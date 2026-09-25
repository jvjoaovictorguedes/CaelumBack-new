// Sistema de Proezas Únicas §5.3/§10/§11 — extensão controlada do Power
// pra mecânicas de Legado, e o ENFORCEMENT por contexto competitivo.
//
// EFFECT_HANDLERS fica populado conforme Legados concretos entram no
// jogo (Fase de Conteúdo) — cada handler é responsável por validar a
// própria config e, futuramente, aplicar o efeito no motor de combate.
// Nenhum handler aqui ainda: infraestrutura primeiro (Fase 3), conteúdo
// depois (Fase 7), nunca o contrário.
const EFFECT_HANDLERS = {};

const { POWER_EFFECT_CONTEXT_COLUMNS } = require("../config/uniqueFeatConfig");
const UniquePowerEffect = require("../models/UniquePowerEffect");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function registrarEfeito(effectKey, handler) {
  EFFECT_HANDLERS[effectKey] = handler;
}

function efeitoConhecido(effectKey) {
  return effectKey in EFFECT_HANDLERS;
}

// Usado pelo admin CRUD (fase futura) antes de persistir
// UniquePowerEffect.config — falha fechado: effect_key desconhecido
// rejeita, e cada handler valida a própria config (nunca eval).
function validarConfig(effectKey, config) {
  const handler = EFFECT_HANDLERS[effectKey];
  if (!handler) throw erro(`effect_key desconhecido: "${effectKey}".`);
  if (typeof handler.validarConfig === "function") handler.validarConfig(config);
}

// §11 — dado um conjunto de poderes JÁ CARREGADOS (objetos planos com
// `id` e `acquisition_scope`, como buscarPoderesDoPersonagem devolve) e
// o contexto de combate real, devolve os ids que NÃO podem ser usados
// nesse contexto. Quem monta o snapshot de combate (pvpLiveSocket.
// carregarLutador — usado por casual/ranked/torneio/party/guild boss)
// remove esses ids do loadout ANTES do lutador existir de verdade —
// nunca deixa o Power "entrar" e só silenciosamente não fazer efeito
// (isso abriria brecha de custo de mana cobrado sem efeito nenhum).
//
// Powers NORMAL (a esmagadora maioria) nunca chegam a gerar query: o
// filtro por acquisition_scope acontece em memória antes de tocar o
// banco, então este chokepoint fica praticamente grátis pra qualquer
// personagem sem Legado nenhum.
async function idsDesautorizadosNoContexto(poderes, contexto, { transaction } = {}) {
  const coluna = POWER_EFFECT_CONTEXT_COLUMNS[contexto];
  if (!coluna) throw erro(`Contexto de combate desconhecido: "${contexto}".`, 500);

  const idsUnicos = (poderes ?? [])
    .filter((poder) => poder?.acquisition_scope === "UNIQUE_FEAT")
    .map((poder) => poder.id);
  if (idsUnicos.length === 0) return [];

  const efeitos = await UniquePowerEffect.findAll({ where: { id_power: idsUnicos }, transaction });
  const efeitoPorPower = new Map(efeitos.map((efeito) => [efeito.id_power, efeito]));

  const desautorizados = [];
  for (const id of idsUnicos) {
    const efeito = efeitoPorPower.get(id);
    // Sem UniquePowerEffect configurado (não devia acontecer com um
    // Power acquisition_scope=UNIQUE_FEAT, mas defensivo) ou efeito
    // desativado pelo admin: nunca funciona em NENHUM contexto até
    // estar configurado/ativo — falha fechado, nunca aberto.
    if (!efeito || !efeito.ativo || !efeito[coluna]) {
      desautorizados.push(id);
    }
  }
  return desautorizados;
}

module.exports = {
  registrarEfeito,
  efeitoConhecido,
  validarConfig,
  idsDesautorizadosNoContexto,
};
