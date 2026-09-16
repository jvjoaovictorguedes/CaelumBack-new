"use strict";

// A Classe já tinha multiplicador_vida_por_nivel/multiplicador_mana_por_nivel
// seedados (Guerreiro tanque/pouca mana, Mago frágil/muita mana) mas nada no
// jogo lia esses campos — cada personagem usava a mesma fórmula de vida/mana
// não importa a classe. Essa migration adiciona o terceiro multiplicador que
// faltava (ataque físico) pra fechar a identidade das classes: guerreiro bate
// mais forte no ataque básico, mago depende de poder/mana.
module.exports = {
  async up(queryInterface, Sequelize) {
    const description = await queryInterface.describeTable("Classes");
    if (!("multiplicador_dano_fisico" in description)) {
      await queryInterface.addColumn("Classes", "multiplicador_dano_fisico", {
        type: Sequelize.FLOAT,
        defaultValue: 1.0,
        allowNull: false,
      });
    } else {
      console.log('[migration] "Classes"."multiplicador_dano_fisico" já existe — pulando criação da coluna.');
    }

    // Guerreiro bate mais forte no ataque básico, Mago bate bem mais fraco
    // (o forte dele são os poderes, que escalam por inteligência e não são
    // afetados por esse multiplicador). Qualquer outra classe que já exista
    // fica no valor padrão 1.0 (neutro) até alguém configurar diferente.
    await queryInterface.sequelize.query(`
      UPDATE "Classes" SET multiplicador_dano_fisico = 1.2 WHERE nome ILIKE '%guerreiro%';
      UPDATE "Classes" SET multiplicador_dano_fisico = 0.5 WHERE nome ILIKE '%mago%';
    `);
  },

  async down(queryInterface) {
    const description = await queryInterface.describeTable("Classes");
    if ("multiplicador_dano_fisico" in description) {
      await queryInterface.removeColumn("Classes", "multiplicador_dano_fisico");
    }
  },
};
