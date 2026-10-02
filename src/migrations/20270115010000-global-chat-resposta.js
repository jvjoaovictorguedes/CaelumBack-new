"use strict";

// Pedido do jogador: responder uma mensagem específica do chat global,
// igual WhatsApp (balão de citação acima da mensagem nova). Guarda só
// um nível de citação (nunca uma cadeia resposta-de-resposta, igual
// WhatsApp também só mostra a mensagem citada original, não a árvore
// inteira) e CONGELA nome/texto da mensagem citada no momento do envio
// — mesmo motivo de nome_personagem já ser congelado em
// GlobalChatMessage: o histórico não deveria mudar retroativamente se o
// personagem trocar de nome depois, e a citação precisa sobreviver à
// limpeza mensal (globalChatService.limparMensagensDeMesesAnteriores)
// mesmo que a mensagem original já tenha sido apagada.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("GlobalChatMessages", "id_mensagem_respondida", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "GlobalChatMessages", key: "id" },
      onDelete: "SET NULL",
    });
    await queryInterface.addColumn("GlobalChatMessages", "nome_personagem_respondido", {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn("GlobalChatMessages", "texto_respondido", {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("GlobalChatMessages", "texto_respondido");
    await queryInterface.removeColumn("GlobalChatMessages", "nome_personagem_respondido");
    await queryInterface.removeColumn("GlobalChatMessages", "id_mensagem_respondida");
  },
};
