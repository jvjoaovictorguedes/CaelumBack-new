"use strict";

// Semeia 1 receita por item de equipamento já iconado (ver sessão de
// ícones customizados) — cada um pede materiais de uma "trilha"
// (Combate/Proteção/Arcana) na MESMA raridade do item final, mais um
// pouco de "Essência da Forja" (também na mesma raridade). Tempo e
// custo em ouro escalam junto com a raridade — Lendario é
// propositalmente o mais lento (12h), não tem como "forçar" um
// lendário rápido nem sorte envolvida: a receita é sempre a mesma pro
// mesmo item.
const TEMPO_E_CUSTO_POR_RARIDADE = {
  Comum: { tempo_segundos: 5 * 60, ouro: 20, qtd_trilha: 3, qtd_essencia: 1 },
  Incomum: { tempo_segundos: 20 * 60, ouro: 60, qtd_trilha: 4, qtd_essencia: 2 },
  Raro: { tempo_segundos: 60 * 60, ouro: 150, qtd_trilha: 5, qtd_essencia: 3 },
  Epico: { tempo_segundos: 4 * 60 * 60, ouro: 400, qtd_trilha: 6, qtd_essencia: 4 },
  Lendario: { tempo_segundos: 12 * 60 * 60, ouro: 1000, qtd_trilha: 8, qtd_essencia: 6 },
};

const TRILHA_MATERIAL = {
  Combate: {
    Comum: "Presa de Lobo",
    Incomum: "Minério Bruto",
    Raro: "Aço Rúnico",
    Epico: "Cristal de Guerra",
    Lendario: "Núcleo de Dragão",
  },
  Protecao: {
    Comum: "Couro Cru",
    Incomum: "Placa de Ferro",
    Raro: "Fio de Prata Élfico",
    Epico: "Escama Sombria",
    Lendario: "Escama de Dragão",
  },
  Arcana: {
    Comum: "Pó Brilhante",
    Incomum: "Gema Menor",
    Raro: "Essência Élfica",
    Epico: "Fragmento Sombrio",
    Lendario: "Coração de Fogo",
  },
};

const ESSENCIA_POR_RARIDADE = {
  Comum: "Fagulha da Forja",
  Incomum: "Brasa Viva",
  Raro: "Chama Élfica",
  Epico: "Chama Ancestral",
  Lendario: "Chama Eterna",
};

// [nome do item final, trilha de material que ele usa]
const RECEITAS = [
  ["Elmo de Couro", "Protecao"],
  ["Elmo de Ferro", "Protecao"],
  ["Diadema Élfico", "Protecao"],
  ["Elmo Sombrio", "Protecao"],
  ["Elmo Dracônico", "Protecao"],
  ["Escudo de Madeira", "Combate"],
  ["Escudo de Ferro", "Combate"],
  ["Escudo do Guardião", "Combate"],
  ["Bastião Inabalável", "Combate"],
  ["Escudo do Último Baluarte", "Combate"],
  ["Peitoral de Couro", "Protecao"],
  ["Peitoral de Ferro", "Protecao"],
  ["Manto Élfico", "Protecao"],
  ["Peitoral Sombrio", "Protecao"],
  ["Peitoral Dracônico", "Protecao"],
  ["Botas de Couro", "Protecao"],
  ["Botas de Ferro", "Protecao"],
  ["Botas Élficas", "Protecao"],
  ["Botas Sombrias", "Protecao"],
  ["Botas Dracônicas", "Protecao"],
  ["Espada Curta de Bronze", "Combate"],
  ["Espada de Ferro", "Combate"],
  ["Espada Élfica", "Combate"],
  ["Espada do Rei Adormecido", "Combate"],
  ["Cajado do Aprendiz", "Combate"],
  ["Cajado Sussurrante", "Combate"],
  ["Cajado do Arquimago", "Combate"],
  ["Cajado das Mil Tempestades", "Combate"],
  ["Anel de Couro", "Arcana"],
  ["Anel Cravejado", "Arcana"],
  ["Anel Flamejante", "Arcana"],
  ["Anel do Rei Dracônico", "Arcana"],
  ["Colar de Cobre", "Arcana"],
  ["Colar do Guardião", "Arcana"],
  ["Colar em Chamas", "Arcana"],
  ["Colar do Cristal Eterno", "Arcana"],
];

module.exports = {
  async up(queryInterface) {
    const [itens] = await queryInterface.sequelize.query(`SELECT id, nome, raridade FROM "Items";`);
    const itemPorNome = new Map(itens.map((item) => [item.nome, item]));

    for (const [nomeItem, trilha] of RECEITAS) {
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
      if (!config) {
        console.log(`[migration] Raridade "${item.raridade}" sem tabela de custo — pulando "${nomeItem}".`);
        continue;
      }

      const nomeMaterialTrilha = TRILHA_MATERIAL[trilha][item.raridade];
      const nomeEssencia = ESSENCIA_POR_RARIDADE[item.raridade];
      const materialTrilha = itemPorNome.get(nomeMaterialTrilha);
      const essencia = itemPorNome.get(nomeEssencia);
      if (!materialTrilha || !essencia) {
        console.log(`[migration] Materiais da trilha "${trilha}"/"${item.raridade}" não encontrados — pulando "${nomeItem}".`);
        continue;
      }

      const [linhas] = await queryInterface.sequelize.query(
        `INSERT INTO crafting_recipes (id_item, tempo_segundos, ouro_custo, "createdAt", "updatedAt")
         VALUES (:idItem, :tempoSegundos, :ouroCusto, now(), now())
         RETURNING id;`,
        {
          replacements: {
            idItem: item.id,
            tempoSegundos: config.tempo_segundos,
            ouroCusto: config.ouro,
          },
        },
      );
      const idReceita = linhas[0].id;

      await queryInterface.sequelize.query(
        `INSERT INTO crafting_recipe_ingredients (id_receita, id_item_material, quantidade, "createdAt", "updatedAt")
         VALUES
           (:idReceita, :idMaterialTrilha, :qtdTrilha, now(), now()),
           (:idReceita, :idEssencia, :qtdEssencia, now(), now());`,
        {
          replacements: {
            idReceita,
            idMaterialTrilha: materialTrilha.id,
            qtdTrilha: config.qtd_trilha,
            idEssencia: essencia.id,
            qtdEssencia: config.qtd_essencia,
          },
        },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("crafting_recipes", null);
  },
};
