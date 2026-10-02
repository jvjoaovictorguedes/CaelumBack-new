"use strict";

// Mesmo bug de 20260930600000-corrige-excesso-habilidades-ativas.js, só
// que por DOIS call sites diferentes que nunca tinham sido corrigidos
// junto da primeira rodada: characterController.comprarPoder (comprar
// um poder Ativo com ouro) e comprarEvolucao (poder concedido por nó da
// Árvore de Evolução de Natureza/Classe) ambos marcavam is_active:true
// sem checar MAX_HABILIDADES_ATIVAS_COMBATE (5) — um personagem que
// comprasse/evoluísse além do limite entrava em combate com mais de 5
// poderes Ativos marcados. O código já foi corrigido pra não conceder
// mais do que isso daqui pra frente; esta migration corrige quem já
// ficou com excesso, desativando o excedente e mantendo os 5 mais
// antigos (menor nível de aprendizado, depois menor id) de cada
// personagem — mesmo critério/mesma query da migration anterior.
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
