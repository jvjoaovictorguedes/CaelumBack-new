// Painel Administrativo — "Inventário": correções administrativas de
// inventário (players.manage). Reaproveita inventoryService.js
// (addStack/removeStack) — a mesma fonte que qualquer drop/recompensa
// legítima usa — nunca escreve quantidade direto na tabela. Toda
// correção exige motivo (fica na auditoria com o porquê), igual
// adminGrantService.grantToCharacter.
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const CharacterInventory = require("../models/CharacterInventory");
const CharacterEquipmentInstance = require("../models/CharacterEquipmentInstance");
const Item = require("../models/Item");
const { addStack, removeStack } = require("./inventoryService");
const { registrarAcao } = require("./adminAuditService");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function exigirMotivo(motivo) {
  if (!motivo || !motivo.trim()) throw erro("motivo é obrigatório — toda correção fica registrada na auditoria com o porquê.");
}

async function getCharacterInventory(idPersonagem) {
  const personagem = await Character.findByPk(idPersonagem, { attributes: ["id", "nome"] });
  if (!personagem) throw erro("Personagem não encontrado.", 404);

  const [stacks, equipamentos] = await Promise.all([
    CharacterInventory.findAll({
      where: { id_personagem: idPersonagem },
      include: [{ model: Item, as: "itemEspolio", attributes: ["id", "nome", "tipo_item", "raridade", "imagem_url"] }],
      order: [["id_item", "ASC"]],
    }),
    CharacterEquipmentInstance.findAll({
      where: { id_personagem: idPersonagem },
      include: [{ model: Item, as: "item", attributes: ["id", "nome", "tipo_item", "raridade", "imagem_url"] }],
      order: [["id", "ASC"]],
    }),
  ]);

  return {
    personagem: { id: personagem.id, nome: personagem.nome },
    stacks,
    equipamentos,
  };
}

async function setInventoryStackQuantity(idPersonagem, idItem, novaQuantidade, { idAdmin, motivo, req }) {
  exigirMotivo(motivo);
  if (!Number.isInteger(novaQuantidade) || novaQuantidade < 0) {
    throw erro("novaQuantidade precisa ser um inteiro >= 0.");
  }

  return sequelize.transaction(async (transaction) => {
    const personagem = await Character.findByPk(idPersonagem, { transaction, lock: transaction.LOCK.UPDATE });
    if (!personagem) throw erro("Personagem não encontrado.", 404);

    const entrada = await CharacterInventory.findOne({
      where: { id_personagem: idPersonagem, id_item: idItem },
      transaction,
    });
    const quantidadeAntes = entrada?.quantidade ?? 0;
    const delta = novaQuantidade - quantidadeAntes;

    if (delta > 0) await addStack(idPersonagem, idItem, delta, transaction);
    else if (delta < 0) await removeStack(idPersonagem, idItem, -delta, transaction);

    await registrarAcao({
      idAdmin,
      acao: "corrigir",
      entidade: "CharacterInventory",
      idEntidade: idPersonagem,
      dadosAntes: { id_item: idItem, quantidade: quantidadeAntes },
      dadosDepois: { id_item: idItem, quantidade: novaQuantidade },
      motivo,
      req,
      transaction,
    });

    return { id_item: idItem, quantidade_antes: quantidadeAntes, quantidade_depois: novaQuantidade };
  });
}

async function removeEquipmentInstance(idInstancia, { idAdmin, motivo, req }) {
  exigirMotivo(motivo);

  return sequelize.transaction(async (transaction) => {
    const instancia = await CharacterEquipmentInstance.findByPk(idInstancia, { transaction, lock: transaction.LOCK.UPDATE });
    if (!instancia) throw erro("Instância de equipamento não encontrada.", 404);
    // Nunca mexe em equipamento EQUIPADO (precisaria também desocupar o
    // slot em CharacterEquipment) nem em anúncio ativo no Mercado —
    // essas correções passam por fluxo próprio (desequipar o jogador
    // primeiro / moderação de Mercado), não por aqui.
    if (instancia.estado !== "Inventario") {
      throw erro(`Só é possível remover instâncias soltas no inventário (estado atual: ${instancia.estado}).`);
    }

    const antes = instancia.toJSON();
    await instancia.destroy({ transaction });

    await registrarAcao({
      idAdmin,
      acao: "remover",
      entidade: "CharacterEquipmentInstance",
      idEntidade: idInstancia,
      dadosAntes: antes,
      motivo,
      req,
      transaction,
    });

    return { removido: true };
  });
}

module.exports = { getCharacterInventory, setInventoryStackQuantity, removeEquipmentInstance };
