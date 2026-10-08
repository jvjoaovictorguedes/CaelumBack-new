const M = require("../models/worldCrisisModels");
const Item = require("../models/Item");
const Resource = require("../models/ExpeditionResource");
const ResourceItem = require("../models/ExpeditionResourceItem");
const Zone = require("../models/AdventureZone");
const cache = require("./gameSettingCache");
const CONTEXTS = ["ADVENTURE_SOLO", "ADVENTURE_PARTY", "HUNT"];
const QUALITIES = ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"];
const EFFECTS = ["PVE_XP_PENALTY_PCT", "PVE_GOLD_PENALTY_PCT"];
const REWARDS = [
  "CHARACTER_GOLD",
  "CHARACTER_XP",
  "ITEM",
  "GUILD_XP",
  "GUILD_TREASURY_GOLD",
];
const SCOPES = [
  "PARTICIPATION",
  "PERSONAL_MILESTONE",
  "INDIVIDUAL_RANK",
  "GUILD_RANK",
  "COMPLETION",
];
const fail = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
function number(n, min, max, label, integer = false) {
  if (
    typeof n !== "number" ||
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (integer && !Number.isSafeInteger(n))
  )
    throw fail(`${label}: valor inválido.`);
  return n;
}
function key(k) {
  if (typeof k !== "string" || !/^[A-Z][A-Z0-9_]{0,79}$/.test(k))
    throw fail("Chave inválida. Use letras maiúsculas, números e _.");
}
function named(x) {
  key(x.key);
  if (typeof x.nome !== "string" || !x.nome.trim() || x.nome.length > 150)
    throw fail("Informe um nome de até 150 caracteres.");
}
function list(x, max, label) {
  if (!Array.isArray(x) || x.length > max)
    throw fail(`${label}: lista inválida.`);
  return x;
}
async function reference(model, id, transaction) {
  number(id, 1, 2147483647, "Referência", true);
  const row = await model.findByPk(id, { transaction });
  if (!row) throw fail("Referência inexistente.");
  return row;
}
async function validate(input, transaction) {
  const s = structuredClone(input);
  named(s);
  list(s.stages, 20, "Etapas");
  if (!s.stages.length) throw fail("Cadastre ao menos uma etapa.");
  const keys = new Set();
  for (const stage of s.stages) {
    named(stage);
    if (keys.has(stage.key)) throw fail("Etapa duplicada.");
    keys.add(stage.key);
    list(stage.requirements, 30, "Requisitos");
    const reqs = new Set();
    if (
      !stage.requirements.some((r) => r.mandatory !== false) &&
      s.allow_zero_requirement_stage !== true
    )
      throw fail("Etapa precisa de um requisito obrigatório.");
    for (const r of stage.requirements) {
      named(r);
      if (reqs.has(r.key)) throw fail("Requisito duplicado.");
      reqs.add(r.key);
      number(r.target_progress, 1, 1e9, "Meta", true);
      list(r.sources, 100, "Fontes");
      if (!r.sources.length) throw fail("Requisito sem fontes.");
      const sources = new Set();
      for (const source of r.sources) {
        if (!["ITEM", "EXPEDITION_RESOURCE"].includes(source.source_type))
          throw fail("Fonte inválida.");
        const sourceKey = `${source.source_type}:${source.source_id}`;
        if (sources.has(sourceKey)) throw fail("Fonte duplicada.");
        sources.add(sourceKey);
        const row = await reference(
          source.source_type === "ITEM" ? Item : Resource,
          source.source_id,
          transaction,
        );
        if (
          source.source_type === "ITEM" &&
          require("./equipmentInstanceService").ehInstanciavel(row.tipo_item)
        )
          throw fail("Doações aceitam somente itens empilháveis.");
        if (
          source.source_type === "EXPEDITION_RESOURCE" &&
          !(await ResourceItem.count({
            where: { id_recurso: source.source_id },
            transaction,
          }))
        )
          throw fail("Recurso não possui itens materializados.");
        number(source.progress_per_unit, 1, 1e6, "Progresso por item", true);
        number(source.ranking_points_per_unit, 1, 1e6, "Pontos por item", true);
        if (source.source_type === "EXPEDITION_RESOURCE") {
          if (
            !source.quality_weights ||
            Object.keys(source.quality_weights).some(
              (k) => !QUALITIES.includes(k),
            )
          )
            throw fail("Pesos de qualidade inválidos.");
          for (const q of QUALITIES)
            number(source.quality_weights[q], 1, 1000, `Peso ${q}`, true);
        }
      }
    }
    list((stage.effects ??= []), 2, "Efeitos");
    const effects = new Set();
    for (const e of stage.effects) {
      if (!EFFECTS.includes(e.effect_key) || effects.has(e.effect_key))
        throw fail("Efeito inválido/duplicado.");
      effects.add(e.effect_key);
      number(
        e.magnitude,
        0,
        Math.min(50, Number(cache.obter("worldcrisis.max_penalty_pct", 50))),
        "Penalidade",
      );
      list(e.contexts, 3, "Contextos");
      if (!e.contexts.length || e.contexts.some((c) => !CONTEXTS.includes(c)))
        throw fail("Contexto inválido.");
    }
  }
  list((s.restrictions ??= []), 100, "Restrições");
  const targets = new Set();
  for (const r of s.restrictions) {
    if (
      r.target_type !== "ADVENTURE_ZONE" ||
      !keys.has(r.unlock_after_stage_key)
    )
      throw fail("Restrição/etapa inválida.");
    await reference(Zone, r.target_id, transaction);
    if (targets.has(r.target_id)) throw fail("Zona duplicada.");
    targets.add(r.target_id);
  }
  const g = s.guild_scoring_config;
  if (!g) throw fail("Configure mobilização de guildas.");
  number(
    g.minimum_contributors_for_bonus,
    1,
    100000,
    "Mínimo de contribuidores",
    true,
  );
  list(g.tiers, 10, "Faixas de mobilização");
  if (
    !g.tiers.length ||
    g.tiers[0].min_pct !== 0 ||
    g.tiers[0].multiplier !== 1
  )
    throw fail("Mobilização deve começar em 0% / 1x.");
  let last = -1,
    mult = 1;
  for (const tier of g.tiers) {
    number(tier.min_pct, 0, 100, "Participação");
    number(tier.multiplier, 1, 2, "Multiplicador");
    if (tier.min_pct <= last || tier.multiplier < mult)
      throw fail("Faixas de mobilização devem ser crescentes.");
    last = tier.min_pct;
    mult = tier.multiplier;
  }
  list((s.rewards ??= []), 50, "Prêmios");
  const rewards = new Set();
  for (const r of s.rewards) {
    key(r.key);
    if (rewards.has(r.key) || !SCOPES.includes(r.scope))
      throw fail("Prêmio inválido/duplicado.");
    rewards.add(r.key);
    number(r.min_points, 1, 1e12, "Pontos mínimos", true);
    if (["INDIVIDUAL_RANK", "GUILD_RANK"].includes(r.scope)) {
      number(r.rank_start, 1, 10000, "Posição inicial", true);
      number(r.rank_end, r.rank_start, 10000, "Posição final", true);
      for (const other of s.rewards) {
        if (
          other !== r &&
          other.scope === r.scope &&
          other.rank_start <= r.rank_end &&
          other.rank_end >= r.rank_start
        )
          throw fail("Faixas de ranking não podem se sobrepor.");
      }
    }
    list(r.payload, 20, "Pacote");
    if (!r.payload.length) throw fail("Prêmio sem pacote.");
    for (const p of r.payload) {
      if (!REWARDS.includes(p.type)) throw fail("Tipo de prêmio inválido.");
      if (p.type.startsWith("GUILD_") && r.scope !== "GUILD_RANK")
        throw fail("Prêmios de guilda exigem ranking de guilda.");
      number(
        p.quantity,
        1,
        p.type === "ITEM" ? 100 : 1e7,
        "Quantidade do prêmio",
        true,
      );
      if (p.type === "ITEM") await reference(Item, p.item_id, transaction);
    }
  }
  return s;
}
async function snapshot(configId, transaction, { allowInactive = false } = {}) {
  if (!configId) return null;
  const c = await M.Config.findByPk(configId, { transaction });
  if (!c || (!c.ativo && !allowInactive))
    throw fail("Perfil de crise inexistente ou desativado.");
  const s = await validate(c.structure, transaction);
  const variants = await ResourceItem.findAll({ raw: true, transaction });
  const items = await Item.findAll({
    attributes: ["id", "nome", "imagem_url"],
    raw: true,
    transaction,
  });
  const names = new Map(items.map((i) => [i.id, i]));
  for (const stage of s.stages)
    for (const r of stage.requirements) {
      r.resolved_items = [];
      const seen = new Set();
      for (const source of r.sources) {
        const eligible =
          source.source_type === "ITEM"
            ? [{ id_item: source.source_id, qualidade: null }]
            : variants.filter((i) => i.id_recurso === source.source_id);
        for (const item of eligible) {
          if (seen.has(item.id_item))
            throw fail("Um item está em mais de uma fonte do mesmo requisito.");
          seen.add(item.id_item);
          const weight = item.qualidade
            ? source.quality_weights[item.qualidade]
            : 1;
          r.resolved_items.push({
            ...names.get(item.id_item),
            qualidade: item.qualidade,
            progress_per_unit: source.progress_per_unit * weight,
            ranking_points_per_unit: source.ranking_points_per_unit * weight,
          });
        }
      }
    }
  for (const r of s.restrictions) {
    const zone = await Zone.findByPk(r.target_id, { transaction });
    r.nome = zone.nome;
  }
  for (const reward of s.rewards)
    for (const payload of reward.payload)
      if (payload.type === "ITEM")
        payload.nome = names.get(payload.item_id)?.nome;
  return { ...s, config_id: c.id };
}
function guildScore(raw, count, snapshot, g) {
  const pct = Math.min(
    100,
    (100 * count) / Math.max(1, snapshot.member_count_snapshot),
  );
  let multiplier = 1;
  if (snapshot.existed_at_start && count >= g.minimum_contributors_for_bonus)
    for (const t of g.tiers) if (pct >= t.min_pct) multiplier = t.multiplier;
  return {
    raw_points: raw,
    unique_contributors: count,
    member_count_snapshot: snapshot.member_count_snapshot,
    participation_pct: pct,
    mobilization_multiplier: multiplier,
    score: Math.round(raw * multiplier),
  };
}
module.exports = {
  validate,
  snapshot,
  guildScore,
  fail,
  number,
  key,
  CONTEXTS,
  QUALITIES,
  EFFECTS,
  REWARDS,
  SCOPES,
};
