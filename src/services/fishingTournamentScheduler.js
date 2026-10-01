// Torneio da Pesca — fechamento automático (ideia #1 da fila de
// melhorias, bug reportado: "o torneio acaba de forma automática, não
// contabiliza os vencedores, nem o ranking do torneio e nem desativa o
// torneio automaticamente"). Mesmo padrão de worldBossScheduler.js: um
// tick periódico que faz o mundo seguir vivendo sem depender de nenhuma
// ação de admin.
//
// O ranking em si NUNCA precisa ser persistido à parte: é sempre
// recalculado a partir de fishing_catch_records (histórico imutável,
// mesmo princípio de fishingTournamentService.js) — um torneio já
// terminado continua dando o MESMO resultado pra sempre, já que
// termina_em não muda. A única coisa que este scheduler precisa
// GRAVAR é quem venceu (pra consulta rápida/histórico) e marcar o
// torneio como finalizado/inativo.
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const FishingTournament = require("../models/FishingTournament");
const { listarLeaderboardTorneio } = require("./fishingTournamentService");

const INTERVALO_MS = 30_000;
let intervalo = null;

// Idempotente por natureza: só processa torneio com ativo=true E
// finalizado_em ainda null E termina_em já passado — uma vez
// processado, nunca mais aparece nessa busca de novo.
async function finalizarTorneiosVencidos() {
  const vencidos = await FishingTournament.findAll({
    where: { ativo: true, finalizado_em: null, termina_em: { [Op.lt]: new Date() } },
  });

  for (const torneio of vencidos) {
    // eslint-disable-next-line no-await-in-loop
    await finalizarUmTorneio(torneio.id);
  }
  return vencidos.length;
}

async function finalizarUmTorneio(idTorneio) {
  // O cálculo do vencedor (leaderboard) é read-only e não precisa da
  // transação/lock — só a ESCRITA do resultado final precisa, pra duas
  // ticks concorrentes nunca processarem o mesmo torneio duas vezes.
  const leaderboard = await listarLeaderboardTorneio(idTorneio, 1);
  const vencedor = leaderboard.itens[0] ?? null;

  return sequelize.transaction(async (transaction) => {
    const torneio = await FishingTournament.findByPk(idTorneio, { transaction, lock: transaction.LOCK.UPDATE });
    // Já processado por outra tick enquanto esperávamos o leaderboard —
    // nunca sobrescreve um resultado já gravado.
    if (!torneio || !torneio.ativo || torneio.finalizado_em) return null;

    torneio.finalizado_em = new Date();
    torneio.ativo = false;
    torneio.vencedor_character_id = vencedor?.id ?? null;
    torneio.vencedor_nome = vencedor?.nome ?? null;
    await torneio.save({ transaction });

    console.log(
      `[fishingTournamentScheduler] torneio #${idTorneio} ("${torneio.nome}") finalizado — vencedor: ${vencedor?.nome ?? "ninguém se inscreveu/pescou"}.`,
    );
    return torneio;
  });
}

async function tick() {
  try {
    await finalizarTorneiosVencidos();
  } catch (error) {
    console.error("[fishingTournamentScheduler] falha ao finalizar torneios vencidos:", error);
  }
}

function iniciar() {
  if (intervalo) return;
  tick().catch((error) => console.error("[fishingTournamentScheduler] falha no tick inicial:", error));
  intervalo = setInterval(() => {
    tick().catch((error) => console.error("[fishingTournamentScheduler] falha no tick:", error));
  }, INTERVALO_MS);
  intervalo.unref?.();
}

module.exports = { iniciar, tick, finalizarTorneiosVencidos, finalizarUmTorneio };
