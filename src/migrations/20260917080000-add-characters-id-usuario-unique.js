"use strict";

// Cada conta só deveria ter um personagem (é assim que login/
// character-session e o controller de criação já tratam o jogo), mas
// isso nunca foi garantido no banco — só por uma checagem no
// controller, vulnerável a corrida entre dois creates simultâneos pra
// mesma conta. Antes de travar com UNIQUE, precisa lidar com qualquer
// duplicata que já exista: mantém o personagem mais antigo (menor id)
// de cada usuário e apaga o que depende dos demais (descoberto
// dinamicamente, em vez de uma lista fixa de tabelas que fica
// desatualizada conforme o jogo cresce) antes de apagar os próprios
// personagens duplicados.
module.exports = {
  async up(queryInterface, Sequelize) {
    const indices = await queryInterface.showIndex("Characters").catch(() => []);
    const jaTemUnique = indices.some(
      (indice) =>
        indice.unique && indice.fields?.some((campo) => campo.attribute === "id_usuario"),
    );
    if (jaTemUnique) {
      console.log('[migration] UNIQUE em "Characters"."id_usuario" já existe — pulando.');
      return;
    }

    const duplicados = await queryInterface.sequelize.query(
      `
        SELECT id_usuario, array_agg(id ORDER BY id) AS ids
        FROM "Characters"
        GROUP BY id_usuario
        HAVING COUNT(*) > 1;
      `,
      { type: Sequelize.QueryTypes.SELECT },
    );

    if (duplicados.length > 0) {
      const idsParaRemover = duplicados.flatMap((linha) => linha.ids.slice(1));
      console.warn(
        `[migration] Encontrados ${duplicados.length} usuário(s) com mais de um personagem. ` +
          `Mantendo o personagem mais antigo de cada um e removendo os IDs: ${idsParaRemover.join(", ")}.`,
      );

      // Descobre dinamicamente toda tabela com uma coluna que referencie
      // Characters(id) (via FK de verdade OU convenção de nome
      // id_personagem/id_vencedor/id_perdedor) e limpa as linhas órfãs
      // antes de apagar os personagens duplicados — sem isso, o DELETE
      // final falharia por violação de foreign key (ou deixaria lixo
      // órfão, se a FK nem existir).
      const tabelas = await queryInterface.sequelize.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`,
        { type: Sequelize.QueryTypes.SELECT },
      );

      for (const { table_name: tabela } of tabelas) {
        if (tabela === "Characters") continue;

        const colunas = await queryInterface.describeTable(tabela).catch(() => null);
        if (!colunas) continue;

        const colunasPersonagem = Object.keys(colunas).filter((coluna) =>
          /^id_personagem$|_personagem$|^id_vencedor$|^id_perdedor$/i.test(coluna),
        );

        for (const coluna of colunasPersonagem) {
          await queryInterface.sequelize.query(
            `DELETE FROM "${tabela}" WHERE "${coluna}" = ANY(:ids);`,
            { replacements: { ids: idsParaRemover } },
          );
        }
      }

      await queryInterface.sequelize.query(`DELETE FROM "Characters" WHERE id = ANY(:ids);`, {
        replacements: { ids: idsParaRemover },
      });
    }

    await queryInterface.addConstraint("Characters", {
      fields: ["id_usuario"],
      type: "unique",
      name: "characters_id_usuario_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint("Characters", "characters_id_usuario_unique");
  },
};
