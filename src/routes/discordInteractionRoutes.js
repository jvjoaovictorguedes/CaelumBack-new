const express = require("express");
const crypto = require("node:crypto");
const { Op } = require("sequelize");
const { config } = require("../discord/config");
const { Interaction } = require("../models/discordNewsModels");
const { answer } = require("../discord/knowledge");
const router = express.Router();
function verifySignature(
  raw,
  signature,
  timestamp,
  publicKey,
  now = Date.now(),
) {
  if (
    !Buffer.isBuffer(raw) ||
    !/^[a-f0-9]{128}$/i.test(signature || "") ||
    !/^\d{10}$/.test(timestamp || "") ||
    !/^[a-f0-9]{64}$/i.test(publicKey || "") ||
    Math.abs(now - Number(timestamp) * 1000) > 300000
  )
    return false;
  try {
    return crypto.verify(
      null,
      Buffer.concat([Buffer.from(timestamp), raw]),
      crypto.createPublicKey({
        key: Buffer.concat([
          Buffer.from("302a300506032b6570032100", "hex"),
          Buffer.from(publicKey, "hex"),
        ]),
        format: "der",
        type: "spki",
      }),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}
router.post(
  "/interactions",
  express.raw({ type: "application/json", limit: "32kb" }),
  async (req, res) => {
    const c = config();
    if (
      !verifySignature(
        req.body,
        req.get("x-signature-ed25519"),
        req.get("x-signature-timestamp"),
        c.publicKey,
      )
    )
      return res.status(401).json({ error: "Assinatura inválida." });
    let interaction;
    try {
      interaction = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).json({ error: "JSON inválido." });
    }
    if (interaction.type === 1) return res.json({ type: 1 });
    const reply = (content) =>
      res.json({
        type: 4,
        data: { content, flags: 64, allowed_mentions: { parse: [] } },
      });
    if (
      interaction.application_id !== c.applicationId ||
      interaction.guild_id !== c.guildId
    )
      return res.status(403).json({ error: "Servidor não autorizado." });
    if (!c.enabled || !c.ready)
      return reply("News Caelum ainda não foi habilitado.");
    if (
      !/^\d{17,20}$/.test(interaction.id || "") ||
      !/^\d{17,20}$/.test(interaction.member?.user?.id || "")
    )
      return res.status(400).json({ error: "Identidade inválida." });
    if (interaction.type !== 2)
      return res.status(400).json({ error: "Tipo não suportado." });
    // Reply within Discord's 3-second window. Never store/log interaction tokens.
    let timer;
    const work = (async () => {
      try {
        const state =
          await require("../models/discordNewsModels").State.findByPk(1);
        if (!state?.enabled)
          return "News Caelum está desativado pelo administrador.";
        const userId = interaction.member.user.id;
        const count = await Interaction.count({
          where: {
            user_id: userId,
            createdAt: { [Op.gte]: new Date(Date.now() - 60000) },
          },
        });
        if (count >= 20)
          return "Aguarde um minuto antes de consultar novamente.";
        await Interaction.create({ id: interaction.id, user_id: userId });
        const options = Object.fromEntries(
          (interaction.data?.options || [])
            .filter((o) => typeof o.name === "string")
            .map((o) => [o.name, o.value]),
        );
        return await answer(interaction.data?.name, options);
      } catch (e) {
        return e.name === "SequelizeUniqueConstraintError"
          ? "Este comando já foi recebido."
          : "Não foi possível consultar os dados oficiais agora. Tente novamente.";
      }
    })();
    try {
      const content = await Promise.race([
        work,
        new Promise((resolve) => {
          timer = setTimeout(
            () =>
              resolve(
                "A consulta demorou mais que o esperado. Tente novamente em instantes.",
              ),
            2200,
          );
        }),
      ]);
      return reply(content);
    } finally {
      clearTimeout(timer);
    }
  },
);
module.exports = router;
module.exports.verifySignature = verifySignature;
