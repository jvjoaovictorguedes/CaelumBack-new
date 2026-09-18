"use strict";

// ETAPA 1 (progressão da Forja) + ETAPA 2 (instâncias de equipamento) da
// Forja v3. Idempotente via showAllTables()/describeTable, como as
// migrations anteriores do projeto.
//
// Decisão de arquitetura (documentada no relatório final): NÃO
// migramos os equipamentos já existentes (drop/loja/mercado/Forja v2)
// pra dentro de character_equipment_instances. O sistema de inventário/
// loja/mercado/equipar do jogo inteiro hoje é construído em cima de
// "id_item empilhável em CharacterInventory", e converter TODO
// equipamento já possuído por TODO jogador pra instâncias individuais
// não-empilháveis exigiria reescrever loja, mercado P2P, drop e as telas
// de inventário/equipamento no mesmo golpe — risco alto de perda/
// corrupção de dados de jogadores reais por uma migration irreversível,
// pra um sistema (refinamento) que só faz sentido pra quem passar pela
// Forja v3 de qualquer forma. Instâncias são criadas SÓ para
// equipamentos que saem da nova Fabricação — equipamento antigo continua
// exatamente como está (implicitamente "sem refinamento", igual sempre
// foi). `character_equipment.id_instancia` fica nullable: null continua
// funcionando 100% como antes (aponta só pra id_item); quando setado,
// aponta pra uma instância com refinamento própria.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("character_forge_progress")) {
      await queryInterface.createTable("character_forge_progress", {
        id_personagem: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        nivel: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        experiencia: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("character_equipment_instances")) {
      await queryInterface.createTable("character_equipment_instances", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        id_item: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
        refinamento: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        // null = a instância está "solta" no inventário (não equipada em
        // nenhum slot) — evita precisar de uma tabela de junção separada
        // só pra saber se está guardada ou equipada.
        equipada: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    const colunasEquipamento = await queryInterface.describeTable("character_equipment");
    if (!colunasEquipamento.id_instancia) {
      await queryInterface.addColumn("character_equipment", "id_instancia", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "character_equipment_instances", key: "id" },
        onDelete: "SET NULL",
      });
    }
  },

  async down(queryInterface) {
    const colunasEquipamento = await queryInterface.describeTable("character_equipment");
    if (colunasEquipamento.id_instancia) {
      await queryInterface.removeColumn("character_equipment", "id_instancia");
    }
    await queryInterface.dropTable("character_equipment_instances");
    await queryInterface.dropTable("character_forge_progress");
  },
};
