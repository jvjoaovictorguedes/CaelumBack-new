"use strict";

// Os itens "Adaga Enferrujada do Bandido" e "Amuleto do Cultista" já
// existiam (Espolio de Bandido Errante / Cultista Renegado, criados na
// expansão da Aventura) mas sem imagem_url. Só faltava a arte, entregue
// depois — este backfill preenche o campo sem recriar os itens.
const IMAGENS = [
  { nome: "Adaga Enferrujada do Bandido", imagem: "/images/drops/Adaga Enferrujada do Bandido.png" },
  { nome: "Amuleto do Cultista", imagem: "/images/drops/Amuleto do Cultista.png" },
];

module.exports = {
  async up(queryInterface) {
    for (const { nome, imagem } of IMAGENS) {
      const [, affectedRows] = await queryInterface.sequelize.query(
        `UPDATE "Items" SET imagem_url = :imagem WHERE nome = :nome AND (imagem_url IS NULL OR imagem_url = '');`,
        { replacements: { nome, imagem } },
      );
      console.log(`[migration] Item "${nome}": imagem_url atualizado (${affectedRows ?? 0} linha(s)).`);
    }
  },

  async down(queryInterface) {
    const nomes = IMAGENS.map((i) => i.nome);
    await queryInterface.sequelize.query(
      `UPDATE "Items" SET imagem_url = NULL WHERE nome IN (${nomes.map(() => "?").join(",")});`,
      { replacements: nomes },
    );
  },
};
