"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Mensagens' AND versao = '2.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Mensagens 2.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Mensagens', '2.0', 'Mensagens agora em tempo real',
         'Chega de esperar o próximo carregamento automático: mensagens novas, confirmação de leitura e o indicador de "digitando..." agora chegam na hora, por conexão em tempo real. A caixa de entrada e o aviso de mensagens não lidas no menu também atualizam sozinhos, sem ficar consultando o servidor a cada poucos segundos. Adicionamos também um pontinho verde mostrando quando o outro jogador está online e um botão pra carregar mensagens mais antigas da conversa. O som de notificação continua do mesmo jeito, só que agora toca na hora certa em vez de a cada verificação periódica.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Mensagens", versao: "2.0" });
  },
};
