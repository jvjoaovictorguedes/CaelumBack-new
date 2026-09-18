"use strict";

// Terceira fonte de Fragmento de Grimório (ver abilityLevelService.js),
// além do drop de sorte em PvE e do bônus garantido do Portal de Ranque:
// uma missão diária que qualquer jogador consegue completar só jogando
// normalmente, sem depender de RNG nem de já estar num ranque alto o
// bastante pro Portal.
module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      "SELECT id FROM missions WHERE nome = 'Caçador de Fragmentos' LIMIT 1;",
    );
    if (existente.length > 0) {
      console.log("[seed] Missão 'Caçador de Fragmentos' já existe — pulando.");
      return;
    }

    const [itens] = await queryInterface.sequelize.query(
      "SELECT id FROM \"Items\" WHERE nome = 'Fragmento de Grimório' LIMIT 1;",
    );
    const idFragmento = itens[0]?.id ?? null;
    if (!idFragmento) {
      console.log(
        "[seed] Item 'Fragmento de Grimório' não encontrado — rode o reseed de itens antes desta seed.",
      );
      return;
    }

    const agora = new Date();
    await queryInterface.bulkInsert("missions", [
      {
        nome: "Caçador de Fragmentos",
        descricao: "Derrote 15 inimigos na Aventura.",
        tipo: "MatarInimigos",
        meta: 15,
        categoria: "Diaria",
        nivel_minimo: 1,
        recompensa_dinheiro: 40,
        recompensa_xp: 60,
        recompensa_item_id: idFragmento,
        recompensa_item_quantidade: 3,
        createdAt: agora,
        updatedAt: agora,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("missions", { nome: "Caçador de Fragmentos" });
  },
};
