"use strict";

// Segundo lote de imagens de drop entregue pelo usuário — 5 arquivos
// batem por nome quase-igual (sufixo extra ou acento diferente) com
// Items "Espolio" que já existiam sem imagem_url. Backfill simples,
// sem criar nada novo (mesmo padrão de
// 20261026720000-fix-drops-usar-espolio-existente.js).
const IMAGENS_POR_ITEM_ESPOLIO = [
  { nome: "Chifre Taurino", imagem: "/images/drops/Chifre Taurino Duplo.png" },
  { nome: "Escama de Basilisco", imagem: "/images/drops/Escama de Basílisco.png" },
  { nome: "Fragmento de Alma", imagem: "/images/drops/Fragmento de Alma (UNIVERSAL-ESSENCIAL).png" },
  { nome: "Sangue Dracônico", imagem: "/images/drops/Sangue Dracônico Puro.png" },
  { nome: "Presa de Cão de Guerra", imagem: "/images/drops/Presa do Cão de Guerra.png" },
];

module.exports = {
  async up(queryInterface) {
    let atualizados = 0;
    for (const { nome, imagem } of IMAGENS_POR_ITEM_ESPOLIO) {
      const [[item]] = await queryInterface.sequelize.query(
        `SELECT id FROM "Items" WHERE nome = :nome AND tipo_item = 'Espolio' LIMIT 1;`,
        { replacements: { nome } },
      );
      if (!item) {
        console.log(`[migration] Item Espólio "${nome}" não encontrado — pulando.`);
        continue;
      }
      await queryInterface.sequelize.query(
        `UPDATE "Items" SET imagem_url = :imagem WHERE id = :id;`,
        { replacements: { id: item.id, imagem } },
      );
      atualizados += 1;
    }
    console.log(`[migration] Imagem aplicada em ${atualizados} Item(ns) Espólio existente(s).`);
  },

  async down(queryInterface) {
    const nomes = IMAGENS_POR_ITEM_ESPOLIO.map((i) => i.nome);
    await queryInterface.sequelize.query(
      `UPDATE "Items" SET imagem_url = NULL WHERE nome IN (${nomes.map(() => "?").join(",")}) AND tipo_item = 'Espolio';`,
      { replacements: nomes },
    );
  },
};
