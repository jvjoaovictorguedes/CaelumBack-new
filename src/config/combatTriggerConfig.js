// Habilidades V2.0 (doc "Habilidades V2.0" §14) — Fase 3. Catálogo
// fechado de GATILHOS que um PowerCombatEffect poderá usar a partir da
// Fase 4 (passivas e efeitos reativos sem eval/script/fórmula arbitrária
// vinda do banco — §14/§27 "nunca lógica executável armazenada no
// banco"). Puro catálogo; nenhum trigger é disparado por ninguém ainda.
const TRIGGERS = [
  // Sempre válido enquanto a passiva estiver ativa — não é "disparado",
  // é um estado contínuo (ex.: +8% de crítico o tempo todo).
  "PASSIVE",
  "COMBAT_START",
  "ON_CAST",
  "ON_HIT",
  // Rebalanceamento de Powers de personagem — diferente de ON_CAST/
  // ON_HIT (que disparam pra QUALQUER Power usada enquanto o efeito
  // estiver no loadout), estes dois só disparam quando a Power DONA do
  // efeito foi ela mesma a usada/a acertar (filtrado por sourcePowerId
  // em powerCombatRuntime.emit, nunca por nome — ver Power.id). Pra
  // efeitos intrínsecos de uma Power (ex.: Fúria de Aço se buffar ao
  // ser lançada), nunca pra reagir ao uso de QUALQUER OUTRA Power do
  // loadout, que é o que ON_CAST/ON_HIT fariam.
  "ON_POWER_CAST",
  "ON_POWER_HIT",
  "ON_CRIT",
  "ON_DAMAGE_TAKEN",
  "ON_DODGE",
  "ON_HEAL",
  "ON_KILL",
  "TURN_START",
  "TURN_END",
];

const DESCRICAO_DO_TRIGGER = {
  PASSIVE: "Sempre ativo enquanto a Power/passiva for válida.",
  COMBAT_START: "No início do combate.",
  ON_CAST: "Ao lançar uma habilidade (qualquer Power ativa).",
  ON_HIT: "Ao acertar um ataque básico ou Power.",
  ON_POWER_CAST: "Ao lançar ESTA MESMA Power (efeito intrínseco, nunca reage a outra Power do loadout).",
  ON_POWER_HIT: "Ao ESTA MESMA Power acertar (nunca dodge/miss, nunca outra Power).",
  ON_CRIT: "Ao causar um golpe crítico.",
  ON_DAMAGE_TAKEN: "Ao sofrer dano.",
  ON_DODGE: "Ao esquivar de um ataque.",
  ON_HEAL: "Após curar (a si mesmo ou outro alvo).",
  ON_KILL: "Ao derrotar o alvo.",
  TURN_START: "No início do próprio turno do ator.",
  TURN_END: "No fim do próprio turno do ator.",
};

function triggerValido(trigger) {
  return TRIGGERS.includes(trigger);
}

module.exports = {
  TRIGGERS,
  DESCRICAO_DO_TRIGGER,
  triggerValido,
};
