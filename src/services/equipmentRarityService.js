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

// Chaves de atributo que cada categoria aceita num override admin (ver
// itemRarityOverrideService.js) — também usado aqui pra nunca deixar um
// override aplicar um valor bruto (string, null, NaN) sobre o cálculo.
const CHAVES_OVERRIDE_ARMA = ["dano_min", "dano_max", "valor_bonus_atributo"];
const CHAVES_OVERRIDE_ARMADURA = ["defesa", "bonus_forca", "bonus_vitalidade", "bonus_inteligencia", "bonus_agilidade", "bonus_velocidade"];
const CHAVES_OVERRIDE_VARA = ["forca_linha", "controle", "recolhimento", "precisao", "estabilidade"];

// `overrides` é o array Item.raridadeOverrides (já carregado junto do
// Item via include — ver associations.js — nunca uma query nova aqui,
// isso roda em runtime de combate). Devolve o objeto "atributos" da
// linha cuja qualidade bate com `raridade`, ou null se não houver
// override cadastrado pra essa combinação Item+Raridade.
function encontrarOverride(overrides, raridade) {
  if (!Array.isArray(overrides) || overrides.length === 0) return null;
  const linha = overrides.find((o) => o.qualidade === raridade);
  return linha?.atributos ?? null;
}

// Aplica só as chaves permitidas e numéricas do override por cima do
// valor já calculado pela curva global — chave ausente/inválida no
// override mantém o valor calculado (override é sempre parcial).
function comOverride(calculado, override, chavesPermitidas) {
  if (!override) return calculado;
  const resultado = { ...calculado };
  for (const chave of chavesPermitidas) {
    const valor = override[chave];
    if (typeof valor === "number" && Number.isFinite(valor)) {
      resultado[chave] = Math.round(valor);
    }
  }
  return resultado;
}

function aplicarRaridadeArma(weaponProperties, raridade, overrides) {
  if (!weaponProperties) return null;
  const base = weaponProperties.toJSON ? weaponProperties.toJSON() : weaponProperties;
  const fator = multiplicadorRaridade(raridade);
  const calculado = {
    ...base,
    dano_min: Math.round(base.dano_min * fator),
    dano_max: Math.round(base.dano_max * fator),
    valor_bonus_atributo: Math.round(base.valor_bonus_atributo * fator),
  };
  return comOverride(calculado, encontrarOverride(overrides, raridade), CHAVES_OVERRIDE_ARMA);
}

function aplicarRaridadeArmadura(armorProperties, raridade, overrides) {
  if (!armorProperties) return null;
  const base = armorProperties.toJSON ? armorProperties.toJSON() : armorProperties;
  const fator = multiplicadorRaridade(raridade);
  const calculado = {
    ...base,
    defesa: Math.round(base.defesa * fator),
    bonus_forca: Math.round(base.bonus_forca * fator),
    bonus_vitalidade: Math.round(base.bonus_vitalidade * fator),
    bonus_inteligencia: Math.round(base.bonus_inteligencia * fator),
    bonus_agilidade: Math.round(base.bonus_agilidade * fator),
    bonus_velocidade: Math.round(base.bonus_velocidade * fator),
  };
  return comOverride(calculado, encontrarOverride(overrides, raridade), CHAVES_OVERRIDE_ARMADURA);
}

function aplicarRaridadeVara(fishingRodProperties, raridade, overrides) {
  if (!fishingRodProperties) return null;
  const base = fishingRodProperties.toJSON ? fishingRodProperties.toJSON() : fishingRodProperties;
  const fator = multiplicadorRaridade(raridade);
  const calculado = {
    ...base,
    forca_linha: Math.round(base.forca_linha * fator),
    controle: Math.round(base.controle * fator),
    recolhimento: Math.round(base.recolhimento * fator),
    precisao: Math.round(base.precisao * fator),
    estabilidade: Math.round(base.estabilidade * fator),
  };
  return comOverride(calculado, encontrarOverride(overrides, raridade), CHAVES_OVERRIDE_VARA);
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
  encontrarOverride,
  CHAVES_OVERRIDE_ARMA,
  CHAVES_OVERRIDE_ARMADURA,
  CHAVES_OVERRIDE_VARA,
};
