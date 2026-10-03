// IA de Combate PvE & Habilidades de Monstros V1 (§4.2/§4.3/§4.4/§6.1)
// — catálogo central de MonsterAbility/GuildBossAbility. Puro catálogo +
// validação de shape; nenhuma lógica de combate aqui (isso é
// combatAiService). condition_key é SEMPRE whitelist — nunca expressão
// livre (§4.3 "config pode guardar somente parâmetros conhecidos").

const TARGET_POLICIES = ["SELF", "PLAYER", "LOWEST_HP", "HIGHEST_HP", "RANDOM", "ALL"];

// §4.4 — BASIC (pouca análise, ataque básico dominante) -> TACTICAL
// (usa condições, evita desperdício) -> BOSS (combina recursos/fases) ->
// ELITE_BOSS (maior profundidade, menor aleatoriedade; reservado ao
// Templo — não liberado em nenhum monstro/boss desta V1).
const AI_PROFILES = ["BASIC", "TACTICAL", "BOSS", "ELITE_BOSS"];

// Jitter máximo (pontos de score) somado à escolha final por perfil —
// §5.4 "BASIC pode variar mais; ELITE_BOSS varia menos".
const JITTER_MAXIMO_POR_PERFIL = {
  BASIC: 18,
  TACTICAL: 10,
  BOSS: 6,
  ELITE_BOSS: 2,
};

// §6.1 — whitelist de condition_key. `schema` lista as chaves aceitas
// em `config` pra validação; nenhuma delas aceita expressão/eval.
const CONDITION_KEYS = {
  SELF_HP_BELOW_PCT: { schema: ["thresholdPct"] },
  SELF_HP_ABOVE_PCT: { schema: ["thresholdPct"] },
  TARGET_HP_BELOW_PCT: { schema: ["thresholdPct"] },
  TARGET_HP_ABOVE_PCT: { schema: ["thresholdPct"] },
  SELF_HAS_STATUS: { schema: ["statusKey"] },
  TARGET_HAS_STATUS: { schema: ["statusKey"] },
  SELF_HAS_BUFF: { schema: ["effectKey"] },
  TARGET_HAS_BUFF: { schema: ["effectKey"] },
  SELF_MANA_BELOW_PCT: { schema: ["thresholdPct"] },
  TURN_AT_LEAST: { schema: ["turn"] },
  PHASE_IS: { schema: ["phase"] },
  PREVIOUS_ACTION_WAS: { schema: ["actionType", "abilityId"] },
};

const CONDITION_KEYS_VALIDAS = Object.keys(CONDITION_KEYS);

function targetPolicyValida(policy) {
  return TARGET_POLICIES.includes(policy);
}

function aiProfileValido(perfil) {
  return AI_PROFILES.includes(perfil);
}

function jitterMaximoDoPerfil(perfil) {
  return JITTER_MAXIMO_POR_PERFIL[perfil] ?? JITTER_MAXIMO_POR_PERFIL.BASIC;
}

function conditionKeyValida(chave) {
  return CONDITION_KEYS_VALIDAS.includes(chave);
}

// Só garante que `config` não carrega chaves fora do schema conhecido —
// não valida tipo/intervalo de cada campo aqui (isso fica a cargo de
// quem consome, ex.: combatAiService ao avaliar a condição).
function configValidoParaCondicao(conditionKey, config) {
  const definicao = CONDITION_KEYS[conditionKey];
  if (!definicao) return false;
  if (!config || typeof config !== "object" || Array.isArray(config)) return false;
  return Object.keys(config).every((chave) => definicao.schema.includes(chave));
}

module.exports = {
  TARGET_POLICIES,
  AI_PROFILES,
  CONDITION_KEYS,
  CONDITION_KEYS_VALIDAS,
  targetPolicyValida,
  aiProfileValido,
  jitterMaximoDoPerfil,
  conditionKeyValida,
  configValidoParaCondicao,
};
