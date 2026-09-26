// Bug reportado: "Ranking PVP Ranqueado não está contabilizando o
// ranking, corrija esse bug." A suíte existente (rankedIntegracao.test.js)
// já cobre rankedRatingService/rankedSeasonService/rankedTierService no
// nível de SERVIÇO, chamando aplicarResultadoDesafiante direto — nunca
// passou pelo fluxo real: POST /match/start (rankedLiveSocket.
// iniciarPartidaAssincrona) -> combate de verdade via pvpLiveSocket.
// executarTurno -> duelo.finalizar (rankedLiveSocket.finalizarDueloRanked)
// -> CharacterPvpSeason atualizado -> rankingService.rankingPvp/posicaoPvp
// refletindo o resultado. Esta suíte cobre exatamente essa lacuna —
// se existir uma quebra na FIAÇÃO entre o motor de duelo ao vivo e a
// persistência do rating, é aqui que aparece.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const pvpLiveSocket = require("../src/socket/pvpLiveSocket");
const rankedLiveSocket = require("../src/socket/rankedLiveSocket");
const rankedSeasonService = require("../src/services/rankedSeasonService");
const rankedRatingService = require("../src/services/rankedRatingService");
const rankingService = require("../src/services/rankingService");
const CharacterPvpSeason = require("../src/models/CharacterPvpSeason");
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

function criarIoFalso() {
  return {
    to: () => ({ emit: () => {} }),
    sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
  };
}

// Marca o desafiante como "online" (exigido por iniciarPartidaAssincrona)
// e desfaz no fim do teste — nunca deixa lixo no Map compartilhado
// entre arquivos de teste.
function marcarOnline(characterId) {
  const chave = pvpLiveSocket.chaveOnline(characterId);
  pvpLiveSocket.online.set(chave, `fake-socket-${sufixo()}`);
  return () => pvpLiveSocket.online.delete(chave);
}

testeComBanco("fluxo real ponta a ponta: iniciar partida -> combate via executarTurno -> CharacterPvpSeason atualizado -> ranking reflete", async () => {
  const { personagem: desafiante } = await criarPersonagem({ nivel: 10 });
  const { personagem: defensor } = await criarPersonagem({ nivel: 10 });

  const temporada = await rankedSeasonService.obterOuIniciarTemporadaAtiva();
  // Oponente precisa já ter uma linha em CharacterPvpSeason pra ser
  // elegível na seleção (rankedOpponentSelectionService só olha
  // CharacterPvpSeason, nunca Character cru) — mesmo rating padrão do
  // desafiante (1000 = Bronze IV), então cai no mesmo tier de cara.
  await rankedRatingService.obterOuCriarParticipacao(defensor.id, temporada.id);

  const desmarcar = marcarOnline(desafiante.id);
  const ioFalso = criarIoFalso();

  let resultadoInicio;
  try {
    resultadoInicio = await rankedLiveSocket.iniciarPartidaAssincrona(ioFalso, { idDesafiante: desafiante.id });
  } finally {
    desmarcar();
  }

  assert.ok(resultadoInicio.duelId, "devia ter criado um duelo");
  const duelo = pvpLiveSocket.duelos.get(resultadoInicio.duelId);
  assert.ok(duelo, "duelo devia estar registrado no mapa de duelos ao vivo");
  assert.equal(duelo.ranked, true);
  assert.equal(typeof duelo.finalizar, "function", "duelo ranqueado precisa ter o hook de finalização setado");

  // Força uma vitória determinística do desafiante (lado A) numa única
  // ação: zera a vida do defensor, garante que é a vez do lado A, e
  // trava Math.random em 1 só durante esta chamada — nenhuma esquiva
  // (chance sempre < 1) consegue impedir o golpe fatal por sorte, então
  // o "acabou" dispara de verdade nesta primeira ação, sem depender de
  // vários turnos alternados com a IA (que rodam em setTimeout real).
  duelo.b.estado.vida_atual = 1;
  clearTimeout(duelo.timerIA);
  duelo.turnoDe = "A";

  const randomOriginal = Math.random;
  Math.random = () => 1;
  try {
    await pvpLiveSocket.executarTurno(ioFalso, resultadoInicio.duelId, "A", { tipo: "attack" });
  } finally {
    Math.random = randomOriginal;
  }

  // O duelo tem que ter sido removido do mapa — prova que o combate
  // real terminou e finalizarDueloRanked rodou (ele é quem faz isso).
  assert.equal(pvpLiveSocket.duelos.has(resultadoInicio.duelId), false, "duelo devia ter sido finalizado e removido");

  const partida = await RankedMatch.findByPk(resultadoInicio.rankedMatchId);
  assert.equal(partida.status, "Finalizada", "RankedMatch devia estar Finalizada");
  assert.equal(partida.id_vencedor, desafiante.id, "desafiante devia ter vencido");
  assert.ok(partida.rating_jogador1_depois > partida.rating_jogador1_antes, "rating do desafiante devia ter subido");

  const participacaoDepois = await CharacterPvpSeason.findOne({
    where: { character_id: desafiante.id, season_id: temporada.id },
  });
  assert.ok(participacaoDepois, "CharacterPvpSeason do desafiante devia existir");
  assert.equal(participacaoDepois.jogos, 1, "devia contar 1 jogo");
  assert.equal(participacaoDepois.vitorias, 1, "devia contar 1 vitória");
  assert.ok(participacaoDepois.rating > 1000, "rating devia ter subido a partir do inicial (1000)");

  // A prova final: o RANKING (o que o usuário de fato vê na tela) tem
  // que refletir esse resultado, não só a tabela crua.
  const posicao = await rankingService.posicaoPvp(desafiante.id);
  assert.equal(posicao.elegivel, true, "desafiante devia estar classificado após 1 partida válida");
  assert.equal(posicao.vitorias, 1);
  assert.equal(posicao.combates, 1);
  assert.equal(posicao.pontuacao, participacaoDepois.rating);

  const pagina1 = await rankingService.rankingPvp(1);
  const encontrado = pagina1.itens.find((item) => item.id === desafiante.id);
  assert.ok(encontrado, "desafiante devia aparecer na primeira página do ranking PvP");
  assert.equal(encontrado.vitorias, 1);
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
