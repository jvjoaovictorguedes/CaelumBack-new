// Habilidades V2.0 — Fase 2 da especificação (seção 26, passo 2):
// "Criar testes de caracterização do comportamento atual antes de
// alterar fórmulas." Este arquivo não testa comportamento NOVO —
// trava, com números exatos, como o motor funciona HOJE nos pontos
// que a V2 vai mexer, pra qualquer mudança de fórmula/stacking/
// contexto ser uma decisão deliberada (vista no diff deste arquivo),
// nunca um acidente silencioso.
//
// O que cada bloco caracteriza, e por quê (ver doc "Habilidades V2.0"):
// 1. BURN/BLEED/POISON usam potency como DANO ABSOLUTO (não % da Vida
//    máxima) — é exatamente isso que a seção 4 da V2 pede pra mudar.
// 2. Poison de ARMA e Poison de PODER incrementam a MESMA instância
//    (mesmo pool), respeitando o cap global de 5 — a seção 16 pede
//    que isso continue valendo depois da migração de magnitude.
// 3. Passivas (Power tipo_poder=Passivo) hoje só concedem bônus de
//    ATRIBUTO via equipmentBonusService, sem NENHUM conceito de
//    contexto (PvE/PvP) — a função nem recebe esse parâmetro. A seção
//    11 da V2 pede pra formalizar "PvE/PvP por default", o que já é
//    verdade hoje só porque não existe filtro nenhum.
// 4. ClassEvolutionEffect: das 11 effect_keys do ENUM, só
//    DAMAGE_REDUCTION é interpretada em combate hoje — criar uma linha
//    LIFESTEAL não quebra nada, mas também não faz NADA (constatação
//    que a seção 15/16 da V2 pede pra resolver).
// combatBuffService (buffs de poção não empilham mais) já tem
// caracterização própria em combatBuff.test.js — não duplicado aqui.
// cooldownService (bloqueia N turnos) já tem test/cooldownService.test.js
// — não duplicado aqui.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const statusEffectService = require("../src/services/statusEffectService");
const Power = require("../src/models/Power");
const CharacterAbilities = require("../src/models/CharacterAbilities");
const ClassEvolutionPath = require("../src/models/ClassEvolutionPath");
const CharacterClassEvolution = require("../src/models/CharacterClassEvolution");
const ClassEvolutionEffect = require("../src/models/ClassEvolutionEffect");
const { buscarBonusDeAtributos } = require("../src/services/equipmentBonusService");
const { resolverBonusDeEfeitosDeEvolucao } = require("../src/services/classEvolutionEffectService");

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

// ---------------------------------------------------------------------
// 1. Magnitude ABSOLUTA de BURN/BLEED/POISON (statusEffectService puro,
//    sem banco) — hoje `potency` é dano cru, não percentual da Vida
//    máxima. A V2 (seção 4) muda isso pra "% da Vida máxima".
// ---------------------------------------------------------------------

test("CARACTERIZAÇÃO (hoje): POISON com stacks usa potency como dano absoluto, não % da Vida máxima", () => {
  let lista = statusEffectService.aplicarStatus([], {
    key: "POISON",
    sourceActorId: "A",
    sourcePowerId: 1,
    sourceItemId: null,
    remainingTurns: 3,
    potency: 20, // hoje: 20 de dano cru por stack, independente da Vida máxima do alvo
  });
  assert.equal(statusEffectService.calcularDanoDoTick(lista[0]), 20, "1 stack: 20 de dano cru");

  lista = statusEffectService.aplicarStatus(lista, {
    key: "POISON",
    sourceActorId: "A",
    sourcePowerId: 1,
    sourceItemId: null,
    remainingTurns: 3,
    potency: 20,
  });
  assert.equal(lista[0].stacks, 2);
  assert.equal(
    statusEffectService.calcularDanoDoTick(lista[0]),
    40,
    "2 stacks: 40 de dano cru (20*2) — o mesmo valor valeria pra um alvo de 100 ou de 100000 de Vida máxima, hoje",
  );
});

test("CARACTERIZAÇÃO (hoje): BLEED empilha até 3, POISON até 5 — nunca mais que isso", () => {
  let bleed = [];
  for (let i = 0; i < 5; i += 1) {
    bleed = statusEffectService.aplicarStatus(bleed, {
      key: "BLEED",
      sourceActorId: "A",
      remainingTurns: 2,
      potency: 10,
    });
  }
  assert.equal(bleed[0].stacks, 3, "Bleed nunca passa de 3 stacks mesmo aplicado 5 vezes");

  let poison = [];
  for (let i = 0; i < 7; i += 1) {
    poison = statusEffectService.aplicarStatus(poison, {
      key: "POISON",
      sourceActorId: "A",
      remainingTurns: 2,
      potency: 5,
    });
  }
  assert.equal(poison[0].stacks, 5, "Poison nunca passa de 5 stacks mesmo aplicado 7 vezes");
});

// ---------------------------------------------------------------------
// 2. Poison de ARMA e Poison de PODER no MESMO pool (seção 16 da V2).
//    Caracteriza que statusEffectService.aplicarStatus não distingue a
//    fonte pra fins de stacking: as duas entram na MESMA lista, mesma
//    chave "POISON", respeitando o MESMO cap de 5.
// ---------------------------------------------------------------------

test("CARACTERIZAÇÃO (hoje): Poison de arma + Poison de Power incrementam o MESMO pool/stack, respeitando o cap global", () => {
  let lista = statusEffectService.aplicarStatus([], {
    key: "POISON",
    sourceActorId: "A",
    sourceItemId: 42, // veio de uma ARMA
    sourcePowerId: null,
    remainingTurns: 3,
    potency: 8,
  });
  lista = statusEffectService.aplicarStatus(lista, {
    key: "POISON",
    sourceActorId: "A",
    sourceItemId: null,
    sourcePowerId: 7, // veio de um PODER
    remainingTurns: 2,
    potency: 15,
  });

  assert.equal(lista.length, 1, "arma e poder nunca criam duas instâncias separadas de Poison no mesmo alvo");
  assert.equal(lista[0].stacks, 2, "cada aplicação válida soma 1 stack, não importa a fonte");
  assert.equal(lista[0].potency, 15, "fica com a MAIOR potência entre arma (8) e poder (15), nunca soma as duas");
  // sourceItemId/sourcePowerId da ÚLTIMA aplicação prevalecem na
  // instância — hoje não há atribuição por stack individual.
  assert.equal(lista[0].sourcePowerId, 7);
});

// ---------------------------------------------------------------------
// 3. Passivas hoje são context-BLIND (seção 11 da V2 pede "PvE/PvP por
//    default" — já é verdade hoje, mas só porque não existe NENHUM
//    conceito de contexto nesse caminho ainda).
// ---------------------------------------------------------------------

testeComBanco(
  "CARACTERIZAÇÃO (hoje): passiva ativa concede bônus de atributo sem nenhum filtro de contexto (função nem recebe um)",
  async () => {
    const { personagem } = await criarPersonagem({ nivel: 10 });
    const power = await Power.create({
      nome: `Passiva de Teste ${sufixo()}`,
      descricao: "Passiva de caracterização.",
      tipo_poder: "Passivo",
      custo_mana: 0,
      escala_atributo: "Forca",
      valor_escala: 5,
      tipo_dano: "Nenhum",
    });
    await CharacterAbilities.create({
      id_personagem: personagem.id,
      id_power: power.id,
      is_active: true,
      nivel_habilidade: 1,
    });

    const bonus = await buscarBonusDeAtributos(personagem.id);
    assert.equal(bonus.forca, 5, "bônus da passiva aplicado — buscarBonusDeAtributos não sabe se é PvE ou PvP");

    await CharacterAbilities.destroy({ where: { id_personagem: personagem.id, id_power: power.id } });
    await Power.destroy({ where: { id: power.id } });
  },
);

// ---------------------------------------------------------------------
// 4. ClassEvolutionEffect: só DAMAGE_REDUCTION é interpretado hoje —
//    LIFESTEAL (ou qualquer uma das outras 9) existe no schema mas
//    contribui ZERO ao combate (seção 15/16 da V2).
// ---------------------------------------------------------------------

testeComBanco(
  "CARACTERIZAÇÃO (hoje): ClassEvolutionEffect LIFESTEAL não contribui nada ao combate (só DAMAGE_REDUCTION está implementado)",
  async () => {
    const { personagem } = await criarPersonagem({ nivel: 50 });
    const caminho = await ClassEvolutionPath.create({
      id_classe: personagem.id_classe,
      slug: `caminho-teste-${sufixo()}`,
      estagio: 1,
      nome: "Caminho de Teste",
      descricao: "Caminho de caracterização.",
      nivel_necessario: 40,
    });
    const evolucao = await CharacterClassEvolution.create({
      id_personagem: personagem.id,
      id_evolucao: caminho.id,
      estagio: 1,
    });
    const efeito = await ClassEvolutionEffect.create({
      id_evolucao: caminho.id,
      effect_key: "LIFESTEAL",
      valor: 25, // 25% de lifesteal, SE fosse interpretado
      ativo: true,
    });

    const resultado = await resolverBonusDeEfeitosDeEvolucao(personagem.id);
    assert.equal(resultado.defesa, 0, "LIFESTEAL não gera bônus nenhum hoje — nem em defesa nem em qualquer outro campo");

    await ClassEvolutionEffect.destroy({ where: { id: efeito.id } });
    await CharacterClassEvolution.destroy({ where: { id: evolucao.id } });
    await ClassEvolutionPath.destroy({ where: { id: caminho.id } });
  },
);

testeComBanco(
  "CARACTERIZAÇÃO (hoje): ClassEvolutionEffect DAMAGE_REDUCTION soma defesa via equipmentBonusService (o único que já funciona)",
  async () => {
    const { personagem } = await criarPersonagem({ nivel: 50 });
    const caminho = await ClassEvolutionPath.create({
      id_classe: personagem.id_classe,
      slug: `caminho-teste-${sufixo()}`,
      estagio: 1,
      nome: "Caminho de Teste",
      descricao: "Caminho de caracterização.",
      nivel_necessario: 40,
    });
    const evolucao = await CharacterClassEvolution.create({
      id_personagem: personagem.id,
      id_evolucao: caminho.id,
      estagio: 1,
    });
    const efeito = await ClassEvolutionEffect.create({
      id_evolucao: caminho.id,
      effect_key: "DAMAGE_REDUCTION",
      valor: 12,
      ativo: true,
    });

    const resultado = await resolverBonusDeEfeitosDeEvolucao(personagem.id);
    assert.equal(resultado.defesa, 12);

    const bonusCompleto = await buscarBonusDeAtributos(personagem.id);
    assert.equal(bonusCompleto.defesa, 12, "chega até buscarBonusDeAtributos, usado por todo o resto do combate");

    await ClassEvolutionEffect.destroy({ where: { id: efeito.id } });
    await CharacterClassEvolution.destroy({ where: { id: evolucao.id } });
    await ClassEvolutionPath.destroy({ where: { id: caminho.id } });
  },
);
