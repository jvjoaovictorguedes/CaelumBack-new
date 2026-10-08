const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const {
  State,
  Delivery,
  Change,
  Interaction,
} = require("../models/discordNewsModels");
const PatchNote = require("../models/PatchNote");
const { config } = require("./config");
const { patchVisible } = require("./presentation");
const { harvestPatchNotes } = require("../services/discordNewsService");
const { sendMessage, verifyDestination } = require("./api");
async function tick({
  send = sendMessage,
  checkDestination = verifyDestination,
} = {}) {
  const c = config();
  if (!c.enabled || !c.ready) return;
  const state = await State.findByPk(1);
  if (!state?.enabled) return;
  if (!(await checkDestination())) return;
  await harvestPatchNotes();
  // A crashed process may have sent a message. Never blindly retry an ambiguous POST.
  await Delivery.update(
    {
      status: "Review",
      last_error: "Processo interrompido; confirme a mensagem no canal.",
    },
    {
      where: {
        status: "Sending",
        updatedAt: { [Op.lt]: new Date(Date.now() - 120000) },
      },
    },
  );
  await Interaction.destroy({
    where: { createdAt: { [Op.lt]: new Date(Date.now() - 600000) } },
  });
  const delivery = await sequelize.transaction(async (transaction) => {
    const d = await Delivery.findOne({
      where: { status: "Pending", available_at: { [Op.lte]: new Date() } },
      order: [["id", "ASC"]],
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
      transaction,
    });
    if (!d) return null;
    if (d.kind === "patch") {
      const note = await PatchNote.findByPk(d.source_id, { transaction });
      if (!note || !patchVisible(note)) {
        await d.update(
          {
            status: "Canceled",
            last_error: "Patch deixou de estar publicado.",
          },
          { transaction },
        );
        return null;
      }
    } else {
      const change = await Change.findByPk(d.source_id, { transaction });
      if (
        !change ||
        change.status !== "Approved" ||
        change.release_env !== c.environment
      ) {
        await d.update(
          {
            status: "Canceled",
            last_error: "Alteração não aprovada neste ambiente.",
          },
          { transaction },
        );
        return null;
      }
    }
    await d.update(
      { status: "Sending", attempts: d.attempts + 1, channel_id: c.channelId },
      { transaction },
    );
    return d;
  });
  if (!delivery) return;
  try {
    const message = await send(
      delivery.channel_id,
      delivery.payload,
      `caelum-news-${delivery.id}`,
    );
    if (!/^\d{17,20}$/.test(message?.id || ""))
      throw Object.assign(new Error("Resposta sem confirmação da mensagem."), {
        ambiguous: true,
      });
    await delivery.update({
      status: "Sent",
      message_id: message.id,
      last_error: null,
    });
  } catch (e) {
    const retry = e.status === 429 && delivery.attempts < 10;
    await delivery.update({
      status: e.ambiguous ? "Review" : retry ? "Pending" : "Failed",
      available_at: new Date(
        Date.now() + Math.max(1, Math.min(3600, e.retryAfter || 30)) * 1000,
      ),
      last_error: e.ambiguous
        ? "Envio incerto: confira o canal antes de reenviar."
        : e.status
          ? `Discord HTTP ${e.status}`
          : "Falha local no envio.",
    });
  }
}
let timer,
  busy = false;
function start() {
  if (timer || !config().enabled || process.env.VERCEL) return;
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      await tick();
    } catch {
      console.error("[Discord News] Falha no processamento da fila.");
    } finally {
      busy = false;
    }
  };
  timer = setInterval(run, 15000);
  timer.unref();
  run();
}
function stop() {
  clearInterval(timer);
  timer = null;
}
module.exports = { tick, start, stop };
