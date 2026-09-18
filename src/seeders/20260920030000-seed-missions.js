"use strict";

// Catálogo de missões — diárias (resetam a cada 24h, ver missionService.js)
// e únicas (marcos de progressão, tipo "chegue no nível X"). Item de
// recompensa é resolvido pelo NOME (não por id fixo) pra não quebrar se
// o catálogo de Itens já tiver sido reseedado com ids diferentes (ver
// scripts/reseed-itens-producao.js) — mesmo raciocínio de resiliência
// usado nos outros seeders desse projeto.
module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      "SELECT COUNT(*)::int AS count FROM missions;",
    );
    if (rows[0].count > 0) {
      console.log("[seed] missions já tem dados — pulando.");
      return;
    }

    async function idDoItemPorNome(nome) {
      const [encontrados] = await queryInterface.sequelize.query(
        'SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;',
        { replacements: { nome } },
      );
      return encontrados[0]?.id ?? null;
    }

    const idPocaoVidaMedia = await idDoItemPorNome("Poção de Vida Média");
    const idAdagaEnferrujada = await idDoItemPorNome("Adaga Enferrujada");
    const idEspadaDeFerro = await idDoItemPorNome("Espada de Ferro");

    const agora = new Date();
    const missoes = [
      {
        nome: "Caçador Iniciante",
        descricao: "Derrote 5 inimigos na Aventura.",
        tipo: "MatarInimigos",
        meta: 5,
        categoria: "Diaria",
        nivel_minimo: 1,
        recompensa_dinheiro: 50,
        recompensa_xp: 40,
        recompensa_item_id: null,
        recompensa_item_quantidade: 1,
      },
      {
        nome: "Extermínio",
        descricao: "Derrote 10 inimigos na Aventura.",
        tipo: "MatarInimigos",
        meta: 10,
        categoria: "Diaria",
        nivel_minimo: 3,
        recompensa_dinheiro: 80,
        recompensa_xp: 70,
        recompensa_item_id: idPocaoVidaMedia,
        recompensa_item_quantidade: 2,
      },
      {
        nome: "Duelista do Dia",
        descricao: "Vença 1 duelo PvP.",
        tipo: "VencerDuelos",
        meta: 1,
        categoria: "Diaria",
        nivel_minimo: 3,
        recompensa_dinheiro: 80,
        recompensa_xp: 50,
        recompensa_item_id: null,
        recompensa_item_quantidade: 1,
      },
      {
        nome: "Bolso Cheio",
        descricao: "Ganhe 200 moedas (de qualquer fonte).",
        tipo: "GanharOuro",
        meta: 200,
        categoria: "Diaria",
        nivel_minimo: 1,
        recompensa_dinheiro: 30,
        recompensa_xp: 30,
        recompensa_item_id: null,
        recompensa_item_quantidade: 1,
      },
      {
        nome: "Primeiros Passos",
        descricao: "Alcance o nível 5.",
        tipo: "AlcancarNivel",
        meta: 5,
        categoria: "Unica",
        nivel_minimo: 1,
        recompensa_dinheiro: 100,
        recompensa_xp: 0,
        recompensa_item_id: idAdagaEnferrujada,
        recompensa_item_quantidade: 1,
      },
      {
        nome: "Guerreiro Experiente",
        descricao: "Alcance o nível 15.",
        tipo: "AlcancarNivel",
        meta: 15,
        categoria: "Unica",
        nivel_minimo: 1,
        recompensa_dinheiro: 300,
        recompensa_xp: 0,
        recompensa_item_id: null,
        recompensa_item_quantidade: 1,
      },
      {
        nome: "Lenda em Ascensão",
        descricao: "Alcance o nível 30.",
        tipo: "AlcancarNivel",
        meta: 30,
        categoria: "Unica",
        nivel_minimo: 1,
        recompensa_dinheiro: 1000,
        recompensa_xp: 0,
        recompensa_item_id: idEspadaDeFerro,
        recompensa_item_quantidade: 1,
      },
    ].map((missao) => ({ ...missao, createdAt: agora, updatedAt: agora }));

    await queryInterface.bulkInsert("missions", missoes);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("missions", null);
  },
};
