// IA de Combate PvE & Habilidades de Monstros V1 (§3.1/§6.2/§7) —
// catálogo central das CAPABILITIES que uma Power pode exibir. Puro
// catálogo: "Capability resolver classifica a Power pelos efeitos que
// possui... não deve executar combate" (§3.1). A classificação de
// verdade mora em powerCapabilityService; aqui só a lista fechada e os
// mapas usados por ela, pra nunca inventar um nome novo de capability
// fora deste arquivo.
const CAPABILITIES = [
  "DAMAGE",
  "DEBUFF_CONTROL",
  "OFFENSIVE_BUFF",
  "DEFENSIVE_BUFF",
  "HEAL_HP",
  "REGEN_HP",
  "SHIELD",
  "CLEANSE_SELF",
  "DISPEL_TARGET",
];

// §9.2/§7 — capabilities de SUSTAIN: ganho de recurso (vida) ou mitigação
// total de dano que, em Boss coletivo, inflaria o EHP artificialmente.
// Usado pela "Hard rule de Boss coletivo" (nunca reconfigurável).
const CAPABILITIES_DE_SUSTAIN_PROIBIDAS_EM_BOSS_COLETIVO = ["HEAL_HP", "REGEN_HP", "SHIELD"];

// effect_key de PowerCombatEffect (combatModifierConfig.EFFECT_KEYS) que
// mapeiam direto pra uma capability, por efeito que causam (não por
// nome). GRANT_SHIELD/SHIELD_ON_CAST -> SHIELD; REGEN_HP_* -> REGEN_HP;
// CLEANSE_* -> CLEANSE_SELF (só quando target=SELF); DISPEL_BUFF ->
// DISPEL_TARGET (só quando o alvo é inimigo).
const EFFECT_KEY_PARA_CAPABILITY = {
  GRANT_SHIELD: "SHIELD",
  SHIELD_ON_CAST: "SHIELD",
  REGEN_HP_FLAT: "REGEN_HP",
  REGEN_HP_PERCENT: "REGEN_HP",
  CLEANSE_STATUS: "CLEANSE_SELF",
  CLEANSE_CATEGORY: "CLEANSE_SELF",
  DISPEL_BUFF: "DISPEL_TARGET",
};

// Demais effect_keys que viram buff ofensivo/defensivo dependendo de SE
// o alvo é o próprio portador/aliado (nunca um "debuff" aqui — debuff de
// verdade sobre o INIMIGO sempre passa por PowerStatusEffect/§6.2
// WEAKEN, não por estes modificadores numéricos neste catálogo de IA).
const EFFECT_KEYS_DE_BUFF_OFENSIVO = ["DAMAGE_DEALT_PCT", "CRIT_CHANCE_PCT", "CRIT_DAMAGE_PCT", "HIT_CHANCE_PCT", "LIFESTEAL_PCT"];
const EFFECT_KEYS_DE_BUFF_DEFENSIVO = ["DAMAGE_TAKEN_PCT", "DEFENSE_FLAT", "DODGE_CHANCE_PCT", "STATUS_RESISTANCE_PCT", "HEALING_RECEIVED_PCT"];

// Alvos (TARGETS de combatModifierConfig) tratados como "sobre si/aliado"
// pra fim de OFFENSIVE_BUFF/DEFENSIVE_BUFF/REGEN_HP/SHIELD/CLEANSE_SELF.
const ALVOS_PROPRIOS = ["SELF", "ALL_ALLIES"];
const ALVOS_INIMIGOS = ["ENEMY", "ALL_ENEMIES"];

function capabilityValida(capability) {
  return CAPABILITIES.includes(capability);
}

function ehCapabilityDeSustainProibidaEmBossColetivo(capability) {
  return CAPABILITIES_DE_SUSTAIN_PROIBIDAS_EM_BOSS_COLETIVO.includes(capability);
}

module.exports = {
  CAPABILITIES,
  CAPABILITIES_DE_SUSTAIN_PROIBIDAS_EM_BOSS_COLETIVO,
  EFFECT_KEY_PARA_CAPABILITY,
  EFFECT_KEYS_DE_BUFF_OFENSIVO,
  EFFECT_KEYS_DE_BUFF_DEFENSIVO,
  ALVOS_PROPRIOS,
  ALVOS_INIMIGOS,
  capabilityValida,
  ehCapabilityDeSustainProibidaEmBossColetivo,
};
