"use strict";

// Pergaminhos de Refinamento (§36-42) — sempre exigem material Mítico de
// Silvicultura (Tronco) e, pra variar, também de Exploração, valorizando
// as duas profissões junto com a Forja de alto nível (§41/§42).
// Diferente dos blueprints (que têm qualidade variável escolhida pelo
// jogador), o pergaminho é uma receita FIXA — sempre os mesmos
// ingredientes Míticos, sem RNG de qualidade — por isso usa sua própria
// tabelinha (forge_scrolls/forge_scroll_ingredients) em vez de reaproveitar
// forge_blueprint_ingredients (que resolve ingrediente por qualidade
// escolhida, o que não se aplica aqui).
const PERGAMINHOS = [
  {
    nome: "Pergaminho do Aprimoramento",
    bonus_percentual: 5,
    nivel_forja_minimo: 4,
    tempo_segundos: 20 * 60,
    ingredientes: [
      { nomeRecursoMitico: "Carvalho", quantidade: 1 }, // Tronco Mítico (Silvicultura)
      { nomeRecursoMitico: "Erva Medicinal", quantidade: 2, qualidadeAlternativa: "Epico" }, // materiais Épicos de Exploração
    ],
  },
  {
    nome: "Pergaminho do Mestre Ferreiro",
    bonus_percentual: 10,
    nivel_forja_minimo: 7,
    tempo_segundos: 45 * 60,
    ingredientes: [
      { nomeRecursoMitico: "Madeira Dracônica", quantidade: 1 }, // recurso avançado de Silvicultura, Mítico
      { nomeRecursoMitico: "Fruto Místico", quantidade: 2, qualidadeAlternativa: "Lendario" }, // Lendário de Exploração
    ],
  },
  {
    nome: "Pergaminho da Forja Celestial",
    bonus_percentual: 15,
    nivel_forja_minimo: 10,
    tempo_segundos: 90 * 60,
    ingredientes: [
      { nomeRecursoMitico: "Árvore Celestial", quantidade: 2 }, // 2x Tronco de Árvore Celestial Mítico
      { nomeRecursoMitico: "Essência Celestial", quantidade: 1 }, // Essência Celestial Mítica
    ],
  },
];

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id_item FROM forge_scrolls LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Pergaminhos já existem — pulando.");
      return;
    }

    for (const pergaminho of PERGAMINHOS) {
      const [[itemCriado]] = await queryInterface.sequelize.query(
        `INSERT INTO "Items" (nome, descricao, tipo_item, raridade, valor_compra, valor_venda, peso, "disponivel_loja", "createdAt", "updatedAt")
         VALUES (:nome, :descricao, 'Consumivel', 'Lendario', 0, :valor_venda, 0.1, false, now(), now())
         RETURNING id;`,
        {
          replacements: {
            nome: pergaminho.nome,
            descricao: `Consumido numa tentativa de Refinamento pra somar +${pergaminho.bonus_percentual}% de chance de sucesso — sempre gasto, mesmo em falha. Só 1 pergaminho por tentativa.`,
            valor_venda: pergaminho.bonus_percentual * 200,
          },
        },
      );
      const idItemPergaminho = itemCriado.id;

      await queryInterface.sequelize.query(
        `INSERT INTO forge_scrolls (id_item, bonus_percentual, nivel_forja_minimo, tempo_segundos)
         VALUES (:id_item, :bonus, :nivel_minimo, :tempo);`,
        {
          replacements: {
            id_item: idItemPergaminho,
            bonus: pergaminho.bonus_percentual,
            nivel_minimo: pergaminho.nivel_forja_minimo,
            tempo: pergaminho.tempo_segundos,
          },
        },
      );

      for (const ingrediente of pergaminho.ingredientes) {
        const qualidade = ingrediente.qualidadeAlternativa ?? "Mitico";
        const [[recurso]] = await queryInterface.sequelize.query(
          `SELECT id FROM expedition_resources WHERE nome = :nome LIMIT 1;`,
          { replacements: { nome: ingrediente.nomeRecursoMitico } },
        );
        if (!recurso) {
          throw new Error(`Recurso "${ingrediente.nomeRecursoMitico}" não encontrado pra pergaminho "${pergaminho.nome}".`);
        }

        // Tronco/recurso de Silvicultura resolvido via forge_bar_items só
        // vale pra Mineração — recursos de Silvicultura/Exploração usam
        // direto expedition_resource_items (mesma tabela que a Expedição
        // já usa pra dar o item concreto por qualidade).
        const [[vinculo]] = await queryInterface.sequelize.query(
          `SELECT id_item FROM expedition_resource_items WHERE id_recurso = :id_recurso AND qualidade = :qualidade LIMIT 1;`,
          { replacements: { id_recurso: recurso.id, qualidade } },
        );
        if (!vinculo) {
          throw new Error(
            `Sem Item de "${ingrediente.nomeRecursoMitico}" (${qualidade}) pra pergaminho "${pergaminho.nome}".`,
          );
        }

        await queryInterface.sequelize.query(
          `INSERT INTO forge_scroll_ingredients (id_scroll_item, id_item_material, quantidade)
           VALUES (:id_scroll_item, :id_item_material, :quantidade);`,
          {
            replacements: {
              id_scroll_item: idItemPergaminho,
              id_item_material: vinculo.id_item,
              quantidade: ingrediente.quantidade,
            },
          },
        );
      }
    }

    console.log(`[migration] ${PERGAMINHOS.length} pergaminhos criados.`);
  },

  async down(queryInterface) {
    const [pergaminhos] = await queryInterface.sequelize.query(
      `SELECT id_item FROM forge_scrolls;`,
    );
    const ids = pergaminhos.map((p) => p.id_item);
    if (ids.length === 0) return;
    await queryInterface.sequelize.query(`DELETE FROM forge_scroll_ingredients WHERE id_scroll_item IN (${ids.join(",")});`);
    await queryInterface.sequelize.query(`DELETE FROM forge_scrolls WHERE id_item IN (${ids.join(",")});`);
    await queryInterface.sequelize.query(`DELETE FROM "Items" WHERE id IN (${ids.join(",")});`);
  },
};
