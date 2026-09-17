"use strict";

// Base do sistema de "evoluções" — hoje só o Mago, condicionado à
// natureza mágica sorteada no personagem (ver naturezaMagicaService.js).
// Cada evolução pertence a uma classe + natureza mágica específicas, tem
// um pré-requisito opcional (outra evolução, formando uma árvore/linha
// de evolução) e concede, na compra: um poder (id_power_concedido,
// opcional) e/ou bônus permanente de atributo. `ordem` é só pra exibição
// (posição dentro do mesmo nível da árvore), não afeta regra nenhuma.
//
// A feature nasce sem nenhum dado (nenhum seeder aqui) — as evoluções de
// verdade entram depois, uma a uma, via POST /evolutions (admin), quando
// o design de cada uma estiver definido. Ver também o comentário em
// EvolutionsPanel.tsx (front) sobre a aba ficar oculta até lá.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("evolutions")) {
      await queryInterface.createTable("evolutions", {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        nome: {
          type: Sequelize.STRING(100),
          allowNull: false,
        },
        descricao: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        id_classe: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Classes", key: "id" },
          onDelete: "CASCADE",
        },
        natureza_magica: {
          type: Sequelize.ENUM(
            "Fogo",
            "Agua",
            "Terra",
            "Ar",
            "Luz",
            "Escuridao",
            "Raio",
            "Yin&Yang",
          ),
          allowNull: false,
        },
        nivel_necessario: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
        },
        custo: {
          type: Sequelize.INTEGER,
          allowNull: false,
          validate: { min: 0 },
        },
        bonus_forca: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        bonus_vitalidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        bonus_agilidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        bonus_inteligencia: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        bonus_velocidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        id_power_concedido: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "Powers", key: "id" },
        },
        id_evolucao_pre_requisito: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "evolutions", key: "id" },
        },
        ordem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        imagem_url: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
        },
      });
    }

    if (!tabelas.includes("character_evolutions")) {
      await queryInterface.createTable("character_evolutions", {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        id_evolucao: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "evolutions", key: "id" },
          onDelete: "CASCADE",
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
        },
      });

      await queryInterface.addConstraint("character_evolutions", {
        fields: ["id_personagem", "id_evolucao"],
        type: "unique",
        name: "character_evolutions_personagem_evolucao_unique",
      });
    }
  },

  async down(queryInterface) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("character_evolutions")) {
      await queryInterface.dropTable("character_evolutions");
    }
    if (tabelas.includes("evolutions")) {
      await queryInterface.dropTable("evolutions");
    }
  },
};
