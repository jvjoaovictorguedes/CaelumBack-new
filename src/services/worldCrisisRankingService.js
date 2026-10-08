const { sequelize } = require("../config/database");
const { QueryTypes } = require("sequelize");
const M = require("../models/worldCrisisModels");
const { guildScore } = require("./worldCrisisConfigService");
async function calculate(event, transaction) {
  const rows = await sequelize.query(
    `SELECT c.character_id, p.ranking_guild_id, ch.nome, SUM(c.ranking_points)::float8 AS points, COUNT(*)::int AS contributions, MAX(c."createdAt") AS reached_at FROM world_crisis_contributions c JOIN world_crisis_participation p ON p.event_id=c.event_id AND p.character_id=c.character_id JOIN "Characters" ch ON ch.id=c.character_id WHERE c.event_id=:id GROUP BY c.character_id,p.ranking_guild_id,ch.nome ORDER BY points DESC,contributions DESC,reached_at ASC,c.character_id ASC`,
    { replacements: { id: event.id }, type: QueryTypes.SELECT, transaction },
  );
  const individual = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  // Guild totals use ledger attribution: un-guilded donations before affiliation are never retroactively transferred.
  const totals = await sequelize.query(
    `SELECT ranking_guild_id AS guild_id,SUM(ranking_points)::float8 AS points,COUNT(DISTINCT character_id)::int AS contributors FROM world_crisis_contributions WHERE event_id=:id AND ranking_guild_id IS NOT NULL GROUP BY ranking_guild_id`,
    { replacements: { id: event.id }, type: QueryTypes.SELECT, transaction },
  );
  const snaps = await M.GuildSnapshot.findAll({
    where: { event_id: event.id },
    raw: true,
    transaction,
  });
  const guild = totals
    .map((t) => {
      const snap = snaps.find((s) => s.guild_id === t.guild_id);
      return {
        guild_id: t.guild_id,
        nome: snap.guild_name_snapshot,
        ...guildScore(
          t.points,
          t.contributors,
          snap,
          event.config_snapshot.guild_scoring_config,
        ),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.raw_points - a.raw_points ||
        b.unique_contributors - a.unique_contributors ||
        a.guild_id - b.guild_id,
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return { individual, guild };
}
async function rankings(
  event,
  characterId,
  { scope = "individual", page = 1 } = {},
) {
  if (!["individual", "guild"].includes(scope))
    throw require("./worldCrisisConfigService").fail("Ranking inválido.");
  const data = event.rankings_frozen_at
    ? event.final_rankings
    : await calculate(event);
  const list = data[scope] ?? [];
  const mine =
    data.individual?.find((r) => r.character_id === characterId) ?? null;
  const myGuild =
    data.guild?.find((r) => r.guild_id === mine?.ranking_guild_id) ?? null;
  const p = Math.max(1, Math.min(100000, Number(page) || 1));
  return {
    scope,
    page: p,
    total: list.length,
    rows: list.slice((p - 1) * 50, p * 50),
    me: mine,
    my_guild: myGuild,
    frozen: !!event.rankings_frozen_at,
  };
}
module.exports = { calculate, rankings };
