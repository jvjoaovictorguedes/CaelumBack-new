"use strict";

// Cria 1 Item por combinação recurso+qualidade (até 6 por recurso) e
// liga em expedition_resource_items — a peça que deixa o backend
// achar "Ferro + Raro = Item 203" por ID, sem procurar por nome
// (ver §12 da especificação). tipo_item Material / disponivel_loja
// false: não aparecem na loja, só saem de expedição (e futuramente
// de forja/mercado, já que são Items normais).
const PREFIXO_POR_PROFISSAO = {
  Mineracao: "Fragmento de",
  Silvicultura: "Tronco de",
  Exploracao: "",
};

const QUALIDADES = ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"];
const NOME_EXIBICAO_QUALIDADE = {
  Comum: "Comum",
  Incomum: "Incomum",
  Raro: "Raro",
  Epico: "Épico",
  Lendario: "Lendário",
  Mitico: "Mítico",
};
const VALOR_VENDA_POR_QUALIDADE = {
  Comum: 3,
  Incomum: 10,
  Raro: 25,
  Epico: 80,
  Lendario: 250,
  Mitico: 800,
};

function nomeItem(profissao, nomeRecurso, qualidade) {
  const prefixo = PREFIXO_POR_PROFISSAO[profissao];
  const base = prefixo ? `${prefixo} ${nomeRecurso}` : nomeRecurso;
  return `${base} — ${NOME_EXIBICAO_QUALIDADE[qualidade]}`;
}

module.exports = {
  async up(queryInterface) {
    const [recursos] = await queryInterface.sequelize.query(
      `SELECT id, nome, profissao FROM expedition_resources;`,
    );

    for (const recurso of recursos) {
      for (const qualidade of QUALIDADES) {
        const [existenteVinculo] = await queryInterface.sequelize.query(
          `SELECT 1 FROM expedition_resource_items WHERE id_recurso = :idRecurso AND qualidade = :qualidade LIMIT 1;`,
          { replacements: { idRecurso: recurso.id, qualidade } },
        );
        if (existenteVinculo.length > 0) continue;

        const nome = nomeItem(recurso.profissao, recurso.nome, qualidade);
        const [existenteItem] = await queryInterface.sequelize.query(
          `SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`,
          { replacements: { nome } },
        );
        let idItem;
        if (existenteItem.length > 0) {
          idItem = existenteItem[0].id;
        } else {
          const [linhas] = await queryInterface.sequelize.query(
            `INSERT INTO "Items"
               (nome, descricao, tipo_item, raridade, valor_compra, valor_venda, peso, disponivel_loja, imagem_url, "createdAt", "updatedAt")
             VALUES
               (:nome, :descricao, 'Material', :qualidade, 0, :valorVenda, 0.1, false, '', now(), now())
             RETURNING id;`,
            {
              replacements: {
                nome,
                descricao: `Material coletado em expedições de ${recurso.profissao === "Mineracao" ? "mineração" : recurso.profissao === "Silvicultura" ? "silvicultura" : "exploração"}.`,
                qualidade,
                valorVenda: VALOR_VENDA_POR_QUALIDADE[qualidade],
              },
            },
          );
          idItem = linhas[0].id;
        }

        await queryInterface.sequelize.query(
          `INSERT INTO expedition_resource_items (id_recurso, qualidade, id_item, "createdAt", "updatedAt")
           VALUES (:idRecurso, :qualidade, :idItem, now(), now());`,
          { replacements: { idRecurso: recurso.id, qualidade, idItem } },
        );
      }
    }
  },

  async down() {},
};
