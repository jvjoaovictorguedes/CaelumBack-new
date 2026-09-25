"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Admin Jogadores' AND versao = '1.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Admin Jogadores 1.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, resumo, destaque, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Admin Jogadores', '1.0', 'Bastidores: Busca de Jogador e correções de Inventário',
         'Dois novos módulos no Painel Administrativo: Busca (consultar um jogador por nome, username ou ID, com nível, classe, raça, guilda e conta) e Inventário (corrigir a quantidade de um item empilhável ou remover uma peça de equipamento indevida, sempre com motivo obrigatório e registro em auditoria). Não muda nada pra quem já joga — é ferramenta de bastidores.',
         'Ferramenta de bastidores: consultar um jogador e corrigir seu inventário quando necessário.',
         false, CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Admin Jogadores", versao: "1.0" });
  },
};
