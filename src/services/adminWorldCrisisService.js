const M = require("../models/worldCrisisModels");
const { sequelize } = require("../config/database");
const C = require("./worldCrisisConfigService");
const crisis = require("./worldCrisisService");
const { registrarAcao } = require("./adminAuditService");
function reason(req) {
  const value = req.body.reason ?? req.body.motivo;
  if (
    typeof value !== "string" ||
    value.trim().length < 5 ||
    value.length > 500
  )
    throw C.fail("Informe motivo de 5 a 500 caracteres.");
  return value.trim();
}
async function audit(req, action, id, operation) {
  const motivo = reason(req);
  return sequelize.transaction(async (transaction) => {
    const { before, after } = await operation(transaction);
    await registrarAcao({
      idAdmin: req.user.id,
      acao: `worldcrisis.${action}`,
      entidade: "WorldCrisis",
      idEntidade: id,
      dadosAntes: before,
      dadosDepois: after,
      motivo,
      req,
      transaction,
    });
    return after;
  });
}
async function save(req, id) {
  return audit(req, "config.save", id, async (transaction) => {
    const structure = await C.validate(req.body.structure, transaction);
    let row = id
      ? await M.Config.findByPk(id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        })
      : null;
    if (id && !row) throw C.fail("Perfil não encontrado.", 404);
    const before = row?.toJSON() ?? null;
    const data = {
      key: structure.key,
      nome: structure.nome,
      descricao: structure.descricao ?? "",
      ativo: req.body.ativo === true,
      structure,
    };
    if (row) await row.update(data, { transaction });
    else row = await M.Config.create(data, { transaction });
    return { before, after: row.toJSON() };
  });
}
async function duplicate(req, id) {
  return audit(req, "config.duplicate", id, async (transaction) => {
    const row = await M.Config.findByPk(id, { transaction });
    if (!row) throw C.fail("Perfil não encontrado.", 404);
    C.key(req.body.key);
    const structure = {
      ...row.structure,
      key: req.body.key,
      nome: `${row.nome} (cópia)`,
    };
    const copy = await M.Config.create(
      {
        key: structure.key,
        nome: structure.nome,
        descricao: row.descricao,
        ativo: false,
        structure,
      },
      { transaction },
    );
    return { before: null, after: copy.toJSON() };
  });
}
async function activate(req, id, active) {
  return audit(req, "config.activate", id, async (transaction) => {
    const row = await M.Config.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!row) throw C.fail("Perfil não encontrado.", 404);
    if (active) await C.validate(row.structure, transaction);
    const before = row.toJSON();
    await row.update({ ativo: active }, { transaction });
    return { before, after: row.toJSON() };
  });
}
async function live(req, action) {
  return audit(req, action, null, async (transaction) => {
    const event = await M.Event.findOne({
      where: { status: "ACTIVE" },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!event) throw C.fail("Nenhuma crise ativa.", 409);
    const before = event.toJSON();
    if (action === "pause" || action === "resume")
      event.contributions_paused = action === "pause";
    else if (action === "force-complete-stage") {
      if (req.body.confirm !== true)
        throw C.fail("Confirme a conclusão da etapa.");
      await crisis.advance(event, transaction, { force: true });
    } else if (action === "adjust-requirement") {
      C.number(req.body.target_progress, 1, 1e9, "Nova meta", true);
      const row = await M.Progress.findOne({
        where: {
          event_id: event.id,
          stage_key: event.current_stage_key,
          requirement_key: req.body.requirement_key,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row || req.body.target_progress < Number(row.current_progress))
        throw C.fail("Meta inválida ou menor que o progresso.");
      if (
        req.body.target_progress === Number(row.current_progress) &&
        req.body.confirm !== true
      )
        throw C.fail("Confirme conclusão do requisito.");
      const prior = row.toJSON();
      await row.update(
        { target_progress: req.body.target_progress },
        { transaction },
      );
      event.runtime_state = {
        ...event.runtime_state,
        requirement_adjustments: [
          ...(event.runtime_state.requirement_adjustments ?? []),
          { before: prior, target: req.body.target_progress },
        ],
      };
      await crisis.advance(event, transaction);
    } else if (action === "override-effect") {
      C.number(req.body.magnitude, 0, 50, "Penalidade");
      event.runtime_state = {
        ...event.runtime_state,
        effect_override: req.body.magnitude,
      };
    } else if (action === "announce") {
      if (
        typeof req.body.message !== "string" ||
        !req.body.message.trim() ||
        req.body.message.length > 1000
      )
        throw C.fail("Mensagem inválida.");
      await require("./worldCrisisAnnouncementService").announce(
        event,
        "ADMIN_ANNOUNCEMENT",
        "Aviso de Caelum",
        req.body.message,
        transaction,
      );
    } else if (action === "force-resolve") {
      if (
        req.body.confirm !== true ||
        typeof req.body.process_rewards !== "boolean"
      )
        throw C.fail("Confirme a conclusão e escolha se haverá prêmios.");
      while (event.status === "ACTIVE")
        await crisis.advance(event, transaction, {
          force: true,
          rewards: req.body.process_rewards,
        });
    } else if (action === "cancel") {
      if (req.body.confirm !== true) throw C.fail("Confirme o cancelamento.");
      event.status = "CANCELLED";
      event.completed_at = new Date();
      event.rankings_frozen_at = new Date();
      event.final_rankings =
        await require("./worldCrisisRankingService").calculate(
          event,
          transaction,
        );
      event.rewards_done = true;
      await event.save({ transaction });
      await require("./worldCrisisAnnouncementService").announce(
        event,
        "CRISIS_CANCELLED",
        "Crise encerrada",
        "As restrições e penalidades foram removidas pela administração.",
        transaction,
      );
      await require("./worldBossLifecycleService").agendarProximoCiclo(
        transaction,
        { apartirDe: new Date() },
      );
    } else throw C.fail("Operação inválida.");
    await event.save({ transaction });
    crisis.afterCommit(transaction, event.id);
    return { before, after: event.toJSON() };
  });
}
async function catalogs() {
  return {
    items: await require("../models/Item").findAll({
      attributes: ["id", "nome", "imagem_url", "tipo_item"],
      raw: true,
    }),
    resources: await require("../models/ExpeditionResource").findAll({
      raw: true,
    }),
    zones: await require("../models/AdventureZone").findAll({
      attributes: ["id", "nome"],
      raw: true,
    }),
    configs: await M.Config.findAll({ order: [["id", "ASC"]] }),
    registry: {
      contexts: C.CONTEXTS,
      qualities: C.QUALITIES,
      effects: C.EFFECTS,
      rewards: C.REWARDS,
      scopes: C.SCOPES,
    },
    enabled: require("./gameSettingCache").obter("worldcrisis.enabled", false),
  };
}
async function settings(req) {
  if (typeof req.body.enabled !== "boolean")
    throw C.fail("Configuração inválida.");
  const result = await audit(req, "enabled", null, async (transaction) => {
    const S = require("../models/GameSetting");
    const row = await S.findByPk("worldcrisis.enabled", {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const before = row?.toJSON();
    await S.upsert(
      {
        chave: "worldcrisis.enabled",
        valor: req.body.enabled,
        tipo: "boolean",
        updated_by_admin_id: req.user.id,
      },
      { transaction },
    );
    return { before, after: { enabled: req.body.enabled } };
  });
  await require("./gameSettingCache").recarregar();
  return result;
}
async function metrics() {
  const { QueryTypes } = require("sequelize");
  const aggregate = await sequelize.query(
    `SELECT event_id,COUNT(*)::int AS donations,COUNT(DISTINCT character_id)::int AS contributors,SUM(quantity)::float8 AS materials,SUM(progress_units)::float8 AS progress,SUM(ranking_points)::float8 AS points FROM world_crisis_contributions GROUP BY event_id ORDER BY event_id DESC`,
    { type: QueryTypes.SELECT },
  );
  return {
    aggregate,
    grants: await M.Grant.findAll({
      attributes: ["event_id", "status"],
      raw: true,
    }),
    history: await M.Event.findAll({
      attributes: [
        "id",
        "source_id",
        "status",
        "current_stage_key",
        "started_at",
        "completed_at",
        "rewards_done",
      ],
      order: [["id", "DESC"]],
      limit: 50,
    }),
  };
}
async function preview(id) {
  const c = await M.Config.findByPk(id);
  if (!c) throw C.fail("Perfil inexistente.", 404);
  await C.validate(c.structure);
  const warnings = [];
  if (!c.ativo)
    warnings.push("Perfil desativado: ative antes de vincular a um Boss.");
  const s = await C.snapshot(id, undefined, { allowInactive: true });
  return {
    structure: s,
    warnings,
    guild_examples: [
      [10, 3],
      [50, 25],
      [5, 5],
    ].map(([members, count]) =>
      C.guildScore(
        1000,
        count,
        { member_count_snapshot: members, existed_at_start: true },
        s.guild_scoring_config,
      ),
    ),
  };
}
async function preset() {
  const resources = await require("../models/ExpeditionResource").findAll({
    raw: true,
  });
  const find = (names) => resources.filter((r) => names.includes(r.nome));
  const woods = find(["Carvalho", "Pinheiro", "Cedro"]),
    iron = find(["Ferro"]),
    herbs = find(["Erva Medicinal", "Erva de Mana"]);
  if (!woods.length || !iron.length || !herbs.length)
    throw C.fail(
      "Catálogo não possui madeira, ferro e ervas esperados. Cadastre fontes pelo editor.",
    );
  const weights = Object.fromEntries(C.QUALITIES.map((q, i) => [q, 2 ** i]));
  const source = (rows) =>
    rows.map((r) => ({
      source_type: "EXPEDITION_RESOURCE",
      source_id: r.id,
      progress_per_unit: 1,
      ranking_points_per_unit: 1,
      quality_weights: weights,
    }));
  return {
    key: "RECONSTRUCAO_CAELUM",
    nome: "Reconstrução de Caelum",
    descricao:
      "Entregue madeira, ferro e ervas à Guilda dos Aventureiros para reconstruir Caelum e cuidar dos feridos.",
    start_message:
      "A ameaça devastou os arredores. Caelum precisa da ajuda de todos!",
    completion_message:
      "A cidade foi reconstruída e os feridos foram tratados. Todas as rotas foram restauradas!",
    stages: [
      [
        "RESGATE",
        "Resgate dos sobreviventes",
        10,
        [["ERVAS", "Tratamento dos feridos", 1000, herbs]],
      ],
      [
        "ESTRADAS",
        "Estradas e pontes",
        5,
        [
          ["MADEIRA", "Madeira estrutural", 2000, woods],
          ["FERRO", "Estruturas de ferro", 1000, iron],
        ],
      ],
      [
        "CIDADE",
        "Reconstrução da cidade",
        2,
        [
          ["MADEIRA", "Reconstrução das moradias", 2000, woods],
          ["FERRO", "Fortificação", 1000, iron],
          ["ERVAS", "Recuperação dos feridos", 1000, herbs],
        ],
      ],
    ].map(([key, nome, penalty, reqs]) => ({
      key,
      nome,
      requirements: reqs.map(([key, nome, target, rows]) => ({
        key,
        nome,
        target_progress: target,
        mandatory: true,
        sources: source(rows),
      })),
      effects: C.EFFECTS.map((effect_key) => ({
        effect_key,
        magnitude: penalty,
        contexts: C.CONTEXTS,
      })),
    })),
    restrictions: [],
    guild_scoring_config: {
      minimum_contributors_for_bonus: 5,
      tiers: [
        { min_pct: 0, multiplier: 1 },
        { min_pct: 20, multiplier: 1.05 },
        { min_pct: 40, multiplier: 1.1 },
        { min_pct: 60, multiplier: 1.15 },
        { min_pct: 80, multiplier: 1.2 },
      ],
    },
    rewards: [
      {
        key: "PARTICIPACAO",
        scope: "PARTICIPATION",
        min_points: 100,
        payload: [{ type: "CHARACTER_GOLD", quantity: 100 }],
      },
      {
        key: "TOP_INDIVIDUAL",
        scope: "INDIVIDUAL_RANK",
        min_points: 100,
        rank_start: 1,
        rank_end: 10,
        payload: [{ type: "CHARACTER_GOLD", quantity: 1000 }],
      },
      {
        key: "TOP_GUILDA",
        scope: "GUILD_RANK",
        min_points: 100,
        rank_start: 1,
        rank_end: 3,
        payload: [
          { type: "GUILD_TREASURY_GOLD", quantity: 1000 },
          { type: "CHARACTER_GOLD", quantity: 500 },
        ],
      },
    ],
  };
}
module.exports = {
  save,
  duplicate,
  activate,
  live,
  catalogs,
  settings,
  metrics,
  preview,
  preset,
};
