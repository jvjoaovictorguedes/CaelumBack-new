"use strict";

// Baseline: a tabela "Characters" já existe em produção, criada via
// sequelize.sync({alter:true}). Esta migration só formaliza o schema atual
// em versionamento — se a tabela já existir, não faz nada.
//
// Depende de "users", "Races" e "Classes" já existirem (por isso o
// timestamp deste arquivo vem depois dos três).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("Characters")) {
      console.log('[migration] Tabela "Characters" já existe — pulando criação.');
      return;
    }

    await queryInterface.createTable("Characters", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      id_usuario: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      nome: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      genero: {
        type: Sequelize.ENUM("Masculino", "Feminino"),
        allowNull: false,
      },
      nivel: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        allowNull: false,
      },
      experiencia: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      vida_atual: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      mana_atual: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      forca: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      vitalidade: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      agilidade: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      inteligencia: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      velocidade: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      dinheiro: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      pontos_distribuir: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: true,
      },
      reset: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: true,
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
        allowNull: true,
      },
      rank: {
        type: Sequelize.STRING(50),
        defaultValue: "F",
        allowNull: true,
      },
      id_raca: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Races", key: "id" },
      },
      id_classe: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Classes", key: "id" },
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
  },

  async down() {
    console.log(
      '[migration] down() de baseline é intencionalmente um no-op (não dropa "Characters" em produção).',
    );
  },
};
