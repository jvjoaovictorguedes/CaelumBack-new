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
const Character = require("../src/models/Character");
const User = require("../src/models/User");

const fishingRankingService = require("../src/services/fishingRankingService");
const fishingTournamentService = require("../src/services/fishingTournamentService");

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

  await catchRecord({ idPersonagem: p1.id, idSpecies: esp.id, idZone: zonaDoTorneio.id, weight_g: 1000, quality: 1 });
  await catchRecord({ idPersonagem: p1.id, idSpecies: esp.id, idZone: outraZona.id, weight_g: 8000, quality: 1 });

  const minha = await fishingTournamentService.obterMinhaPosicaoTorneio(torneio.id, p1.id);
  assert.equal(minha.pontuacao, 1000);
  assert.equal(minha.capturas, 1);
});
