"use strict";

// Auditoria de economia (pedido do jogador): a Evolução de Classe não
// custava ouro nenhum, só nível + relíquia + (desde a migration
// anterior) matar 150 monstros. Depois de fechar o vazamento do Portal
// de Ranque (maior fonte de ouro do jogo, ver 20260930570000), faz
// sentido dar um destino de peso pra esse ouro logo no ponto em que o
// personagem está mais rico (nível 40+, já farmou bastante) — um sink
// de alto valor bem posicionado, no exato "capstone" que acabou de
// ficar ~2.2x mais forte.
module.exports = {
  async up(queryInterface, Sequelize) {
    const descricao = await queryInterface.describeTable("class_evolution_paths");
    if (!descricao.custo_ouro) {
      await queryInterface.addColumn("class_evolution_paths", "custo_ouro", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    await queryInterface.sequelize.query(
      `UPDATE class_evolution_paths SET custo_ouro = 6000;`,
    );
  },

  async down(queryInterface) {
    const descricao = await queryInterface.describeTable("class_evolution_paths");
    if (descricao.custo_ouro) {
      await queryInterface.removeColumn("class_evolution_paths", "custo_ouro");
    }
  },
};
