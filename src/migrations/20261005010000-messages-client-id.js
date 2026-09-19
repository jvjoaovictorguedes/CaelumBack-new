"use strict";

// Mensagens v2 (§6 da spec) — client_message_id gerado pelo cliente pra
// idempotência de envio: se o browser reenviar a mesma mensagem depois
// de um timeout/reconexão, o servidor devolve a mensagem já criada em
// vez de duplicar. Índice único é PARCIAL (WHERE client_message_id IS
// NOT NULL) porque mensagens antigas/enviadas via REST sem esse campo
// continuam válidas com o valor null — Postgres já trata múltiplos
// NULLs como não-iguais num índice único comum, mas o WHERE deixa a
// intenção explícita e evita qualquer suposição sobre esse detalhe.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabela = await queryInterface.describeTable("messages");
    if (!tabela.client_message_id) {
      await queryInterface.addColumn("messages", "client_message_id", {
        type: Sequelize.STRING(100),
        allowNull: true,
      });
    }

    const indexes = await queryInterface.showIndex("messages");
    const jaExiste = indexes.some((i) => i.name === "messages_remetente_client_id_unique");
    if (!jaExiste) {
      await queryInterface.addIndex("messages", ["id_remetente", "client_message_id"], {
        unique: true,
        name: "messages_remetente_client_id_unique",
        where: { client_message_id: { [Sequelize.Op.ne]: null } },
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("messages", "messages_remetente_client_id_unique");
    await queryInterface.removeColumn("messages", "client_message_id");
  },
};
