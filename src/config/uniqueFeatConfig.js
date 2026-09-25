// Sistema de Proezas Únicas (Caelum_Proezas_Unicas_Claude.docx) §6/§28 —
// whitelists e parâmetros seguros. O banco NUNCA guarda trigger_key fora
// desta lista: uniqueFeatTriggerRegistry.js só registra handlers pras
// chaves daqui, e uniqueFeatService.check() rejeita qualquer trigger_key
// desconhecido antes de sequer procurar Proezas — nunca eval, nunca SQL/
// JS/expressão arbitrária vinda do banco (regra 6 da spec).
const TRIGGER_KEYS = [
  "WORLD_BOSS_FINAL_BLOW",
  "ADVENTURE_VICTORY",
  "FORGE_CRAFT_COMPLETED",
  "FORGE_REFINEMENT_COMPLETED",
  "ALCHEMY_CRAFT_COMPLETED",
  "FISH_CAUGHT",
  "NAVIGATION_DISCOVERY",
  "EXPEDITION_COMPLETED",
  "BESTIARY_EVENT",
];

// §12 — controla o que a API pública mostra ANTES do claim existir.
const VISIBILITY_BEFORE_CLAIM = ["HIDDEN", "TEASER"];

// §12 — controla o que a API pública mostra DEPOIS do claim existir.
const REVEAL_AFTER_CLAIM = ["FULL", "FLAVOR_ONLY", "REMAIN_SECRET"];

const CLAIM_STATUS = ["VALID", "REVOKED"];

// §9 — marca técnica em Power.acquisition_scope; nunca concedido por
// classe/raça/evolução/loja/drop/seed genérico quando for UNIQUE_FEAT.
const POWER_ACQUISITION_SCOPES = ["NORMAL", "UNIQUE_FEAT"];

// §11 — colunas de contexto competitivo em UniquePowerEffect. Usado pelo
// enforcement (uniquePowerEffectRegistry.contextoPermitido) pra mapear
// um contexto de combate real (ex.: "Ranked", "TorneioPvP") na coluna
// allow_* certa, sem espalhar essa tabela pelo código todo.
const POWER_EFFECT_CONTEXT_COLUMNS = {
  PVE: "allow_pve",
  PARTY: "allow_party",
  GUILD_BOSS: "allow_guild_boss",
  WORLD_BOSS: "allow_world_boss",
  PVP_CASUAL: "allow_pvp_casual",
  RANKED: "allow_ranked",
  TOURNAMENT: "allow_tournament",
};

function triggerKeyValida(triggerKey) {
  return TRIGGER_KEYS.includes(triggerKey);
}

module.exports = {
  TRIGGER_KEYS,
  VISIBILITY_BEFORE_CLAIM,
  REVEAL_AFTER_CLAIM,
  CLAIM_STATUS,
  POWER_ACQUISITION_SCOPES,
  POWER_EFFECT_CONTEXT_COLUMNS,
  triggerKeyValida,
};
