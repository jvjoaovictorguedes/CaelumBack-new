// Caçadas da Guilda dos Aventureiros — cobre a parte pura (Reputação de
// Caçador/janela, sem banco) e o fluxo ponta a ponta com banco real
// (geração de oferta, aceite/abandono, modificador no encontro,
// contagem de morte e conclusão transacional).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
const { resolverNivel, formatarResumoReputacao, sortearDificuldade } = require("../src/services/hunterReputationService");
const { inicioDaJanelaDeCacada, HUNT_DIFFICULTIES } = require("../src/config/huntConfig");
const { garantirOfertaAtual } = require("../src/services/adventureHuntRotationService");
const { obterEstado, aceitarOferta, abandonarCacada } = require("../src/services/adventureHuntService");
const { resolverModificadorParaEncontro, registrarMorteDaCacada } = require("../src/services/adventureHuntCombatService");
const Character = require("../src/models/Character");
const AdventureZone = require("../src/models/AdventureZone");
const AdventureMonster = require("../src/models/AdventureMonster");
const AdventureZoneMonster = require("../src/models/AdventureZoneMonster");
const CharacterAdventureHunt = require("../src/models/CharacterAdventureHunt");
const CharacterHunterProgress = require("../src/models/CharacterHunterProgress");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
});

// aventuraExpansao.test.js confere a contagem EXATA de zonas/monstros
// ativos do catálogo de produção — as zonas/monstros de teste criados
// aqui (criarZonaComMonstro) precisam ser removidos no final do
// arquivo, senão poluem esses testes que rodam no mesmo banco.
const zonasCriadas = [];
const monstrosCriados = [];
test.after(async () => {
  if (!temBanco) return;
  await AdventureZoneMonster.destroy({ where: { id_area: zonasCriadas } });
  await CharacterAdventureHunt.destroy({ where: { id_monstro: monstrosCriados } });
  await AdventureZone.destroy({ where: { id: zonasCriadas } });
  await AdventureMonster.destroy({ where: { id: monstrosCriados } });
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

// ---------------------------------------------------------------------
// hunterReputationService — puro, sem banco
// ---------------------------------------------------------------------

test("resolverNivel: marcos exatos 0/2500/8500/22000/50000 produzem I-V", () => {
  assert.equal(resolverNivel(0).roman, "I");
  assert.equal(resolverNivel(2499).roman, "I");
  assert.equal(resolverNivel(2500).roman, "II");
  assert.equal(resolverNivel(8499).roman, "II");
  assert.equal(resolverNivel(8500).roman, "III");
  assert.equal(resolverNivel(21999).roman, "III");
  assert.equal(resolverNivel(22000).roman, "IV");
  assert.equal(resolverNivel(49999).roman, "IV");
  assert.equal(resolverNivel(50000).roman, "V");
});

test("resolverNivel: acima do nível V permanece V", () => {
  assert.equal(resolverNivel(999_999).roman, "V");
});

test("formatarResumoReputacao: nextLevelAt correto e null no nível V", () => {
  assert.equal(formatarResumoReputacao(0).nextLevelAt, 2500);
  assert.equal(formatarResumoReputacao(50000).nextLevelAt, null);
});

test("sortearDificuldade: nível I só sorteia dentro do próprio pool (Perigosa/Difícil)", () => {
  for (let i = 0; i < 100; i += 1) {
    const dificuldade = sortearDificuldade(0);
    assert.ok(["Dangerous", "Difficult"].includes(dificuldade));
  }
});

test("sortearDificuldade: nível V só sorteia Mortal/Pesadelo/Extermínio", () => {
  for (let i = 0; i < 100; i += 1) {
    const dificuldade = sortearDificuldade(60000);
    assert.ok(["Deadly", "Nightmare", "Extermination"].includes(dificuldade));
  }
});

test("inicioDaJanelaDeCacada: borda 03:59:59/04:00:00 UTC cai em janelas diferentes", () => {
  const antes = new Date("2026-09-24T03:59:59.000Z");
  const depois = new Date("2026-09-24T04:00:00.000Z");
  assert.equal(inicioDaJanelaDeCacada(antes).toISOString(), "2026-09-24T00:00:00.000Z");
  assert.equal(inicioDaJanelaDeCacada(depois).toISOString(), "2026-09-24T04:00:00.000Z");
});

// ---------------------------------------------------------------------
// Fluxo completo com banco real
// ---------------------------------------------------------------------

async function criarZonaComMonstro({ nivelMin = 10, nivelMax = 20 } = {}) {
  const chave = sufixo();
  const zona = await AdventureZone.create({
    nome: `Zona Teste ${chave}`,
    nivel_monstro_min: nivelMin,
    nivel_monstro_max: nivelMax,
  });
  const monstro = await AdventureMonster.create({
    nome: `Monstro Teste ${chave}`,
    multiplicador_vida: 1,
    multiplicador_dano: 1,
  });
  await AdventureZoneMonster.create({ id_area: zona.id, id_monstro: monstro.id });
  zonasCriadas.push(zona.id);
  monstrosCriados.push(monstro.id);
  return { zona, monstro };
}

testeComBanco("garantirOfertaAtual: gera uma oferta estável entre chamadas (refresh)", async () => {
  await criarZonaComMonstro();
  const { personagem } = await criarPersonagem();

  const primeira = await sequelize.transaction((t) => garantirOfertaAtual(personagem.id, t));
  assert.equal(primeira.status, "Offered");
  const [minQtd, maxQtd] = HUNT_DIFFICULTIES[primeira.difficulty].quantityRange;
  assert.ok(primeira.quantity_required >= minQtd && primeira.quantity_required <= maxQtd);

  const segunda = await sequelize.transaction((t) => garantirOfertaAtual(personagem.id, t));
  assert.equal(segunda.id, primeira.id);
});

testeComBanco("aceitar/abandonar: só uma Caçada Ativa por vez; abandonar não gera nova oferta", async () => {
  await criarZonaComMonstro();
  const { personagem } = await criarPersonagem();

  const { oferta } = await sequelize.transaction((t) => obterEstado(personagem.id, t));
  const ativa = await sequelize.transaction((t) => aceitarOferta(personagem.id, oferta.id, t));
  assert.equal(ativa.status, "Active");

  await assert.rejects(
    sequelize.transaction((t) => aceitarOferta(personagem.id, oferta.id, t)),
    (erro) => erro.statusCode === 409,
  );

  const abandonada = await sequelize.transaction((t) => abandonarCacada(personagem.id, ativa.id, t));
  assert.equal(abandonada.status, "Abandoned");

  const { oferta: ofertaDepois, ativa: ativaDepois } = await sequelize.transaction((t) => obterEstado(personagem.id, t));
  assert.equal(ativaDepois, null);
  // §10 — mesma janela, mesma linha (agora Abandoned); não cria nova oferta.
  assert.equal(ofertaDepois.id, oferta.id);
  assert.equal(ofertaDepois.status, "Abandoned");
});

testeComBanco("aceitar: oferta de outro personagem não pode ser aceita (404)", async () => {
  await criarZonaComMonstro();
  const { personagem: p1 } = await criarPersonagem();
  const { personagem: p2 } = await criarPersonagem();

  const { oferta } = await sequelize.transaction((t) => obterEstado(p1.id, t));
  await assert.rejects(
    sequelize.transaction((t) => aceitarOferta(p2.id, oferta.id, t)),
    (erro) => erro.statusCode === 404,
  );
});

testeComBanco("resolverModificadorParaEncontro: só aplica pro alvo da Caçada Ativa do personagem certo", async () => {
  const { zona, monstro } = await criarZonaComMonstro();
  const { monstro: outroMonstro } = await criarZonaComMonstro();
  const { personagem: p1 } = await criarPersonagem();
  const { personagem: p2 } = await criarPersonagem();

  // Cria a Caçada Ativa diretamente (bypassa sorteio pra fixar o alvo).
  const janelaInicio = inicioDaJanelaDeCacada();
  const cacada = await CharacterAdventureHunt.create({
    id_personagem: p1.id,
    id_monstro: monstro.id,
    id_zona_referencia: zona.id,
    rotation_start: janelaInicio,
    rotation_end: new Date(janelaInicio.getTime() + 4 * 60 * 60 * 1000),
    status: "Active",
    difficulty: "Deadly",
    quantity_required: 3,
    title_snapshot: "t",
    story_template_key: "CARAVANA",
    story_snapshot: "s",
    hp_multiplier_snapshot: HUNT_DIFFICULTIES.Deadly.hpMultiplier,
    damage_multiplier_snapshot: HUNT_DIFFICULTIES.Deadly.damageMultiplier,
    reward_multiplier_snapshot: HUNT_DIFFICULTIES.Deadly.rewardMultiplier,
    gold_reward_snapshot: 999,
    reputation_reward_snapshot: HUNT_DIFFICULTIES.Deadly.reputationReward,
    random_factor_snapshot: 1,
  });

  const modPersonagemCerto = await sequelize.transaction((t) => resolverModificadorParaEncontro(p1.id, monstro.id, t));
  assert.ok(modPersonagemCerto);
  assert.equal(modPersonagemCerto.hpMultiplier, HUNT_DIFFICULTIES.Deadly.hpMultiplier);

  const modOutroPersonagem = await sequelize.transaction((t) => resolverModificadorParaEncontro(p2.id, monstro.id, t));
  assert.equal(modOutroPersonagem, null);

  const modOutroMonstro = await sequelize.transaction((t) => resolverModificadorParaEncontro(p1.id, outroMonstro.id, t));
  assert.equal(modOutroMonstro, null);

  await cacada.destroy();
});

testeComBanco("registrarMorteDaCacada: progresso incrementa e conclui só na quantidade certa, uma vez", async () => {
  const { zona, monstro } = await criarZonaComMonstro();
  const { personagem } = await criarPersonagem();

  const janelaInicio = inicioDaJanelaDeCacada();
  const cacada = await CharacterAdventureHunt.create({
    id_personagem: personagem.id,
    id_monstro: monstro.id,
    id_zona_referencia: zona.id,
    rotation_start: janelaInicio,
    rotation_end: new Date(janelaInicio.getTime() + 4 * 60 * 60 * 1000),
    status: "Active",
    difficulty: "Dangerous",
    quantity_required: 3,
    title_snapshot: "t",
    story_template_key: "CARAVANA",
    story_snapshot: "s",
    hp_multiplier_snapshot: HUNT_DIFFICULTIES.Dangerous.hpMultiplier,
    damage_multiplier_snapshot: HUNT_DIFFICULTIES.Dangerous.damageMultiplier,
    reward_multiplier_snapshot: HUNT_DIFFICULTIES.Dangerous.rewardMultiplier,
    gold_reward_snapshot: 500,
    reputation_reward_snapshot: HUNT_DIFFICULTIES.Dangerous.reputationReward,
    random_factor_snapshot: 1,
  });

  const character = await Character.findByPk(personagem.id);
  const dinheiroAntes = character.dinheiro;
  const inimigoFake = { id_monstro: monstro.id };

  const r1 = await sequelize.transaction((t) => registrarMorteDaCacada(character, inimigoFake, t));
  assert.equal(r1.progress, 1);
  assert.equal(r1.completed, false);

  const r2 = await sequelize.transaction((t) => registrarMorteDaCacada(character, inimigoFake, t));
  assert.equal(r2.progress, 2);
  assert.equal(r2.completed, false);

  const r3 = await sequelize.transaction((t) => registrarMorteDaCacada(character, inimigoFake, t));
  assert.equal(r3.progress, 3);
  assert.equal(r3.completed, true);
  assert.equal(r3.goldReward, 500);
  assert.equal(character.dinheiro, dinheiroAntes + 500);

  // §16 idempotência — depois de Completed, o alvo não conta mais
  // (não há Caçada Active pra esse monstro/personagem).
  const r4 = await sequelize.transaction((t) => registrarMorteDaCacada(character, inimigoFake, t));
  assert.equal(r4, null);

  const progresso = await CharacterHunterProgress.findOne({ where: { id_personagem: personagem.id } });
  assert.equal(progresso.hunts_completed_total, 1);
  assert.equal(progresso.hunts_completed_dangerous, 1);
  assert.equal(progresso.monsters_killed_in_hunts, 3);
});

testeComBanco("registrarMorteDaCacada: matar outro monstro não afeta a Caçada Ativa", async () => {
  const { zona, monstro } = await criarZonaComMonstro();
  const { monstro: outroMonstro } = await criarZonaComMonstro();
  const { personagem } = await criarPersonagem();

  const janelaInicio = inicioDaJanelaDeCacada();
  await CharacterAdventureHunt.create({
    id_personagem: personagem.id,
    id_monstro: monstro.id,
    id_zona_referencia: zona.id,
    rotation_start: janelaInicio,
    rotation_end: new Date(janelaInicio.getTime() + 4 * 60 * 60 * 1000),
    status: "Active",
    difficulty: "Dangerous",
    quantity_required: 3,
    title_snapshot: "t",
    story_template_key: "CARAVANA",
    story_snapshot: "s",
    hp_multiplier_snapshot: 0.15,
    damage_multiplier_snapshot: 0.1,
    reward_multiplier_snapshot: 1.25,
    gold_reward_snapshot: 500,
    reputation_reward_snapshot: 10,
    random_factor_snapshot: 1,
  });

  const character = await Character.findByPk(personagem.id);
  const resultado = await sequelize.transaction((t) =>
    registrarMorteDaCacada(character, { id_monstro: outroMonstro.id }, t),
  );
  assert.equal(resultado, null);

  const cacadaDepois = await CharacterAdventureHunt.findOne({ where: { id_personagem: personagem.id } });
  assert.equal(cacadaDepois.progress, 0);
});
