"use strict";

// Últimas 5 habilidades sem imagem_url nenhuma: Meteoro Arcano (Mago),
// Vontade Inabalável, Flecha Élfica, Julgamento Divino e Luz
// Purificadora (essas 4 sem classe associada em class_abilities ainda).
// Com essa migração, todas as 21 linhas de Powers passam a ter ícone.
// As outras 4 do mesmo lote de arte (Fúria Selvagem, Investida do
// Vendaval, Tornado Arcano, Golpe das Sombras) já tinham imagem_url
// apontando pro mesmo caminho — só o arquivo em si foi substituído no
// frontend, sem precisar mexer no banco.
module.exports = {
  async up(queryInterface) {
    const atualizacoes = [
      ["Meteoro Arcano", "/icons/skills/meteoro-arcano.png"],
      ["Vontade Inabalável", "/icons/skills/vontade-inabalavel.png"],
      ["Flecha Élfica", "/icons/skills/flecha-elfica.png"],
      ["Julgamento Divino", "/icons/skills/julgamento-divino.png"],
      ["Luz Purificadora", "/icons/skills/luz-purificadora.png"],
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
