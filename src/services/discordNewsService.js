const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const { State, Change, Delivery } = require("../models/discordNewsModels");
const PatchNote = require("../models/PatchNote");
const { config } = require("../discord/config");
const P = require("../discord/presentation");
function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}
function reason(value) {
  if (
    typeof value !== "string" ||
    value.trim().length < 5 ||
    value.length > 500
  )
    fail("Informe um motivo entre 5 e 500 caracteres.");
  return value.trim();
}
async function queue(kind, sourceId, payload, transaction) {
  // Immutable first-publication snapshot. Never create a second delivery for the same source.
  const [delivery] = await Delivery.findOrCreate({
    where: { source_key: `${kind}:${sourceId}` },
    defaults: {
      kind,
      source_id: sourceId,
      payload,
      status: "Pending",
      available_at: new Date(),
      attempts: 0,
    },
    transaction,
  });
  return delivery;
}
async function captureAudit(log, transaction) {
  const row = log.toJSON();
  const changes = P.diff(row.entidade, row.dados_antes, row.dados_depois);
  if (changes.length && row.id_entidade)
    await Change.create(
      {
        audit_id: row.id,
        entity: row.entidade,
        entity_id: row.id_entidade,
        name: String(
          row.dados_depois.nome ||
            row.dados_antes.nome ||
            `${row.entidade} #${row.id_entidade}`,
        ).slice(0, 200),
        diff: changes,
        release_env: config().environment,
        status: "Pending",
      },
      { transaction },
    );
  // Patch notes are harvested by the worker only after being visible in the game.
}
async function harvestPatchNotes() {
  return sequelize.transaction(async (transaction) => {
    const state = await State.findByPk(1, { transaction });
    if (!state?.auto_patch_notes) return;
    const notes = await PatchNote.findAll({
      where: {
        [Op.and]: [
          {
            [Op.or]: [
              { createdAt: { [Op.gte]: state.capture_since } },
              { updatedAt: { [Op.gte]: state.capture_since } },
            ],
          },
          sequelize.literal(
            `NOT EXISTS (SELECT 1 FROM discord_news_deliveries d WHERE d.source_key = 'patch:' || "PatchNote".id::text)`,
          ),
        ],
        [Op.or]: [
          { status: "Publicado" },
          {
            status: "Agendado",
            publicado_em: { [Op.lte]: sequelize.literal("CURRENT_DATE") },
          },
        ],
      },
      order: [["id", "ASC"]],
      limit: 100,
      transaction,
    });
    // A NOT EXISTS filter prevents a fixed first page from starving later publications.
    for (const note of notes)
      await queue(
        "patch",
        note.id,
        P.patchPayload(note, config().environment),
        transaction,
      );
  });
}
async function auditAction(
  idAdmin,
  req,
  transaction,
  acao,
  idEntidade,
  antes,
  depois,
  motivo,
) {
  await require("./adminAuditService").registrarAcao({
    idAdmin,
    req,
    transaction,
    acao,
    entidade: "DiscordNews",
    idEntidade,
    dadosAntes: antes,
    dadosDepois: depois,
    motivo,
  });
}
async function dashboard() {
  const c = config();
  const [state, changes, deliveries] = await Promise.all([
    State.findByPk(1),
    Change.findAll({ order: [["id", "DESC"]], limit: 100 }),
    Delivery.findAll({ order: [["id", "DESC"]], limit: 100 }),
  ]);
  return {
    environment: c.environment,
    configured: c.ready,
    enabled: c.enabled && !!state?.enabled,
    environment_enabled: c.enabled,
    state,
    application_id: c.applicationId || null,
    guild_id: c.guildId || null,
    channel_id: c.channelId || null,
    checks: {
      bot_token: !!c.token,
      public_key: /^[a-f0-9]{64}$/i.test(c.publicKey || ""),
      ids: [c.applicationId, c.guildId, c.channelId].every((x) =>
        /^\d{17,20}$/.test(x || ""),
      ),
    },
    changes,
    deliveries,
  };
}
async function updateSettings(
  data,
  actor,
  { checkDestination = require("../discord/api").verifyDestination } = {},
) {
  const why = reason(data.reason);
  if (
    typeof data.enabled !== "boolean" ||
    typeof data.auto_patch_notes !== "boolean"
  )
    fail("Configurações devem ser booleanas.");
  const c = config();
  if (data.enabled && (!c.ready || !c.enabled))
    fail("Configure os segredos e DISCORD_NEWS_ENABLED antes de habilitar.");
  if (data.enabled) {
    let valid;
    try {
      valid = await checkDestination();
    } catch {
      fail(
        "Não foi possível validar o canal no Discord. Confira o token e as permissões.",
        502,
      );
    }
    if (!valid)
      fail("Escolha um canal de texto ou anúncios do servidor configurado.");
  }
  return sequelize.transaction(async (transaction) => {
    const state = await State.findByPk(1, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const before = state.toJSON();
    await state.update(
      { enabled: data.enabled, auto_patch_notes: data.auto_patch_notes },
      { transaction },
    );
    await auditAction(
      actor.idAdmin,
      actor.req,
      transaction,
      "configurar",
      1,
      before,
      state.toJSON(),
      why,
    );
    return state;
  });
}
async function reviewChange(id, data, actor) {
  const why = reason(data.reason);
  if (!["approve", "reject"].includes(data.action)) fail("Ação inválida.");
  return sequelize.transaction(async (transaction) => {
    const change = await Change.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!change) fail("Alteração não encontrada.", 404);
    if (change.release_env !== config().environment)
      fail("Alteração pertence a outro ambiente.", 409);
    if (change.status !== "Pending")
      fail("Esta alteração já foi revisada.", 409);
    const before = change.toJSON();
    await change.update(
      {
        status: data.action === "approve" ? "Approved" : "Rejected",
        approved_at: data.action === "approve" ? new Date() : null,
      },
      { transaction },
    );
    if (change.status === "Approved")
      await queue("change", change.id, P.changePayload(change), transaction);
    await auditAction(
      actor.idAdmin,
      actor.req,
      transaction,
      data.action === "approve" ? "publicar_alteracao" : "rejeitar_alteracao",
      change.id,
      before,
      change.toJSON(),
      why,
    );
    return change;
  });
}
async function queuePatch(id, data, actor) {
  const why = reason(data.reason);
  return sequelize.transaction(async (transaction) => {
    const note = await PatchNote.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!note) fail("Patch note não encontrada.", 404);
    if (!P.patchVisible(note))
      fail("Somente patch notes já visíveis no jogo podem ser enviadas.");
    const delivery = await queue(
      "patch",
      note.id,
      P.patchPayload(note, config().environment),
      transaction,
    );
    await auditAction(
      actor.idAdmin,
      actor.req,
      transaction,
      "enfileirar_patch",
      note.id,
      null,
      { delivery_id: delivery.id },
      why,
    );
    return delivery;
  });
}
async function retry(id, data, actor) {
  const why = reason(data.reason);
  return sequelize.transaction(async (transaction) => {
    const d = await Delivery.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!d) fail("Envio não encontrado.", 404);
    if (d.status !== "Failed")
      fail(
        "Somente falhas confirmadas podem ser reenviadas. Envios incertos exigem conciliação.",
        409,
      );
    const before = d.toJSON();
    await d.update(
      {
        status: "Pending",
        available_at: new Date(),
        attempts: 0,
        last_error: null,
      },
      { transaction },
    );
    await auditAction(
      actor.idAdmin,
      actor.req,
      transaction,
      "reenviar",
      d.id,
      before,
      d.toJSON(),
      why,
    );
    return d;
  });
}
async function reconcile(id, data, actor) {
  const why = reason(data.reason);
  if (
    !/^\d{17,20}$/.test(data.message_id || "") ||
    !["found", "absent"].includes(data.action)
  ) {
    if (data.action !== "absent")
      fail(
        "Informe found e o ID da mensagem, ou absent após conferir o canal.",
      );
  }
  return sequelize.transaction(async (transaction) => {
    const d = await Delivery.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!d) fail("Envio não encontrado.", 404);
    if (d.status !== "Review") fail("Envio não precisa de conciliação.", 409);
    const before = d.toJSON();
    if (data.action === "found") {
      const message = await require("../discord/api").getMessage(
        d.channel_id,
        data.message_id,
      );
      if (
        message.author?.id !== config().applicationId ||
        !(
          message.nonce === `caelum-news-${d.id}` ||
          (message.embeds?.[0]?.footer?.text ===
            d.payload.embeds?.[0]?.footer?.text &&
            message.embeds?.[0]?.description ===
              d.payload.embeds?.[0]?.description &&
            message.embeds?.[0]?.title === d.payload.embeds?.[0]?.title)
        )
      )
        fail("A mensagem não pertence a este envio.");
      await d.update(
        { status: "Sent", message_id: data.message_id, last_error: null },
        { transaction },
      );
    } else
      await d.update(
        {
          status: "Failed",
          last_error: "Ausência da mensagem confirmada pelo administrador.",
        },
        { transaction },
      );
    await auditAction(
      actor.idAdmin,
      actor.req,
      transaction,
      "conciliar",
      d.id,
      before,
      d.toJSON(),
      why,
    );
    return d;
  });
}
module.exports = {
  captureAudit,
  harvestPatchNotes,
  dashboard,
  updateSettings,
  reviewChange,
  queuePatch,
  retry,
  reconcile,
  queue,
};
