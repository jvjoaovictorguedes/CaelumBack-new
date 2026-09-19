// Fase 1 do sistema de "Grimórios" (pedido do jogador: habilidades como
// Cura Arcana evoluindo em níveis, tipo 1, 2, 3...). Cada habilidade
// aprendida evolui de 1 até 10 gastando ouro + Fragmentos de Grimório —
// um recurso que já dropa em combate PvE de graça (é um item Material
// comum, ver dropService.js) e também pode ser comprado/vendido no
// mercado entre jogadores, então nunca depende só de RNG ou de pagar.
//
// A curva de custo E a curva de efeito são não-lineares de propósito
// (pedido explícito do PDF que o jogador trouxe): cada nível pesa mais
// que o anterior, mas os saltos de EFEITO (não só o custo) também
// aceleram — nível 5 e 10 são marcos de verdade (reduzem o custo de mana
// da habilidade, não só o dano/cura), não só mais um número.

const NOME_ITEM_FRAGMENTO = "Fragmento de Grimório";
const NIVEL_MAXIMO_HABILIDADE = 10;

// Quantas habilidades ATIVAS um personagem pode ter marcadas pro combate
// ao mesmo tempo (ver toggleCharacterAbility em
// characterAbilitiesController.js e concederPoderesIniciais em
// characterController.js — os dois precisam do mesmo número: o segundo
// nunca pode conceder mais poderes já ativos do que o primeiro permite
// manter ativos).
const MAX_HABILIDADES_ATIVAS_COMBATE = 5;

// índice = nível ATUAL da habilidade (1 a 9) — custo pra ir pro próximo.
const CUSTO_EVOLUCAO_POR_NIVEL = {
  1: { ouro: 50, fragmentos: 2 },
  2: { ouro: 120, fragmentos: 4 },
  3: { ouro: 220, fragmentos: 6 },
  4: { ouro: 350, fragmentos: 9 },
  5: { ouro: 500, fragmentos: 12 },
  6: { ouro: 700, fragmentos: 16 },
  7: { ouro: 950, fragmentos: 20 },
  8: { ouro: 1250, fragmentos: 25 },
  9: { ouro: 1600, fragmentos: 30 },
};

// índice = nível da habilidade (1 a 10) — multiplica dano_base/cura_base
// (depois de já somado o bônus de atributo). Não é linear: os saltos
// crescem mais rápido perto do fim, e os dois marcos (5 e 10) dão um
// salto maior que a vizinhança deles, pra parecerem uma "evolução" de
// verdade e não só "+X%".
const MULTIPLICADOR_EFEITO_POR_NIVEL = {
  1: 1,
  2: 1.1,
  3: 1.18,
  4: 1.28,
  5: 1.45,
  6: 1.55,
  7: 1.7,
  8: 1.85,
  9: 2.05,
  10: 2.3,
};

// Custo de mana da habilidade cai nos dois marcos — é a "mudança
// significativa" que o nível 5/10 precisa ter, não só mais dano.
const MULTIPLICADOR_CUSTO_MANA_POR_NIVEL = {
  1: 1,
  2: 1,
  3: 1,
  4: 1,
  5: 0.9,
  6: 0.9,
  7: 0.9,
  8: 0.9,
  9: 0.9,
  10: 0.7,
};

const MARCO_POR_NIVEL = {
  5: "Evolução",
  10: "Ascensão",
};

function multiplicadorEfeito(nivelHabilidade) {
  return MULTIPLICADOR_EFEITO_POR_NIVEL[nivelHabilidade] ?? 1;
}

function multiplicadorCustoMana(nivelHabilidade) {
  return MULTIPLICADOR_CUSTO_MANA_POR_NIVEL[nivelHabilidade] ?? 1;
}

function marcoDoNivel(nivelHabilidade) {
  return MARCO_POR_NIVEL[nivelHabilidade] ?? null;
}

function custoParaEvoluir(nivelAtual) {
  return CUSTO_EVOLUCAO_POR_NIVEL[nivelAtual] ?? null;
}

module.exports = {
  NOME_ITEM_FRAGMENTO,
  NIVEL_MAXIMO_HABILIDADE,
  MAX_HABILIDADES_ATIVAS_COMBATE,
  multiplicadorEfeito,
  multiplicadorCustoMana,
  marcoDoNivel,
  custoParaEvoluir,
};
