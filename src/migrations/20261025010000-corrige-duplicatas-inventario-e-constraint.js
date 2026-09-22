"use strict";

// Bug real reportado por um jogador: a Forja mostrava "10000 fragmentos
// disponíveis" na tela (Fundição), mas ao tentar fundir vinha "tem 1".
//
// Causa raiz: addStack (inventoryService.js) fazia um "findOne -> se
// achou soma, se não achou cria" sem nenhum jeito de travar uma linha
// que AINDA NÃO EXISTE — lock de linha (FOR UPDATE) só serve pra linha
// que já existe. Duas concessões do MESMO item quase ao mesmo tempo
// (ex.: dois drops de Expedição em sequência rápida) podiam achar as
// duas "nenhuma linha ainda" e criar DUAS linhas em
// character_inventory pro mesmo (id_personagem, id_item) — nunca havia
// constraint nenhuma no banco impedindo isso.
//
// A tela de listagem (forgeSmeltingService.listarOpcoes) soma via um
// Map (favorece uma das linhas, não soma as duas) enquanto a fundição
// de verdade (forgeSmeltingService.fundir) faz um findOne isolado (pega
// só UMA das linhas, possivelmente a errada/menor) — daí o número
// mostrado na tela nunca bater com o que a ação realmente enxerga.
//
// Esta migration: (1) funde qualquer duplicata já existente em uma
// linha só, somando quantidade; (2) adiciona a constraint UNIQUE que
// impede o problema de voltar. addStack também foi reescrito (ver
// inventoryService.js) pra um upsert atômico de verdade.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
        WITH duplicadas AS (
          SELECT id_personagem, id_item, SUM(quantidade) AS total, MIN(id_personagem_inventario) AS linha_a_manter
          FROM character_inventory
          GROUP BY id_personagem, id_item
          HAVING COUNT(*) > 1
        )
        UPDATE character_inventory ci
        SET quantidade = d.total
        FROM duplicadas d
        WHERE ci.id_personagem_inventario = d.linha_a_manter;
        `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        WITH duplicadas AS (
          SELECT id_personagem, id_item, MIN(id_personagem_inventario) AS linha_a_manter
          FROM character_inventory
          GROUP BY id_personagem, id_item
          HAVING COUNT(*) > 1
        )
        DELETE FROM character_inventory ci
        USING duplicadas d
        WHERE ci.id_personagem = d.id_personagem
          AND ci.id_item = d.id_item
          AND ci.id_personagem_inventario <> d.linha_a_manter;
        `,
        { transaction },
      );

      await queryInterface.addConstraint("character_inventory", {
        fields: ["id_personagem", "id_item"],
        type: "unique",
        name: "character_inventory_personagem_item_unique",
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      "character_inventory",
      "character_inventory_personagem_item_unique",
    );
  },
};
