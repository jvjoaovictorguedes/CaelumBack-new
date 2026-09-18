"use strict";

// Ícones novos pros 8 recursos de Silvicultura — mesma lógica dos
// minérios (20260930360000): 1 imagem por recurso, reaproveitada nas 6
// qualidades (a raridade já é comunicada pela borda colorida na UI).
const MAPA_RECURSO_PARA_ARQUIVO = {
  Carvalho: "carvalho",
  Pinheiro: "pinheiro",
  Cedro: "cedro",
  Ébano: "ebano",
  "Madeira Arcana": "madeira-arcana",
  "Salgueiro Lunar": "salgueiro-lunar",
  "Madeira Dracônica": "madeira-draconica",
  "Árvore Celestial": "arvore-celestial",
};

module.exports = {
  async up(queryInterface) {
    for (const [nomeRecurso, slug] of Object.entries(MAPA_RECURSO_PARA_ARQUIVO)) {
      const [[recurso]] = await queryInterface.sequelize.query(
        `SELECT id FROM expedition_resources WHERE nome = :nome AND profissao = 'Silvicultura' LIMIT 1;`,
        { replacements: { nome: nomeRecurso } },
      );
      if (!recurso) {
        console.log(`[migration] Recurso "${nomeRecurso}" não encontrado — pulando.`);
        continue;
      }

      await queryInterface.sequelize.query(
        `UPDATE "Items" SET imagem_url = :url
         WHERE id IN (SELECT id_item FROM expedition_resource_items WHERE id_recurso = :id_recurso);`,
        { replacements: { url: `/icons/silvicultura/${slug}.png`, id_recurso: recurso.id } },
      );
    }
    console.log("[migration] Ícones de tronco aplicados.");
  },

  async down(queryInterface) {
    for (const nomeRecurso of Object.keys(MAPA_RECURSO_PARA_ARQUIVO)) {
      const [[recurso]] = await queryInterface.sequelize.query(
        `SELECT id FROM expedition_resources WHERE nome = :nome AND profissao = 'Silvicultura' LIMIT 1;`,
        { replacements: { nome: nomeRecurso } },
      );
      if (!recurso) continue;
      await queryInterface.sequelize.query(
        `UPDATE "Items" SET imagem_url = NULL
         WHERE id IN (SELECT id_item FROM expedition_resource_items WHERE id_recurso = :id_recurso);`,
        { replacements: { id_recurso: recurso.id } },
      );
    }
  },
};
