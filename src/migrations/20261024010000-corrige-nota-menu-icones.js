"use strict";

// Corrige o texto da nota "Menu" 1.2: a arte do guerreiro acabou indo
// pro fundo de Equipamentos, não pro ícone de Meu Inventário (que
// continua com o ícone original) — ver commit "Corrige onde a arte do
// guerreiro deveria ir".
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE patch_notes
       SET titulo = 'Guia do Aventureiro e Bestiário ganham ícone próprio',
           descricao = 'Esses dois itens do menu lateral usavam um ícone emprestado de outra tela como placeholder. Agora cada um tem sua arte definitiva.'
       WHERE feature = 'Menu' AND versao = '1.2';`,
    );
  },

  async down() {
    // Texto anterior não vale a pena restaurar — estava incorreto.
  },
};
