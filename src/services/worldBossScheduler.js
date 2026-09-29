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
//   4. retomarRecompensasPendentes (Fase 5, §16) — rede de segurança
//      pro lote de recompensas: o caminho rápido já dispara na hora do
//      Golpe Final (worldBossCombatService, fire-and-forget), mas se
//      isso falhar ou o processo cair no meio do lote, todo evento
//      DEFEATED com participation_rewards_status Pending/Processing é
//      retomado daqui — idempotente, nunca credita de novo o que já
//      virou Granted.
const { sequelize } = require("../config/database");
const WorldBossEvent = require("../models/WorldBossEvent");
const worldBossLifecycleService = require("./worldBossLifecycleService");
const worldBossRuntimeService = require("./worldBossRuntimeService");
const worldBossStatusService = require("./worldBossStatusService");
const worldBossRewardService = require("./worldBossRewardService");
const { emitGlobal } = require("../socket/worldBossSocket");
const { EVENT_STATUS } = require("../config/worldBossConfig");

const INTERVALO_MS = 15_000;
// Ameaça Mundial V2 §3.2/§9.2 — o relógio do Boss precisa de um tick
// bem mais curto que o de gerenciamento de ciclo acima: intervalo_acao_ms
// default é 3000ms e uma fase pode configurar algo ainda mais curto.
// 1000ms garante next_action_at nunca atrasar mais que 1s em relação ao
// que foi persistido — worldBossRuntimeService.processarProximaAcao já
// é no-op na esmagadora maioria das chamadas (só age quando o horário
// realmente já passou).
const INTERVALO_COMBATE_MS = 1_000;
let intervalo = null;
let intervaloCombate = null;

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

  try {
    await worldBossRewardService.retomarRecompensasPendentes();
  } catch (error) {
    console.error("[worldBossScheduler] falha ao retomar recompensas pendentes:", error);
  }
}

async function tickCombate() {
  try {
    await worldBossRuntimeService.processarProximaAcao();
  } catch (error) {
    console.error("[worldBossScheduler] falha no tick de combate do boss:", error);
  }
}

function iniciar() {
  if (intervalo) return;
  tick().catch((error) => console.error("[worldBossScheduler] falha no tick inicial:", error));
  intervalo = setInterval(() => {
    tick().catch((error) => console.error("[worldBossScheduler] falha no tick:", error));
  }, INTERVALO_MS);
  intervalo.unref?.();

  intervaloCombate = setInterval(tickCombate, INTERVALO_COMBATE_MS);
  intervaloCombate.unref?.();
}

module.exports = { iniciar, tick, tickCombate };
