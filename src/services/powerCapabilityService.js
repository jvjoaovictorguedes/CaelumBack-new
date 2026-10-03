// IA de Combate PvE & Habilidades de Monstros V1 (§3.1/§5.2/§6.2/§7) —
// "Capability resolver: classificar a Power pelos efeitos que possui;
// não deve executar combate." Único ponto que decide que capabilities
// (config/powerCapabilityConfig.js) uma Power exibe, a partir do que ela
// JÁ TEM hoje (dano_base/cura_base/PowerStatusEffect/PowerCombatEffect)
// — nunca uma segunda fonte de verdade sobre o que a Power faz.
const Power = require("../models/Power");
const PowerStatusEffect = require("../models/PowerStatusEffect");
const PowerCombatEffect = require("../models/PowerCombatEffect");
// Efeito colateral necessário pra garantir as associações Power<->efeitos
// (mesmo padrão de combatModifierService.js).
require("../models/associations");
const { definicaoDoStatus } = require("../config/statusEffectConfig");
const {
  EFFECT_KEY_PARA_CAPABILITY,
  EFFECT_KEYS_DE_BUFF_OFENSIVO,
  EFFECT_KEYS_DE_BUFF_DEFENSIVO,
  ALVOS_PROPRIOS,
  ALVOS_INIMIGOS,
} = require("../config/powerCapabilityConfig");

// Carrega uma Power com os dois catálogos de efeito já inclusos — mesmo
// shape que monsterAbilityService/combatAiService vão precisar, pra
// nunca duplicar o include em cada chamador.
async function carregarPowerComEfeitos(idPower, { transaction } = {}) {
  return Power.findByPk(idPower, {
    include: [
      { model: PowerStatusEffect, as: "efeitosDeStatus", where: { ativo: true }, required: false },
      { model: PowerCombatEffect, as: "efeitosDeCombate", where: { ativo: true }, required: false },
    ],
    transaction,
  });
}

// §6.2 — um PowerStatusEffect sobre o INIMIGO é DAMAGE quando o status é
// DoT (Burn/Bleed/Poison, ehDot:true em statusEffectConfig) ou
// DEBUFF_CONTROL pros demais (Silence/Weaken/Freeze/Stun/Paralyze/Blind).
// Sobre o próprio ator (target Self) não gera nenhuma capability nova
// aqui — nenhum status do catálogo atual é autobuff, e um eventual
// futuro não teria capability definida sem decisão explícita.
function capabilitiesDosStatusEffects(efeitosDeStatus) {
  const capabilities = new Set();
  for (const efeito of efeitosDeStatus ?? []) {
    if (efeito.target !== "Enemy") continue;
    const definicao = definicaoDoStatus(efeito.status_key);
    if (!definicao) continue;
    capabilities.add(definicao.ehDot ? "DAMAGE" : "DEBUFF_CONTROL");
  }
  return capabilities;
}

// §7/§9.2 — um PowerCombatEffect mapeia pra capability pelo par
// (effect_key, target): SHIELD/REGEN_HP/CLEANSE_SELF só contam quando o
// alvo é o próprio portador/aliado; DISPEL_BUFF só conta como
// DISPEL_TARGET quando mira um inimigo (dispelar o PRÓPRIO buff não é
// uma capability de combate real). Buffs numéricos (crítico/esquiva/
// dano causado/recebido/etc.) entram em OFFENSIVE_BUFF/DEFENSIVE_BUFF
// quando aplicados sobre si/aliado.
function capabilitiesDosCombatEffects(efeitosDeCombate) {
  const capabilities = new Set();
  for (const efeito of efeitosDeCombate ?? []) {
    const capabilityDireta = EFFECT_KEY_PARA_CAPABILITY[efeito.effect_key];
    if (capabilityDireta) {
      if (capabilityDireta === "DISPEL_TARGET") {
        if (ALVOS_INIMIGOS.includes(efeito.target)) capabilities.add(capabilityDireta);
      } else if (ALVOS_PROPRIOS.includes(efeito.target)) {
        capabilities.add(capabilityDireta);
      }
      continue;
    }
    if (!ALVOS_PROPRIOS.includes(efeito.target)) continue;
    if (EFFECT_KEYS_DE_BUFF_OFENSIVO.includes(efeito.effect_key)) capabilities.add("OFFENSIVE_BUFF");
    if (EFFECT_KEYS_DE_BUFF_DEFENSIVO.includes(efeito.effect_key)) capabilities.add("DEFENSIVE_BUFF");
  }
  return capabilities;
}

// Classifica uma Power JÁ CARREGADA com efeitosDeStatus/efeitosDeCombate
// (ver carregarPowerComEfeitos) num Set de capabilities. dano_base/
// cura_base são os únicos campos nativos de Power que geram capability
// direta (DAMAGE/HEAL_HP); o resto vem só dos efeitos.
function classificarPower(power) {
  const capabilities = new Set();
  if ((power?.dano_base ?? 0) > 0) capabilities.add("DAMAGE");
  if ((power?.cura_base ?? 0) > 0) capabilities.add("HEAL_HP");

  for (const capability of capabilitiesDosStatusEffects(power?.efeitosDeStatus)) capabilities.add(capability);
  for (const capability of capabilitiesDosCombatEffects(power?.efeitosDeCombate)) capabilities.add(capability);

  return capabilities;
}

module.exports = {
  carregarPowerComEfeitos,
  classificarPower,
};
