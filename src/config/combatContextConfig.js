// Habilidades V2.0 (doc "Habilidades V2.0" §3/§11/§17) — Fase 3 da ordem
// recomendada de implementação (catálogo central de contextos). Fonte
// ÚNICA da lista de contextos de combate do jogo — hoje espalhada em
// duplicatas conceituais (uniqueFeatConfig.POWER_EFFECT_CONTEXT_COLUMNS
// já usa exatamente estes 7 nomes só pra Proezas Únicas). Esta lista
// nasce central pra tudo que vier depois (PowerCombatEffect, Status
// Catalog, limites de DoT) nunca precisar inventar a própria enumeração
// de contexto — e pra uniqueFeatConfig.js consumir DAQUI (ver import
// abaixo), em vez de manter uma segunda lista que pode divergir.
//
// Puro catálogo — zero lógica de enforcement aqui (isso continua em
// cada service que já faz enforcement hoje, como uniquePowerEffectRegistry,
// e no futuro combatModifierService).
const CONTEXTOS_DE_COMBATE = [
  "PVE",
  "PARTY",
  "GUILD_BOSS",
  "WORLD_BOSS",
  "PVP_CASUAL",
  "RANKED",
  "TOURNAMENT",
];

// Rótulo pra exibição no Admin (§17) — nunca o nome técnico cru na UI.
const ROTULO_DO_CONTEXTO = {
  PVE: "Aventura (PvE)",
  PARTY: "Grupo (Party)",
  GUILD_BOSS: "Boss da Guilda",
  WORLD_BOSS: "Ameaça Mundial",
  PVP_CASUAL: "PvP Casual",
  RANKED: "Ranqueado",
  TOURNAMENT: "Torneio",
};

function contextoValido(contexto) {
  return CONTEXTOS_DE_COMBATE.includes(contexto);
}

module.exports = {
  CONTEXTOS_DE_COMBATE,
  ROTULO_DO_CONTEXTO,
  contextoValido,
};
