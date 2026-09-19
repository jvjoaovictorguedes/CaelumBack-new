"use strict";

// Requisito de caça pedido pelo jogador: além de nível + relíquia, cada
// caminho da árvore de Evolução de Classe agora também pode exigir
// derrotar N vezes um monstro específico (ver character_monster_kills) —
// ex.: Berserker pede 150 Minotauros. Campos nullable de propósito: um
// caminho sem essa exigência configurada (nome_monstro_alvo = NULL) se
// comporta exatamente como antes.
module.exports = {
  async up(queryInterface, Sequelize) {
    const descricao = await queryInterface.describeTable("class_evolution_paths");

    if (!descricao.nome_monstro_alvo) {
      await queryInterface.addColumn("class_evolution_paths", "nome_monstro_alvo", {
        type: Sequelize.STRING(100),
        allowNull: true,
      });
    }
    if (!descricao.quantidade_monstro_necessaria) {
      await queryInterface.addColumn("class_evolution_paths", "quantidade_monstro_necessaria", {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const descricao = await queryInterface.describeTable("class_evolution_paths");
    if (descricao.nome_monstro_alvo) {
      await queryInterface.removeColumn("class_evolution_paths", "nome_monstro_alvo");
    }
    if (descricao.quantidade_monstro_necessaria) {
      await queryInterface.removeColumn("class_evolution_paths", "quantidade_monstro_necessaria");
    }
  },
};
