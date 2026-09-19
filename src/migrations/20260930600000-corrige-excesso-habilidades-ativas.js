"use strict";

// Bug reportado pelo jogador: concederPoderesIniciais marcava TODO poder
// concedido de graça como is_active:true, sem respeitar
// MAX_HABILIDADES_ATIVAS_COMBATE (5) — inofensivo enquanto cada classe/
// raça tinha só um punhado de poderes (coincidia com o limite por
// acaso), mas o lote de 36 poderes novos (20260930510000) estourou isso
// de vez: personagens passaram a entrar em combate com praticamente
// TODOS os poderes Ativos marcados, não só os 5 escolhidos na aba
// Combate. O código já foi corrigido pra não conceder mais do que isso
// daqui pra frente — esta migration corrige quem já ficou com excesso,
// desativando o excedente e mantendo os 5 mais antigos (menor nível de
// aprendizado, depois menor id) de cada personagem. Passivos nunca
// contam nesse limite (ficam de fora do CTE via join com "Powers").
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      WITH ranqueadas AS (
        SELECT
          ca.id,
          ROW_NUMBER() OVER (
            PARTITION BY ca.id_personagem
            ORDER BY ca.level_learned ASC, ca.id ASC
          ) AS posicao
        FROM "CharacterAbilities" ca
        JOIN "Powers" p ON p.id = ca.id_power
        WHERE ca.is_active = true AND p.tipo_poder = 'Ativo'
      )
      UPDATE "CharacterAbilities"
      SET is_active = false
      WHERE id IN (SELECT id FROM ranqueadas WHERE posicao > 5);
    `);
  },

  async down() {
    // Não reverte pra um estado anterior conhecido — o bug já deixava o
    // dado num estado que nunca deveria ter existido.
  },
};
