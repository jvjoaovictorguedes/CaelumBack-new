// Carrega e executa os ConsumableEffect de um Item via
// consumableEffectRegistry.js (spec §17). Usado pelo combatController
// (PvE) e characterInventoryController (fora de combate) no branch de
// item — duelEngine.js (PvP/Grupo) resolve o mesmo motor sem passar por
// aqui, porque aplicarAcao() é síncrono/puro e já recebe os efeitos
// pré-carregados por quem monta a ação (ver comentário em
// duelEngine.js).
const ConsumableEffect = require("../models/ConsumableEffect");
const {
  efeitoConhecido,
  executarEfeito,
  EFFECT_KEYS_DE_VIDA,
  EFFECT_KEYS_DE_MANA,
} = require("./consumableEffectRegistry");

async function listarEfeitosAtivos(idItem, transaction) {
  return ConsumableEffect.findAll({ where: { id_item: idItem, ativo: true }, transaction });
}

// Aplica todos os efeitos ativos do item, em sequência, sobre o estado
// do ALVO (normalmente o próprio usuário — todo efeito de consumível é
// self-target na V1). `vidaAtual`/`vidaMaxima`/`manaAtual`/`manaMaxima`
// são opcionais — quem só precisa de cleanse (ex. um Antídoto puro)
// pode omitir, e nenhum handler de vida/mana vai rodar porque o item
// não tem esse effect_key configurado.
//
// Devolve, além de `statusEffects`/`log`, `vidaAtual`/`manaAtual` (valor
// final já clampado) e `temEfeitoDeVida`/`temEfeitoDeMana` — a flag que
// quem chama usa pra decidir se ainda roda o legado
// ConsumableProperties.efeito_vida/efeito_mana daquele item (nunca os
// dois juntos: um item com HEAL_HP_*/RESTORE_MANA_* moderno configurado
// ignora o campo legado correspondente por completo).
async function aplicarEfeitosDoItem({
  idItem,
  statusEffects,
  vidaAtual = null,
  vidaMaxima = null,
  manaAtual = null,
  manaMaxima = null,
  quantidade = 1,
  nomeAlvo,
  transaction,
}) {
  const efeitos = await listarEfeitosAtivos(idItem, transaction);
  let lista = statusEffects;
  let vida = vidaAtual;
  let mana = manaAtual;
  let curaVida = 0;
  let curaMana = 0;
  let temEfeitoDeVida = false;
  let temEfeitoDeMana = false;
  const log = [];

  for (const efeito of efeitos) {
    if (!efeitoConhecido(efeito.effect_key)) {
      // effect_key desconhecida falha de forma segura (spec §12) — não
      // aplica, não quebra o resto do uso do item, só ignora e loga.
      console.error(`[consumableEffectService] effect_key não whitelisted: ${efeito.effect_key} (item ${idItem})`);
      continue;
    }

    const ehEfeitoDeVida = EFFECT_KEYS_DE_VIDA.includes(efeito.effect_key);
    const ehEfeitoDeMana = EFFECT_KEYS_DE_MANA.includes(efeito.effect_key);
    if (ehEfeitoDeVida) temEfeitoDeVida = true;
    if (ehEfeitoDeMana) temEfeitoDeMana = true;

    const resultado = executarEfeito(efeito.effect_key, {
      statusEffects: lista,
      config: efeito.config,
      magnitude: efeito.magnitude,
      vidaAtual: vida,
      vidaMaxima,
      manaAtual: mana,
      manaMaxima,
      quantidade,
    });

    if (resultado.statusEffects) lista = resultado.statusEffects;
    if (resultado.aplicado) log.push(`${nomeAlvo} foi curado(a) de um efeito negativo.`);
    if (typeof resultado.vidaAtual === "number") {
      vida = resultado.vidaAtual;
      curaVida += resultado.curou ?? 0;
    }
    if (typeof resultado.manaAtual === "number") {
      mana = resultado.manaAtual;
      curaMana += resultado.curou ?? 0;
    }
  }

  return {
    statusEffects: lista,
    vidaAtual: vida,
    manaAtual: mana,
    curaVida,
    curaMana,
    temEfeitoDeVida,
    temEfeitoDeMana,
    log,
  };
}

module.exports = { listarEfeitosAtivos, aplicarEfeitosDoItem };
