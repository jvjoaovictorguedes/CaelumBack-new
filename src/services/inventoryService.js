// Service central de posse pra itens EMPILHÁVEIS (Materiais/
// Consumíveis/Espólios/QuestItem/Currências — spec Inventário v2 §4) em
// CharacterInventory. Único ponto que soma/subtrai quantidade, pra
// nenhum controller reimplementar "acha ou cria a linha e some" (era
// duplicado em pelo menos 6 arquivos antes desta unificação).
const CharacterInventory = require("../models/CharacterInventory");

async function addStack(idPersonagem, idItem, quantidade, transaction) {
  if (!(quantidade > 0)) return null;
  let entrada = await CharacterInventory.findOne({
    where: { id_personagem: idPersonagem, id_item: idItem },
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
  if (entrada) {
    entrada.quantidade += quantidade;
    await entrada.save({ transaction });
  } else {
    entrada = await CharacterInventory.create(
      { id_personagem: idPersonagem, id_item: idItem, quantidade },
      { transaction },
    );
  }
  return entrada;
}

async function removeStack(idPersonagem, idItem, quantidade, transaction) {
  const entrada = await CharacterInventory.findOne({
    where: { id_personagem: idPersonagem, id_item: idItem },
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
  if (!entrada || entrada.quantidade < quantidade) {
    throw Object.assign(new Error("Quantidade insuficiente no inventário."), { statusCode: 400 });
  }
  entrada.quantidade -= quantidade;
  if (entrada.quantidade <= 0) {
    await entrada.destroy({ transaction });
  } else {
    await entrada.save({ transaction });
  }
  return entrada;
}

module.exports = { addStack, removeStack };
