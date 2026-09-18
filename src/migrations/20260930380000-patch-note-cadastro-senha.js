"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Cadastro' AND versao = '1.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Cadastro 1.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Cadastro', '1.0', 'Regra de senha do registro corrigida',
         'A tela de registro exigia maiúscula, minúscula, número e caractere especial na senha — bem mais rígido do que o servidor realmente pede (só letras e números, 8+ caracteres). Isso podia travar o registro na tela antes mesmo de chegar no servidor, escondendo mensagens de erro reais (como usuário ou e-mail já cadastrado). Agora a regra da tela bate com a do servidor.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Cadastro", versao: "1.0" });
  },
};
