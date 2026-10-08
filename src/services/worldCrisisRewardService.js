const M = require("../models/worldCrisisModels");
const { sequelize } = require("../config/database");
function eligible(tier, row) {
  return (
    row.points >= tier.min_points &&
    (!["INDIVIDUAL_RANK", "GUILD_RANK"].includes(tier.scope) ||
      (row.rank >= tier.rank_start && row.rank <= tier.rank_end))
  );
}
async function prepare(event, transaction) {
  const data = event.final_rankings;
  for (const tier of event.config_snapshot.rewards) {
    if (tier.scope === "GUILD_RANK") {
      for (const g of data.guild) {
        if (
          g.rank < tier.rank_start ||
          g.rank > tier.rank_end ||
          g.raw_points < tier.min_points
        )
          continue;
        const guildPayload = tier.payload.filter((p) =>
          p.type.startsWith("GUILD_"),
        );
        if (guildPayload.length)
          await M.Grant.findOrCreate({
            where: {
              event_id: event.id,
              recipient_type: "GUILD",
              recipient_id: g.guild_id,
              tier_key: tier.key,
            },
            defaults: { payload_snapshot: guildPayload },
            transaction,
          });
        for (const row of data.individual.filter(
          (r) =>
            r.ranking_guild_id === g.guild_id && r.points >= tier.min_points,
        )) {
          const payload = tier.payload.filter(
            (p) => !p.type.startsWith("GUILD_"),
          );
          if (payload.length)
            await M.Grant.findOrCreate({
              where: {
                event_id: event.id,
                recipient_type: "CHARACTER",
                recipient_id: row.character_id,
                tier_key: tier.key,
              },
              defaults: { payload_snapshot: payload },
              transaction,
            });
        }
      }
    } else
      for (const row of data.individual)
        if (eligible(tier, row))
          await M.Grant.findOrCreate({
            where: {
              event_id: event.id,
              recipient_type: "CHARACTER",
              recipient_id: row.character_id,
              tier_key: tier.key,
            },
            defaults: { payload_snapshot: tier.payload },
            transaction,
          });
  }
}
async function processGrant(id) {
  return sequelize.transaction(async (transaction) => {
    const grant = await M.Grant.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!grant || grant.status === "Granted") return false;
    if (grant.recipient_type === "CHARACTER") {
      const bundle = { ouro: 0, xp: 0, itens: [] };
      for (const p of grant.payload_snapshot) {
        if (p.type === "CHARACTER_GOLD") bundle.ouro += p.quantity;
        if (p.type === "CHARACTER_XP") bundle.xp += p.quantity;
        if (p.type === "ITEM")
          bundle.itens.push({ id_item: p.item_id, quantidade: p.quantity });
      }
      if (bundle.xp === 0) delete bundle.xp;
      if (bundle.ouro === 0) delete bundle.ouro;
      await require("./rewardPayoutService").aplicarPacoteDeRecompensa(
        grant.recipient_id,
        bundle,
        transaction,
      );
    } else {
      const guild = await require("../models/Guild").findByPk(
        grant.recipient_id,
        { transaction, lock: transaction.LOCK.UPDATE },
      );
      if (!guild) throw new Error("Guilda de recompensa ausente.");
      for (const p of grant.payload_snapshot) {
        if (p.type === "GUILD_XP") {
          await require("./guildXpService").concederExperiencia(
            guild,
            p.quantity,
          );
          guild.experiencia_total_ganha =
            Number(guild.experiencia_total_ganha ?? 0) + p.quantity;
        }
        if (p.type === "GUILD_TREASURY_GOLD") guild.tesouro += p.quantity;
      }
      await guild.save({ transaction });
    }
    grant.status = "Granted";
    grant.granted_at = new Date();
    await grant.save({ transaction });
    return true;
  });
}
async function recover() {
  const { Op } = require("sequelize");
  const events = await M.Event.findAll({
    where: { status: "COMPLETED", rewards_done: false },
  });
  for (const event of events) {
    const pending = await M.Grant.findAll({
      where: { event_id: event.id, status: { [Op.ne]: "Granted" } },
      attributes: ["id"],
    });
    for (const grant of pending)
      try {
        await processGrant(grant.id);
      } catch (e) {
        console.error("[worldcrisis] reward_grant_failed", grant.id, e.message);
      }
    if (
      !(await M.Grant.count({
        where: { event_id: event.id, status: { [Op.ne]: "Granted" } },
      }))
    )
      await event.update({ rewards_done: true });
  }
}
module.exports = { prepare, processGrant, recover, eligible };
