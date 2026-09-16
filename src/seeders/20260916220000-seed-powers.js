"use strict";

// Placeholder — os dois primeiros vêm do mock-api.ts (mesmo nome/efeito
// usado no front quando NEXT_PUBLIC_USE_MOCKS=true), o terceiro é um
// poder exclusivo de Celestial pra dar algo pra testar em RaceAbilities.
// O quarto (Bola de Fogo) foi adicionado depois: sem ele o Mago não
// tinha NENHUM poder ofensivo — só Cura Arcana (cura) — então não tinha
// como um mago causar dano de verdade além do ataque básico (que agora
// é bem mais fraco pra essa classe, de propósito).
module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      'SELECT COUNT(*)::int AS count FROM "Powers";',
    );
    if (rows[0].count > 0) {
      console.log('[seed] "Powers" já tem dados — pulando.');
      return;
    }

    await queryInterface.bulkInsert("Powers", [
      {
        id: 1,
        nome: "Golpe Poderoso",
        descricao: "Um golpe que usa toda a forca do heroi.",
        tipo_poder: "Ativo",
        custo_mana: 0,
        dano_base: 10,
        cura_base: 0,
        escala_atributo: "Forca",
        valor_escala: 1.2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        nome: "Cura Arcana",
        descricao: "Recupera vida usando energia magica.",
        tipo_poder: "Ativo",
        custo_mana: 12,
        dano_base: 0,
        cura_base: 15,
        escala_atributo: "Inteligencia",
        valor_escala: 1.0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 3,
        nome: "Julgamento Divino",
        descricao: "Poder exclusivo da linhagem Celestial, invoca luz pura contra o inimigo.",
        tipo_poder: "Ativo",
        custo_mana: 15,
        dano_base: 18,
        cura_base: 0,
        escala_atributo: "Inteligencia",
        valor_escala: 1.5,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 4,
        nome: "Bola de Fogo",
        descricao: "Uma explosao de energia arcana lancada contra o inimigo.",
        tipo_poder: "Ativo",
        custo_mana: 10,
        dano_base: 6,
        cura_base: 0,
        escala_atributo: "Inteligencia",
        valor_escala: 1.2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("Powers", { id: [1, 2, 3, 4] });
  },
};
