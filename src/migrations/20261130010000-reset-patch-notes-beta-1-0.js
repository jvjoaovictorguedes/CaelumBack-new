"use strict";

// Pedido explícito do usuário: resetar completamente a tabela de patch
// notes pra virar a página pro Beta — a partir de agora a cadência é 2
// atualizações por mês, e cada patch note passa a descrever o que
// mudou NA atualização do beta (não mais o histórico acumulado de
// desenvolvimento). Este é o primeiro patch note da era pós-reset:
// "1.0 — Caelum ganha vida", o lançamento do Beta em si.
//
// TRUNCATE ... RESTART IDENTITY CASCADE em vez de DELETE: reinicia o
// id_seq (primeira nota nasce id=1, ordem=1) e arrasta em cascata
// user_patch_notes_seen (confirmado vazia antes desta migration — não
// há "visto" de jogador real sendo perdido).
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`TRUNCATE TABLE patch_notes RESTART IDENTITY CASCADE;`);

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (1, 'Caelum', '1.0', 'Caelum ganha vida',
         'É oficial: o Beta do Caelum está no ar! Depois de muito trabalho, o mundo de Caelum abre as portas pela primeira vez — aventura, combate, forja, pesca, guildas, mercado, taverna e muito mais, tudo em uma única jornada. A partir de agora, o jogo recebe atualizações regulares (2 por mês), e cada uma delas vai ganhar sua própria nota aqui, contando exatamente o que mudou. Obrigado por fazer parte do início dessa história. Boa sorte, aventureiro.',
         CURRENT_DATE, now(), now());`,
    );
  },

  async down(queryInterface) {
    // Down simétrico e explícito (não uma tentativa de "restaurar" o
    // histórico apagado, que não é reversível por natureza de um
    // TRUNCATE) — só remove a nota 1.0 que esta migration criou.
    await queryInterface.sequelize.query(
      `DELETE FROM patch_notes WHERE feature = 'Caelum' AND versao = '1.0';`,
    );
  },
};
