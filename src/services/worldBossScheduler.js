// Boss Global — Fase 3: laço periódico que avança o ciclo sozinho,
// sem precisar de nenhuma ação de admin (§20 spec — o mundo tem que
// seguir vivendo mesmo sem ninguém olhando).
//
// A cada tick:
//   1. agendarProximoCiclo — bootstrap (nenhum evento existe ainda) E
//      recovery (um DEFEATED ficou sem sucessor porque o processo
//      caiu antes de agendar o próximo) são o MESMO caso: idempotente,
//      não faz nada se já existe aberto ou em COOLDOWN.
//   2. ativarSeElegivel — COOLDOWN -> DORMANT quando next_eligible_at
//      já passou. Continua silencioso (nunca emite socket): o mundo
//      não sabe que uma ameaça está à espreita até ser descoberta.
//   3. despertarSeNecessario — DISCOVERED -> ACTIVE quando
//      auto_awaken_at já passou (ninguém precisou "avisar" nada; o
//      despertar automático é a garantia de que a luta sempre começa,
//      mesmo se o descobridor sumir). Esse SIM é público — broadcast
//      pra sala global.
const { sequelize } = require("../config/database");
const WorldBossEvent = require("../models/WorldBossEvent");
const worldBossLifecycleService = require("./worldBossLifecycleService");
const worldBossStatusService = require("./worldBossStatusService");
const { emitGlobal } = require("../socket/worldBossSocket");
const { EVENT_STATUS } = require("../config/worldBossConfig");

const INTERVALO_MS = 15_000;
let intervalo = null;

async function despertarSeNecessario() {
  return sequelize.transaction(async (transaction) => {
    const evento = await WorldBossEvent.findOne({
      where: { status: EVENT_STATUS.DISCOVERED },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!evento) return null;
    if (evento.auto_awaken_at && new Date(evento.auto_awaken_at).getTime() > Date.now()) return null;

    evento.status = EVENT_STATUS.ACTIVE;
    evento.activated_at = new Date();
    await evento.save({ transaction });
    return evento;
  });
}

async function tick() {
  try {
    await sequelize.transaction((transaction) => worldBossLifecycleService.agendarProximoCiclo(transaction));
  } catch (error) {
    console.error("[worldBossScheduler] falha ao agendar próximo ciclo:", error);
  }

  try {
    await sequelize.transaction((transaction) => worldBossLifecycleService.ativarSeElegivel(transaction));
  } catch (error) {
    console.error("[worldBossScheduler] falha ao ativar ciclo (COOLDOWN->DORMANT):", error);
  }

  try {
    const despertou = await despertarSeNecessario();
    if (despertou) {
      const status = await worldBossStatusService.obterStatusPublico();
      emitGlobal("worldboss:desperta", status);
    }
  } catch (error) {
    console.error("[worldBossScheduler] falha ao despertar evento descoberto:", error);
  }
}

function iniciar() {
  if (intervalo) return;
  tick().catch((error) => console.error("[worldBossScheduler] falha no tick inicial:", error));
  intervalo = setInterval(() => {
    tick().catch((error) => console.error("[worldBossScheduler] falha no tick:", error));
  }, INTERVALO_MS);
  intervalo.unref?.();
}

module.exports = { iniciar, tick };
