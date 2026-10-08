const M = require("../models/worldCrisisModels");
const { sequelize } = require("../config/database");
const { fail } = require("./worldCrisisConfigService");
const announcements = require("./worldCrisisAnnouncementService");
function stage(event) {
  return event.config_snapshot.stages.find(
    (s) => s.key === event.current_stage_key,
  );
}
async function current(transaction) {
  return M.Event.findOne({ where: { status: "ACTIVE" }, transaction });
}
async function latest() {
  return (await current()) ?? M.Event.findOne({ order: [["id", "DESC"]] });
}
function restrictions(event) {
  if (event.status !== "ACTIVE") return [];
  const stages = event.config_snapshot.stages;
  const index = stages.findIndex((s) => s.key === event.current_stage_key);
  return event.config_snapshot.restrictions.filter(
    (r) => stages.findIndex((s) => s.key === r.unlock_after_stage_key) >= index,
  );
}
function effects(event, context) {
  if (!event || event.status !== "ACTIVE") return { xp_pct: 0, gold_pct: 0 };
  const es = stage(event).effects.filter(
    (e) => !context || e.contexts.includes(context),
  );
  const override = event.runtime_state.effect_override;
  return {
    xp_pct:
      override ??
      es.find((e) => e.effect_key === "PVE_XP_PENALTY_PCT")?.magnitude ??
      0,
    gold_pct:
      override ??
      es.find((e) => e.effect_key === "PVE_GOLD_PENALTY_PCT")?.magnitude ??
      0,
  };
}
async function status(characterId, eventOverride) {
  const event = eventOverride ?? (await latest());
  if (!event) return { status: "NONE" };
  const progress = await M.Progress.findAll({
    where: { event_id: event.id },
    raw: true,
    order: [["id", "ASC"]],
  });
  const currentStage = stage(event);
  return {
    id: event.id,
    status: event.status,
    nome: event.config_snapshot.nome,
    descricao: event.config_snapshot.descricao,
    source_id: event.source_id,
    source_name: event.config_snapshot.source_boss_name ?? null,
    started_at: event.started_at,
    completed_at: event.completed_at,
    current_stage_key: event.current_stage_key,
    stage: currentStage,
    stage_index: event.config_snapshot.stages.findIndex(
      (s) => s.key === event.current_stage_key,
    ),
    stage_count: event.config_snapshot.stages.length,
    progress: progress.map((p) => ({
      ...p,
      stage_nome: event.config_snapshot.stages.find(
        (s) => s.key === p.stage_key,
      )?.nome,
      requirement_nome: event.config_snapshot.stages
        .find((s) => s.key === p.stage_key)
        ?.requirements.find((r) => r.key === p.requirement_key)?.nome,
    })),
    effects: effects(event),
    restrictions: restrictions(event),
    contributions_paused: event.contributions_paused,
    rewards_done: event.rewards_done,
    rewards: event.config_snapshot.rewards,
    pending_announcement: characterId
      ? await announcements.pending(event, characterId)
      : null,
  };
}
async function emitStatus(eventId, type = "worldcrisis:status") {
  const event = await M.Event.findByPk(eventId);
  if (event)
    require("../socket/worldBossSocket").emitGlobal(
      type,
      await status(null, event),
    );
}
function afterCommit(transaction, eventId, type) {
  transaction.afterCommit(() => {
    void emitStatus(eventId, type).catch((e) =>
      console.error("[worldcrisis] broadcast failed", e.message),
    );
  });
}
async function trigger(boss, transaction) {
  const snapshot = boss.config_snapshot?.failure_crisis_snapshot;
  if (!snapshot) return null;
  const exists = await M.Event.findOne({
    where: { source_id: boss.id },
    transaction,
  });
  if (exists) return exists;
  const active = await current(transaction);
  if (active)
    throw fail(
      "Já existe uma crise ativa; falha será retomada pelo recovery.",
      409,
    );
  const event = await M.Event.create(
    {
      source_id: boss.id,
      crisis_config_id: snapshot.config_id,
      status: "ACTIVE",
      current_stage_key: snapshot.stages[0].key,
      config_snapshot: {
        ...snapshot,
        source_boss_name: boss.config_snapshot.nome,
      },
      started_at: new Date(),
    },
    { transaction },
  );
  for (const s of snapshot.stages)
    for (const r of s.requirements)
      await M.Progress.create(
        {
          event_id: event.id,
          stage_key: s.key,
          requirement_key: r.key,
          target_progress: r.target_progress,
        },
        { transaction },
      );
  const guilds = await require("../models/Guild").findAll({ transaction });
  const members = await require("../models/GuildMember").findAll({
    raw: true,
    transaction,
  });
  for (const g of guilds)
    await M.GuildSnapshot.create(
      {
        event_id: event.id,
        guild_id: g.id,
        guild_name_snapshot: g.nome,
        member_count_snapshot: Math.max(
          1,
          members.filter((m) => m.id_guild === g.id).length,
        ),
        existed_at_start: true,
      },
      { transaction },
    );
  await announcements.announce(
    event,
    "CRISIS_STARTED",
    snapshot.nome,
    snapshot.start_message ||
      "A ameaça não foi contida. Ajude a reconstruir Caelum.",
    transaction,
  );
  afterCommit(transaction, event.id, "worldcrisis:started");
  return event;
}
async function advance(
  event,
  transaction,
  { force = false, rewards = true } = {},
) {
  if (event.status !== "ACTIVE") return false;
  const s = stage(event);
  const rows = await M.Progress.findAll({
    where: { event_id: event.id, stage_key: s.key },
    transaction,
  });
  if (
    !force &&
    s.requirements.some(
      (r) =>
        r.mandatory !== false &&
        Number(rows.find((p) => p.requirement_key === r.key).current_progress) <
          Number(rows.find((p) => p.requirement_key === r.key).target_progress),
    )
  )
    return false;
  if (force)
    for (const row of rows) {
      row.current_progress = row.target_progress;
      row.completed_at = new Date();
      await row.save({ transaction });
    }
  const stages = event.config_snapshot.stages;
  const index = stages.findIndex((x) => x.key === s.key);
  const runtime = {
    ...event.runtime_state,
    completed_stages: [
      ...(event.runtime_state.completed_stages ?? []),
      { key: s.key, completed_at: new Date() },
    ],
  };
  if (index + 1 < stages.length) {
    event.current_stage_key = stages[index + 1].key;
    delete runtime.effect_override;
    event.runtime_state = runtime;
    await event.save({ transaction });
    const type =
      index + 1 === stages.length - 1
        ? "FINAL_STAGE_STARTED"
        : "STAGE_TRANSITION";
    await announcements.announce(
      event,
      type,
      stages[index + 1].nome,
      s.completion_message || `${s.nome} concluída. A reconstrução continua.`,
      transaction,
    );
    afterCommit(transaction, event.id, "worldcrisis:stage-completed");
    if (!stages[index + 1].requirements.some((r) => r.mandatory !== false))
      await advance(event, transaction);
  } else {
    event.status = "COMPLETED";
    event.completed_at = new Date();
    event.rankings_frozen_at = new Date();
    event.final_rankings =
      await require("./worldCrisisRankingService").calculate(
        event,
        transaction,
      );
    event.runtime_state = runtime;
    event.rewards_done = !rewards;
    await event.save({ transaction });
    if (rewards)
      await require("./worldCrisisRewardService").prepare(event, transaction);
    await announcements.announce(
      event,
      "CRISIS_COMPLETED",
      "Caelum restaurada",
      event.config_snapshot.completion_message ||
        "Todas as rotas foram restauradas. Obrigado por ajudar Caelum!",
      transaction,
    );
    afterCommit(transaction, event.id, "worldcrisis:completed");
    await require("./worldBossLifecycleService").agendarProximoCiclo(
      transaction,
      { apartirDe: new Date() },
    );
  }
  return true;
}
module.exports = {
  stage,
  current,
  latest,
  restrictions,
  effects,
  status,
  emitStatus,
  afterCommit,
  trigger,
  advance,
};
