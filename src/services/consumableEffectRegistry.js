// Whitelist de effect_key (spec §6.5/§12) — único lugar que resolve uma
// string do banco pra uma função de verdade. Nenhum eval/Function/SQL
// dinâmico; effect_key desconhecida falha de forma segura (nunca
// silenciosamente ignorada).
//
// Cada handler recebe { statusEffects, config, magnitude, vidaAtual,
// vidaMaxima, manaAtual, manaMaxima, quantidade } (nem todo handler usa
// todos os campos) e devolve só as chaves que efetivamente mudou —
// `statusEffects` (nova lista, mesma convenção pura de
// statusEffectService, nunca muta o array recebido) e/ou `vidaAtual`/
// `manaAtual` (novo valor já clampado no respectivo máximo, mais
// `curou` com o delta aplicado) — nunca os dois tipos no mesmo handler.
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

// Cura de vida/mana (spec Caldeirão §6.5) — migra Poção de Vida/Mana
// (e qualquer novo consumível) pro motor de ConsumableEffect, saindo do
// par legado ConsumableProperties.efeito_vida/efeito_mana (percentual
// fixo, sem handler nenhum). _FLAT soma pontos fixos; _PERCENT soma um
// percentual do máximo efetivo (mesma fórmula do legado, pra manter
// catálogo existente numericamente idêntico ao migrar). `quantidade`
// (default 1) escala o valor curado — usado só por
// characterInventoryController.js (uso fora de combate, que permite
// consumir várias unidades de uma vez); combate sempre usa 1.
function healHpFlat({ magnitude, vidaAtual, vidaMaxima, quantidade = 1 }) {
  const cura = Math.max(0, Math.round((magnitude || 0) * quantidade));
  const novaVida = Math.min(vidaMaxima, vidaAtual + cura);
  return { vidaAtual: novaVida, curou: novaVida - vidaAtual };
}

function healHpPercent({ magnitude, vidaAtual, vidaMaxima, quantidade = 1 }) {
  const cura = Math.max(0, Math.round(vidaMaxima * ((magnitude || 0) / 100) * quantidade));
  const novaVida = Math.min(vidaMaxima, vidaAtual + cura);
  return { vidaAtual: novaVida, curou: novaVida - vidaAtual };
}

function restoreManaFlat({ magnitude, manaAtual, manaMaxima, quantidade = 1 }) {
  const cura = Math.max(0, Math.round((magnitude || 0) * quantidade));
  const novaMana = Math.min(manaMaxima, manaAtual + cura);
  return { manaAtual: novaMana, curou: novaMana - manaAtual };
}

function restoreManaPercent({ magnitude, manaAtual, manaMaxima, quantidade = 1 }) {
  const cura = Math.max(0, Math.round(manaMaxima * ((magnitude || 0) / 100) * quantidade));
  const novaMana = Math.min(manaMaxima, manaAtual + cura);
  return { manaAtual: novaMana, curou: novaMana - manaAtual };
}

// Usado por quem monta o payload de aplicarEfeitosDoItem (e por
// duelEngine.js, que resolve isso sem passar pelo service — ver
// comentário lá) pra saber, SEM rodar o handler, se um item tem efeito
// moderno de vida/mana configurado — é o que decide se o legado
// efeito_vida/efeito_mana daquele item deve ou não rodar (nunca os
// dois juntos).
const EFFECT_KEYS_DE_VIDA = ["HEAL_HP_FLAT", "HEAL_HP_PERCENT"];
const EFFECT_KEYS_DE_MANA = ["RESTORE_MANA_FLAT", "RESTORE_MANA_PERCENT"];

const CONSUMABLE_EFFECT_HANDLERS = {
  CLEANSE_STATUS: cleanseStatus,
  CLEANSE_CATEGORY: cleanseCategory,
  HEAL_HP_FLAT: healHpFlat,
  HEAL_HP_PERCENT: healHpPercent,
  RESTORE_MANA_FLAT: restoreManaFlat,
  RESTORE_MANA_PERCENT: restoreManaPercent,
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

module.exports = {
  CONSUMABLE_EFFECT_HANDLERS,
  EFFECT_KEYS_DE_VIDA,
  EFFECT_KEYS_DE_MANA,
  efeitoConhecido,
  executarEfeito,
};
