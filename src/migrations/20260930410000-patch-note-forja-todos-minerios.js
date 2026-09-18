"use strict";

module.exports = {
  async up(queryInterface) {
    const notas = [
      {
        feature: "Expedição",
        versao: "1.2",
        titulo: "Ícones novos pros troncos de Silvicultura",
        descricao:
          "As 8 madeiras de Silvicultura (Carvalho, Pinheiro, Cedro, Ébano, Madeira Arcana, Salgueiro Lunar, Madeira Dracônica e Árvore Celestial) ganharam ícone próprio, em vez do quadradinho genérico.",
      },
      {
        feature: "Forja",
        versao: "3.2",
        titulo: "Fabricação agora usa todos os minérios, e Mago ganhou equipamento",
        descricao:
          "Antes só as barras de Ferro tinham receita na Fabricação. Agora Espada, Peitoral e Anel existem pra todos os 8 minérios (Cobre, Prata, Ouro, Cristal de Mana, Obsidiana, Astralita e Minério Celestial também). Também chegou o Cajado, uma arma mágica que escala com Inteligência em vez de Força — finalmente dá pra fabricar equipamento pra quem joga de Mago. A lista de blueprints agora vem organizada em seções (Armas, Armaduras, Acessórios) pra não virar uma rolagem gigante.",
      },
    ];

    for (const nota of notas) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM patch_notes WHERE feature = :feature AND versao = :versao LIMIT 1;`,
        { replacements: { feature: nota.feature, versao: nota.versao } },
      );
      if (existente.length > 0) {
        console.log(`[migration] Nota ${nota.feature} ${nota.versao} já existe — pulando.`);
        continue;
      }

      const [[{ max }]] = await queryInterface.sequelize.query(
        `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
      );

      await queryInterface.sequelize.query(
        `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
         VALUES (:ordem, :feature, :versao, :titulo, :descricao, CURRENT_DATE, now(), now());`,
        { replacements: { ordem: max + 1, ...nota } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Expedição", versao: "1.2" });
    await queryInterface.bulkDelete("patch_notes", { feature: "Forja", versao: "3.2" });
  },
};
