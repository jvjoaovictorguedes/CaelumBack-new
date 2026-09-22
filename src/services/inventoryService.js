// Service central de posse pra itens EMPILHÁVEIS (Materiais/
// Consumíveis/Espólios/QuestItem/Currências — spec Inventário v2 §4) em
// CharacterInventory. Único ponto que soma/subtrai quantidade, pra
// nenhum controller reimplementar "acha ou cria a linha e some" (era
// duplicado em pelo menos 6 arquivos antes desta unificação).
const { sequelize } = require("../config/database");
const { QueryTypes } = require("sequelize");
const CharacterInventory = require("../models/CharacterInventory");

// UPSERT atômico de verdade (INSERT ... ON CONFLICT), não um "findOne ->
// soma ou cria" em dois passos: um lock de linha (FOR UPDATE) só protege
// uma linha que JÁ EXISTE — duas chamadas concorrentes pro MESMO item
// (ex.: dois drops de Expedição chegando quase juntos) podiam achar as
// duas "nenhuma linha ainda" e criar DUAS linhas pro mesmo
// (id_personagem, id_item), cada uma com metade da quantidade. Bug real
// reportado por um jogador: a Forja mostrava um total (que soma tudo
// que existir pro item) mas fundir só enxergava UMA das linhas
// duplicadas — números diferentes pra "a mesma coisa" na tela. A
// constraint UNIQUE em (id_personagem, id_item) (ver migration
// 20261025010000) é o que faz o ON CONFLICT abaixo funcionar; sem ela
// isto seria um INSERT comum, sujeito ao mesmo problema.
async function addStack(idPersonagem, idItem, quantidade, transaction) {
  if (!(quantidade > 0)) return null;
  const [entrada] = await sequelize.query(
    `INSERT INTO character_inventory (id_personagem, id_item, quantidade)
     VALUES (:idPersonagem, :idItem, :quantidade)
     ON CONFLICT (id_personagem, id_item)
     DO UPDATE SET quantidade = character_inventory.quantidade + EXCLUDED.quantidade
     RETURNING *;`,
    {
      replacements: { idPersonagem, idItem, quantidade },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
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
