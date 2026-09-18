"use strict";

// Ícones novos pros 8 recursos de Mineração — 1 imagem de fragmento
// (pedra bruta) e 1 de barra (fundida) por recurso, reaproveitada nas
// 6 qualidades de cada (a raridade já é comunicada pela borda colorida
// na UI, não precisa de uma arte por qualidade).
const MAPA_RECURSO_PARA_ARQUIVO = {
  Ferro: "ferro",
  Cobre: "cobre",
  Prata: "prata",
  Ouro: "ouro",
  "Cristal de Mana": "cristal-de-mana",
  Obsidiana: "obsidiana",
  Astralita: "astralita",
  "Minério Celestial": "minerio-celestial",
};

module.exports = {
  async up(queryInterface) {
    for (const [nomeRecurso, slug] of Object.entries(MAPA_RECURSO_PARA_ARQUIVO)) {
      const [[recurso]] = await queryInterface.sequelize.query(
        `SELECT id FROM expedition_resources WHERE nome = :nome AND profissao = 'Mineracao' LIMIT 1;`,
        { replacements: { nome: nomeRecurso } },
      );
      if (!recurso) {
        console.log(`[migration] Recurso "${nomeRecurso}" não encontrado — pulando.`);
        continue;
      }

      await queryInterface.sequelize.query(
        `UPDATE "Items" SET imagem_url = :url
         WHERE id IN (SELECT id_item FROM expedition_resource_items WHERE id_recurso = :id_recurso);`,
        { replacements: { url: `/icons/mineracao/${slug}-fragmento.png`, id_recurso: recurso.id } },
      );

      await queryInterface.sequelize.query(
        `UPDATE "Items" SET imagem_url = :url
         WHERE id IN (SELECT id_item FROM forge_bar_items WHERE id_recurso = :id_recurso);`,
        { replacements: { url: `/icons/mineracao/${slug}-barra.png`, id_recurso: recurso.id } },
      );
    }
    console.log("[migration] Ícones de minério aplicados.");
  },

  async down(queryInterface) {
    for (const nomeRecurso of Object.keys(MAPA_RECURSO_PARA_ARQUIVO)) {
      const [[recurso]] = await queryInterface.sequelize.query(
        `SELECT id FROM expedition_resources WHERE nome = :nome AND profissao = 'Mineracao' LIMIT 1;`,
        { replacements: { nome: nomeRecurso } },
      );
      if (!recurso) continue;
      await queryInterface.sequelize.query(
        `UPDATE "Items" SET imagem_url = NULL
         WHERE id IN (SELECT id_item FROM expedition_resource_items WHERE id_recurso = :id_recurso)
            OR id IN (SELECT id_item FROM forge_bar_items WHERE id_recurso = :id_recurso);`,
        { replacements: { id_recurso: recurso.id } },
      );
    }
  },
};
