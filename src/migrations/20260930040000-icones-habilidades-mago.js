"use strict";

// As 5 habilidades de Guerreiro já tinham ícone (craftpix); a arte nova
// substitui o arquivo no mesmo caminho, então não precisa mexer no banco
// pra essas. As 5 habilidades de Mago nunca tiveram imagem_url — essa
// migração preenche com a arte nova publicada em
// CaelumFront-new/public/icons/skills/. Idempotente: só atualiza o que
// ainda não bate com o valor alvo.
module.exports = {
  async up(queryInterface) {
    const atualizacoes = [
      ["Cura Arcana", "/icons/skills/cura-arcana.png"],
      ["Bola de Fogo", "/icons/skills/bola-de-fogo.png"],
      ["Lança de Gelo", "/icons/skills/lanca-de-gelo.png"],
      ["Explosão Arcana", "/icons/skills/explosao-arcana.png"],
      ["Renascer Místico", "/icons/skills/renascer-mistico.png"],
    ];

    for (const [nome, imagemUrl] of atualizacoes) {
      await queryInterface.sequelize.query(
        `UPDATE "Powers" SET imagem_url = :imagemUrl WHERE nome = :nome AND imagem_url IS DISTINCT FROM :imagemUrl;`,
        { replacements: { nome, imagemUrl } },
      );
    }
  },

  async down() {},
};
