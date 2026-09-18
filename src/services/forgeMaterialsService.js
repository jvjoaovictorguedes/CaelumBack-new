// Resolve um insumo genérico de blueprint (tipo_insumo + id_recurso +
// qualidade escolhida pelo jogador) pro Item concreto que precisa ser
// consumido do inventário — nunca aceitar o id_item pronto vindo do
// cliente (spec §54), sempre recalcular aqui a partir do recurso.
const ForgeBarItem = require("../models/ForgeBarItem");
const ExpeditionResourceItem = require("../models/ExpeditionResourceItem");

async function resolverIdItemDoInsumo({ tipo_insumo, id_recurso, qualidade }, transaction) {
  if (tipo_insumo === "Barra") {
    const vinculo = await ForgeBarItem.findOne({ where: { id_recurso, qualidade }, transaction });
    return vinculo?.id_item ?? null;
  }
  const vinculo = await ExpeditionResourceItem.findOne({ where: { id_recurso, qualidade }, transaction });
  return vinculo?.id_item ?? null;
}

module.exports = { resolverIdItemDoInsumo };
