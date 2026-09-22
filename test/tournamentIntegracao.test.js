// PvP v2 §16/§17 — testes de integração dos Torneios (precisam de
// Postgres migrado em TEST_DATABASE_URL/DATABASE_URL).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");

const tournamentService = require("../src/services/tournamentService");
const tournamentMatchService = require("../src/services/tournamentMatchService");
const tournamentStatsService = require("../src/services/tournamentStatsService");
const adminMiddleware = require("../src/middlewares/adminMiddleware");
const Tournament = require("../src/models/Tournament");
const TournamentParticipant = require("../src/models/TournamentParticipant");
const TournamentSeries = require("../src/models/TournamentSeries");
const CharacterPvpSeason = require("../src/models/CharacterPvpSeason");
const CharacterRankedDailyUsage = require("../src/models/CharacterRankedDailyUsage");
const PvpStatus = require("../src/models/PvpStatus");
const rankedDailyLimitService = require("../src/services/rankedDailyLimitService");

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

async function torneioComInscritos(quantidade, { adminUserId, nivel = 10 } = {}) {
  const torneio = await tournamentService.criar({
    criadoPorUserId: adminUserId,
    dados: {
      name: `Copa ${Date.now()}${Math.random()}`,
      starts_at: new Date(Date.now() + 3600_000).toISOString(),
      max_participants: 8,
      level_min: 1,
      level_max: 999,
    },
  });

  const personagens = [];
  for (let i = 0; i < quantidade; i += 1) {
    const { personagem } = await criarPersonagem({ nivel });
    await tournamentService.inscrever({ torneioId: torneio.id, personagem });
    personagens.push(personagem);
  }
  return { torneio, personagens };
}

async function adminDeTeste() {
  const { usuario } = await criarPersonagem({ isAdmin: true });
  return usuario;
}

// Resolve uma série ganhando quantas partidas o formato exigir.
async function vencerSerie(serie, vencedorParticipantId) {
  const alvo = tournamentMatchService.vitoriasNecessarias(serie.format);
  for (let i = 0; i < alvo; i += 1) {
    await tournamentMatchService.registrarResultadoDeJogo({
      serieId: serie.id,
      vencedorParticipantId,
    });
  }
}

// -------------------- Autorização (§17) --------------------

test("não-admin não passa pelo adminMiddleware", async (t) => {
  if (!temBanco) return t.skip("sem banco de dados");
  const { usuario } = await criarPersonagem();
  let statusRecebido = null;
  let chamouNext = false;
  const res = {
    status(codigo) {
      statusRecebido = codigo;
      return this;
    },
    json() {
      return this;
    },
  };
  await adminMiddleware({ user: { id: usuario.id } }, res, () => {
    chamouNext = true;
  });
  assert.equal(statusRecebido, 403);
  assert.equal(chamouNext, false);
});

test("admin de verdade passa pelo adminMiddleware", async (t) => {
  if (!temBanco) return t.skip("sem banco de dados");
  const usuario = await adminDeTeste();
  let chamouNext = false;
  await adminMiddleware({ user: { id: usuario.id } }, { status: () => ({ json: () => {} }) }, () => {
    chamouNext = true;
  });
  assert.equal(chamouNext, true);
});

// -------------------- Criação e inscrição --------------------

testeComBanco("admin cria torneio com parâmetros válidos", async () => {
  const admin = await adminDeTeste();
  const torneio = await tournamentService.criar({
    criadoPorUserId: admin.id,
    dados: {
      name: "Copa de Caelum",
      description: "Torneio de teste",
      starts_at: new Date(Date.now() + 3600_000).toISOString(),
      max_participants: 8,
      level_min: 5,
      level_max: 20,
      prize_description: "Espada lendária",
    },
  });
  assert.equal(torneio.status, "InscricoesAbertas");
  assert.equal(torneio.max_participants, 8);
  assert.equal(torneio.prize_delivered, false);
  assert.equal(torneio.created_by, admin.id);
});

testeComBanco("criação rejeita mais de 8 participantes e datas inválidas", async () => {
  const admin = await adminDeTeste();
  await assert.rejects(
    () =>
      tournamentService.criar({
        criadoPorUserId: admin.id,
        dados: { name: "X", starts_at: new Date().toISOString(), max_participants: 16 },
      }),
    /max_participants/,
  );
  await assert.rejects(
    () =>
      tournamentService.criar({
        criadoPorUserId: admin.id,
        dados: { name: "X", starts_at: "não é data" },
      }),
    /starts_at/,
  );
});

testeComBanco("inscrição respeita faixa de nível e lotação", async () => {
  const admin = await adminDeTeste();
  const torneio = await tournamentService.criar({
    criadoPorUserId: admin.id,
    dados: {
      name: `Faixa ${Date.now()}`,
      starts_at: new Date(Date.now() + 3600_000).toISOString(),
      max_participants: 2,
      level_min: 10,
      level_max: 20,
    },
  });

  const { personagem: foraDaFaixa } = await criarPersonagem({ nivel: 5 });
  await assert.rejects(
    () => tournamentService.inscrever({ torneioId: torneio.id, personagem: foraDaFaixa }),
    /nível/,
  );

  const { personagem: a } = await criarPersonagem({ nivel: 12 });
  const { personagem: b } = await criarPersonagem({ nivel: 15 });
  await tournamentService.inscrever({ torneioId: torneio.id, personagem: a });
  await tournamentService.inscrever({ torneioId: torneio.id, personagem: b });

  // Inscrição repetida e torneio lotado.
  await assert.rejects(
    () => tournamentService.inscrever({ torneioId: torneio.id, personagem: a }),
    /já está inscrito/,
  );
  const { personagem: c } = await criarPersonagem({ nivel: 15 });
  await assert.rejects(
    () => tournamentService.inscrever({ torneioId: torneio.id, personagem: c }),
    /lotado/,
  );
});

// -------------------- Chaveamento --------------------

testeComBanco("start com 5 inscritos é recusado (4 ou 8 nesta versão)", async () => {
  const admin = await adminDeTeste();
  const { torneio } = await torneioComInscritos(5, { adminUserId: admin.id });
  await assert.rejects(() => tournamentService.iniciar({ torneioId: torneio.id }), /4 ou 8/);
});

testeComBanco("chaveamento é sorteado, persistido e nunca regerado", async () => {
  const admin = await adminDeTeste();
  const { torneio } = await torneioComInscritos(8, { adminUserId: admin.id });

  const { bracketSeed } = await tournamentService.iniciar({ torneioId: torneio.id });
  assert.equal(bracketSeed.total, 8);
  assert.equal(bracketSeed.primeiraRodada, "Quartas");

  const salvo = await Tournament.findByPk(torneio.id);
  assert.equal(salvo.status, "EmAndamento");
  assert.deepEqual(salvo.bracket_seed.ordem, bracketSeed.ordem);

  // Uma segunda leitura devolve exatamente o mesmo chaveamento.
  const relido = await tournamentService.detalhar(torneio.id);
  assert.deepEqual(relido.bracket_seed.ordem, bracketSeed.ordem);

  // E um segundo start é recusado em vez de regerar.
  await assert.rejects(() => tournamentService.iniciar({ torneioId: torneio.id }), /já teve o chaveamento/);
  const depois = await Tournament.findByPk(torneio.id);
  assert.deepEqual(depois.bracket_seed.ordem, bracketSeed.ordem);

  // Estrutura: 4 quartas + 2 semis + 3º lugar + final.
  const series = await TournamentSeries.findAll({ where: { tournament_id: torneio.id } });
  assert.equal(series.length, 8);
  assert.equal(series.filter((s) => s.round === "Quartas").length, 4);
  assert.equal(series.find((s) => s.round === "Final").format, "MD5");
  // Quartas já entram em ready check e com loadout congelado.
  assert.ok(series.filter((s) => s.round === "Quartas").every((s) => s.status === "ReadyCheck"));
  const participantes = await TournamentParticipant.findAll({ where: { tournament_id: torneio.id } });
  assert.ok(participantes.every((p) => p.loadout_travado !== null));
  assert.deepEqual(
    participantes.map((p) => p.seed).sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
});

// -------------------- MD3/MD5 e avanço --------------------

testeComBanco("MD3 precisa de 2 vitórias; MD5 (final) precisa de 3", async () => {
  const admin = await adminDeTeste();
  const { torneio } = await torneioComInscritos(4, { adminUserId: admin.id });
  await tournamentService.iniciar({ torneioId: torneio.id });

  const semis = await TournamentSeries.findAll({
    where: { tournament_id: torneio.id, round: "Semifinal" },
    order: [["posicao", "ASC"]],
  });

  // Uma vitória não fecha um MD3.
  await tournamentMatchService.registrarResultadoDeJogo({
    serieId: semis[0].id,
    vencedorParticipantId: semis[0].participant_a_id,
  });
  await semis[0].reload();
  assert.equal(semis[0].status, "ReadyCheck");
  assert.equal(semis[0].score_a, 1);

  // A segunda fecha.
  await tournamentMatchService.registrarResultadoDeJogo({
    serieId: semis[0].id,
    vencedorParticipantId: semis[0].participant_a_id,
  });
  await semis[0].reload();
  assert.equal(semis[0].status, "Finalizada");
  assert.equal(semis[0].winner_participant_id, semis[0].participant_a_id);

  await vencerSerie(semis[1], semis[1].participant_a_id);
  await semis[1].reload();

  // Vencedores caem na final; perdedores, no 3º lugar.
  const final = await TournamentSeries.findOne({
    where: { tournament_id: torneio.id, round: "Final" },
  });
  const terceiro = await TournamentSeries.findOne({
    where: { tournament_id: torneio.id, round: "TerceiroLugar" },
  });
  assert.equal(final.participant_a_id, semis[0].winner_participant_id);
  assert.equal(final.participant_b_id, semis[1].winner_participant_id);
  assert.equal(final.format, "MD5");
  assert.equal(final.status, "ReadyCheck");
  assert.ok(terceiro.participant_a_id && terceiro.participant_b_id);

  // MD5: duas vitórias ainda não fecham.
  for (let i = 0; i < 2; i += 1) {
    await tournamentMatchService.registrarResultadoDeJogo({
      serieId: final.id,
      vencedorParticipantId: final.participant_a_id,
    });
  }
  await final.reload();
  assert.equal(final.status, "ReadyCheck");

  await tournamentMatchService.registrarResultadoDeJogo({
    serieId: final.id,
    vencedorParticipantId: final.participant_a_id,
  });
  await final.reload();
  assert.equal(final.status, "Finalizada");

  await vencerSerie(terceiro, terceiro.participant_a_id);

  // Torneio fecha sozinho quando todas as séries terminam; colocações
  // ficam registradas.
  const fechado = await Tournament.findByPk(torneio.id);
  assert.equal(fechado.status, "Finalizado");

  const campeao = await TournamentParticipant.findByPk(final.participant_a_id);
  const vice = await TournamentParticipant.findByPk(final.participant_b_id);
  assert.equal(campeao.final_placement, 1);
  assert.equal(vice.final_placement, 2);

  // Troféu vem do torneio (campeonato); medalha NÃO — medalha agora é
  // só de temporada ranqueada encerrada (ver teste dedicado abaixo).
  // Ganhar um torneio não gera Ouro nenhum por si só.
  const podio = await tournamentStatsService.podioDoPersonagem(campeao.character_id);
  assert.equal(podio.trofeus, 1);
  assert.equal(podio.ouro, 0);
  assert.equal(podio.prata, 0);
});

testeComBanco("resultado repetido de série já finalizada é ignorado", async () => {
  const admin = await adminDeTeste();
  const { torneio } = await torneioComInscritos(4, { adminUserId: admin.id });
  await tournamentService.iniciar({ torneioId: torneio.id });
  const semi = await TournamentSeries.findOne({
    where: { tournament_id: torneio.id, round: "Semifinal", posicao: 0 },
  });

  await vencerSerie(semi, semi.participant_a_id);
  await semi.reload();
  const placarA = semi.score_a;

  const repetido = await tournamentMatchService.registrarResultadoDeJogo({
    serieId: semi.id,
    vencedorParticipantId: semi.participant_a_id,
  });
  assert.equal(repetido.ignorado, true);
  await semi.reload();
  assert.equal(semi.score_a, placarA);
});

// -------------------- Ready check e W.O. --------------------

testeComBanco("ready check expirado com um lado pronto dá W.O.", async () => {
  const admin = await adminDeTeste();
  const { torneio } = await torneioComInscritos(4, { adminUserId: admin.id });
  await tournamentService.iniciar({ torneioId: torneio.id });
  const semi = await TournamentSeries.findOne({
    where: { tournament_id: torneio.id, round: "Semifinal", posicao: 0 },
  });

  await tournamentMatchService.confirmarPronto({
    serieId: semi.id,
    participantId: semi.participant_a_id,
  });
  // Força o prazo a vencer.
  await semi.update({ ready_check_expira_em: new Date(Date.now() - 1000) });

  const resolvida = await tournamentMatchService.resolverReadyCheckExpirado(semi.id);
  assert.equal(resolvida.status, "WO");
  assert.equal(resolvida.winner_participant_id, semi.participant_a_id);

  // O vencedor do W.O. avança normalmente.
  const final = await TournamentSeries.findOne({
    where: { tournament_id: torneio.id, round: "Final" },
  });
  assert.equal(final.participant_a_id, semi.participant_a_id);
});

testeComBanco("ready check expirado sem ninguém pronto vira PendenteAdm", async () => {
  const admin = await adminDeTeste();
  const { torneio } = await torneioComInscritos(4, { adminUserId: admin.id });
  await tournamentService.iniciar({ torneioId: torneio.id });
  const semi = await TournamentSeries.findOne({
    where: { tournament_id: torneio.id, round: "Semifinal", posicao: 1 },
  });

  await semi.update({ ready_check_expira_em: new Date(Date.now() - 1000) });
  const resolvida = await tournamentMatchService.resolverReadyCheckExpirado(semi.id);

  assert.equal(resolvida.status, "PendenteAdm");
  assert.equal(resolvida.winner_participant_id, null, "o sistema nunca escolhe vencedor sozinho");
});

testeComBanco("quem não participa da série não confirma ready check", async () => {
  const admin = await adminDeTeste();
  const { torneio } = await torneioComInscritos(4, { adminUserId: admin.id });
  await tournamentService.iniciar({ torneioId: torneio.id });
  const semiA = await TournamentSeries.findOne({
    where: { tournament_id: torneio.id, round: "Semifinal", posicao: 0 },
  });
  const semiB = await TournamentSeries.findOne({
    where: { tournament_id: torneio.id, round: "Semifinal", posicao: 1 },
  });

  await assert.rejects(
    () =>
      tournamentMatchService.confirmarPronto({
        serieId: semiA.id,
        participantId: semiB.participant_a_id,
      }),
    /não participa/,
  );
});

// -------------------- Isolamento (§1/§16) --------------------

testeComBanco("torneio não mexe em rating ranqueado, limite diário nem PvpStatus", async () => {
  const admin = await adminDeTeste();
  const { torneio, personagens } = await torneioComInscritos(4, { adminUserId: admin.id });

  const PvPSeason = require("../src/models/PvPSeason");
  const temporada = await PvPSeason.create({
    nome: `Temporada isolamento ${Date.now()}${Math.random()}`,
    starts_at: new Date(),
    ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    status: "Agendada",
  });

  for (const personagem of personagens) {
    await CharacterPvpSeason.create({
      character_id: personagem.id,
      season_id: temporada.id,
      rating: 1234,
      jogos: 0,
      vitorias: 0,
      derrotas: 0,
      peak_rating: 1234,
    });
    await PvpStatus.create({
      id_personagem: personagem.id,
      total_batalhas: 2,
      vitorias: 1,
      derrotas: 1,
      sistema_classificacao: "Vitorias",
    });
  }

  await tournamentService.iniciar({ torneioId: torneio.id });
  const semis = await TournamentSeries.findAll({
    where: { tournament_id: torneio.id, round: "Semifinal" },
  });
  for (const semi of semis) await vencerSerie(semi, semi.participant_a_id);
  const final = await TournamentSeries.findOne({
    where: { tournament_id: torneio.id, round: "Final" },
  });
  await vencerSerie(final, final.participant_a_id);

  for (const personagem of personagens) {
    const ranked = await CharacterPvpSeason.findOne({
      where: { character_id: personagem.id, season_id: temporada.id },
    });
    assert.equal(ranked.rating, 1234);
    assert.equal(ranked.jogos, 0);

    const uso = await rankedDailyLimitService.consultarUso(personagem.id);
    assert.equal(uso.usadas, 0);
    const linhas = await CharacterRankedDailyUsage.count({ where: { character_id: personagem.id } });
    assert.equal(linhas, 0);

    const casual = await PvpStatus.findOne({ where: { id_personagem: personagem.id } });
    assert.equal(casual.total_batalhas, 2);
    assert.equal(casual.vitorias, 1);
  }
});

testeComBanco("série ativa bloqueia outras experiências (exclusão mútua)", async () => {
  const admin = await adminDeTeste();
  const { torneio, personagens } = await torneioComInscritos(4, { adminUserId: admin.id });
  assert.equal(await tournamentService.emSerieAtiva(personagens[0].id), false);

  await tournamentService.iniciar({ torneioId: torneio.id });
  assert.equal(await tournamentService.emSerieAtiva(personagens[0].id), true);
});

// -------------------- Prêmio e cancelamento --------------------

testeComBanco("prêmio entregue é só marcador de admin (nada é creditado)", async () => {
  const admin = await adminDeTeste();
  const torneio = await tournamentService.criar({
    criadoPorUserId: admin.id,
    dados: {
      name: `Premio ${Date.now()}`,
      starts_at: new Date().toISOString(),
      prize_description: "1000 de ouro na mão",
    },
  });
  assert.equal(torneio.prize_delivered, false);
  const marcado = await tournamentService.marcarPremioEntregue({
    torneioId: torneio.id,
    entregue: true,
    adminUserId: admin.id,
  });
  assert.equal(marcado.prize_delivered, true);
});

testeComBanco("cancelamento fecha o torneio e bloqueia novo cancelamento após final", async () => {
  const admin = await adminDeTeste();
  const torneio = await tournamentService.criar({
    criadoPorUserId: admin.id,
    dados: { name: `Cancel ${Date.now()}`, starts_at: new Date().toISOString() },
  });
  const cancelado = await tournamentService.cancelar({
    torneioId: torneio.id,
    motivo: "teste",
    adminUserId: admin.id,
  });
  assert.equal(cancelado.status, "Cancelado");

  await torneio.update({ status: "Finalizado" });
  await assert.rejects(
    () => tournamentService.cancelar({ torneioId: torneio.id, adminUserId: admin.id }),
    /finalizado/,
  );
});

// -------------------- Desconexão no meio de um jogo --------------------
//
// Regressão: um jogador caindo no MEIO de um jogo de torneio (não no
// ready check) tinha que passar pelo mesmo finalize que o fim por
// combate já usa (duelo.finalizar), senão a série nunca recebia o
// resultado e a chave travava — foi exatamente o bug relatado (W.O. sem
// avançar pra próxima fase). Simula o disconnect direto pelo módulo do
// duelo ao vivo, sem precisar de um socket.io real.
testeComBanco(
  "desconexão no meio de um jogo de torneio avança a série (não só o fim por combate)",
  async () => {
    const pvpLiveSocket = require("../src/socket/pvpLiveSocket");
    const tournamentSocket = require("../src/socket/tournamentSocket");

    const admin = await adminDeTeste();
    const { torneio } = await torneioComInscritos(4, { adminUserId: admin.id });
    await tournamentService.iniciar({ torneioId: torneio.id });
    const semi = await TournamentSeries.findOne({
      where: { tournament_id: torneio.id, round: "Semifinal", posicao: 0 },
    });
    const participanteA = await TournamentParticipant.findByPk(semi.participant_a_id);
    const participanteB = await TournamentParticipant.findByPk(semi.participant_b_id);

    // Jogo 1 da série termina por combate normal (não é o que estamos
    // testando) — deixa a série em 1-0 pra A.
    await vencerSerieUmJogo(semi, semi.participant_a_id);

    // Jogo 2 (decisivo, MD3 = 2 vitórias): B desconecta no meio da
    // partida. Registra um duelo "de verdade" nos mapas do módulo,
    // exatamente como tournamentSocket.iniciarJogoDaSerie faria, e
    // simula o evento de disconnect.
    const duelId = pvpLiveSocket.alocarDuelId();
    const ioFalso = {
      to: () => ({ emit: () => {} }),
      sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
    };
    pvpLiveSocket.duelos.set(duelId, {
      id: duelId,
      sala: `torneio:${duelId}`,
      a: { id: participanteA.character_id, nome: "A" },
      b: { id: participanteB.character_id, nome: "B" },
      torneio: true,
      serieId: semi.id,
      participantAId: semi.participant_a_id,
      participantBId: semi.participant_b_id,
      finalizar: tournamentSocket.finalizarJogoDeTorneio,
      timer: null,
    });

    await pvpLiveSocket.finalizarDueloPorDesistencia(
      ioFalso,
      duelId,
      participanteB.character_id,
    );

    const semiAtualizada = await TournamentSeries.findByPk(semi.id);
    assert.equal(semiAtualizada.status, "Finalizada", "a série precisa ter recebido o resultado");
    assert.equal(semiAtualizada.winner_participant_id, semi.participant_a_id);
    assert.equal(semiAtualizada.score_a, 2);

    // E o vencedor avançou de verdade pra Final — não só a série local
    // ficou marcada como finalizada.
    const final = await TournamentSeries.findOne({
      where: { tournament_id: torneio.id, round: "Final" },
    });
    assert.equal(final.participant_a_id ?? final.participant_b_id, semi.participant_a_id);
  },
);

async function vencerSerieUmJogo(serie, vencedorParticipantId) {
  await tournamentMatchService.registrarResultadoDeJogo({
    serieId: serie.id,
    vencedorParticipantId,
  });
}

test.after(async () => {
  if (temBanco) await sequelize.close();
});
