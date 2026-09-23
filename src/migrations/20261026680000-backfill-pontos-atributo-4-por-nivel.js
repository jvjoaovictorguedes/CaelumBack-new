"use strict";

// Nível passou de 1 para 4 pontos de atributo (experienceService.
// PONTOS_POR_NIVEL). Personagens que já tinham subido de nível recebem
// os +3 pontos por nível que faltaram, pra ficar no mesmo patamar de
// quem sobe a partir de agora. Cada concessão fica registrada numa
// tabela de auditoria: rodar de novo nunca concede duas vezes, e o down
// retira só o que foi concedido aqui (sem deixar saldo negativo, caso o
// jogador já tenha gastado).
const PONTOS_EXTRAS_POR_NIVEL = 3;

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("character_level_points_backfill", {
      id_personagem: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
        references: { model: "Characters", key: "id" },
        onDelete: "CASCADE",
      },
      pontos_concedidos: { type: Sequelize.INTEGER, allowNull: false },
      nivel_na_concessao: { type: Sequelize.INTEGER, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
    });

    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `INSERT INTO character_level_points_backfill (id_personagem, pontos_concedidos, nivel_na_concessao, "createdAt")
         SELECT id, (nivel - 1) * :extra, nivel, now()
           FROM "Characters"
          WHERE nivel > 1
         ON CONFLICT (id_personagem) DO NOTHING;`,
        { replacements: { extra: PONTOS_EXTRAS_POR_NIVEL }, transaction },
      );

      await queryInterface.sequelize.query(
        `UPDATE "Characters" c
            SET pontos_distribuir = COALESCE(c.pontos_distribuir, 0) + b.pontos_concedidos
           FROM character_level_points_backfill b
          WHERE b.id_personagem = c.id;`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `UPDATE "Characters" c
            SET pontos_distribuir = GREATEST(0, COALESCE(c.pontos_distribuir, 0) - b.pontos_concedidos)
           FROM character_level_points_backfill b
          WHERE b.id_personagem = c.id;`,
        { transaction },
      );
    });
    await queryInterface.dropTable("character_level_points_backfill");
  },
};
