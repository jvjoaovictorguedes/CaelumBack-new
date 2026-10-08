const M = require("../models/worldCrisisModels");
async function announce(
  event,
  type,
  title,
  message,
  transaction,
  payload = {},
) {
  const seq =
    Number(
      (await M.Announcement.max("seq", {
        where: { event_id: event.id },
        transaction,
      })) || 0,
    ) + 1;
  return M.Announcement.create(
    { event_id: event.id, seq, type, title, message, payload },
    { transaction },
  );
}
async function pending(event, characterId) {
  const state = await M.UiState.findOne({
    where: { event_id: event.id, character_id: characterId },
  });
  const { Op } = require("sequelize");
  const rows = await M.Announcement.findAll({
    where: {
      event_id: event.id,
      seq: { [Op.gt]: state?.last_seen_announcement_seq ?? 0 },
    },
    order: [["seq", "ASC"]],
    raw: true,
  });
  if (!rows.length) return null;
  const last = rows.at(-1);
  return {
    ...last,
    catch_up: rows.length > 1,
    message:
      rows.length > 1
        ? `Enquanto você esteve ausente, Caelum passou por ${rows.length} acontecimentos. ${last.message}`
        : last.message,
  };
}
async function ack(characterId, eventId, seq) {
  const { sequelize } = require("../config/database");
  const { number, fail } = require("./worldCrisisConfigService");
  number(seq, 1, 2147483647, "Anúncio", true);
  return sequelize.transaction(async (transaction) => {
    const event = await M.Event.findByPk(eventId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (
      !event ||
      !(await M.Announcement.findOne({
        where: { event_id: eventId, seq },
        transaction,
      }))
    )
      throw fail("Anúncio inexistente.");
    let state = await M.UiState.findOne({
      where: { event_id: eventId, character_id: characterId },
      transaction,
    });
    if (!state)
      state = await M.UiState.create(
        {
          event_id: eventId,
          character_id: characterId,
          last_seen_announcement_seq: 0,
        },
        { transaction },
      );
    state.last_seen_announcement_seq = Math.max(
      state.last_seen_announcement_seq,
      seq,
    );
    await state.save({ transaction });
    return state;
  });
}
module.exports = { announce, pending, ack };
