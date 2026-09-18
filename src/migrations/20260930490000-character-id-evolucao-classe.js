"use strict";

// Troca o booleano classe_evoluida (1 evolução fixa por classe) pela FK
// id_evolucao_classe (qual dos 3 caminhos da árvore o personagem
// escolheu — ver 20260930480000). Quem já tinha classe_evoluida=true
// (só existia em ambiente de teste até aqui) migra pro primeiro caminho
// (ordem=1) da própria classe, pra não "perder" a evolução; num jogo em
// produção de verdade isso precisaria de uma escolha manual do jogador,
// mas não há como inferir qual caminho ele teria escolhido.
module.exports = {
  async up(queryInterface, Sequelize) {
    const descricao = await queryInterface.describeTable("Characters");

    if (!descricao.id_evolucao_classe) {
      await queryInterface.addColumn("Characters", "id_evolucao_classe", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "class_evolution_paths", key: "id" },
      });
    }

    if (descricao.classe_evoluida) {
      const [personagensEvoluidos] = await queryInterface.sequelize.query(
        `SELECT c.id, c.id_classe FROM "Characters" c WHERE c.classe_evoluida = true;`,
      );
      for (const personagem of personagensEvoluidos) {
        const [[caminho]] = await queryInterface.sequelize.query(
          `SELECT id FROM class_evolution_paths WHERE id_classe = :id_classe ORDER BY ordem ASC LIMIT 1;`,
          { replacements: { id_classe: personagem.id_classe } },
        );
        if (caminho) {
          await queryInterface.sequelize.query(
            `UPDATE "Characters" SET id_evolucao_classe = :id_caminho WHERE id = :id_personagem;`,
            { replacements: { id_caminho: caminho.id, id_personagem: personagem.id } },
          );
        }
      }

      await queryInterface.removeColumn("Characters", "classe_evoluida");
    }
  },

  async down(queryInterface, Sequelize) {
    const descricao = await queryInterface.describeTable("Characters");

    if (!descricao.classe_evoluida) {
      await queryInterface.addColumn("Characters", "classe_evoluida", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
      await queryInterface.sequelize.query(
        `UPDATE "Characters" SET classe_evoluida = true WHERE id_evolucao_classe IS NOT NULL;`,
      );
    }

    if (descricao.id_evolucao_classe) {
      await queryInterface.removeColumn("Characters", "id_evolucao_classe");
    }
  },
};
