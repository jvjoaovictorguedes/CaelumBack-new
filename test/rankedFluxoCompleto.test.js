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
const rankedDailyLimitService = require("../src/services/rankedDailyLimitService");
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

// Setup compartilhado pelos testes de finalização abaixo: cria
// desafiante+defensor, garante o defensor elegível na temporada atual e
// inicia a partida assíncrona de verdade (mesmo POST /match/start que o
// jogador dispara). Devolve tudo que os cenários de baixo precisam para
// forçar um resultado determinístico sem depender de setTimeout real.
async function prepararPartida({ nivel = 10 } = {}) {
  const { personagem: desafiante } = await criarPersonagem({ nivel });
  const { personagem: defensor } = await criarPersonagem({ nivel });
  const temporada = await rankedSeasonService.obterOuIniciarTemporadaAtiva();
  await rankedRatingService.obterOuCriarParticipacao(defensor.id, temporada.id);

  const desmarcar = marcarOnline(desafiante.id);
  const ioFalso = criarIoFalso();
  let resultadoInicio;
  try {
    resultadoInicio = await rankedLiveSocket.iniciarPartidaAssincrona(ioFalso, { idDesafiante: desafiante.id });
  } finally {
    desmarcar();
  }

  const duelo = pvpLiveSocket.duelos.get(resultadoInicio.duelId);
  clearTimeout(duelo.timerIA);
  return { desafiante, defensor, temporada, ioFalso, resultadoInicio, duelo };
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

testeComBanco("Teste 2 — derrota: RankedMatch Finalizada, jogos=1/vitorias=0/derrotas=1, rating atualizado, ranking reflete", async () => {
  const { desafiante, temporada, ioFalso, resultadoInicio, duelo } = await prepararPartida();

  // Força uma vitória determinística do DEFENSOR (lado B, controlado
  // pela IA) — espelha o teste de vitória, só que zerando a vida do
  // desafiante e fazendo o turno de B resolver o combate.
  duelo.a.estado.vida_atual = 1;
  duelo.turnoDe = "B";

  const randomOriginal = Math.random;
  Math.random = () => 1;
  try {
    await pvpLiveSocket.executarTurno(ioFalso, resultadoInicio.duelId, "B", { tipo: "attack" });
  } finally {
    Math.random = randomOriginal;
  }

  assert.equal(pvpLiveSocket.duelos.has(resultadoInicio.duelId), false, "duelo devia ter sido finalizado e removido");

  const partida = await RankedMatch.findByPk(resultadoInicio.rankedMatchId);
  assert.equal(partida.status, "Finalizada");
  assert.equal(partida.id_vencedor, duelo.defensorId, "defensor devia ter vencido");
  assert.equal(partida.motivo_encerramento, "Vitoria");

  const participacaoDepois = await CharacterPvpSeason.findOne({
    where: { character_id: desafiante.id, season_id: temporada.id },
  });
  assert.equal(participacaoDepois.jogos, 1);
  assert.equal(participacaoDepois.vitorias, 0);
  assert.equal(participacaoDepois.derrotas, 1);
  assert.ok(Number.isFinite(participacaoDepois.rating), "rating devia ter sido recalculado (mesmo que igual, nunca NaN)");
  assert.equal(partida.rating_jogador1_depois, participacaoDepois.rating);

  const posicao = await rankingService.posicaoPvp(desafiante.id);
  assert.equal(posicao.elegivel, true, "1 partida (mesmo perdida) já classifica, LEADERBOARD_MINIMO_PARTIDAS=1");
  assert.equal(posicao.vitorias, 0);
  assert.equal(posicao.combates, 1);
});

testeComBanco("Teste 3 — abandono: contabiliza como derrota, motivo_encerramento=Abandono, rating alterado", async () => {
  const { desafiante, temporada, ioFalso, resultadoInicio, duelo } = await prepararPartida();

  // Simula o timer de graça de reconexão disparando (aoDesconectarRanked
  // chamaria exatamente isto): o desafiante (lado A) abandonou, então
  // quem "venceu" é o defensor (B).
  await rankedLiveSocket.finalizarDueloRanked(ioFalso, resultadoInicio.duelId, "B", "abandono");

  assert.equal(pvpLiveSocket.duelos.has(resultadoInicio.duelId), false);

  const partida = await RankedMatch.findByPk(resultadoInicio.rankedMatchId);
  assert.equal(partida.status, "Finalizada");
  assert.equal(partida.motivo_encerramento, "Abandono");
  assert.equal(partida.id_vencedor, duelo.defensorId);

  const participacaoDepois = await CharacterPvpSeason.findOne({
    where: { character_id: desafiante.id, season_id: temporada.id },
  });
  assert.equal(participacaoDepois.jogos, 1, "abandono conta como jogo disputado");
  assert.equal(participacaoDepois.vitorias, 0);
  assert.equal(participacaoDepois.derrotas, 1, "abandono conta como derrota");
  assert.notEqual(partida.rating_jogador1_depois, null, "abandono ALTERA rating (não é FalhaServidor)");
});

testeComBanco("Teste 4 — finalização duplicada nunca conta duas vezes (idempotência via status+FOR UPDATE)", async () => {
  const { desafiante, temporada, ioFalso, resultadoInicio, duelo } = await prepararPartida();

  duelo.b.estado.vida_atual = 1;
  duelo.turnoDe = "A";
  const randomOriginal = Math.random;
  Math.random = () => 1;
  try {
    await pvpLiveSocket.executarTurno(ioFalso, resultadoInicio.duelId, "A", { tipo: "attack" });
  } finally {
    Math.random = randomOriginal;
  }

  const participacaoAposPrimeiraFinalizacao = await CharacterPvpSeason.findOne({
    where: { character_id: desafiante.id, season_id: temporada.id },
  });
  assert.equal(participacaoAposPrimeiraFinalizacao.jogos, 1);

  // O duelo já saiu de pvpLiveSocket.duelos (finalizarDueloRanked já
  // rodou) — simula a condição de corrida real que a guarda de banco
  // protege (combate terminando e o timer de abandono disparando quase
  // ao mesmo tempo): reinsere o MESMO duelo no mapa e chama
  // finalizarDueloRanked de novo pra exercitar o SELECT...FOR UPDATE +
  // status="Finalizada" (não só o `if (!duelo) return` do topo, que já
  // bastaria sozinho no caso comum, mas não é o que esta guarda existe
  // pra cobrir).
  pvpLiveSocket.duelos.set(resultadoInicio.duelId, duelo);
  try {
    await rankedLiveSocket.finalizarDueloRanked(ioFalso, resultadoInicio.duelId, "B", "combate");
  } finally {
    pvpLiveSocket.duelos.delete(resultadoInicio.duelId);
  }

  const participacaoFinal = await CharacterPvpSeason.findOne({
    where: { character_id: desafiante.id, season_id: temporada.id },
  });
  assert.equal(participacaoFinal.jogos, 1, "jogos não pode dobrar numa segunda finalização da mesma partida");
  assert.equal(participacaoFinal.vitorias, 1);
  assert.equal(participacaoFinal.rating, participacaoAposPrimeiraFinalizacao.rating, "rating não pode mudar de novo");

  const partida = await RankedMatch.findByPk(resultadoInicio.rankedMatchId);
  assert.equal(partida.id_vencedor, desafiante.id, "a segunda chamada (motivo diferente) não pode ter sobrescrito o vencedor real");
});

testeComBanco("Teste 5a — falha transitória na persistência: retry recupera e credita o resultado real (nada se perde)", async () => {
  const { desafiante, temporada, ioFalso, resultadoInicio, duelo } = await prepararPartida();

  duelo.b.estado.vida_atual = 1;
  duelo.turnoDe = "A";

  // Simula uma falha transitória (deadlock/conexão) na PRIMEIRA tentativa
  // de transaction desta finalização, deixando a segunda tentativa
  // seguir normalmente — exatamente o cenário que o retry em
  // finalizarDueloRanked existe para cobrir.
  const transactionOriginal = sequelize.transaction.bind(sequelize);
  let chamadas = 0;
  sequelize.transaction = (...args) => {
    chamadas += 1;
    if (chamadas === 1) {
      return Promise.reject(new Error("Falha simulada de conexão com o banco (teste)."));
    }
    return transactionOriginal(...args);
  };

  const randomOriginal = Math.random;
  Math.random = () => 1;
  try {
    await pvpLiveSocket.executarTurno(ioFalso, resultadoInicio.duelId, "A", { tipo: "attack" });
  } finally {
    Math.random = randomOriginal;
    sequelize.transaction = transactionOriginal;
  }

  assert.ok(chamadas >= 2, "devia ter tentado persistir mais de uma vez após a falha simulada");

  const partida = await RankedMatch.findByPk(resultadoInicio.rankedMatchId);
  assert.equal(partida.status, "Finalizada", "o retry devia ter conseguido persistir na tentativa seguinte");
  assert.equal(partida.id_vencedor, desafiante.id, "o resultado real (vitória do desafiante) não pode ter se perdido por causa da falha transitória");

  const participacaoDepois = await CharacterPvpSeason.findOne({
    where: { character_id: desafiante.id, season_id: temporada.id },
  });
  assert.equal(participacaoDepois.jogos, 1, "exatamente 1 jogo — a falha simulada não pode ter duplicado nem perdido a contagem");
  assert.equal(participacaoDepois.vitorias, 1);
});

testeComBanco("Teste 5b — falha persistente (todas as tentativas falham): partida fica EmAndamento, nunca perdida nem contabilizada incorretamente", async () => {
  const { desafiante, temporada, resultadoInicio, duelo } = await prepararPartida();
  const ioFalso = criarIoFalso();

  duelo.b.estado.vida_atual = 1;
  duelo.turnoDe = "A";

  // Todas as tentativas falham — simula uma falha real e persistente
  // (não apenas uma piscada transitória).
  const transactionOriginal = sequelize.transaction.bind(sequelize);
  sequelize.transaction = () => Promise.reject(new Error("Falha simulada permanente de banco (teste)."));

  const randomOriginal = Math.random;
  Math.random = () => 1;
  try {
    await pvpLiveSocket.executarTurno(ioFalso, resultadoInicio.duelId, "A", { tipo: "attack" });
  } finally {
    Math.random = randomOriginal;
    sequelize.transaction = transactionOriginal;
  }

  // O duelo já não existe mais em memória (removido antes da tentativa
  // de persistência, por design) — mas isso NUNCA pode significar que o
  // resultado foi contabilizado errado ou que a partida ficou num estado
  // inconsistente. O comportamento correto aqui é: RankedMatch continua
  // "EmAndamento" (rollback automático da transaction, nunca meio-salvo)
  // e CharacterPvpSeason NÃO foi tocado — exatamente o estado que
  // encerrarPartidasOrfas (test/rankedPartidasOrfas.test.js) sabe
  // recuperar depois, devolvendo a tentativa diária.
  assert.equal(pvpLiveSocket.duelos.has(resultadoInicio.duelId), false);

  const partida = await RankedMatch.findByPk(resultadoInicio.rankedMatchId);
  assert.equal(partida.status, "EmAndamento", "nunca pode ficar Finalizada sem o resultado ter sido persistido de verdade");
  assert.equal(partida.id_vencedor, null);

  const participacaoDepois = await CharacterPvpSeason.findOne({
    where: { character_id: desafiante.id, season_id: temporada.id },
  });
  assert.equal(participacaoDepois.jogos, 0, "CharacterPvpSeason não pode ter sido tocado se a persistência nunca confirmou");
});

testeComBanco("Teste 6 — temporada: season_id da partida é a MESMA usada por CharacterPvpSeason e pelo ranking", async () => {
  const { desafiante, temporada, ioFalso, resultadoInicio, duelo } = await prepararPartida();

  assert.equal(duelo.seasonId, temporada.id, "duelo devia ter capturado o id da temporada ativa no início");

  duelo.b.estado.vida_atual = 1;
  duelo.turnoDe = "A";
  const randomOriginal = Math.random;
  Math.random = () => 1;
  try {
    await pvpLiveSocket.executarTurno(ioFalso, resultadoInicio.duelId, "A", { tipo: "attack" });
  } finally {
    Math.random = randomOriginal;
  }

  const partida = await RankedMatch.findByPk(resultadoInicio.rankedMatchId);
  assert.equal(partida.season_id, temporada.id);

  const participacao = await CharacterPvpSeason.findOne({
    where: { character_id: desafiante.id, season_id: temporada.id },
  });
  assert.ok(participacao, "CharacterPvpSeason devia existir na MESMA temporada da partida");
  assert.equal(participacao.jogos, 1);

  // A mesma temporada tem que ser a que rankingService usa pra
  // responder — obterOuIniciarTemporadaAtiva é determinístico por data,
  // então nenhuma chamada nova deveria abrir outra temporada aqui.
  const temporadaNoRanking = await rankedSeasonService.obterOuIniciarTemporadaAtiva();
  assert.equal(temporadaNoRanking.id, temporada.id, "ranking não pode consultar uma temporada diferente da que a partida usou");

  const posicao = await rankingService.posicaoPvp(desafiante.id);
  assert.equal(posicao.elegivel, true);
  assert.equal(posicao.combates, 1);
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
