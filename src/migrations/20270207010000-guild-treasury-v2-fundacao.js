"use strict";

// Tesouro da Guilda V2 (spec "Tesouro da Guilda V2 + Contribuição V2")
// — Armazém de itens compartilhado, separado do Tesouro de ouro já
// existente (Guild.tesouro/GuildTreasuryTransaction, preservados sem
// alteração de significado — §22.1 da spec). Três tabelas novas:
//
// GuildTreasuryStack — estoque de itens EMPILHÁVEIS (mesma semântica de
// CharacterInventory: chave é id_item, nunca nome/raridade textual).
//
// GuildTreasuryEquipmentInstance — representação de uma instância de
// equipamento/ferramenta ENQUANTO ela pertence ao Tesouro. Tabela
// própria (não um id_personagem nullable em CharacterEquipmentInstance)
// de propósito — a spec pede explicitamente evitar esse impacto no
// sistema de equipamentos atual.
//
// GuildTreasuryItemTransaction — ledger imutável (updatedAt: false,
// sem endpoint de editar/apagar) com snapshot de nome/raridade/
// refinamento, pra o histórico continuar legível mesmo se o Item for
// renomeado/balanceado depois.
module.exports = {
  async up(queryInterface, Sequelize) {
    // Nova permissão configurável (guildPermissionService.js) — quem
    // pode RETIRAR do Armazém (depositar não exige permissão nenhuma,
    // qualquer membro pode).
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_GuildRolePermissions_permissao" ADD VALUE IF NOT EXISTS 'retirar_itens_tesouro';`,
    );

    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("GuildTreasuryStacks")) {
      await queryInterface.createTable("GuildTreasuryStacks", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_guild: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Guilds", key: "id" },
          onDelete: "CASCADE",
        },
        id_item: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
        quantidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      });
      await queryInterface.addConstraint("GuildTreasuryStacks", {
        fields: ["id_guild", "id_item"],
        type: "unique",
        name: "guild_treasury_stacks_id_guild_id_item_unique",
      });
      await queryInterface.addConstraint("GuildTreasuryStacks", {
        fields: ["quantidade"],
        type: "check",
        name: "guild_treasury_stacks_quantidade_nao_negativa",
        where: { quantidade: { [Sequelize.Op.gte]: 0 } },
      });
    }

    if (!tabelas.includes("GuildTreasuryEquipmentInstances")) {
      await queryInterface.createTable("GuildTreasuryEquipmentInstances", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_guild: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Guilds", key: "id" },
          onDelete: "CASCADE",
        },
        id_item: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
        raridade: {
          type: Sequelize.ENUM("Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"),
          allowNull: true,
        },
        refinamento: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        // Nullable + SET NULL: a instância no Tesouro é patrimônio da
        // GUILDA, não do personagem que depositou — sobrevive à exclusão
        // da conta de quem depositou (mesma política histórica já usada
        // em GuildLog/claims, §10/§12.6 da spec).
        depositado_por: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "Characters", key: "id" },
          onDelete: "SET NULL",
        },
        depositado_em: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      });
      await queryInterface.addIndex("GuildTreasuryEquipmentInstances", ["id_guild"]);
    }

    if (!tabelas.includes("GuildTreasuryItemTransactions")) {
      await queryInterface.createTable("GuildTreasuryItemTransactions", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_guild: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Guilds", key: "id" },
          onDelete: "CASCADE",
        },
        // Nullable + SET NULL (mesmo motivo de depositado_por acima) —
        // o ledger é patrimônio/auditoria da GUILDA, sobrevive à
        // exclusão de quem fez a movimentação; item_nome_snapshot
        // abaixo garante que a linha continua legível de qualquer jeito.
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "Characters", key: "id" },
          onDelete: "SET NULL",
        },
        operation: { type: Sequelize.ENUM("DEPOSITO", "RETIRADA"), allowNull: false },
        id_item: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
        // SEM foreign key de propósito: numa retirada de equipamento, a
        // linha de GuildTreasuryEquipmentInstance referenciada aqui é
        // removida na MESMA transaction que grava este ledger (spec
        // §9.4) — uma FK travaria ou exigiria DEFERRABLE só por causa
        // disso. O ledger é intencionalmente uma cópia/snapshot, não uma
        // relação viva.
        id_treasury_equipment_instance: { type: Sequelize.INTEGER, allowNull: true },
        quantidade: { type: Sequelize.INTEGER, allowNull: true },
        item_nome_snapshot: { type: Sequelize.STRING(120), allowNull: false },
        raridade_snapshot: {
          type: Sequelize.ENUM("Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"),
          allowNull: true,
        },
        refinamento_snapshot: { type: Sequelize.INTEGER, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      });
      await queryInterface.addIndex("GuildTreasuryItemTransactions", ["id_guild", "createdAt"]);
      await queryInterface.addIndex("GuildTreasuryItemTransactions", ["id_guild", "id_item"]);
      await queryInterface.addIndex("GuildTreasuryItemTransactions", ["id_guild", "id_personagem"]);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("GuildTreasuryItemTransactions");
    await queryInterface.dropTable("GuildTreasuryEquipmentInstances");
    await queryInterface.dropTable("GuildTreasuryStacks");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_GuildTreasuryItemTransactions_operation";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_GuildTreasuryItemTransactions_raridade_snapshot";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_GuildTreasuryEquipmentInstances_raridade";');
    // Nota: igual a toda migration anterior que adiciona valor de ENUM
    // (ex.: 20261026410000) — Postgres não permite remover um valor de
    // ENUM sem recriar o tipo inteiro. "retirar_itens_tesouro" permanece
    // no enum_GuildRolePermissions_permissao do banco mesmo após o
    // down(); sem efeito prático sem as tabelas acima.
  },
};
