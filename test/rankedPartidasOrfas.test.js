// Bug reportado: "Ranking PVP Ranqueado não está contabilizando".
// Causa raiz encontrada: finalizarDueloRanked apaga o duelo da memória
// ANTES de tentar persistir rating/V-D — se essa persistência falhar
// por qualquer motivo transitório (sem chance de retry no mesmo
// processo, já que o estado em memória já era removido), a partida
// fica "EmAndamento" pra sempre no banco. O encerrarPartidasOrfas só
// rodava UMA VEZ no boot do processo — se o servidor não reiniciasse
// logo depois, a partida (e a rating pendente dela) ficava perdida por
// horas/dias. Agora roda periodicamente (rankedLiveSocket.
// iniciarVarredorDePartidasOrfas). Esta suíte prova que a varredura:
// 1) nunca falha uma partida que ainda está sendo jogada de verdade
//    neste mesmo processo (duelo ainda em pvpLiveSocket.duelos);
// 2) limpa de verdade uma partida genuinamente travada, devolvendo a
//    tentativa diária.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const pvpLiveSocket = require("../src/socket/pvpLiveSocket");
const rankedLiveSocket = require("../src/socket/rankedLiveSocket");
const rankedSeasonService = require("../src/services/rankedSeasonService");
const rankedDailyLimitService = require("../src/services/rankedDailyLimitService");
const RankedMatch = require("../src/models/RankedMatch");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

async function criarPartidaEmAndamento({ minutosAtras, desafianteId, defensorId, temporadaId, dateKey }) {
  const iniciadaEm = new Date(Date.now() - minutosAtras * 60 * 1000);
  return RankedMatch.create({
    season_id: temporadaId,
    id_jogador1: desafianteId,
    id_jogador2: defensorId,
    rating_jogador1_antes: 1000,
    rating_jogador2_antes: 1000,
    defensor_controlado_por_ia: true,
    date_key: dateKey,
    status: "EmAndamento",
    iniciada_em: iniciadaEm,
  });
}

testeComBanco("varredura NUNCA falha uma partida cujo duelo ainda existe em memória (ainda sendo jogada de verdade)", async () => {
  const { personagem: desafiante } = await criarPersonagem({ nivel: 10 });
  const { personagem: defensor } = await criarPersonagem({ nivel: 10 });
  const temporada = await rankedSeasonService.obterOuIniciarTemporadaAtiva();
  const dateKey = rankedDailyLimitService.chaveDoDia();

  // Iniciada há 20 minutos (passaria a idade mínima de 10min), mas o
  // duelo AINDA está no mapa em memória — simula um jogo real longo
  // ainda em andamento.
  const partida = await criarPartidaEmAndamento({
    minutosAtras: 20,
    desafianteId: desafiante.id,
    defensorId: defensor.id,
    temporadaId: temporada.id,
    dateKey,
  });

  const duelIdFalso = pvpLiveSocket.alocarDuelId();
  pvpLiveSocket.duelos.set(duelIdFalso, {
    id: duelIdFalso,
    ranked: true,
    rankedMatchId: partida.id,
    a: { id: desafiante.id },
    b: { id: defensor.id },
  });

  try {
    await rankedLiveSocket.encerrarPartidasOrfas();

    const partidaDepois = await RankedMatch.findByPk(partida.id);
    assert.equal(partidaDepois.status, "EmAndamento", "partida ainda em memória nunca pode ser marcada como órfã");
  } finally {
    pvpLiveSocket.duelos.delete(duelIdFalso);
  }
});

testeComBanco("varredura limpa partida genuinamente travada (sem duelo em memória) e devolve a tentativa diária", async () => {
  const { personagem: desafiante } = await criarPersonagem({ nivel: 10 });
  const { personagem: defensor } = await criarPersonagem({ nivel: 10 });
  const temporada = await rankedSeasonService.obterOuIniciarTemporadaAtiva();
  const dateKey = rankedDailyLimitService.chaveDoDia();

  await rankedDailyLimitService.consumirTentativa(desafiante.id, { data: new Date() });
  const usoAntes = await rankedDailyLimitService.consultarUso(desafiante.id);

  const partida = await criarPartidaEmAndamento({
    minutosAtras: 15,
    desafianteId: desafiante.id,
    defensorId: defensor.id,
    temporadaId: temporada.id,
    dateKey,
  });
  // Nenhum duelo correspondente em pvpLiveSocket.duelos — exatamente o
  // estado de uma partida cuja finalizarDueloRanked falhou.

  await rankedLiveSocket.encerrarPartidasOrfas();

  const partidaDepois = await RankedMatch.findByPk(partida.id);
  assert.equal(partidaDepois.status, "Finalizada");
  assert.equal(partidaDepois.motivo_encerramento, "FalhaServidor");

  const usoDepois = await rankedDailyLimitService.consultarUso(desafiante.id);
  assert.equal(usoDepois.usadas, usoAntes.usadas - 1, "tentativa diária devia ter sido devolvida");
});

testeComBanco("varredura ignora partidas recentes (idade mínima de segurança), mesmo sem duelo em memória", async () => {
  const { personagem: desafiante } = await criarPersonagem({ nivel: 10 });
  const { personagem: defensor } = await criarPersonagem({ nivel: 10 });
  const temporada = await rankedSeasonService.obterOuIniciarTemporadaAtiva();
  const dateKey = rankedDailyLimitService.chaveDoDia();

  const partida = await criarPartidaEmAndamento({
    minutosAtras: 1,
    desafianteId: desafiante.id,
    defensorId: defensor.id,
    temporadaId: temporada.id,
    dateKey,
  });

  await rankedLiveSocket.encerrarPartidasOrfas();

  const partidaDepois = await RankedMatch.findByPk(partida.id);
  assert.equal(partidaDepois.status, "EmAndamento", "partida recente nunca deve ser varrida, mesmo sem duelo em memória (janela de corrida)");
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
