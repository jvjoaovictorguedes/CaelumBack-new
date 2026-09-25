// Carrega e executa os ConsumableEffect de um Item via
// consumableEffectRegistry.js (spec §17). Usado pelo combatController
// no branch de item, depois do heal/mana legado de
// efeito_vida/efeito_mana — nunca duplica regra de status, sempre
// delega pro statusEffectService através do registry.
const ConsumableEffect = require("../models/ConsumableEffect");
const { efeitoConhecido, executarEfeito } = require("./consumableEffectRegistry");

async function listarEfeitosAtivos(idItem, transaction) {
  return ConsumableEffect.findAll({ where: { id_item: idItem, ativo: true }, transaction });
}

// Aplica todos os efeitos ativos do item, em sequência, sobre a lista de
// status do ALVO (normalmente o próprio usuário — antídotos/cleanse são
// sempre self-target na V1). Devolve a lista final + um log de frases.
async function aplicarEfeitosDoItem({ idItem, statusEffects, nomeAlvo, transaction }) {
  const efeitos = await listarEfeitosAtivos(idItem, transaction);
  let lista = statusEffects;
  const log = [];
  for (const efeito of efeitos) {
    if (!efeitoConhecido(efeito.effect_key)) {
      // effect_key desconhecida falha de forma segura (spec §12) — não
      // aplica, não quebra o resto do uso do item, só ignora e loga.
      console.error(`[consumableEffectService] effect_key não whitelisted: ${efeito.effect_key} (item ${idItem})`);
      continue;
    }
    const { statusEffects: novaLista, aplicado } = executarEfeito(efeito.effect_key, {
      statusEffects: lista,
      config: efeito.config,
      magnitude: efeito.magnitude,
    });
    lista = novaLista;
    if (aplicado) {
      log.push(`${nomeAlvo} foi curado(a) de um efeito negativo.`);
    }
  }
  return { statusEffects: lista, log };
}

module.exports = { listarEfeitosAtivos, aplicarEfeitosDoItem };
