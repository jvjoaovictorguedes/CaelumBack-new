// Habilidades V2.0 (doc "Habilidades V2.0" §14) — Fase 3. Catálogo
// fechado de CONDIÇÕES tipadas que um PowerCombatEffect poderá exigir a
// partir da Fase 4 (ex.: "+20% dano abaixo de 30% de Vida própria").
// Cada condition_key tem uma config PRÓPRIA e tipada — nunca uma
// expressão livre. Puro catálogo; nenhuma condição é avaliada ainda.
const CONDITIONS = [
  "SELF_HP_BELOW_PCT",
  "TARGET_HP_BELOW_PCT",
  "SELF_HAS_STATUS",
  "TARGET_HAS_STATUS",
  "TARGET_HAS_DEBUFF_GROUP",
];

// Formato de `condition_config` esperado por cada condition_key — serve
// de contrato pra validação (Admin/service), nunca interpretado como
// código. `campos` lista as chaves obrigatórias da config em JSON.
const CONFIG_ESPERADA = {
  SELF_HP_BELOW_PCT: { campos: ["limite_pct"], descricao: "Vida ATUAL do próprio ator abaixo de limite_pct (0-100).", fields: [{ key: "limite_pct", label: "HP próprio abaixo de (%)", type: "number", min: 0, max: 100, required: true }] },
  TARGET_HP_BELOW_PCT: { campos: ["limite_pct"], descricao: "Vida ATUAL do alvo abaixo de limite_pct (0-100).", fields: [{ key: "limite_pct", label: "HP do alvo abaixo de (%)", type: "number", min: 0, max: 100, required: true }] },
  SELF_HAS_STATUS: { campos: ["status_key"], descricao: "O próprio ator carrega o Status status_key.", fields: [{ key: "status_key", label: "Status no próprio personagem", type: "select", optionsSource: "statusKeys", required: true }] },
  TARGET_HAS_STATUS: { campos: ["status_key"], descricao: "O alvo carrega o Status status_key.", fields: [{ key: "status_key", label: "Status no alvo", type: "select", optionsSource: "statusKeys", required: true }] },
  TARGET_HAS_DEBUFF_GROUP: { campos: ["stack_group"], descricao: "O alvo carrega um modificador do stack_group indicado.", fields: [{ key: "stack_group", label: "Grupo de debuff no alvo", type: "text", optionsSource: "stackGroups", maxLength: 60, required: true }] },
};

function conditionKeyValida(conditionKey) {
  return CONDITIONS.includes(conditionKey);
}

// Validação de forma (shape), nunca de valor semântico profundo — cada
// consumidor real (combatModifierService, a partir da Fase 4) ainda
// valida os valores em si (ex.: limite_pct entre 0 e 100).
function configBateComContrato(conditionKey, config) {
  const contrato = CONFIG_ESPERADA[conditionKey];
  if (!contrato) return false;
  if (!config || typeof config !== "object") return false;
  return contrato.campos.every((campo) => campo in config);
}

module.exports = {
  CONDITIONS,
  CONFIG_ESPERADA,
  conditionKeyValida,
  configBateComContrato,
};
