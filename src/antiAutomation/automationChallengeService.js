const { sequelize } = require("../config/database");
const { Op } = require("sequelize");
const Risk = require("../models/AutomationRiskState");
const Challenge = require("../models/AutomationChallenge");
const { policy } = require("./automationPolicyService");
const { failure } = require("./antiAutomationErrors");
const { recordSignal } = require("./automationTelemetryService");
async function gate(characterId, actionType) {
  const config = policy();
  if (!config.enabled || config.shadow_mode) return;
  const character = await require("../models/Character").findByPk(characterId);
  if (character && require("../services/pveEncounterService").encontroValido(character)) return;
  if (
    require("../socket/pvpLiveSocket").duelPorPersonagem.has(
      String(characterId),
    )
  )
    return;
  if (
    require("../socket/partySocket").estaEmBatalha(characterId) ||
    require("../socket/guildBossSocket").estaEmBatalha(characterId)
  )
    return;
  const fishing = await require("../models/FishingSession").findOne({
    where: {
      id_personagem: characterId,
      fase: {
        [Op.notIn]: require("../services/fishingService").FASES_TERMINAIS,
      },
      expires_at: { [Op.gt]: new Date() },
    },
  });
  if (fishing) return;
  if (
    await require("../models/WorldBossCombatSession").findOne({
      where: { character_id: characterId, status: "Ativo" },
    })
  )
    return;
  const state = await Risk.findByPk(characterId);
  if (!state) return;
  const now = Date.now();
  if (new Date(state.exempt_until || 0).getTime() > now) return;
  if (
    config.restriction_enabled &&
    new Date(state.restricted_until || 0).getTime() > now
  )
    throw failure(
      "ANTI_AUTOMATION_TEMPORARILY_RESTRICTED",
      403,
      new Date(state.restricted_until).getTime() - now,
    );
  const decayedScore = Math.max(
    0,
    state.score -
      (Math.max(0, now - new Date(state.last_decay_at || now).getTime()) /
        3600000) *
        config.decay_per_hour,
  );
  if (
    config.challenge_enabled &&
    decayedScore >= config.challenge_threshold &&
    (state.signal_families || []).length >= 2 &&
    new Date(state.verified_until || 0).getTime() <= now
  ) {
    // Missing provider configuration must not cause a global lockout.
    if (
      !process.env.TURNSTILE_SECRET_KEY ||
      !process.env.TURNSTILE_SITE_KEY ||
      !process.env.TURNSTILE_HOSTNAMES
    )
      return;
    throw failure("ANTI_AUTOMATION_CHALLENGE_REQUIRED", 403);
  }
}
async function issue(characterId) {
  // Require the same gate as gameplay; normal users cannot trigger challenges.
  try {
    await gate(characterId, "CHALLENGE");
    return { required: false };
  } catch (error) {
    if (error.code !== "ANTI_AUTOMATION_CHALLENGE_REQUIRED") throw error;
  }
  return sequelize.transaction(async (transaction) => {
    await Risk.findByPk(characterId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    let challenge = await Challenge.findOne({
      where: {
        id_personagem: characterId,
        status: "PENDING",
        expires_at: { [Op.gt]: new Date() },
      },
      transaction,
    });
    if (!challenge)
      challenge = await Challenge.create(
        {
          id_personagem: characterId,
          expires_at: new Date(Date.now() + 300000),
        },
        { transaction },
      );
    return {
      required: true,
      challengeId: challenge.id,
      siteKey: process.env.TURNSTILE_SITE_KEY,
    };
  });
}
async function siteverify(token, challengeId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        signal: controller.signal,
        body: new URLSearchParams({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: token,
        }),
      },
    );
    if (!response.ok) throw new Error("Provider unavailable");
    const result = await response.json();
    const hostnames = (process.env.TURNSTILE_HOSTNAMES || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!hostnames.length) throw new Error("Provider hostnames not configured");
    return (
      result.success === true &&
      result.action === "caelum-verify" &&
      result.cdata === challengeId &&
      hostnames.includes(result.hostname)
    );
  } finally {
    clearTimeout(timer);
  }
}
async function verify(characterId, id, token, verifier = siteverify) {
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw failure("INVALID_ACTION_STATE", 400);
  if (typeof token !== "string" || token.length < 1 || token.length > 2048)
    throw failure("INVALID_ACTION_STATE", 400);
  const config = policy();
  const outcome = await sequelize.transaction(async (transaction) => {
    const state = await Risk.findByPk(characterId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const challenge = await Challenge.findOne({
      where: { id, id_personagem: characterId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (
      !state ||
      !challenge ||
      challenge.status !== "PENDING" ||
      new Date(challenge.expires_at) <= new Date()
    )
      throw failure("ACTION_REPLAYED", 409);
    let passed;
    try {
      passed = await verifier(token, id);
    } catch {
      if (!config.turnstile_fail_open)
        throw failure("ACTION_RATE_LIMITED", 503, 30000);
      challenge.status = "PROVIDER_UNAVAILABLE";
      state.verified_until = new Date(Date.now() + 300000);
      await challenge.save({ transaction });
      await state.save({ transaction });
      return { verified: true, providerUnavailable: true };
    }
    challenge.attempts += 1;
    if (passed) {
      challenge.status = "VERIFIED";
      challenge.verified_at = new Date();
      state.verified_until = new Date(
        Date.now() + config.verified_minutes * 60000,
      );
      state.score = Math.max(0, state.score - 20);
      state.status = "VERIFIED_WINDOW";
      state.last_decay_at = new Date();
    } else if (challenge.attempts >= 3) {
      challenge.status = "FAILED";
      if (
        !config.shadow_mode &&
        config.restriction_enabled &&
        state.score >= config.restriction_threshold &&
        (state.signal_families || []).length >= 2
      ) {
        state.restricted_until = new Date(
          Date.now() + config.restriction_minutes * 60000,
        );
        state.status = "TEMPORARILY_RESTRICTED";
      }
    }
    await challenge.save({ transaction });
    await state.save({ transaction });
    return { verified: passed };
  });
  if (!outcome.verified)
    void recordSignal({
      characterId,
      type: "CHALLENGE_FAILED",
      actionType: "CHALLENGE",
    });
  return outcome;
}
module.exports = { gate, issue, verify, siteverify };
