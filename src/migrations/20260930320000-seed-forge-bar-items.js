"use strict";

// Gera as Barras (Item, tipo_item=Material) pra cada recurso de
// Mineração x qualidade, e os vínculos forge_bar_items — mesmo padrão
// (nunca resolver por nome) e mesmos valores de venda já usados em
// 20260930220000-seed-expedition-items.js (CaelumBack-new), pra manter
// a mesma régua econômica entre fragmento e barra.
const QUALIDADES = ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"];
const NOME_EXIBICAO_QUALIDADE = { Comum: "Comum", Incomum: "Incomum", Raro: "Raro", Epico: "Épico", Lendario: "Lendário", Mitico: "Mítico" };
const VALOR_VENDA_POR_QUALIDADE = { Comum: 5, Incomum: 15, Raro: 40, Epico: 120, Lendario: 350, Mitico: 1000 };

function nomeBarra(nomeRecurso, qualidade) {
  return `Barra de ${nomeRecurso} — ${NOME_EXIBICAO_QUALIDADE[qualidade]}`;
}

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id_recurso FROM forge_bar_items LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Barras da Forja já existem — pulando.");
      return;
    }

    const [recursosMineracao] = await queryInterface.sequelize.query(
      `SELECT id, nome FROM expedition_resources WHERE profissao = 'Mineracao' ORDER BY id;`,
    );

    for (const recurso of recursosMineracao) {
      for (const qualidade of QUALIDADES) {
        const nome = nomeBarra(recurso.nome, qualidade);

        const [[itemExistente]] = await queryInterface.sequelize.query(
          `SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`,
          { replacements: { nome } },
        );

        let idItem = itemExistente?.id;
        if (!idItem) {
          const [[itemCriado]] = await queryInterface.sequelize.query(
            `INSERT INTO "Items" (nome, descricao, tipo_item, raridade, valor_compra, valor_venda, peso, "disponivel_loja", "createdAt", "updatedAt")
             VALUES (:nome, :descricao, 'Material', :raridade, 0, :valor_venda, 0.3, false, now(), now())
             RETURNING id;`,
            {
              replacements: {
                nome,
                descricao: `Barra de ${recurso.nome} fundida na Forja, qualidade ${NOME_EXIBICAO_QUALIDADE[qualidade]}. Usada em receitas de Fabricação.`,
                raridade: qualidade,
                valor_venda: VALOR_VENDA_POR_QUALIDADE[qualidade],
              },
            },
          );
          idItem = itemCriado.id;
        }

        await queryInterface.sequelize.query(
          `INSERT INTO forge_bar_items (id_recurso, qualidade, id_item)
           VALUES (:id_recurso, :qualidade, :id_item)
           ON CONFLICT (id_recurso, qualidade) DO NOTHING;`,
          { replacements: { id_recurso: recurso.id, qualidade, id_item: idItem } },
        );
      }
    }

    const [[{ count }]] = await queryInterface.sequelize.query(`SELECT count(*) FROM forge_bar_items;`);
    console.log(`[migration] ${count} barras vinculadas em forge_bar_items.`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DELETE FROM forge_bar_items;`);
  },
};
