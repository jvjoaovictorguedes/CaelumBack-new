// Whitelist de effect_key (spec §6.5/§12) — único lugar que resolve uma
// string do banco pra uma função de verdade. Nenhum eval/Function/SQL
// dinâmico; effect_key desconhecida falha de forma segura (nunca
// silenciosamente ignorada).
//
// Cada handler recebe { statusEffects, config, magnitude } e devolve a
// NOVA lista de status do ALVO (mesma convenção pura de
// statusEffectService — nunca muta o array recebido) mais um `log`
// opcional com a frase pro combate.
const statusEffectService = require("./statusEffectService");
const { CHAVES_VALIDAS } = require("../config/statusEffectConfig");

function cleanseStatus({ statusEffects, config }) {
  const statusKey = config?.status_key;
  if (!statusKey || !CHAVES_VALIDAS.includes(statusKey)) {
    throw Object.assign(new Error(`CLEANSE_STATUS com status_key inválida: ${statusKey}`), { statusCode: 500 });
  }
  const possuiAntes = statusEffectService.possuiStatus(statusEffects, statusKey);
  const novaLista = statusEffectService.removerStatus(statusEffects, statusKey);
  return { statusEffects: novaLista, aplicado: possuiAntes };
}

function cleanseCategory({ statusEffects, config }) {
  const categoria = config?.category;
  if (!categoria || !["DOT", "CONTROLE"].includes(categoria)) {
    throw Object.assign(new Error(`CLEANSE_CATEGORY com category inválida: ${categoria}`), { statusCode: 500 });
  }
  const novaLista = statusEffectService.removerStatusPorCategoria(statusEffects, categoria);
  return { statusEffects: novaLista, aplicado: novaLista.length !== statusEffects.length };
}

// APPLY_COMBAT_BUFF fica deliberadamente FORA da whitelist nesta
// entrega (Fase 6 — spec §13: buffs temporários exigem
// combatBuffService próprio, não implementado ainda). Registrar a
// chave aqui sem handler faria falhar "de forma segura" mesmo assim,
// mas é mais claro simplesmente não listá-la: um admin/seed que tente
// usá-la recebe o mesmo erro de "effect_key desconhecida" do fallback.

const CONSUMABLE_EFFECT_HANDLERS = {
  CLEANSE_STATUS: cleanseStatus,
  CLEANSE_CATEGORY: cleanseCategory,
};

function efeitoConhecido(effectKey) {
  return Object.prototype.hasOwnProperty.call(CONSUMABLE_EFFECT_HANDLERS, effectKey);
}

function executarEfeito(effectKey, args) {
  const handler = CONSUMABLE_EFFECT_HANDLERS[effectKey];
  if (!handler) {
    throw Object.assign(new Error(`effect_key desconhecida/whitelist: ${effectKey}`), { statusCode: 500 });
  }
  return handler(args);
}

module.exports = { CONSUMABLE_EFFECT_HANDLERS, efeitoConhecido, executarEfeito };
