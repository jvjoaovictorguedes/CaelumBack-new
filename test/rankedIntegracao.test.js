// PvP v2 — testes de integração da Arena Ranqueada (precisam de um
// Postgres migrado em TEST_DATABASE_URL/DATABASE_URL). Sem banco, o
// arquivo inteiro é pulado.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");

const rankedRatingService = require("../src/services/rankedRatingService");
const rankedTierService = require("../src/services/rankedTierService");
const rankedSeasonService = require("../src/services/rankedSeasonService");
const rankedDailyLimitService = require("../src/services/rankedDailyLimitService");
const rankedOpponentSelectionService = require("../src/services/rankedOpponentSelectionService");
const rankedAntifarmService = require("../src/services/rankedAntifarmService");
const CharacterPvpSeason = require("../src/models/CharacterPvpSeason");
const CharacterRankedDailyUsage = require("../src/models/CharacterRankedDailyUsage");
const RankedMatch = require("../src/models/RankedMatch");
const PvPSeason = require("../src/models/PvPSeason");
const PvpStatus = require("../src/models/PvpStatus");
const {
  RANKED_LIMITE_PARTIDAS_DIA,
  RANKED_MAX_PARTIDAS_MESMO_OPONENTE_DIA,
  DURACAO_TEMPORADA_DIAS,
} = require("../src/config/rankedConfig");

// Top-level await não existe em CommonJS, então a checagem de banco
// roda num before e cada teste se pula sozinho quando não há banco.
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

// Cada teste trabalha numa temporada própria, criada na mão, pra não
// depender da temporada ativa global nem interferir nela.
async function temporadaDeTeste() {
  return PvPSeason.create({
    nome: `Temporada de teste ${Date.now()}${Math.random()}`,
    starts_at: new Date(),
    ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    status: "Agendada",
  });
}

async function participante(rating, { nivel = 10, seasonId } = {}) {
  const { personagem } = await criarPersonagem({ nivel });
  const participacao = await CharacterPvpSeason.create({
    character_id: personagem.id,
    season_id: seasonId,
    rating,
    jogos: 0,
    vitorias: 0,
    derrotas: 0,
    peak_rating: rating,
  });
  return { personagem, participacao };
}

testeComBanco("jogador novo nasce com rating 1000 = Bronze IV", async () => {
  const temporada = await temporadaDeTeste();
  const { personagem } = await criarPersonagem();
  const participacao = await rankedRatingService.obterOuCriarParticipacao(personagem.id, temporada.id);
  assert.equal(participacao.rating, 1000);
  assert.equal(participacao.jogos, 0);
  assert.equal(rankedTierService.tierDivisaoParaRating(participacao.rating).label, "Bronze IV");
});

testeComBanco("desafiante recebe o delta correto nos três casos de tier", async () => {
  const temporada = await temporadaDeTeste();

  // Mesmo tier: vitória +18.
  const mesmo = await participante(1000, { seasonId: temporada.id });
  let r = await rankedRatingService.aplicarResultadoDesafiante({
    idDesafiante: mesmo.personagem.id,
    seasonId: temporada.id,
    ratingOponente: 1250,
    venceu: true,
  });
  assert.equal(r.delta, 18);
  assert.equal(r.ratingDepois, 1018);

  // Oponente um tier acima: derrota -14.
  const acima = await participante(1000, { seasonId: temporada.id });
  r = await rankedRatingService.aplicarResultadoDesafiante({
    idDesafiante: acima.personagem.id,
    seasonId: temporada.id,
    ratingOponente: 1450,
    venceu: false,
  });
  assert.equal(r.delta, -14);

  // Oponente um tier abaixo: vitória +14.
  const abaixo = await participante(1000, { seasonId: temporada.id });
  r = await rankedRatingService.aplicarResultadoDesafiante({
    idDesafiante: abaixo.personagem.id,
    seasonId: temporada.id,
    ratingOponente: 950,
    venceu: true,
  });
  assert.equal(r.delta, 14);
});

testeComBanco("defensor controlado por IA não tem rating nem V-D alterados", async () => {
  const temporada = await temporadaDeTeste();
  const desafiante = await participante(1500, { seasonId: temporada.id });
  const defensor = await participante(1520, { seasonId: temporada.id });

  for (const venceu of [true, false]) {
    await rankedRatingService.aplicarResultadoDesafiante({
      idDesafiante: desafiante.personagem.id,
      seasonId: temporada.id,
      ratingOponente: defensor.participacao.rating,
      venceu,
    });
  }

  await defensor.participacao.reload();
  assert.equal(defensor.participacao.rating, 1520);
  assert.equal(defensor.participacao.jogos, 0);
  assert.equal(defensor.participacao.vitorias, 0);
  assert.equal(defensor.participacao.derrotas, 0);

  await desafiante.participacao.reload();
  assert.equal(desafiante.participacao.jogos, 2);
  assert.equal(desafiante.participacao.vitorias, 1);
  assert.equal(desafiante.participacao.derrotas, 1);
});

testeComBanco("seleção de oponente respeita tier ±1 e nunca expande", async () => {
  const temporada = await temporadaDeTeste();
  const ferro = await participante(500, { seasonId: temporada.id }); // Ferro IV
  await participante(1500, { seasonId: temporada.id }); // Prata III
  await participante(1550, { seasonId: temporada.id }); // Prata III

  // Só existe Prata disponível: Ferro não pode ser pareado.
  const escolhido = await rankedOpponentSelectionService.selecionarOponente({
    idDesafiante: ferro.personagem.id,
    ratingDesafiante: 500,
    nivelDesafiante: 10,
    seasonId: temporada.id,
  });
  assert.equal(escolhido, null, "Ferro nunca pode enfrentar Prata");

  // Com um Bronze disponível, aí sim pareia.
  const bronze = await participante(1050, { seasonId: temporada.id });
  const agora = await rankedOpponentSelectionService.selecionarOponente({
    idDesafiante: ferro.personagem.id,
    ratingDesafiante: 500,
    nivelDesafiante: 10,
    seasonId: temporada.id,
  });
  assert.ok(agora);
  assert.equal(agora.characterId, bronze.personagem.id);
});

testeComBanco("Mestre só encontra Diamante ou Mestre", async () => {
  const temporada = await temporadaDeTeste();
  const mestre = await participante(3200, { seasonId: temporada.id });
  await participante(2000, { seasonId: temporada.id }); // Ouro — inelegível
  const diamante = await participante(2700, { seasonId: temporada.id });

  for (let i = 0; i < 10; i += 1) {
    const escolhido = await rankedOpponentSelectionService.selecionarOponente({
      idDesafiante: mestre.personagem.id,
      ratingDesafiante: 3200,
      nivelDesafiante: 10,
      seasonId: temporada.id,
    });
    assert.ok(escolhido);
    assert.equal(escolhido.characterId, diamante.personagem.id);
  }
});

testeComBanco("seleção nunca devolve o próprio desafiante", async () => {
  const temporada = await temporadaDeTeste();
  const sozinho = await participante(1000, { seasonId: temporada.id });
  const escolhido = await rankedOpponentSelectionService.selecionarOponente({
    idDesafiante: sozinho.personagem.id,
    ratingDesafiante: 1000,
    nivelDesafiante: 10,
    seasonId: temporada.id,
  });
  assert.equal(escolhido, null);
});

testeComBanco("anti-rematch limita partidas contra o mesmo oponente no dia", async () => {
  const temporada = await temporadaDeTeste();
  const desafiante = await participante(1000, { seasonId: temporada.id });
  const repetido = await participante(1010, { seasonId: temporada.id });
  const alternativa = await participante(1020, { seasonId: temporada.id });
  const dateKey = rankedDailyLimitService.chaveDoDia();

  for (let i = 0; i < RANKED_MAX_PARTIDAS_MESMO_OPONENTE_DIA; i += 1) {
    await RankedMatch.create({
      season_id: temporada.id,
      id_jogador1: desafiante.personagem.id,
      id_jogador2: repetido.personagem.id,
      rating_jogador1_antes: 1000,
      rating_jogador2_antes: 1010,
      defensor_controlado_por_ia: true,
      date_key: dateKey,
      status: "Finalizada",
    });
  }

  assert.equal(
    await rankedAntifarmService.podeEnfrentar(desafiante.personagem.id, repetido.personagem.id),
    false,
  );
  const bloqueados = await rankedAntifarmService.oponentesBloqueadosHoje(desafiante.personagem.id);
  assert.ok(bloqueados.includes(repetido.personagem.id));

  // Com alternativa disponível, a seleção evita o bloqueado.
  for (let i = 0; i < 10; i += 1) {
    const escolhido = await rankedOpponentSelectionService.selecionarOponente({
      idDesafiante: desafiante.personagem.id,
      ratingDesafiante: 1000,
      nivelDesafiante: 10,
      seasonId: temporada.id,
      dateKey,
    });
    assert.ok(escolhido);
    assert.equal(escolhido.characterId, alternativa.personagem.id);
  }
});

testeComBanco("limite diário: 11ª partida é recusada", async () => {
  const { personagem } = await criarPersonagem();
  for (let i = 0; i < RANKED_LIMITE_PARTIDAS_DIA; i += 1) {
    const uso = await rankedDailyLimitService.consumirTentativa(personagem.id);
    assert.equal(uso.consumiu, true);
    assert.equal(uso.usadas, i + 1);
  }
  const extra = await rankedDailyLimitService.consumirTentativa(personagem.id);
  assert.equal(extra.consumiu, false);
  assert.equal(extra.usadas, RANKED_LIMITE_PARTIDAS_DIA);
});

testeComBanco("duas requisições concorrentes nunca gastam a mesma última vaga", async () => {
  const { personagem } = await criarPersonagem();
  const dateKey = rankedDailyLimitService.chaveDoDia();
  await CharacterRankedDailyUsage.create({
    character_id: personagem.id,
    date_key: dateKey,
    matches_used: RANKED_LIMITE_PARTIDAS_DIA - 1,
  });

  const [a, b] = await Promise.all([
    rankedDailyLimitService.consumirTentativa(personagem.id),
    rankedDailyLimitService.consumirTentativa(personagem.id),
  ]);

  const sucessos = [a, b].filter((r) => r.consumiu).length;
  assert.equal(sucessos, 1, "exatamente uma das duas requisições pode pegar a 10ª vaga");

  const linha = await CharacterRankedDailyUsage.findOne({
    where: { character_id: personagem.id, date_key: dateKey },
  });
  assert.equal(linha.matches_used, RANKED_LIMITE_PARTIDAS_DIA);
});

testeComBanco("tentativa devolvida nunca deixa o contador negativo", async () => {
  const { personagem } = await criarPersonagem();
  await rankedDailyLimitService.consumirTentativa(personagem.id);
  await rankedDailyLimitService.devolverTentativa(personagem.id);
  await rankedDailyLimitService.devolverTentativa(personagem.id);
  const uso = await rankedDailyLimitService.consultarUso(personagem.id);
  assert.equal(uso.usadas, 0);
});

testeComBanco("sem oponente elegível não consome tentativa diária", async () => {
  const temporada = await temporadaDeTeste();
  const sozinho = await participante(500, { seasonId: temporada.id });

  const escolhido = await rankedOpponentSelectionService.selecionarOponente({
    idDesafiante: sozinho.personagem.id,
    ratingDesafiante: 500,
    nivelDesafiante: 10,
    seasonId: temporada.id,
  });
  assert.equal(escolhido, null);

  // O fluxo real (iniciarPartidaAssincrona) só chama consumirTentativa
  // depois de ter um oponente: nenhuma linha de uso pode existir.
  const uso = await rankedDailyLimitService.consultarUso(sozinho.personagem.id);
  assert.equal(uso.usadas, 0);
});

testeComBanco("temporada vira depois de 14 dias, com soft reset", async () => {
  const inicio = new Date(Date.now() - (DURACAO_TEMPORADA_DIAS + 1) * 24 * 60 * 60 * 1000);
  const fim = new Date(inicio.getTime() + DURACAO_TEMPORADA_DIAS * 24 * 60 * 60 * 1000);

  // Encerra qualquer temporada ativa preexistente pra o bootstrap
  // enxergar exatamente a que este teste monta.
  await PvPSeason.update({ status: "Encerrada" }, { where: { status: "Ativa" } });
  const vencida = await PvPSeason.create({
    nome: `Temporada vencida ${Date.now()}`,
    starts_at: inicio,
    ends_at: fim,
    status: "Ativa",
  });

  const { personagem } = await criarPersonagem();
  await CharacterPvpSeason.create({
    character_id: personagem.id,
    season_id: vencida.id,
    rating: 1800,
    jogos: 20,
    vitorias: 12,
    derrotas: 8,
    peak_rating: 1800,
  });

  const nova = await rankedSeasonService.obterOuIniciarTemporadaAtiva();
  assert.notEqual(nova.id, vencida.id);
  assert.equal(nova.status, "Ativa");

  await vencida.reload();
  assert.equal(vencida.status, "Encerrada", "histórico da temporada anterior é preservado");

  // A janela nova tem exatamente 14 dias.
  const duracaoDias = Math.round(
    (new Date(nova.ends_at).getTime() - new Date(nova.starts_at).getTime()) / (24 * 60 * 60 * 1000),
  );
  assert.equal(duracaoDias, DURACAO_TEMPORADA_DIAS);

  const migrada = await CharacterPvpSeason.findOne({
    where: { character_id: personagem.id, season_id: nova.id },
  });
  assert.ok(migrada, "participação é semeada na nova temporada");
  assert.equal(migrada.rating, 1670, "soft reset do exemplo da spec");
  assert.equal(migrada.jogos, 0);
});

testeComBanco("partida ranqueada nunca toca o PvpStatus casual", async () => {
  const temporada = await temporadaDeTeste();
  const { personagem } = await criarPersonagem();
  await PvpStatus.create({
    id_personagem: personagem.id,
    total_batalhas: 7,
    vitorias: 5,
    derrotas: 2,
    sistema_classificacao: "Vitorias",
  });

  await rankedRatingService.aplicarResultadoDesafiante({
    idDesafiante: personagem.id,
    seasonId: temporada.id,
    ratingOponente: 1000,
    venceu: true,
  });

  const casual = await PvpStatus.findOne({ where: { id_personagem: personagem.id } });
  assert.equal(casual.total_batalhas, 7);
  assert.equal(casual.vitorias, 5);
  assert.equal(casual.derrotas, 2);
});

testeComBanco("duelo casual nunca toca rating/V-D ranqueado", async () => {
  const temporada = await temporadaDeTeste();
  const vencedor = await participante(1400, { seasonId: temporada.id });
  const perdedor = await participante(1400, { seasonId: temporada.id });

  const pvpController = require("../src/controllers/pvpController");
  await pvpController.aplicarResultadoDuelo({
    vencedor: vencedor.personagem,
    perdedor: perdedor.personagem,
    rodadas: 5,
  });

  await vencedor.participacao.reload();
  await perdedor.participacao.reload();
  assert.equal(vencedor.participacao.rating, 1400);
  assert.equal(vencedor.participacao.jogos, 0);
  assert.equal(perdedor.participacao.rating, 1400);
  assert.equal(perdedor.participacao.jogos, 0);

  // E o casual foi registrado de verdade.
  const casual = await PvpStatus.findOne({ where: { id_personagem: vencedor.personagem.id } });
  assert.equal(casual.vitorias, 1);
});

testeComBanco("GET /api/pvp/status casual não devolve mais patente de arena", async () => {
  const pvpController = require("../src/controllers/pvpController");
  const { personagem } = await criarPersonagem();
  await PvpStatus.create({
    id_personagem: personagem.id,
    total_batalhas: 3,
    vitorias: 3,
    derrotas: 0,
    sistema_classificacao: "Vitorias",
  });

  let corpo = null;
  const res = {
    status() {
      return this;
    },
    json(payload) {
      corpo = payload;
      return this;
    },
  };
  await pvpController.getStatus({ params: { characterId: personagem.id } }, res);

  assert.ok(corpo);
  assert.equal(corpo.data.pvpStatus.patenteArena, undefined);
  assert.equal("patenteArena" in corpo.data.pvpStatus, false);
});

// §17 — o servidor escolhe o oponente. Um alvo mandado pelo cliente
// não pode ser honrado de jeito nenhum.
testeComBanco("alvo enviado pelo cliente é ignorado: o servidor escolhe", async () => {
  const pvpLiveSocket = require("../src/socket/pvpLiveSocket");
  const rankedLiveSocket = require("../src/socket/rankedLiveSocket");
  const rankedController = require("../src/controllers/rankedController");
  const PvPSeasonModel = require("../src/models/PvPSeason");

  // Temporada ativa controlada por este teste.
  await PvPSeasonModel.update({ status: "Encerrada" }, { where: { status: "Ativa" } });
  const temporada = await PvPSeasonModel.create({
    nome: `Temporada alvo ${Date.now()}${Math.random()}`,
    starts_at: new Date(),
    ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    status: "Ativa",
  });

  const desafiante = await participante(1000, { seasonId: temporada.id });
  const unicoElegivel = await participante(1050, { seasonId: temporada.id });
  // Alvo "escolhido" pelo cliente: existe, mas é de um tier distante e
  // portanto jamais pode ser selecionado.
  const alvoProibido = await participante(2500, { seasonId: temporada.id });

  const chave = pvpLiveSocket.chaveOnline(desafiante.personagem.id);
  pvpLiveSocket.online.set(chave, "socket-falso");

  const emitidos = [];
  const io = {
    sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    to() {
      return { emit: (evento, dados) => emitidos.push({ evento, dados }) };
    },
  };

  let corpo = null;
  let statusHttp = null;
  const res = {
    status(codigo) {
      statusHttp = codigo;
      return this;
    },
    json(payload) {
      corpo = payload;
      return this;
    },
  };

  try {
    await rankedController.iniciarPartida(
      {
        personagemAtual: desafiante.personagem,
        // Todas as grafias plausíveis de "escolha de alvo".
        body: {
          id_oponente: alvoProibido.personagem.id,
          idOponente: alvoProibido.personagem.id,
          opponentId: alvoProibido.personagem.id,
        },
        app: { get: () => io },
      },
      res,
    );

    assert.equal(statusHttp, 201);
    assert.ok(corpo);
    assert.notEqual(corpo.defensor.id, alvoProibido.personagem.id, "alvo do cliente nunca é honrado");
    assert.equal(corpo.defensor.id, unicoElegivel.personagem.id);
    assert.equal(corpo.defensor.controladoPorIA, true);
    assert.equal(corpo.consumiveisHabilitados, false);

    // A tentativa diária foi consumida exatamente uma vez.
    const uso = await rankedDailyLimitService.consultarUso(desafiante.personagem.id);
    assert.equal(uso.usadas, 1);

    // E a partida registrada aponta pro defensor escolhido pelo servidor.
    const partida = await RankedMatch.findByPk(corpo.rankedMatchId);
    assert.equal(partida.id_jogador2, unicoElegivel.personagem.id);
    assert.equal(partida.defensor_controlado_por_ia, true);
    assert.equal(partida.status, "EmAndamento");
  } finally {
    const duelId = pvpLiveSocket.duelPorPersonagem.get(chave);
    if (duelId) {
      const duelo = pvpLiveSocket.duelos.get(duelId);
      clearTimeout(duelo?.timer);
      clearTimeout(duelo?.timerIA);
      pvpLiveSocket.duelos.delete(duelId);
      pvpLiveSocket.duelPorPersonagem.delete(chave);
    }
    pvpLiveSocket.online.delete(chave);
  }
});

// -------------------- Medalhas de temporada (pódio do perfil) --------------------
//
// Ajuste pós-lançamento: medalha deixou de ser de pódio de Torneio e
// passou a ser de 1º/2º/3º lugar no leaderboard de uma temporada
// RANQUEADA já encerrada (tournamentStatsService.podioDoPersonagem
// delega pra rankedSeasonService.medalhasDoPersonagem — ver teste
// espelho em tournamentIntegracao.test.js confirmando que ganhar
// torneio não gera medalha nenhuma, só Troféu).
testeComBanco("medalha vem do 1º/2º/3º lugar da temporada ranqueada ENCERRADA", async () => {
  const temporada = await temporadaDeTeste();
  await temporada.update({ status: "Encerrada" });

  const ouro = await participante(2000, { seasonId: temporada.id });
  const prata = await participante(1900, { seasonId: temporada.id });
  const bronze = await participante(1800, { seasonId: temporada.id });
  const quarto = await participante(1700, { seasonId: temporada.id });
  // Precisa ter jogado pelo menos 1 partida pra contar (mesmo mínimo do
  // leaderboard público) — sem isso um personagem parado em 1000 (nunca
  // jogou) não pode "ganhar" medalha por default.
  await Promise.all(
    [ouro, prata, bronze, quarto].map(({ participacao }) => participacao.update({ jogos: 5 })),
  );

  const medalhasOuro = await rankedSeasonService.medalhasDoPersonagem(ouro.personagem.id);
  assert.deepEqual(medalhasOuro, { ouro: 1, prata: 0, bronze: 0 });

  const medalhasPrata = await rankedSeasonService.medalhasDoPersonagem(prata.personagem.id);
  assert.deepEqual(medalhasPrata, { ouro: 0, prata: 1, bronze: 0 });

  const medalhasBronze = await rankedSeasonService.medalhasDoPersonagem(bronze.personagem.id);
  assert.deepEqual(medalhasBronze, { ouro: 0, prata: 0, bronze: 1 });

  const medalhasQuarto = await rankedSeasonService.medalhasDoPersonagem(quarto.personagem.id);
  assert.deepEqual(medalhasQuarto, { ouro: 0, prata: 0, bronze: 0 }, "4º lugar não pontua");
});

testeComBanco("temporada ATIVA nunca concede medalha (ainda não terminou)", async () => {
  // Só pode existir UMA temporada 'Ativa' no banco inteiro (índice único
  // parcial, migration 20261201010000) — encerra qualquer uma que já
  // esteja ativa (ex.: a bootstrapada por outro teste/serviço) antes de
  // marcar a de teste como Ativa, senão bate no mesmo índice que existe
  // exatamente pra evitar o bug real de duas temporadas Ativa ao mesmo
  // tempo.
  await PvPSeason.update({ status: "Encerrada" }, { where: { status: "Ativa" } });
  const temporada = await temporadaDeTeste();
  await temporada.update({ status: "Ativa" });

  const lider = await participante(3000, { seasonId: temporada.id });
  await lider.participacao.update({ jogos: 10 });

  const medalhas = await rankedSeasonService.medalhasDoPersonagem(lider.personagem.id);
  assert.deepEqual(medalhas, { ouro: 0, prata: 0, bronze: 0 });
});

testeComBanco("medalhas acumulam por temporada — duas temporadas de ouro = 2 medalhas", async () => {
  const { personagem } = await criarPersonagem();

  const temporada1 = await temporadaDeTeste();
  await temporada1.update({ status: "Encerrada" });
  await CharacterPvpSeason.create({
    character_id: personagem.id,
    season_id: temporada1.id,
    rating: 2500,
    jogos: 5,
    vitorias: 5,
    derrotas: 0,
    peak_rating: 2500,
  });

  const temporada2 = await temporadaDeTeste();
  await temporada2.update({ status: "Encerrada" });
  await CharacterPvpSeason.create({
    character_id: personagem.id,
    season_id: temporada2.id,
    rating: 2600,
    jogos: 5,
    vitorias: 5,
    derrotas: 0,
    peak_rating: 2600,
  });

  const medalhas = await rankedSeasonService.medalhasDoPersonagem(personagem.id);
  assert.deepEqual(medalhas, { ouro: 2, prata: 0, bronze: 0 });
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
