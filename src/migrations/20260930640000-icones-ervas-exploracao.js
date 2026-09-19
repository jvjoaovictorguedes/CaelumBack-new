"use strict";

// Ícones novos pros 10 recursos de Exploração — mesma lógica dos
// minérios (20260930360000) e troncos (20260930390000): 1 imagem por
// recurso, reaproveitada nas 6 qualidades (a raridade já é comunicada
// pela borda colorida na UI). Os itens desses recursos ficaram com
// imagem_url = '' (vazio, não NULL) desde o seed original da
// Expedição — nunca tinham ícone de verdade.
const MAPA_RECURSO_PARA_ARQUIVO = {
  "Erva Medicinal": "erva-medicinal",
  "Erva de Mana": "erva-de-mana",
  "Flor Solar": "flor-solar",
  "Cogumelo Carmesim": "cogumelo-carmesim",
  "Erva Lunar": "erva-lunar",
  "Flor Lunar": "flor-lunar",
  "Raiz Ancestral": "raiz-ancestral",
  "Fruto Místico": "fruto-mistico",
  "Essência Celestial": "essencia-celestial",
  "Essência Elemental": "essencia-elemental",
};

module.exports = {
  async up(queryInterface) {
    for (const [nomeRecurso, slug] of Object.entries(MAPA_RECURSO_PARA_ARQUIVO)) {
      const [[recurso]] = await queryInterface.sequelize.query(
        `SELECT id FROM expedition_resources WHERE nome = :nome AND profissao = 'Exploracao' LIMIT 1;`,
        { replacements: { nome: nomeRecurso } },
      );
      if (!recurso) {
        console.log(`[migration] Recurso "${nomeRecurso}" não encontrado — pulando.`);
        continue;
      }

      await queryInterface.sequelize.query(
        `UPDATE "Items" SET imagem_url = :url
         WHERE id IN (SELECT id_item FROM expedition_resource_items WHERE id_recurso = :id_recurso);`,
        { replacements: { url: `/icons/exploracao/${slug}.png`, id_recurso: recurso.id } },
      );
    }
    console.log("[migration] Ícones de Exploração aplicados.");
  },

  async down(queryInterface) {
    for (const nomeRecurso of Object.keys(MAPA_RECURSO_PARA_ARQUIVO)) {
      const [[recurso]] = await queryInterface.sequelize.query(
        `SELECT id FROM expedition_resources WHERE nome = :nome AND profissao = 'Exploracao' LIMIT 1;`,
        { replacements: { nome: nomeRecurso } },
      );
      if (!recurso) continue;
      await queryInterface.sequelize.query(
        `UPDATE "Items" SET imagem_url = '' WHERE id IN (SELECT id_item FROM expedition_resource_items WHERE id_recurso = :id_recurso);`,
        { replacements: { id_recurso: recurso.id } },
      );
    }
  },
};
