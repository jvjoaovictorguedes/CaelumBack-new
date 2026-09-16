"use strict";

// Baseline: a tabela "Powers" já existe em produção, criada via
// sequelize.sync({alter:true}). Esta migration só formaliza o schema atual
// em versionamento — se a tabela já existir, não faz nada.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("Powers")) {
      console.log('[migration] Tabela "Powers" já existe — pulando criação.');
      return;
    }

    await queryInterface.createTable("Powers", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      nome: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      descricao: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      tipo_poder: {
        type: Sequelize.ENUM("Ativo", "Passivo"),
        allowNull: false,
      },
      custo_mana: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      dano_base: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: true,
      },
      cura_base: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: true,
      },
      efeito_status: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      duracao_efeito: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      cooldown: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      escala_atributo: {
        type: Sequelize.ENUM(
          "Forca",
          "Vitalidade",
          "Agilidade",
          "Inteligencia",
          "Velocidade",
        ),
        allowNull: false,
      },
      valor_escala: {
        type: Sequelize.FLOAT,
        defaultValue: 0.0,
        allowNull: false,
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
      '[migration] down() de baseline é intencionalmente um no-op (não dropa "Powers" em produção).',
    );
  },
};
