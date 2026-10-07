const router = require("express").Router();
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Risk = require("../models/AutomationRiskState");
const Event = require("../models/AutomationEvent");
const Challenge = require("../models/AutomationChallenge");
const Setting = require("../models/GameSetting");
const { registrarAcao } = require("../services/adminAuditService");
const {
  policy,
  validate,
} = require("../antiAutomation/automationPolicyService");
const permission = require("../middlewares/requireAdminPermission");
router.use(
  require("../middlewares/authMiddleware"),
  require("../middlewares/adminMiddleware"),
);
const handle = (operation) => async (req, res, next) => {
  try {
    res.json({ status: "success", data: await operation(req) });
  } catch (error) {
    if (error.statusCode)
      return res.status(error.statusCode).json({ message: error.message });
    next(error);
  }
};
router.get(
  "/",
  permission("anti_automation.view"),
  handle(async (req) => {
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const where = {};
    if (req.query.status) where.status = String(req.query.status).slice(0, 40);
    const states = await Risk.findAndCountAll({
      where,
      order: [
        ["score", "DESC"],
        ["id_personagem", "ASC"],
      ],
      limit: 50,
      offset: (page - 1) * 50,
    });
    const counts = await Event.findAll({
      attributes: [
        "event_type",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: { createdAt: { [Op.gt]: new Date(Date.now() - 86400000) } },
      group: ["event_type"],
      raw: true,
    });
    return {
      total: states.count,
      items: states.rows,
      signalsLastDay: counts,
      policy: policy(),
    };
  }),
);
router.get(
  "/config",
  permission("anti_automation.view"),
  handle(() => policy()),
);
router.patch(
  "/config",
  permission("anti_automation.manage"),
  handle(async (req) => {
    const reason = String(req.body.reason || "").trim();
    if (reason.length < 5 || reason.length > 500)
      throw Object.assign(
        new Error("Informe uma justificativa de 5 a 500 caracteres."),
        { statusCode: 400 },
      );
    let next;
    try {
      next = validate(req.body.values);
    } catch (error) {
      error.statusCode = 400;
      throw error;
    }
    await sequelize.transaction(async (transaction) => {
      for (const [key, value] of Object.entries(next))
        await Setting.upsert(
          { chave: `anti_automation.${key}`, valor: value },
          { transaction },
        );
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "anti_automation.config",
        entidade: "AntiAutomation",
        dadosAntes: policy(),
        dadosDepois: next,
        motivo: reason,
        transaction,
      });
    });
    await require("../services/gameSettingCache").recarregar();
    return policy();
  }),
);
router.get(
  "/:id",
  permission("anti_automation.view"),
  handle(async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1)
      throw Object.assign(new Error("Personagem inválido."), {
        statusCode: 400,
      });
    return {
      state: await Risk.findByPk(id),
      events: await Event.findAll({
        where: { id_personagem: id },
        order: [
          ["createdAt", "DESC"],
          ["id", "DESC"],
        ],
        limit: 100,
      }),
      challenges: await Challenge.findAll({
        where: { id_personagem: id },
        order: [["createdAt", "DESC"]],
        limit: 30,
      }),
    };
  }),
);
router.post(
  "/:id/review",
  permission("anti_automation.manage"),
  handle(async (req) => {
    const id = Number(req.params.id),
      action = req.body.action,
      reason = String(req.body.reason || "").trim();
    if (
      !Number.isInteger(id) ||
      id < 1 ||
      reason.length < 5 ||
      reason.length > 500 ||
      !["reviewed", "reset", "release", "challenge", "exempt"].includes(action)
    )
      throw Object.assign(
        new Error("Revisão inválida; informe ação e justificativa."),
        { statusCode: 400 },
      );
    return sequelize.transaction(async (transaction) => {
      const state = await Risk.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!state)
        throw Object.assign(new Error("Estado de risco não encontrado."), {
          statusCode: 404,
        });
      const before = state.toJSON();
      if (action === "reset") {
        state.score = 0;
        state.status = "NORMAL";
        state.signal_families = [];
        state.last_decay_at = new Date();
        state.restricted_until = null;
      }
      if (action === "release") {
        state.restricted_until = null;
        state.status = "OBSERVATION";
      }
      if (action === "challenge") {
        state.score = Math.max(state.score, policy().challenge_threshold);
        state.signal_families = ["ADMIN_REVIEW", "MANUAL_CHALLENGE"];
        state.status = "CHALLENGE_PENDING";
        state.verified_until = null;
      }
      if (action === "exempt")
        state.exempt_until = new Date(Date.now() + 3600000);
      state.version += 1;
      await state.save({ transaction });
      await registrarAcao({
        idAdmin: req.user.id,
        acao: `anti_automation.${action}`,
        entidade: "AutomationRiskState",
        idEntidade: id,
        dadosAntes: before,
        dadosDepois: state.toJSON(),
        motivo: reason,
        transaction,
      });
      return state;
    });
  }),
);
module.exports = router;
