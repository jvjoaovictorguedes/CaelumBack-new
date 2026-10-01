// Ranking da Pesca + Torneio da Pesca — cobre ordenação/desempate/
// "minha posição" (fishingRankingService.js) e a janela de tempo +
// agregação materializada na leitura do Torneio (fishingTournamentService.js).
// Mesma lição aprendida em fishing.test.js/adminFishing.test.js: rastreia
// e limpa TUDO que este arquivo cria (test.after), na ordem certa de FK —
// incluindo Character/User (criarPersonagem), que os outros arquivos de
// Pesca não limpam mas que aqui IMPORTA limpar: um personagem de teste
// esquecido apareceria de verdade num ranking real.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const FishingSpecies = require("../src/models/FishingSpecies");
const FishingZone = require("../src/models/FishingZone");
const FishingCatchRecord = require("../src/models/FishingCatchRecord");
const CharacterFishingProgress = require("../src/models/CharacterFishingProgress");
const FishingTournament = require("../src/models/FishingTournament");
const FishingTournamentEntry = require("../src/models/FishingTournamentEntry");
const Character = require("../src/models/Character");
const User = require("../src/models/User");

const fishingRankingService = require("../src/services/fishingRankingService");
const fishingTournamentService = require("../src/services/fishingTournamentService");
const fishingTournamentScheduler = require("../src/services/fishingTournamentScheduler");

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

const itensCriados = [];
const especiesCriadas = [];
const zonasCriadas = [];
const personagensCriados = [];
const usuariosCriados = [];
const torneiosCriados = [];

test.after(async () => {
  if (!temBanco) return;
  await FishingCatchRecord.destroy({ where: { id_personagem: personagensCriados.length ? personagensCriados : [-1] } });
  await CharacterFishingProgress.destroy({ where: { id_personagem: personagensCriados.length ? personagensCriados : [-1] } });
  await FishingTournamentEntry.destroy({ where: { id_tournament: torneiosCriados.length ? torneiosCriados : [-1] } });
  await FishingTournament.destroy({ where: { id: torneiosCriados.length ? torneiosCriados : [-1] } });
  await FishingSpecies.destroy({ where: { id: especiesCriadas.length ? especiesCriadas : [-1] } });
  await FishingZone.destroy({ where: { id: zonasCriadas.length ? zonasCriadas : [-1] } });
  if (itensCriados.length > 0) await Item.destroy({ where: { id: itensCriados } });
  if (personagensCriados.length > 0) await Character.destroy({ where: { id: personagensCriados } });
  if (usuariosCriados.length > 0) await User.destroy({ where: { id: usuariosCriados } });
  if (temBanco) await sequelize.close();
});

async function personagem() {
  const { usuario, personagem: p } = await criarPersonagem();
  usuariosCriados.push(usuario.id);
  personagensCriados.push(p.id);
  return p;
}

async function especie() {
  const item = await Item.create({
    nome: `Peixe Ranking ${sufixo()}`,
    descricao: "Item de teste do ranking de Pesca.",
    tipo_item: "Material",
    raridade: "Comum",
  });
  itensCriados.push(item.id);
  const esp = await FishingSpecies.create({
    key: `especie_ranking_${sufixo()}`,
    id_item: item.id,
    comportamento_key: "CALM",
    dificuldade_base: 100,
    peso_min_g: 100,
    peso_max_g: 500,
    perfil_peso: "NORMAL",
    pontos_base_torneio: 100,
  });
  especiesCriadas.push(esp.id);
  return esp;
}

async function zona() {
  const z = await FishingZone.create({
    key: `zona_ranking_${sufixo()}`,
    nome: "Zona Ranking Teste",
    nivel_pesca_minimo: 1,
    tier_embarcacao_minimo: 1,
    dificuldade_ambiente: 100,
  });
  zonasCriadas.push(z.id);
  return z;
}

async function catchRecord({ idPersonagem, idSpecies, idZone, weight_g, quality = 1, caughtAt = new Date() }) {
  return FishingCatchRecord.create({
    id_personagem: idPersonagem,
    id_species: idSpecies,
    id_zone: idZone,
    weight_g,
    quality,
    caught_at: caughtAt,
  });
}

// -------------------------------------------------------------- RANKING
testeComBanco("ranking pesca (total): ordena por total_capturado desc, desempata por nivel desc", async () => {
  const p1 = await personagem();
  const p2 = await personagem();
  const p3 = await personagem();

  await CharacterFishingProgress.create({ id_personagem: p1.id, nivel: 5, total_capturado: 10 });
  await CharacterFishingProgress.create({ id_personagem: p2.id, nivel: 8, total_capturado: 20 });
  await CharacterFishingProgress.create({ id_personagem: p3.id, nivel: 3, total_capturado: 20 });

  const { itens } = await fishingRankingService.rankingPescaTotal(1);
  const idsOrdenados = itens.filter((i) => [p1.id, p2.id, p3.id].includes(i.id)).map((i) => i.id);
  // p2 e p3 empatam em total_capturado (20) — p2 (nível 8) vem antes de
  // p3 (nível 3); p1 (total 10) vem por último.
  assert.deepEqual(idsOrdenados, [p2.id, p3.id, p1.id]);

  const posicaoP1 = await fishingRankingService.posicaoPescaTotal(p1.id);
  assert.equal(posicaoP1.elegivel, true);
  // Pelo menos p2 e p3 estão à frente de p1 (podem existir outros
  // personagens de outros arquivos de teste rodando em paralelo, mas
  // nunca menos que os 2 que este teste garante).
  assert.ok(posicaoP1.posicao >= 3);
});

testeComBanco("ranking pesca (total): personagem sem capturas não é elegível", async () => {
  const p = await personagem();
  await CharacterFishingProgress.create({ id_personagem: p.id, nivel: 1, total_capturado: 0 });
  const posicao = await fishingRankingService.posicaoPescaTotal(p.id);
  assert.equal(posicao.elegivel, false);
});

testeComBanco("ranking pesca (maior peixe): um registro por personagem (o MAIOR peso), desempata por captura mais antiga", async () => {
  const p1 = await personagem();
  const esp = await especie();
  const z = await zona();

  const antiga = new Date(Date.now() - 60_000);
  const recente = new Date();
  // Dois catches do MESMO peso pra esse personagem — deve considerar só
  // 1 linha (o mais antigo desempata), não somar/duplicar.
  await catchRecord({ idPersonagem: p1.id, idSpecies: esp.id, idZone: z.id, weight_g: 5000, caughtAt: antiga });
  await catchRecord({ idPersonagem: p1.id, idSpecies: esp.id, idZone: z.id, weight_g: 5000, caughtAt: recente });
  await catchRecord({ idPersonagem: p1.id, idSpecies: esp.id, idZone: z.id, weight_g: 1000, caughtAt: recente });

  const posicao = await fishingRankingService.posicaoPescaMaiorPeixe(p1.id);
  assert.equal(posicao.elegivel, true);
  assert.equal(posicao.weight_g, 5000);

  const { itens } = await fishingRankingService.rankingPescaMaiorPeixe(1);
  const linhaP1 = itens.find((i) => i.id === p1.id);
  assert.ok(linhaP1);
  assert.equal(linhaP1.weight_g, 5000);
});

// ------------------------------------------------------------- TORNEIO
testeComBanco("torneio: obterTorneioAtual encontra o torneio EM_ANDAMENTO (janela cobre agora) e não um passado/futuro", async () => {
  const passado = await FishingTournament.create({
    nome: `Torneio Passado ${sufixo()}`,
    inicia_em: new Date(Date.now() - 5 * 86_400_000),
    termina_em: new Date(Date.now() - 4 * 86_400_000),
  });
  torneiosCriados.push(passado.id);

  const atual = await FishingTournament.create({
    nome: `Torneio Atual ${sufixo()}`,
    inicia_em: new Date(Date.now() - 3_600_000),
    termina_em: new Date(Date.now() + 3_600_000),
  });
  torneiosCriados.push(atual.id);

  const futuro = await FishingTournament.create({
    nome: `Torneio Futuro ${sufixo()}`,
    inicia_em: new Date(Date.now() + 86_400_000),
    termina_em: new Date(Date.now() + 2 * 86_400_000),
  });
  torneiosCriados.push(futuro.id);

  const { torneio, status } = await fishingTournamentService.obterTorneioAtual();
  assert.ok(torneio);
  assert.equal(status, "EM_ANDAMENTO");
  assert.equal(torneio.id, atual.id);
});

testeComBanco("torneio: leaderboard soma weight_g*quality só das capturas DENTRO da janela, ignora fora da janela", async () => {
  const p1 = await personagem();
  const p2 = await personagem();
  const esp = await especie();
  const z = await zona();

  const torneio = await FishingTournament.create({
    nome: `Torneio Pontuação ${sufixo()}`,
    inicia_em: new Date(Date.now() - 3_600_000),
    termina_em: new Date(Date.now() + 3_600_000),
  });
  torneiosCriados.push(torneio.id);
  // Inscrição direta no model (não via inscreverNoTorneio — esse torneio
  // já começou de propósito pra determinismo do teste, e a função real
  // fecha inscrição nesse ponto; aqui simulamos "já estavam inscritos
  // antes do início", que é o caso real que a regra cobre).
  await FishingTournamentEntry.create({ id_tournament: torneio.id, id_personagem: p1.id });
  await FishingTournamentEntry.create({ id_tournament: torneio.id, id_personagem: p2.id });

  // p1: 2 capturas dentro da janela (conta as duas), 1 fora (ignorada).
  await catchRecord({ idPersonagem: p1.id, idSpecies: esp.id, idZone: z.id, weight_g: 1000, quality: 0.5 });
  await catchRecord({ idPersonagem: p1.id, idSpecies: esp.id, idZone: z.id, weight_g: 2000, quality: 1 });
  await catchRecord({
    idPersonagem: p1.id,
    idSpecies: esp.id,
    idZone: z.id,
    weight_g: 9999,
    quality: 1,
    caughtAt: new Date(Date.now() - 10 * 86_400_000), // fora da janela
  });

  // p2: 1 captura dentro da janela, pontuação menor que p1.
  await catchRecord({ idPersonagem: p2.id, idSpecies: esp.id, idZone: z.id, weight_g: 500, quality: 1 });

  const leaderboard = await fishingTournamentService.listarLeaderboardTorneio(torneio.id, 1);
  const linhaP1 = leaderboard.itens.find((i) => i.id === p1.id);
  const linhaP2 = leaderboard.itens.find((i) => i.id === p2.id);

  assert.ok(linhaP1);
  assert.ok(linhaP2);
  // p1: 1000*0.5 + 2000*1 = 2500 (o registro fora da janela NUNCA entra).
  assert.equal(linhaP1.pontuacao, 2500);
  assert.equal(linhaP1.capturas, 2);
  assert.equal(linhaP2.pontuacao, 500);
  assert.ok(linhaP1.posicao < linhaP2.posicao);

  const minhaP1 = await fishingTournamentService.obterMinhaPosicaoTorneio(torneio.id, p1.id);
  assert.equal(minhaP1.elegivel, true);
  assert.equal(minhaP1.pontuacao, 2500);
  assert.equal(minhaP1.posicao, linhaP1.posicao);
});

testeComBanco("torneio: escopo por zona ignora capturas de outras zonas", async () => {
  const p1 = await personagem();
  const esp = await especie();
  const zonaDoTorneio = await zona();
  const outraZona = await zona();

  const torneio = await FishingTournament.create({
    nome: `Torneio Zona ${sufixo()}`,
    id_zone: zonaDoTorneio.id,
    inicia_em: new Date(Date.now() - 3_600_000),
    termina_em: new Date(Date.now() + 3_600_000),
  });
  torneiosCriados.push(torneio.id);
  await FishingTournamentEntry.create({ id_tournament: torneio.id, id_personagem: p1.id });

  await catchRecord({ idPersonagem: p1.id, idSpecies: esp.id, idZone: zonaDoTorneio.id, weight_g: 1000, quality: 1 });
  await catchRecord({ idPersonagem: p1.id, idSpecies: esp.id, idZone: outraZona.id, weight_g: 8000, quality: 1 });

  const minha = await fishingTournamentService.obterMinhaPosicaoTorneio(torneio.id, p1.id);
  assert.equal(minha.pontuacao, 1000);
  assert.equal(minha.capturas, 1);
});

// ---------------------------------------------------------- INSCRIÇÃO
testeComBanco("torneio: inscrição funciona ANTES do início e fica refletida em estaInscrito", async () => {
  const p1 = await personagem();
  const torneio = await FishingTournament.create({
    nome: `Torneio Inscrição Futura ${sufixo()}`,
    inicia_em: new Date(Date.now() + 3_600_000),
    termina_em: new Date(Date.now() + 7_200_000),
  });
  torneiosCriados.push(torneio.id);

  assert.equal(await fishingTournamentService.estaInscrito(torneio.id, p1.id), false);
  await fishingTournamentService.inscreverNoTorneio(torneio.id, p1.id);
  assert.equal(await fishingTournamentService.estaInscrito(torneio.id, p1.id), true);
});

testeComBanco("torneio: inscrição é idempotente (inscrever de novo não falha nem duplica)", async () => {
  const p1 = await personagem();
  const torneio = await FishingTournament.create({
    nome: `Torneio Inscrição Dupla ${sufixo()}`,
    inicia_em: new Date(Date.now() + 3_600_000),
    termina_em: new Date(Date.now() + 7_200_000),
  });
  torneiosCriados.push(torneio.id);

  await fishingTournamentService.inscreverNoTorneio(torneio.id, p1.id);
  await fishingTournamentService.inscreverNoTorneio(torneio.id, p1.id);

  const linhas = await FishingTournamentEntry.findAll({ where: { id_tournament: torneio.id, id_personagem: p1.id } });
  assert.equal(linhas.length, 1);
});

testeComBanco("torneio: inscrição é recusada depois que o torneio já começou", async () => {
  const p1 = await personagem();
  const torneio = await FishingTournament.create({
    nome: `Torneio Já Começou ${sufixo()}`,
    inicia_em: new Date(Date.now() - 60_000),
    termina_em: new Date(Date.now() + 3_600_000),
  });
  torneiosCriados.push(torneio.id);

  await assert.rejects(
    fishingTournamentService.inscreverNoTorneio(torneio.id, p1.id),
    /Inscrições encerradas/,
  );
});

testeComBanco("torneio: captura de quem NÃO se inscreveu não conta pro placar", async () => {
  const inscrito = await personagem();
  const naoInscrito = await personagem();
  const esp = await especie();
  const z = await zona();

  const torneio = await FishingTournament.create({
    nome: `Torneio Só Inscritos ${sufixo()}`,
    inicia_em: new Date(Date.now() - 3_600_000),
    termina_em: new Date(Date.now() + 3_600_000),
  });
  torneiosCriados.push(torneio.id);
  await FishingTournamentEntry.create({ id_tournament: torneio.id, id_personagem: inscrito.id });

  await catchRecord({ idPersonagem: inscrito.id, idSpecies: esp.id, idZone: z.id, weight_g: 1000, quality: 1 });
  await catchRecord({ idPersonagem: naoInscrito.id, idSpecies: esp.id, idZone: z.id, weight_g: 9999, quality: 1 });

  const leaderboard = await fishingTournamentService.listarLeaderboardTorneio(torneio.id, 1);
  assert.ok(leaderboard.itens.some((i) => i.id === inscrito.id));
  assert.ok(!leaderboard.itens.some((i) => i.id === naoInscrito.id), "não inscrito nunca pode aparecer no placar, mesmo tendo pescado mais");

  const minhaNaoInscrito = await fishingTournamentService.obterMinhaPosicaoTorneio(torneio.id, naoInscrito.id);
  assert.equal(minhaNaoInscrito.elegivel, false);
  assert.match(minhaNaoInscrito.motivo, /não se inscreveu/);
});

// ---------------------------------------------------- FINALIZAÇÃO AUTOMÁTICA
testeComBanco("scheduler: finaliza um torneio vencido, registra o vencedor e desativa", async () => {
  const vencedor = await personagem();
  const segundo = await personagem();
  const esp = await especie();
  const z = await zona();

  const torneio = await FishingTournament.create({
    nome: `Torneio Pra Finalizar ${sufixo()}`,
    inicia_em: new Date(Date.now() - 7_200_000),
    termina_em: new Date(Date.now() - 1_000), // já terminou
    ativo: true,
  });
  torneiosCriados.push(torneio.id);
  await FishingTournamentEntry.create({ id_tournament: torneio.id, id_personagem: vencedor.id });
  await FishingTournamentEntry.create({ id_tournament: torneio.id, id_personagem: segundo.id });

  await catchRecord({ idPersonagem: vencedor.id, idSpecies: esp.id, idZone: z.id, weight_g: 5000, quality: 1, caughtAt: new Date(Date.now() - 3_600_000) });
  await catchRecord({ idPersonagem: segundo.id, idSpecies: esp.id, idZone: z.id, weight_g: 1000, quality: 1, caughtAt: new Date(Date.now() - 3_600_000) });

  await fishingTournamentScheduler.finalizarUmTorneio(torneio.id);

  await torneio.reload();
  assert.equal(torneio.ativo, false);
  assert.ok(torneio.finalizado_em);
  assert.equal(torneio.vencedor_character_id, vencedor.id);
  assert.equal(torneio.vencedor_nome, vencedor.nome);
});

testeComBanco("scheduler: finalizarTorneiosVencidos processa só os que já passaram de termina_em e estão ativos", async () => {
  const p1 = await personagem();
  const esp = await especie();
  const z = await zona();

  const vencido = await FishingTournament.create({
    nome: `Torneio Vencido ${sufixo()}`,
    inicia_em: new Date(Date.now() - 7_200_000),
    termina_em: new Date(Date.now() - 1_000),
    ativo: true,
  });
  torneiosCriados.push(vencido.id);
  await FishingTournamentEntry.create({ id_tournament: vencido.id, id_personagem: p1.id });
  await catchRecord({ idPersonagem: p1.id, idSpecies: esp.id, idZone: z.id, weight_g: 1000, quality: 1, caughtAt: new Date(Date.now() - 3_600_000) });

  const aindaRolando = await FishingTournament.create({
    nome: `Torneio Ainda Rolando ${sufixo()}`,
    inicia_em: new Date(Date.now() - 3_600_000),
    termina_em: new Date(Date.now() + 3_600_000),
    ativo: true,
  });
  torneiosCriados.push(aindaRolando.id);

  await fishingTournamentScheduler.finalizarTorneiosVencidos();

  await vencido.reload();
  await aindaRolando.reload();
  assert.equal(vencido.ativo, false, "torneio vencido devia ter sido finalizado");
  assert.ok(vencido.finalizado_em);
  assert.equal(aindaRolando.ativo, true, "torneio ainda em andamento não pode ser mexido");
  assert.equal(aindaRolando.finalizado_em, null);
});

testeComBanco("scheduler: processar o mesmo torneio duas vezes não sobrescreve o resultado (idempotente)", async () => {
  const vencedor = await personagem();
  const esp = await especie();
  const z = await zona();

  const torneio = await FishingTournament.create({
    nome: `Torneio Idempotente ${sufixo()}`,
    inicia_em: new Date(Date.now() - 7_200_000),
    termina_em: new Date(Date.now() - 1_000),
    ativo: true,
  });
  torneiosCriados.push(torneio.id);
  await FishingTournamentEntry.create({ id_tournament: torneio.id, id_personagem: vencedor.id });
  await catchRecord({ idPersonagem: vencedor.id, idSpecies: esp.id, idZone: z.id, weight_g: 1000, quality: 1, caughtAt: new Date(Date.now() - 3_600_000) });

  await fishingTournamentScheduler.finalizarUmTorneio(torneio.id);
  await torneio.reload();
  const finalizadoEmPrimeiraVez = torneio.finalizado_em.getTime();

  const resultadoSegundaChamada = await fishingTournamentScheduler.finalizarUmTorneio(torneio.id);
  assert.equal(resultadoSegundaChamada, null, "já finalizado não deve ser reprocessado");

  await torneio.reload();
  assert.equal(torneio.finalizado_em.getTime(), finalizadoEmPrimeiraVez);
});

testeComBanco("obterTorneioAtual mostra o ÚLTIMO finalizado quando não há nenhum ativo/agendado", async () => {
  const vencedor = await personagem();
  const esp = await especie();
  const z = await zona();

  const torneio = await FishingTournament.create({
    nome: `Torneio Pra Mostrar Depois ${sufixo()}`,
    inicia_em: new Date(Date.now() - 7_200_000),
    termina_em: new Date(Date.now() - 1_000),
    ativo: true,
  });
  torneiosCriados.push(torneio.id);
  await FishingTournamentEntry.create({ id_tournament: torneio.id, id_personagem: vencedor.id });
  await catchRecord({ idPersonagem: vencedor.id, idSpecies: esp.id, idZone: z.id, weight_g: 1000, quality: 1, caughtAt: new Date(Date.now() - 3_600_000) });

  await fishingTournamentScheduler.finalizarUmTorneio(torneio.id);

  // Outros testes deste arquivo deixam torneios "ativo:true" cobrindo o
  // "agora" (cleanup só roda no test.after, no fim do arquivo inteiro) —
  // sem desativar esses fixtures aqui, qualquer um deles venceria o
  // fallback de FINALIZADO antes de chegar neste torneio.
  await FishingTournament.update(
    { ativo: false },
    { where: { id: torneiosCriados.filter((id) => id !== torneio.id) } },
  );

  const { torneio: torneioAtual, status } = await fishingTournamentService.obterTorneioAtual();
  assert.ok(torneioAtual);
  assert.equal(status, "FINALIZADO");
  assert.equal(torneioAtual.id, torneio.id);
  assert.equal(torneioAtual.vencedor_nome, vencedor.nome);
});
