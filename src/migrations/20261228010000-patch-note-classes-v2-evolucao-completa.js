"use strict";

// Pergaminho das Atualizações — Classes V2 completo. A nota "Evolução em
// Estágios" (versão 1.2, migration 20261223010000) já anunciou que a
// evolução de classe ganhou estágios de verdade — mas só o estágio 1
// (Lv.40) e o tipo_dano separado estavam prontos naquele momento. Esta
// nota anuncia a entrega completa: estágio 2 (Lv.100) jogável, com seu
// próprio bônus/habilidade/efeito, e o Painel Admin de Classes pra
// qualquer conteudista montar novas linhagens sem precisar de deploy.
module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Evolução de Classe' AND versao = '2.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Patch note Classes V2 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(`SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`);
    const agora = new Date();

    await queryInterface.bulkInsert("patch_notes", [
      {
        ordem: max + 1,
        feature: "Evolução de Classe",
        versao: "2.0",
        titulo: "A Ascensão Final: Estágio 2 (Lv.100)",
        descricao:
          "Depois de escolher seu caminho no Lv.40, personagens que chegam ao Lv.100 agora podem seguir pra uma segunda ascensão, exclusiva de quem já trilhou o caminho certo — um bônus permanente de atributos ainda maior, podendo vir com uma habilidade nova e efeitos de combate próprios. A tela de Evolução de Classe foi refeita pra mostrar os dois estágios lado a lado, com os requisitos reais de cada um.",
        resumo: "Estágio 2 (Lv.100) da evolução de classe já está jogável, com bônus, habilidade e efeitos próprios.",
        imagem_url: null,
        destaque: false,
        status: "Publicado",
        publicado_em: agora,
        createdAt: agora,
        updatedAt: agora,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Evolução de Classe", versao: "2.0" });
  },
};
