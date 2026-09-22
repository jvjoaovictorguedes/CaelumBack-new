// src/config/equipmentTierConfig.js
//
// Configuração central do sistema de Tier de equipamentos (spec
// "Reestruturação de Forja, Raridade, Poder e Valor dos Equipamentos" —
// Especificacao_Tiers_Equipamentos_Forja_Caelum_FINAL.docx). Tier é a
// FAIXA DE PODER REAL da receita/modelo do equipamento (1 = mais forte,
// 5 = mais básico — §17/§42), fixo pelo blueprint/catálogo, nunca
// sorteado nem alterado por Fabricação/Refinamento (§6/§31/§39).
//
// Raridade (Comum..Mítico) continua existindo, mas passa a representar
// só a qualidade daquela fabricação específica — não mais o salto
// principal de poder (§7/§8). Números abaixo são os "PROPOSTA INICIAL"
// da spec (§9/§10/§26/§32/§34) — sujeitos a ajuste após playtest, mas
// centralizados aqui pra nunca serem reimplementados em duplicidade
// (§20: "Não espalhar esses valores por migrations, controllers e
// frontend").

// Tier 1 = mais forte (topo/endgame), Tier 5 = mais básico (§17).
const TIER_MINIMO = 1;
const TIER_MAXIMO = 5;

// §9 — multiplicador de poder-base por Tier (dano/defesa/bônus de
// atributo do arquétipo).
const TIER_POWER_MULTIPLIER = {
  5: 1.0,
  4: 1.25,
  3: 1.55,
  2: 1.95,
  1: 2.45,
};

// §10 — substitui a curva antiga de Raridade (1 / 1,4 / 2 / 3 / 4,5 /
// 6,5), que sozinha fazia o material da peça virar irrelevante (§3).
const RARITY_POWER_MULTIPLIER = {
  Comum: 1.0,
  Incomum: 1.05,
  Raro: 1.1,
  Epico: 1.17,
  Lendario: 1.25,
  Mitico: 1.35,
};

// §26 — referência econômica-base por Tier (não é preço obrigatório do
// Mercado P2P, só usado pra calibrar valor_venda/referência de preço).
const TIER_ECONOMIC_MULTIPLIER = {
  5: 1,
  4: 2,
  3: 4,
  2: 8,
  1: 16,
};

// §32 — multiplicador moderado de XP de Fabricação por Tier (receitas
// avançadas recompensam mais XP de Forja).
const FORGE_XP_TIER_MULTIPLIER = {
  5: 1.0,
  4: 1.1,
  3: 1.25,
  2: 1.45,
  1: 1.7,
};

// §34 — equipamentos de Tier mais alto custam mais pra manter refinados
// (aplicado ao custo em Ouro do Refinamento; não altera a chance-base
// de sucesso).
const REFINEMENT_COST_TIER_MULTIPLIER = {
  5: 1.0,
  4: 1.25,
  3: 1.6,
  2: 2.1,
  1: 2.8,
};

// §42 — nomenclatura: banco/API usam número 1-5, frontend formata como
// algarismo romano. Centralizado aqui pra não duplicar a função em
// cada tela (Inventário/Forja/Mercado).
const TIER_ROMANO = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V" };

function formatarTier(tier) {
  const romano = TIER_ROMANO[tier];
  return romano ? `Tier ${romano}` : null;
}

function tierValido(tier) {
  return Number.isInteger(tier) && tier >= TIER_MINIMO && tier <= TIER_MAXIMO;
}

module.exports = {
  TIER_MINIMO,
  TIER_MAXIMO,
  TIER_POWER_MULTIPLIER,
  RARITY_POWER_MULTIPLIER,
  TIER_ECONOMIC_MULTIPLIER,
  FORGE_XP_TIER_MULTIPLIER,
  REFINEMENT_COST_TIER_MULTIPLIER,
  TIER_ROMANO,
  formatarTier,
  tierValido,
};
