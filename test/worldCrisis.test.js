const test = require("node:test"),
  assert = require("node:assert/strict");
const { sequelize, bancoDisponivel, criarPersonagem } = require("./helpers/db");
const M = require("../src/models/worldCrisisModels");
const C = require("../src/services/worldCrisisConfigService");
const crisis = require("../src/services/worldCrisisService");
const donation = require("../src/services/worldCrisisContributionService");
const failure = require("../src/services/worldBossFailureService");
const Boss = require("../src/models/WorldBossEvent");
const BossConfig = require("../src/models/WorldBossConfig");
const Session = require("../src/models/WorldBossCombatSession");
const Item = require("../src/models/Item");
const Inventory = require("../src/models/CharacterInventory");
let ready = false;
test.before(async () => {
  ready = await bancoDisponivel();
});
test.after(() => sequelize.close());
function structure(itemId) {
  return {
    key: "TEST_CRISIS",
    nome: "Reconstrução teste",
    stages: [
      {
        key: "RESGATE",
        nome: "Resgate",
        requirements: [
          {
            key: "ERVAS",
            nome: "Ervas",
            target_progress: 12,
            mandatory: true,
            sources: [
              {
                source_type: "ITEM",
                source_id: itemId,
                progress_per_unit: 4,
                ranking_points_per_unit: 8,
              },
            ],
          },
        ],
        effects: [
          {
            effect_key: "PVE_XP_PENALTY_PCT",
            magnitude: 15,
            contexts: ["ADVENTURE_SOLO", "ADVENTURE_PARTY"],
          },
          {
            effect_key: "PVE_GOLD_PENALTY_PCT",
            magnitude: 10,
            contexts: ["ADVENTURE_SOLO", "ADVENTURE_PARTY"],
          },
        ],
      },
      {
        key: "CIDADE",
        nome: "Cidade",
        requirements: [
          {
            key: "FERRO",
            nome: "Ferro",
            target_progress: 5,
            mandatory: true,
            sources: [
              {
                source_type: "ITEM",
                source_id: itemId,
                progress_per_unit: 1,
                ranking_points_per_unit: 2,
              },
            ],
          },
        ],
        effects: [
          {
            effect_key: "PVE_XP_PENALTY_PCT",
            magnitude: 5,
            contexts: ["ADVENTURE_SOLO", "ADVENTURE_PARTY"],
          },
        ],
      },
    ],
    restrictions: [],
    guild_scoring_config: {
      minimum_contributors_for_bonus: 2,
      tiers: [
        { min_pct: 0, multiplier: 1 },
        { min_pct: 50, multiplier: 1.2 },
      ],
    },
    rewards: [
      {
        key: "AJUDA",
        scope: "PARTICIPATION",
        min_points: 1,
        payload: [{ type: "CHARACTER_GOLD", quantity: 30 }],
      },
      {
        key: "TOP",
        scope: "INDIVIDUAL_RANK",
        min_points: 1,
        rank_start: 1,
        rank_end: 1,
        payload: [{ type: "CHARACTER_GOLD", quantity: 40 }],
      },
    ],
  };
}
test("useful quantity caps progress and proportional points without consuming surplus", () => {
  assert.deepEqual(
    donation.usefulQuantity(100, 5, {
      progress_per_unit: 4,
      ranking_points_per_unit: 8,
    }),
    {
      accepted_quantity: 2,
      remaining_quantity: 98,
      progress_units: 5,
      ranking_points: 10,
      capped_by_requirement: true,
    },
  );
});
test("guild mobilization is frozen, bounded and requires unique contributors", () => {
  const g = {
    minimum_contributors_for_bonus: 5,
    tiers: [
      { min_pct: 0, multiplier: 1 },
      { min_pct: 80, multiplier: 1.2 },
    ],
  };
  assert.equal(
    C.guildScore(
      100,
      4,
      { member_count_snapshot: 5, existed_at_start: true },
      g,
    ).score,
    100,
  );
  assert.equal(
    C.guildScore(
      100,
      5,
      { member_count_snapshot: 5, existed_at_start: true },
      g,
    ).score,
    120,
  );
  assert.equal(
    C.guildScore(
      100,
      5,
      { member_count_snapshot: 5, existed_at_start: false },
      g,
    ).score,
    100,
  );
});
test("deadline equality is expired, terminal states can never fail again", () => {
  const now = new Date();
  for (const status of ["DEFEATED", "FAILED", "CANCELLED"])
    assert.equal(
      failure.expired({ status, combat_expires_at: now }, now),
      false,
    );
  assert.equal(
    failure.expired({ status: "ACTIVE", combat_expires_at: now }, now),
    true,
  );
  assert.equal(
    failure.expired(
      { status: "ACTIVE", combat_expires_at: new Date(now.getTime() + 1) },
      now,
    ),
    false,
  );
});
test("crisis transactional lifecycle, inventory, affiliation, announcements and payouts", async (t) => {
  if (!ready) return t.skip("Requires local Postgres");
  const a = await criarPersonagem(),
    b = await criarPersonagem();
  const item = await Item.create({
    nome: `Material crise ${Date.now()}`,
    descricao: "teste",
    tipo_item: "Material",
    raridade: "Comum",
  });
  const Zone = require("../src/models/AdventureZone");
  const zone = await Zone.create({
    nome: `Zona crise ${Date.now()}`,
    nivel_monstro_min: 1,
    nivel_monstro_max: 10,
  });
  const cfg = await M.Config.create({
    key: `TEST_${Date.now()}`,
    nome: "Teste",
    ativo: true,
    structure: {
      ...structure(item.id),
      restrictions: [
        {
          target_type: "ADVENTURE_ZONE",
          target_id: zone.id,
          unlock_after_stage_key: "RESGATE",
        },
      ],
    },
  });
  const bossConfig = await BossConfig.create({
    nome: `Boss crise ${Date.now()}`,
    descricao: "teste",
    ativo: false,
    vida_base: 1000,
    mensagem_descoberta: "teste",
    mensagem_convocacao: "teste",
    id_item_golpe_final: item.id,
  });
  const snapshot = await C.snapshot(cfg.id);
  const boss = await Boss.create({
    id_world_boss_config: bossConfig.id,
    status: "ACTIVE",
    hp_max: 1000,
    hp_current: 800,
    activated_at: new Date(Date.now() - 10000),
    combat_expires_at: new Date(Date.now() - 1),
    config_snapshot: {
      nome: "Boss crise",
      failure_crisis_snapshot: snapshot,
      gold_participacao: 10,
      xp_participacao: 0,
      min_dano_participacao: 1,
    },
  });
  await Session.create({ event_id: boss.id, character_id: a.personagem.id });
  await require("../src/models/WorldBossContribution").create({
    event_id: boss.id,
    character_id: a.personagem.id,
    damage_total: 10,
  });
  const Guild = require("../src/models/Guild"),
    Member = require("../src/models/GuildMember");
  const g1 = await Guild.create({
      nome: `Crise A ${Date.now()}`,
      sigla: `A${Date.now() % 10000}`,
      id_fundador: a.personagem.id,
      id_lider: a.personagem.id,
    }),
    g2 = await Guild.create({
      nome: `Crise B ${Date.now()}`,
      sigla: `B${Date.now() % 10000}`,
      id_fundador: b.personagem.id,
      id_lider: b.personagem.id,
    });
  await Member.create({ id_personagem: a.personagem.id, id_guild: g1.id });
  await Member.create({ id_personagem: b.personagem.id, id_guild: g1.id });
  let e;
  t.after(async () => {
    for (const model of [
      M.Grant,
      M.UiState,
      M.Announcement,
      M.Contribution,
      M.Participation,
      M.Progress,
      M.GuildSnapshot,
    ])
      await model.destroy({ where: { event_id: e.id } });
    await M.Event.destroy({ where: { id: e.id } });
    await Session.destroy({ where: { event_id: boss.id } });
    await require("../src/models/WorldBossRewardGrant").destroy({
      where: { event_id: boss.id },
    });
    await require("../src/models/WorldBossContribution").destroy({
      where: { event_id: boss.id },
    });
    await Boss.destroy({ where: { id: boss.id } });
    await BossConfig.destroy({ where: { id: bossConfig.id } });
    await M.Config.destroy({ where: { id: cfg.id } });
    await Inventory.destroy({ where: { id_item: item.id } });
    await Member.destroy({
      where: { id_personagem: [a.personagem.id, b.personagem.id] },
    });
    await Guild.destroy({ where: { id: [g1.id, g2.id] } });
    await Item.destroy({ where: { id: item.id } });
    await zone.destroy();
  });
  await t.test(
    "concurrent expiry creates one crisis and ends sessions",
    async () => {
      await Promise.all([failure.tick(), failure.tick()]);
      await boss.reload();
      assert.equal(boss.status, "FAILED");
      assert.equal(await M.Event.count({ where: { source_id: boss.id } }), 1);
      e = await M.Event.findOne({ where: { source_id: boss.id } });
      assert.equal(
        (await Session.findOne({ where: { event_id: boss.id } })).status,
        "Encerrada",
      );
      assert.equal(
        await require("../src/services/worldBossLifecycleService").agendarProximoCiclo(),
        null,
      );
    },
  );
  await t.test(
    "blocked zones are a temporary layer and failure only rewards participation",
    async () => {
      const access = require("../src/services/worldCrisisAccessService");
      await assert.rejects(
        access.assertAccessible("ADVENTURE_ZONE", zone.id),
        /devastada/,
      );
      await assert.rejects(
        require("../src/services/adventureService").entrarNaZona(
          a.personagem.id,
          zone.id,
        ),
        /devastada/,
      );
      assert.equal(
        (
          await require("../src/services/adventureService").listarZonas(10)
        ).find((z) => z.id === zone.id).bloqueada_por_crise,
        true,
      );
      await zone.reload();
      assert.equal(zone.ativa, true);
      await assert.rejects(
        require("../src/services/worldBossCombatService").executarAcao(
          a.personagem.id,
          { tipo: "attack" },
        ),
      );
      await boss.reload();
      assert.equal(Number(boss.hp_current), 800);
      await require("../src/services/worldBossRewardService").processarRecompensas(
        boss.id,
      );
      const grants =
        await require("../src/models/WorldBossRewardGrant").findAll({
          where: { event_id: boss.id },
          raw: true,
        });
      assert.deepEqual(
        grants.map((g) => g.reward_kind),
        ["PARTICIPATION"],
      );
    },
  );
  await t.test(
    "snapshot, validation and farm contexts are authoritative",
    async () => {
      await cfg.update({ structure: { ...cfg.structure, nome: "Editado" } });
      await e.reload();
      assert.equal(e.config_snapshot.nome, "Reconstrução teste");
      await assert.rejects(
        C.validate({ ...structure(item.id), stages: [] }),
        /etapa/,
      );
      const duplicate = structure(item.id);
      duplicate.stages[0].requirements[0].sources.push(
        duplicate.stages[0].requirements[0].sources[0],
      );
      await assert.rejects(C.validate(duplicate), /duplicada/);
      const reward =
        await require("../src/services/worldCrisisEffectService").apply(
          120,
          100,
          "ADVENTURE_PARTY",
        );
      assert.equal(reward.xp, 102);
      assert.equal(reward.gold, 90);
      const pvp =
        await require("../src/services/worldCrisisEffectService").apply(
          120,
          100,
          "PVP",
        );
      assert.equal(pvp.xp, 120);
    },
  );
  for (const id of [a.personagem.id, b.personagem.id])
    await require("../src/services/inventoryService").addStack(id, item.id, 20);
  const request = {
    event_id: e.id,
    stage_key: "RESGATE",
    requirement_key: "ERVAS",
    item_id: item.id,
    quantity: 1,
    request_id: "request_first_123456",
  };
  await t.test(
    "invalid source, stale stage and insufficient inventory never mutate",
    async () => {
      await assert.rejects(
        donation.contribute(a.personagem.id, {
          ...request,
          item_id: 2147483647,
        }),
        /não aceito/,
      );
      await assert.rejects(
        donation.contribute(a.personagem.id, {
          ...request,
          stage_key: "STALE",
        }),
        /etapa mudou/,
      );
      const inv = await Inventory.findOne({
        where: { id_personagem: a.personagem.id, id_item: item.id },
      });
      await inv.update({ quantidade: 0 });
      await assert.rejects(
        donation.contribute(a.personagem.id, request),
        /insuficiente/,
      );
      await inv.update({ quantidade: 20 });
      assert.equal(
        await M.Contribution.count({ where: { event_id: e.id } }),
        0,
      );
    },
  );
  await t.test(
    "retry is idempotent and payload reuse is rejected",
    async () => {
      const one = await donation.contribute(a.personagem.id, request);
      const replay = await donation.contribute(a.personagem.id, request);
      assert.equal(replay.replayed, true);
      assert.equal(one.progress_units, 4);
      assert.equal(
        (
          await Inventory.findOne({
            where: { id_personagem: a.personagem.id, id_item: item.id },
          })
        ).quantidade,
        19,
      );
      await assert.rejects(
        donation.contribute(a.personagem.id, { ...request, quantity: 2 }),
        /outra doação/,
      );
    },
  );
  await t.test(
    "simultaneous donations cap consumption and transition once",
    async () => {
      const result = await Promise.allSettled([
        donation.contribute(a.personagem.id, {
          ...request,
          quantity: 100,
          request_id: "request_second_123456",
        }),
        donation.contribute(b.personagem.id, {
          ...request,
          quantity: 100,
          request_id: "request_third_123456",
        }),
      ]);
      assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
      const progress = await M.Progress.findOne({
        where: { event_id: e.id, stage_key: "RESGATE" },
      });
      assert.equal(Number(progress.current_progress), 12);
      await e.reload();
      assert.equal(e.current_stage_key, "CIDADE");
      assert.equal(
        await require("../src/services/worldCrisisAccessService").getRestriction(
          "ADVENTURE_ZONE",
          zone.id,
        ),
        null,
      );
      assert.equal(
        await M.Announcement.count({ where: { event_id: e.id } }),
        2,
      );
      const all = await M.Contribution.sum("quantity", {
        where: { event_id: e.id },
      });
      assert.equal(all, 3);
    },
  );
  await t.test(
    "guild hopping preserves attribution and completion freezes ranking",
    async () => {
      await Member.update(
        { id_guild: g2.id },
        { where: { id_personagem: a.personagem.id } },
      );
      await donation.contribute(a.personagem.id, {
        ...request,
        stage_key: "CIDADE",
        requirement_key: "FERRO",
        quantity: 5,
        request_id: "request_fourth_123456",
      });
      const row = await M.Contribution.findOne({
        where: { event_id: e.id, request_id: "request_fourth_123456" },
      });
      assert.equal(row.ranking_guild_id, g1.id);
      assert.equal(row.guild_id_at_contribution, g2.id);
      await e.reload();
      assert.equal(e.status, "COMPLETED");
      assert.ok(e.rankings_frozen_at);
      assert.equal(crisis.effects(e).xp_pct, 0);
      assert.deepEqual(crisis.restrictions(e), []);
      const rank =
        await require("../src/services/worldCrisisRankingService").rankings(
          e,
          a.personagem.id,
        );
      assert.equal(rank.me.rank, 1);
      assert.equal(rank.my_guild.member_count_snapshot, 2);
      await assert.rejects(
        donation.contribute(a.personagem.id, {
          ...request,
          request_id: "request_after_123456",
        }),
        /indisponíveis/,
      );
    },
  );
  await t.test(
    "offline catch-up groups announcements and ack only advances",
    async () => {
      const A = require("../src/services/worldCrisisAnnouncementService");
      const pending = await A.pending(e, a.personagem.id);
      assert.equal(pending.catch_up, true);
      assert.equal(pending.seq, 3);
      await A.ack(a.personagem.id, e.id, 3);
      await A.ack(a.personagem.id, e.id, 1);
      assert.equal(await A.pending(e, a.personagem.id), null);
      assert.ok(await A.pending(e, b.personagem.id));
    },
  );
  await t.test("replaying grants does not duplicate Gold", async () => {
    const Character = require("../src/models/Character");
    const before = (await Character.findByPk(a.personagem.id)).dinheiro;
    await require("../src/services/worldCrisisRewardService").recover();
    const after = (await Character.findByPk(a.personagem.id)).dinheiro;
    assert.equal(after - before, 70);
    await require("../src/services/worldCrisisRewardService").recover();
    assert.equal((await Character.findByPk(a.personagem.id)).dinheiro, after);
  });
});
