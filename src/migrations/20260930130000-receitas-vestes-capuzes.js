"use strict";

// Mesma lógica de 20260930080000-seed-crafting-recipes.js, só que pros
// 10 itens novos de Capuz/Vestes — usam a trilha "Protecao" (mesma dos
// outros Capacete/Armadura) já que a diferença deles é o bônus de
// atributo (Inteligência em vez de Força/Vitalidade), não o tipo de
// material que consomem pra forjar.
const TEMPO_E_CUSTO_POR_RARIDADE = {
  Comum: { tempo_segundos: 5 * 60, ouro: 20, qtd_trilha: 3, qtd_essencia: 1 },
  Incomum: { tempo_segundos: 20 * 60, ouro: 60, qtd_trilha: 4, qtd_essencia: 2 },
  Raro: { tempo_segundos: 60 * 60, ouro: 150, qtd_trilha: 5, qtd_essencia: 3 },
  Epico: { tempo_segundos: 4 * 60 * 60, ouro: 400, qtd_trilha: 6, qtd_essencia: 4 },
  Lendario: { tempo_segundos: 12 * 60 * 60, ouro: 1000, qtd_trilha: 8, qtd_essencia: 6 },
};

const MATERIAL_PROTECAO_POR_RARIDADE = {
  Comum: "Couro Cru",
  Incomum: "Placa de Ferro",
  Raro: "Fio de Prata Élfico",
  Epico: "Escama Sombria",
  Lendario: "Escama de Dragão",
};

const ESSENCIA_POR_RARIDADE = {
  Comum: "Fagulha da Forja",
  Incomum: "Brasa Viva",
  Raro: "Chama Élfica",
  Epico: "Chama Ancestral",
  Lendario: "Chama Eterna",
};

const ITENS = [
  "Capuz de Aprendiz", "Capuz Arcano", "Capuz do Adepto", "Capuz das Sombras", "Capuz Celestial",
  "Vestes de Aprendiz", "Vestes Arcanas", "Vestes do Adepto", "Vestes das Sombras", "Vestes Celestiais",
];

module.exports = {
  async up(queryInterface) {
    const [itens] = await queryInterface.sequelize.query(`SELECT id, nome, raridade FROM "Items";`);
    const itemPorNome = new Map(itens.map((item) => [item.nome, item]));

    for (const nomeItem of ITENS) {
      const item = itemPorNome.get(nomeItem);
      if (!item) {
        console.log(`[migration] Item "${nomeItem}" não encontrado — pulando receita.`);
        continue;
      }

      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM crafting_recipes WHERE id_item = :idItem LIMIT 1;`,
        { replacements: { idItem: item.id } },
      );
      if (existente.length > 0) {
        console.log(`[migration] Receita de "${nomeItem}" já existe — pulando.`);
        continue;
      }

      const config = TEMPO_E_CUSTO_POR_RARIDADE[item.raridade];
      const nomeMaterial = MATERIAL_PROTECAO_POR_RARIDADE[item.raridade];
      const nomeEssencia = ESSENCIA_POR_RARIDADE[item.raridade];
      const material = itemPorNome.get(nomeMaterial);
      const essencia = itemPorNome.get(nomeEssencia);
      if (!config || !material || !essencia) {
        console.log(`[migration] Config/material faltando pra "${nomeItem}" — pulando.`);
        continue;
      }

      const [linhas] = await queryInterface.sequelize.query(
        `INSERT INTO crafting_recipes (id_item, tempo_segundos, ouro_custo, "createdAt", "updatedAt")
         VALUES (:idItem, :tempoSegundos, :ouroCusto, now(), now())
         RETURNING id;`,
        { replacements: { idItem: item.id, tempoSegundos: config.tempo_segundos, ouroCusto: config.ouro } },
      );
      const idReceita = linhas[0].id;

      await queryInterface.sequelize.query(
        `INSERT INTO crafting_recipe_ingredients (id_receita, id_item_material, quantidade, "createdAt", "updatedAt")
         VALUES
           (:idReceita, :idMaterial, :qtdTrilha, now(), now()),
           (:idReceita, :idEssencia, :qtdEssencia, now(), now());`,
        {
          replacements: {
            idReceita,
            idMaterial: material.id,
            qtdTrilha: config.qtd_trilha,
            idEssencia: essencia.id,
            qtdEssencia: config.qtd_essencia,
          },
        },
      );
    }
  },

  async down(queryInterface) {
    const [itens] = await queryInterface.sequelize.query(
      `SELECT id FROM "Items" WHERE nome IN (:nomes);`,
      { replacements: { nomes: ITENS } },
    );
    const ids = itens.map((i) => i.id);
    if (ids.length > 0) {
      await queryInterface.sequelize.query(`DELETE FROM crafting_recipes WHERE id_item IN (:ids);`, {
        replacements: { ids },
      });
    }
  },
};
