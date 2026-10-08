// Templo do Véu Celestial — Fase 2: laço periódico que promove o
// estado da Convergência sozinho, sem precisar de nenhuma ação de
// admin (§3.2/§12.3 — mesmo princípio de worldBossScheduler, mas um
// único tick: não existe "relógio de combate" global aqui, porque a
// Provação Final é solo e corre dentro do próprio attempt/socket,
// nunca num clock por servidor como World Boss).
const { sequelize } = require("../config/database");
const templeLifecycleService = require("./templeLifecycleService");
const gameSettingCache = require("./gameSettingCache");
const { GAME_SETTINGS_DEFAULT } = require("../config/templeConfig");

let intervalo = null;

async function tick() {
  try {
    await sequelize.transaction((transaction) => templeLifecycleService.promoverEstados(transaction));
  } catch (error) {
    console.error("[templeScheduler] falha ao promover estado da Convergência:", error);
  }
}

function iniciar() {
  if (intervalo) return;
  tick().catch((error) => console.error("[templeScheduler] falha no tick inicial:", error));
  const intervaloMs = gameSettingCache.obter(
    "temple.scheduler.tick_interval_ms",
    GAME_SETTINGS_DEFAULT["temple.scheduler.tick_interval_ms"],
  );
  intervalo = setInterval(() => {
    tick().catch((error) => console.error("[templeScheduler] falha no tick:", error));
  }, intervaloMs);
  intervalo.unref?.();
}

module.exports = { iniciar, tick };
