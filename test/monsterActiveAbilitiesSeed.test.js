// IA de Combate PvE & Habilidades de Monstros V1 -- validação obrigatória
// (§21 do doc de especificação) do conteúdo cadastrado pela migration
// 20270204010000-seed-monster-active-abilities: cadastro, cooldown,
// status, condições e IA. Reaproveita 100% a infra existente
// (combatAiService/monsterCombatAdapter/cooldownService), nenhum motor
// paralelo -- os testes aqui só confirmam que os DADOS cadastrados se
// comportam como o motor já documentado espera.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sequelize } = require("./helpers/db");
const AdventureMonster = require("../src/models/AdventureMonster");
const Power = require("../src/models/Power");
require("../src/models/associations");
const { construirHabilidadesParaEncontro, decidirAcao } = require("../src/services/monsterCombatAdapter");
const cooldownService = require("../src/services/cooldownService");

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

// Nomes dos 40 monstros da Aventura (Zonas 1-10), na mesma ordem/raridade
// usada pela migration -- usado pra montar os testes de cadastro em lote.
const COMUNS = [
  "Rato das Campinas", "Javali Selvagem", "Goblin Batedor",
  "Lobo das Sombras", "Aranha Venenosa", "Goblin Saqueador",
  "Sapo Venenoso", "Serpente do Brejo", "Lodo Vivo",
  "Bandido Errante", "Arqueiro Renegado", "Cão de Guerra",
  "Cultista Renegado", "Esqueleto Guardião", "Aparição Cinzenta",
  "Hiena das Cinzas", "Escorpião de Cinzas", "Elemental de Cinzas",
  "Orc Guerreiro", "Harpia da Garganta", "Troll das Pedras",
  "Morcego Cristalino", "Aranha de Pedra", "Sentinela Rúnica",
  "Draconídeo Jovem", "Basilisco de Pedra", "Salamandra de Obsidiana",
  "Ogro do Labirinto", "Guardião Taurino", "Draconídeo Veterano",
];
const RAROS = [
  "Lobo Alfa da Campina", "Espectro Sussurrante", "Hidra Jovem",
  "Capitão Mercenário", "Cavaleiro Amaldiçoado", "Golem de Pedra",
  "Chefe Orc Sangrento", "Guardião Rúnico Ancestral", "Draco de Obsidiana",
  "Minotauro",
];

// -------------------------------------------------------------- CADASTRO

testeComBanco("cada monstro comum da Aventura tem exatamente 3 habilidades ativas", async () => {
  for (const nome of COMUNS) {
    const monstro = await AdventureMonster.findOne({ where: { nome } });
    assert.ok(monstro, `monstro "${nome}" não encontrado`);
    const habilidades = await construirHabilidadesParaEncontro(monstro.id);
    assert.equal(habilidades.length, 3, `${nome} deveria ter 3 habilidades, tem ${habilidades.length}`);
  }
});

testeComBanco("cada monstro raro da Aventura tem exatamente 4 habilidades ativas", async () => {
  for (const nome of RAROS) {
    const monstro = await AdventureMonster.findOne({ where: { nome } });
    assert.ok(monstro, `monstro "${nome}" não encontrado`);
    const habilidades = await construirHabilidadesParaEncontro(monstro.id);
    assert.equal(habilidades.length, 4, `${nome} deveria ter 4 habilidades, tem ${habilidades.length}`);
  }
});

testeComBanco("nenhuma Power cadastrada por esta migration é passiva, mana é 0 e usage_scope é MONSTER", async () => {
  const todosNomes = [...COMUNS, ...RAROS];
  const monstros = await AdventureMonster.findAll({ where: { nome: todosNomes } });
  const idsMonstro = monstros.map((m) => m.id);
  const [linhas] = await sequelize.query(
    `SELECT DISTINCT p.id, p.nome, p.tipo_poder, p.custo_mana, p.usage_scope
     FROM monster_abilities ma
     JOIN "Powers" p ON p.id = ma.id_power
     WHERE ma.id_monstro IN (:ids);`,
    { replacements: { ids: idsMonstro } },
  );
  assert.equal(linhas.length, 130, `esperava 130 Powers distintas vinculadas aos 40 monstros, achou ${linhas.length}`);
  for (const p of linhas) {
    assert.equal(p.tipo_poder, "Ativo", `Power "${p.nome}" deveria ser Ativo`);
    assert.equal(p.custo_mana, 0, `Power "${p.nome}" deveria ter custo_mana 0`);
    assert.equal(p.usage_scope, "MONSTER", `Power "${p.nome}" deveria ter usage_scope MONSTER`);
  }
});

testeComBanco("ai_profile dos 40 monstros foi configurado (TACTICAL, nunca ELITE_BOSS)", async () => {
  const todosNomes = [...COMUNS, ...RAROS];
  const monstros = await AdventureMonster.findAll({ where: { nome: todosNomes } });
  assert.equal(monstros.length, 40);
  for (const m of monstros) {
    assert.notEqual(m.ai_profile, "ELITE_BOSS", `${m.nome} não pode usar ELITE_BOSS (reservado a outro conteúdo)`);
    assert.equal(m.ai_profile, "TACTICAL", `${m.nome} deveria estar em TACTICAL`);
  }
});

// -------------------------------------------------------------- COOLDOWN

testeComBanco("habilidade de cooldown 3 (Frenesi de Roedor) bloqueia exatamente os 3 turnos seguintes", async () => {
  const power = await Power.findOne({ where: { nome: "Frenesi de Roedor" } });
  assert.ok(power, "Power \"Frenesi de Roedor\" não encontrada");
  assert.equal(power.cooldown, 3);

  let cooldowns = {};
  assert.equal(cooldownService.podeUsar(cooldowns, power.id), true, "deveria poder usar antes da primeira vez");

  // Turno em que a habilidade é usada -- cooldown aplicado, mas não
  // decrementado no MESMO turno (§33: o turno de uso não conta).
  cooldowns = cooldownService.iniciarCooldown(cooldowns, power.id, power.cooldown);
  const chaveAplicadaNesteTurno = new Set([cooldownService.chaveDoPoder(power.id)]);
  cooldowns = cooldownService.decrementarCooldowns(cooldowns, chaveAplicadaNesteTurno);
  assert.equal(cooldownService.turnosRestantes(cooldowns, power.id), 3);
  assert.equal(cooldownService.podeUsar(cooldowns, power.id), false);

  // Próximos 3 turnos (sem usar nada): decrementa 1 por turno, bloqueada
  // nos 3 primeiros, livre de novo só no 4º turno de combate.
  const restantesEsperados = [2, 1, 0];
  for (const esperado of restantesEsperados) {
    cooldowns = cooldownService.decrementarCooldowns(cooldowns);
    assert.equal(cooldownService.turnosRestantes(cooldowns, power.id), esperado);
  }
  assert.equal(cooldownService.podeUsar(cooldowns, power.id), true, "deveria estar elegível de novo no turno certo");
});

// ---------------------------------------------------------------- STATUS

const AMOSTRA_STATUS = [
  { monstro: "Cultista Renegado", habilidade: "Chama Ritual", key: "BURN", chance_ppm: 300000, duration_turns: 2, pctVidaMaxima: 1 },
  { monstro: "Lobo das Sombras", habilidade: "Mordida do Eclipse", key: "BLEED", chance_ppm: 300000, duration_turns: 2, pctVidaMaxima: 1 },
  { monstro: "Aranha Venenosa", habilidade: "Picada Venenosa", key: "POISON", chance_ppm: 350000, duration_turns: 2, pctVidaMaxima: 1 },
  { monstro: "Rato das Campinas", habilidade: "Guincho Desconcertante", key: "BLIND", chance_ppm: 250000, duration_turns: 1, potency: 10 },
  { monstro: "Lobo Alfa da Campina", habilidade: "Uivo Dominante", key: "WEAKEN", chance_ppm: 350000, duration_turns: 2, potency: 10 },
  { monstro: "Javali Selvagem", habilidade: "Pisoteio Brusco", key: "STUN", chance_ppm: 150000, duration_turns: 1 },
  { monstro: "Sapo Venenoso", habilidade: "Muco Entorpecente", key: "PARALYZE", chance_ppm: 300000, duration_turns: 1, potency: 20 },
  { monstro: "Espectro Sussurrante", habilidade: "Sussurro Profano", key: "SILENCE", chance_ppm: 350000, duration_turns: 1 },
];

for (const amostra of AMOSTRA_STATUS) {
  testeComBanco(`status ${amostra.key} (${amostra.habilidade}) foi convertido pro formato do projeto corretamente`, async () => {
    const power = await Power.findOne({ where: { nome: amostra.habilidade } });
    assert.ok(power, `Power "${amostra.habilidade}" não encontrada`);
    const [efeitos] = await sequelize.query(
      `SELECT status_key, chance_ppm, duration_turns, potency_base, percentual_vida_maxima, target
       FROM power_status_effects WHERE id_power = :id;`,
      { replacements: { id: power.id } },
    );
    assert.equal(efeitos.length, 1, `esperava 1 PowerStatusEffect pra "${amostra.habilidade}"`);
    const efeito = efeitos[0];
    assert.equal(efeito.status_key, amostra.key);
    assert.equal(efeito.chance_ppm, amostra.chance_ppm, "chance_ppm (conversão de % pra ppm) errada");
    assert.equal(efeito.duration_turns, amostra.duration_turns);
    assert.equal(efeito.target, "Enemy", "status de monstro precisa ter target Enemy (é o jogador que recebe)");
    if (amostra.pctVidaMaxima != null) {
      assert.equal(Number(efeito.percentual_vida_maxima), amostra.pctVidaMaxima, "DoT deveria usar percentual_vida_maxima, não valor absoluto");
    } else {
      assert.equal(Number(efeito.potency_base), amostra.potency ?? 0);
    }
  });
}

// ------------------------------------------------------------- CONDIÇÕES

function construirInimigoDecisao(habilidades, { vidaAtual = 1000, vidaMaxima = 1000, aiProfile = "TACTICAL" } = {}) {
  return { vida_atual: vidaAtual, vida_maxima: vidaMaxima, ai_profile: aiProfile, habilidades };
}

testeComBanco("condição TARGET_HP_BELOW_PCT=40 (Execução do Alfa) só é escolhida com o jogador abaixo de 40% de vida", async () => {
  const monstro = await AdventureMonster.findOne({ where: { nome: "Lobo Alfa da Campina" } });
  const habilidades = await construirHabilidadesParaEncontro(monstro.id);
  assert.equal(habilidades.length, 4, "Lobo Alfa da Campina deveria ter 4 habilidades carregadas");
  const ultimate = habilidades.find((h) => h.nome === "Execução do Alfa");
  assert.ok(ultimate, "habilidade \"Execução do Alfa\" não encontrada no encontro");

  const base = { statsPersonagem: {}, vidaMaximaJogador: 1000, statusEffects: { player: [], enemy: [] }, combatBuffs: { player: [], enemy: [] }, escudo: { player: null, enemy: null }, cooldowns: { enemy: {} }, combatTurn: 5 };

  // Jogador com vida ACIMA de 40% -- a ultimate (required) fica inelegível,
  // nunca pode ser a decisão escolhida mesmo pontuando mais que as outras.
  let usouUltimate = false;
  for (let i = 0; i < 30; i += 1) {
    const inimigo = construirInimigoDecisao(habilidades);
    const decisao = decidirAcao({ ...base, inimigoAtual: inimigo, personagemAtual: { vida_atual: 500 } }); // 50% de vida
    if (decisao.type === "power" && decisao.abilityId === ultimate.id) usouUltimate = true;
  }
  assert.equal(usouUltimate, false, "Execução do Alfa não deveria disparar com o jogador acima de 40% de vida");

  // Jogador com vida ABAIXO de 40% -- condição satisfeita, score_bonus
  // (15) some ao prioridade_base (20) = 35, dominante dentro do jitter
  // do perfil TACTICAL (10) -- deveria vencer quase sempre.
  let vezesEscolhida = 0;
  const tentativas = 30;
  for (let i = 0; i < tentativas; i += 1) {
    const inimigo = construirInimigoDecisao(habilidades);
    const decisao = decidirAcao({ ...base, inimigoAtual: inimigo, personagemAtual: { vida_atual: 300 } }); // 30% de vida
    if (decisao.type === "power" && decisao.abilityId === ultimate.id) vezesEscolhida += 1;
  }
  assert.ok(vezesEscolhida > tentativas * 0.5, `Execução do Alfa deveria dominar com o jogador abaixo de 40% de vida (venceu ${vezesEscolhida}/${tentativas})`);
});

testeComBanco("condição TURN_AT_LEAST=3 (Lamento do Além) só é escolhida a partir do turno 3", async () => {
  const monstro = await AdventureMonster.findOne({ where: { nome: "Espectro Sussurrante" } });
  const habilidades = await construirHabilidadesParaEncontro(monstro.id);
  assert.equal(habilidades.length, 4, "Espectro Sussurrante deveria ter 4 habilidades carregadas");
  const ultimate = habilidades.find((h) => h.nome === "Lamento do Além");
  assert.ok(ultimate, "habilidade \"Lamento do Além\" não encontrada no encontro");

  const base = { statsPersonagem: {}, vidaMaximaJogador: 1000, statusEffects: { player: [], enemy: [] }, combatBuffs: { player: [], enemy: [] }, escudo: { player: null, enemy: null }, cooldowns: { enemy: {} }, personagemAtual: { vida_atual: 1000 } };

  // Turno 1 (< 3): a ultimate (TURN_AT_LEAST=3, required) não pode ser elegível.
  let usouUltimateCedo = false;
  for (let i = 0; i < 20; i += 1) {
    const inimigo = construirInimigoDecisao(habilidades);
    const decisao = decidirAcao({ ...base, inimigoAtual: inimigo, combatTurn: 1 });
    if (decisao.type === "power" && decisao.abilityId === ultimate.id) usouUltimateCedo = true;
  }
  assert.equal(usouUltimateCedo, false, "Lamento do Além não deveria disparar antes do turno 3");

  // Turno 3+: condição satisfeita, score_bonus garante domínio.
  let vezesEscolhida = 0;
  const tentativas = 30;
  for (let i = 0; i < tentativas; i += 1) {
    const inimigo = construirInimigoDecisao(habilidades);
    const decisao = decidirAcao({ ...base, inimigoAtual: inimigo, combatTurn: 4 });
    if (decisao.type === "power" && decisao.abilityId === ultimate.id) vezesEscolhida += 1;
  }
  assert.ok(vezesEscolhida > tentativas * 0.5, `Lamento do Além deveria dominar a partir do turno 3 (venceu ${vezesEscolhida}/${tentativas})`);
});

// --------------------------------------------------------------------- IA

testeComBanco("monstro comum (Rato das Campinas, perfil TACTICAL) realmente usa as 3 habilidades cadastradas ao longo de vários turnos", async () => {
  const monstro = await AdventureMonster.findOne({ where: { nome: "Rato das Campinas" } });
  const habilidades = await construirHabilidadesParaEncontro(monstro.id);
  assert.equal(habilidades.length, 3);

  const base = { statsPersonagem: {}, vidaMaximaJogador: 1000, statusEffects: { player: [], enemy: [] }, combatBuffs: { player: [], enemy: [] }, escudo: { player: null, enemy: null }, personagemAtual: { vida_atual: 1000 } };

  const usos = { attack: 0 };
  for (const h of habilidades) usos[h.id] = 0;

  // Simula uma sequência de turnos DE VERDADE (cooldown acumula e
  // decrementa entre decisões, nunca reseta) -- uma decisão isolada com
  // cooldowns sempre vazios deixaria a habilidade de maior score sempre
  // disponível, excluindo o ataque básico da banda de contenção o tempo
  // todo e dando a impressão errada de que ele "nunca" é escolhido.
  let cooldowns = {};
  for (let turno = 1; turno <= 200; turno += 1) {
    const inimigo = construirInimigoDecisao(habilidades);
    const decisao = decidirAcao({ ...base, inimigoAtual: inimigo, combatTurn: turno, cooldowns: { enemy: cooldowns } });
    const chavesNesteTurno = new Set();
    if (decisao.type === "attack") {
      usos.attack += 1;
    } else {
      usos[decisao.abilityId] += 1;
      const habilidadeUsada = habilidades.find((h) => h.id === decisao.abilityId);
      cooldowns = cooldownService.iniciarCooldown(cooldowns, habilidadeUsada.powerId, habilidadeUsada.cooldownConfigurado);
      chavesNesteTurno.add(cooldownService.chaveDoPoder(habilidadeUsada.powerId));
    }
    cooldowns = cooldownService.decrementarCooldowns(cooldowns, chavesNesteTurno);
  }

  for (const h of habilidades) {
    assert.ok(usos[h.id] > 0, `habilidade "${h.nome}" nunca foi escolhida em 200 turnos -- IA não está conseguindo usá-la`);
  }
  assert.ok(usos.attack > 0, "ataque básico nunca foi escolhido em 200 turnos -- §8 pede que ele nunca seja permanentemente ignorado");
});

testeComBanco("monstro raro (Minotauro, perfil TACTICAL) usa as 4 opções quando elegíveis, respeitando cooldown e condição", async () => {
  const monstro = await AdventureMonster.findOne({ where: { nome: "Minotauro" } });
  const habilidades = await construirHabilidadesParaEncontro(monstro.id);
  assert.equal(habilidades.length, 4);
  const ultimate = habilidades.find((h) => h.nome === "Sentença do Labirinto");
  assert.ok(ultimate, "habilidade \"Sentença do Labirinto\" não encontrada no encontro");
  const semCondicao = habilidades.filter((h) => h.id !== ultimate.id);

  const base = { statsPersonagem: {}, vidaMaximaJogador: 1000, statusEffects: { player: [], enemy: [] }, combatBuffs: { player: [], enemy: [] }, escudo: { player: null, enemy: null }, combatTurn: 5 };

  // Jogador com vida alta: as 3 primeiras habilidades (sem condição)
  // precisam efetivamente aparecer; a ultimate (TARGET_HP_BELOW_PCT=40)
  // nunca pode, já que o jogador está com vida cheia.
  const usos = {};
  for (const h of habilidades) usos[h.id] = 0;
  for (let i = 0; i < 200; i += 1) {
    const inimigo = construirInimigoDecisao(habilidades);
    const decisao = decidirAcao({ ...base, inimigoAtual: inimigo, personagemAtual: { vida_atual: 1000 }, cooldowns: { enemy: {} } });
    if (decisao.type === "power") usos[decisao.abilityId] += 1;
  }
  for (const h of semCondicao) {
    assert.ok(usos[h.id] > 0, `habilidade "${h.nome}" do Minotauro nunca foi escolhida com vida cheia do jogador`);
  }
  assert.equal(usos[ultimate.id], 0, "ultimate do Minotauro (condicional) não deveria disparar com o jogador de vida cheia");

  // Jogador com vida baixa (<=40%): a ultimate passa a ser elegível e,
  // pelo score_bonus da condição satisfeita, deve dominar.
  let vezesUltimate = 0;
  const tentativas = 30;
  for (let i = 0; i < tentativas; i += 1) {
    const inimigo = construirInimigoDecisao(habilidades);
    const decisao = decidirAcao({ ...base, inimigoAtual: inimigo, personagemAtual: { vida_atual: 300 }, cooldowns: { enemy: {} } });
    if (decisao.type === "power" && decisao.abilityId === ultimate.id) vezesUltimate += 1;
  }
  assert.ok(vezesUltimate > tentativas * 0.5, `ultimate do Minotauro deveria dominar com o jogador abaixo de 40% de vida (venceu ${vezesUltimate}/${tentativas})`);

  // Cooldown respeitado: "Carga Taurina" (CD3, maior dano das 3 sem
  // condição) acabou de ser usada -- cooldownService marca o cooldown
  // dela; a mesma decisão não pode escolhê-la de novo enquanto bloqueada.
  const cargaTaurina = habilidades.find((h) => h.nome === "Carga Taurina");
  assert.ok(cargaTaurina, "habilidade \"Carga Taurina\" não encontrada no encontro");
  const cooldownsComBloqueio = cooldownService.iniciarCooldown({}, cargaTaurina.powerId, cargaTaurina.cooldownConfigurado);
  let escolheuBloqueada = false;
  for (let i = 0; i < 30; i += 1) {
    const inimigo = construirInimigoDecisao(habilidades);
    const decisao = decidirAcao({ ...base, inimigoAtual: inimigo, personagemAtual: { vida_atual: 1000 }, cooldowns: { enemy: cooldownsComBloqueio } });
    if (decisao.type === "power" && decisao.abilityId === cargaTaurina.id) escolheuBloqueada = true;
  }
  assert.equal(escolheuBloqueada, false, "Carga Taurina em cooldown não deveria ser escolhida de novo");
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
