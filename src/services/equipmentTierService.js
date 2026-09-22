// src/services/equipmentTierService.js
//
// Helper de geração/recálculo de propriedades de equipamento por
// Tier+Raridade (spec §11/§21: "Atributo do Item = Base do arquétipo ×
// Multiplicador do Tier × Multiplicador da Raridade"). Usar SEMPRE este
// helper pra gerar/rebalancear WeaponProperties/ArmorProperties — nunca
// reimplementar a fórmula em outro lugar (§21: "seeders/migrations/
// scripts de catálogo" devem todos passar por aqui).
//
// Importante (§11/§37): essa multiplicação serve só pra gerar os dados
// ESTÁTICOS do catálogo (Item/WeaponProperties/ArmorProperties). Tier
// nunca é multiplicado de novo dentro do combate — o combate já lê os
// atributos-base (que já embutem o Tier) + Refinamento por cima
// (equipmentRefinementService.js), nunca o Tier isolado.
const {
  TIER_POWER_MULTIPLIER,
  RARITY_POWER_MULTIPLIER,
  TIER_ECONOMIC_MULTIPLIER,
} = require("../config/equipmentTierConfig");

// §11 — fator único combinando Tier e Raridade, reaproveitado por toda
// geração de propriedades abaixo.
function calcularMultiplicadorEquipamento(tier, raridade) {
  const multTier = TIER_POWER_MULTIPLIER[tier];
  const multRaridade = RARITY_POWER_MULTIPLIER[raridade];
  if (multTier === undefined) throw new Error(`Tier sem multiplicador configurado: ${tier}`);
  if (multRaridade === undefined) throw new Error(`Raridade sem multiplicador configurado: ${raridade}`);
  return multTier * multRaridade;
}

// base = { danoBase: { min, max }, bonusAtributoBase (default 1) }
// Retorna as colunas prontas pra gravar em WeaponProperties (dano_min/
// dano_max inteiros; valor_bonus_atributo com 1 casa decimal, igual já
// era feito nas migrations de Forja).
function gerarPropriedadesArma(base, tier, raridade) {
  const fator = calcularMultiplicadorEquipamento(tier, raridade);
  const bonusBase = base.bonusAtributoBase ?? 1;
  return {
    dano_min: Math.round(base.danoBase.min * fator),
    dano_max: Math.round(base.danoBase.max * fator),
    valor_bonus_atributo: Math.round(bonusBase * fator * 10) / 10,
  };
}

const CAMPO_BONUS_POR_ATRIBUTO = {
  Forca: "bonus_forca",
  Vitalidade: "bonus_vitalidade",
  Inteligencia: "bonus_inteligencia",
  Agilidade: "bonus_agilidade",
  Velocidade: "bonus_velocidade",
};

// base = { defesaBase, bonusAtributo: { atributo, valorBase (default 1) } | null }
// Retorna as colunas prontas pra gravar em ArmorProperties (defesa
// inteira; só o bônus do atributo indicado fica > 0 — os demais saem
// 0, mesmo formato que as migrations de Forja já geravam pra
// Peitoral/Anel).
function gerarPropriedadesArmadura(base, tier, raridade) {
  const fator = calcularMultiplicadorEquipamento(tier, raridade);
  const resultado = {
    defesa: Math.round(base.defesaBase * fator),
    bonus_forca: 0,
    bonus_vitalidade: 0,
    bonus_inteligencia: 0,
    bonus_agilidade: 0,
    bonus_velocidade: 0,
  };
  if (base.bonusAtributo) {
    const campo = CAMPO_BONUS_POR_ATRIBUTO[base.bonusAtributo.atributo];
    if (!campo) throw new Error(`Atributo de bônus de armadura desconhecido: ${base.bonusAtributo.atributo}`);
    const valorBase = base.bonusAtributo.valorBase ?? 1;
    resultado[campo] = Math.round(valorBase * fator);
  }
  return resultado;
}

// §26 — referência econômica-base (valor_venda) por Tier+Raridade a
// partir do valor-base de Raridade já usado hoje (VALOR_VENDA_POR_
// QUALIDADE nas migrations de Forja).
function calcularValorVendaBase(valorBasePorRaridade, tier) {
  const multEconomico = TIER_ECONOMIC_MULTIPLIER[tier];
  if (multEconomico === undefined) throw new Error(`Tier sem multiplicador econômico configurado: ${tier}`);
  return Math.round(valorBasePorRaridade * multEconomico);
}

module.exports = {
  calcularMultiplicadorEquipamento,
  gerarPropriedadesArma,
  gerarPropriedadesArmadura,
  calcularValorVendaBase,
};
