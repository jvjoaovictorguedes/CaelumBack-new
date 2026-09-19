"use strict";

// Contagem de quantos inimigos de cada NOME o personagem já derrotou em
// PvE — pedido do jogador pra dar requisito de caça na árvore de
// Evolução de Classe (ex.: "150 Minotauros" pro Berserker). Incrementada
// em combatController.js sempre que um encontro PvE termina em vitória
// (mesma transação que credita XP/ouro/drop).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("character_monster_kills")) {
      console.log("[migration] Tabela character_monster_kills já existe — pulando.");
      return;
    }

    await queryInterface.createTable("character_monster_kills", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      id_personagem: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Characters", key: "id" },
        onDelete: "CASCADE",
      },
      nome_monstro: { type: Sequelize.STRING(100), allowNull: false },
      quantidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex("character_monster_kills", ["id_personagem", "nome_monstro"], {
      unique: true,
      name: "character_monster_kills_personagem_monstro_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("character_monster_kills");
  },
};
