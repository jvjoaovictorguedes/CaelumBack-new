// Resolve um insumo genérico de blueprint (tipo_insumo + id_recurso +
// qualidade escolhida pelo jogador) pro Item concreto que precisa ser
// consumido do inventário — nunca aceitar o id_item pronto vindo do
// cliente (spec §54), sempre recalcular aqui a partir do recurso.
const ForgeBarItem = require("../models/ForgeBarItem");
const ExpeditionResourceItem = require("../models/ExpeditionResourceItem");
const ExpeditionResource = require("../models/ExpeditionResource");
const AlchemyRecipe = require("../models/AlchemyRecipe");
const Item = require("../models/Item");

async function resolverIdItemDoInsumo({ tipo_insumo, id_recurso, qualidade }, transaction) {
  if (tipo_insumo === "Barra") {
    const vinculo = await ForgeBarItem.findOne({ where: { id_recurso, qualidade }, transaction });
    return vinculo?.id_item ?? null;
  }
  if (tipo_insumo === "ProdutoAlquimia") {
    // Produto do Caldeirão (spec Alquimia §3/§6.1) nunca tem variante
    // de qualidade como Barra/RecursoExpedicao — o mesmo Item de
    // resultado da receita vale nas 6 qualidades da Forja (ignorado
    // aqui de propósito, nunca lido).
    const receita = await AlchemyRecipe.findByPk(id_recurso, { transaction });
    return receita?.id_item_resultado ?? null;
  }
  if (tipo_insumo === "Espolio") {
    // Espólio (pedido: "Forja também pode usar espólios como
    // ingrediente") é o próprio Item concreto do inventário — sem
    // catálogo de recurso intermediário nem variante de qualidade
    // (mesmo racional de ProdutoAlquimia): id_recurso JÁ É o id_item.
    // Só confirma que ainda é um Espólio ativo antes de resolver —
    // nunca deixa um blueprint fabricar com um id_recurso que virou
    // outra coisa (item excluído/tipo trocado) sem dar "Ausente".
    const item = await Item.findByPk(id_recurso, { transaction });
    return item && item.tipo_item === "Espolio" && item.ativo ? item.id : null;
  }
  const vinculo = await ExpeditionResourceItem.findOne({ where: { id_recurso, qualidade }, transaction });
  return vinculo?.id_item ?? null;
}

// id_recurso é polimórfico desde que ProdutoAlquimia existe (ver
// migration 20261216010000): pra Barra/RecursoExpedicao aponta pra
// ExpeditionResource.id, pra ProdutoAlquimia aponta pra AlchemyRecipe.id
// — NUNCA confiar na associação Sequelize "recurso" (ForgeBlueprintIngredient
// .belongsTo(ExpeditionResource)) pra exibir o nome de um ingrediente
// ProdutoAlquimia: sem FK de banco entre as duas tabelas, um id_recurso
// de receita pode coincidir por acaso com o id de um ExpeditionResource
// não relacionado e mostrar o nome errado. Esta função é a ÚNICA fonte
// pra "nome lógico do insumo" — nunca ler ingrediente.recurso?.nome
// direto em outro lugar.
async function resolverNomeRecursoDoInsumo({ tipo_insumo, id_recurso }, transaction) {
  if (tipo_insumo === "ProdutoAlquimia") {
    const receita = await AlchemyRecipe.findByPk(id_recurso, { transaction });
    return receita?.nome ?? null;
  }
  if (tipo_insumo === "Espolio") {
    const item = await Item.findByPk(id_recurso, { transaction });
    return item?.nome ?? null;
  }
  const recurso = await ExpeditionResource.findByPk(id_recurso, { transaction });
  return recurso?.nome ?? null;
}

module.exports = { resolverIdItemDoInsumo, resolverNomeRecursoDoInsumo };
