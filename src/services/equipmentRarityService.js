// Reformulação "Item Único por Equipamento, Raridade por Instância"
// (spec V2, §5). A partir daqui, raridade deixa de escolher outro Item
// (ForgeBlueprintResult) e passa a ser uma característica da CÓPIA
// (CharacterEquipmentInstance.raridade) — este service é a autoridade
// única pra validar/aplicar/comparar raridade em runtime. Nunca
// reimplementar essa matemática em outro lugar (mesmo princípio de
// equipmentTierService/equipmentRefinementService).
//
// Ordem obrigatória (§5.2), sempre nesta sequência:
//   1. Propriedades-base do Item canônico (WeaponProperties/
//      ArmorProperties/FishingRodProperties da variante Comum antiga).
//   2. equipmentRarityService (este arquivo) — multiplica pela raridade
//      da instância.
//   3. equipmentRefinementService — aplica o refinamento por cima.
// Nunca aplicar Tier de novo aqui — as propriedades-base do Item
// canônico já embutem o Tier do modelo (equipmentTierService só é
// usado na GERAÇÃO do catálogo, não em runtime).
const { RARITY_POWER_MULTIPLIER, TIER_ECONOMIC_MULTIPLIER, VALOR_VENDA_EQUIPAMENTO_POR_RARIDADE } = require("../config/equipmentTierConfig");
const { ORDEM_QUALIDADE } = require("../config/forgeConfig");

function validarRaridade(raridade) {
  if (!ORDEM_QUALIDADE.includes(raridade)) {
    throw new Error(`Raridade inválida: ${raridade}. Use: ${ORDEM_QUALIDADE.join(", ")}.`);
  }
}

function multiplicadorRaridade(raridade) {
  validarRaridade(raridade);
  return RARITY_POWER_MULTIPLIER[raridade];
}

// -1 / 0 / 1, mesma convenção de Array.prototype.sort — usado por
// AdventureGuildMission.qualidade_minima e qualquer comparação de "essa
// raridade satisfaz aquele mínimo".
function compararRaridade(a, b) {
  validarRaridade(a);
  validarRaridade(b);
  const posA = ORDEM_QUALIDADE.indexOf(a);
  const posB = ORDEM_QUALIDADE.indexOf(b);
  return Math.sign(posA - posB);
}

function aplicarRaridadeArma(weaponProperties, raridade) {
  if (!weaponProperties) return null;
  const base = weaponProperties.toJSON ? weaponProperties.toJSON() : weaponProperties;
  const fator = multiplicadorRaridade(raridade);
  return {
    ...base,
    dano_min: Math.round(base.dano_min * fator),
    dano_max: Math.round(base.dano_max * fator),
    valor_bonus_atributo: Math.round(base.valor_bonus_atributo * fator),
  };
}

function aplicarRaridadeArmadura(armorProperties, raridade) {
  if (!armorProperties) return null;
  const base = armorProperties.toJSON ? armorProperties.toJSON() : armorProperties;
  const fator = multiplicadorRaridade(raridade);
  return {
    ...base,
    defesa: Math.round(base.defesa * fator),
    bonus_forca: Math.round(base.bonus_forca * fator),
    bonus_vitalidade: Math.round(base.bonus_vitalidade * fator),
    bonus_inteligencia: Math.round(base.bonus_inteligencia * fator),
    bonus_agilidade: Math.round(base.bonus_agilidade * fator),
    bonus_velocidade: Math.round(base.bonus_velocidade * fator),
  };
}

function aplicarRaridadeVara(fishingRodProperties, raridade) {
  if (!fishingRodProperties) return null;
  const base = fishingRodProperties.toJSON ? fishingRodProperties.toJSON() : fishingRodProperties;
  const fator = multiplicadorRaridade(raridade);
  return {
    ...base,
    forca_linha: Math.round(base.forca_linha * fator),
    controle: Math.round(base.controle * fator),
    recolhimento: Math.round(base.recolhimento * fator),
    precisao: Math.round(base.precisao * fator),
    estabilidade: Math.round(base.estabilidade * fator),
  };
}

// §13 — Item canônico não guarda mais seis valores de venda (um por
// raridade); a instância que carrega essa informação.
function calcularValorVendaInstancia(item, raridade) {
  validarRaridade(raridade);
  const valorBase = VALOR_VENDA_EQUIPAMENTO_POR_RARIDADE[raridade];
  const multTier = TIER_ECONOMIC_MULTIPLIER[item.tier_equipamento];
  if (multTier === undefined) {
    throw new Error(`Item #${item.id} sem tier_equipamento configurado — não é possível calcular valor de venda da instância.`);
  }
  return Math.round(valorBase * multTier);
}

module.exports = {
  validarRaridade,
  multiplicadorRaridade,
  compararRaridade,
  aplicarRaridadeArma,
  aplicarRaridadeArmadura,
  aplicarRaridadeVara,
  calcularValorVendaInstancia,
};
