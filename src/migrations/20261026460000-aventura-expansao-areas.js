"use strict";

const { AREAS } = require("../config/adventureExpansionData");

// Expansão Aventura Beta §5/§6/§46 passo 5-6 — atualiza range/ordem das
// 3 áreas já existentes (ID preservado, nunca recriadas) e insere as 7
// novas, na ordem final 1..10 da progressão 1-50.
module.exports = {
  async up(queryInterface) {
    for (const area of AREAS) {
      const [linhas] = await queryInterface.sequelize.query(
        `SELECT id FROM "AdventureZones" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: area.nome } },
      );
      const existente = linhas[0]?.id ?? null;

      if (existente) {
        await queryInterface.sequelize.query(
          `UPDATE "AdventureZones"
           SET nivel_monstro_min = :min, nivel_monstro_max = :max, ordem = :ordem
           WHERE id = :id;`,
          { replacements: { min: area.min, max: area.max, ordem: area.ordem, id: existente } },
        );
        continue;
      }

      await queryInterface.bulkInsert("AdventureZones", [
        {
          nome: area.nome,
          descricao: area.descricao ?? null,
          nivel_monstro_min: area.min,
          nivel_monstro_max: area.max,
          imagem_url: null,
          battle_background_url: null,
          ordem: area.ordem,
          ativa: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    }
  },

  async down(queryInterface) {
    // Não deletado de propósito — mesma decisão já usada em migrations
    // de conteúdo de catálogo neste projeto (ex.: seed da Guilda dos
    // Aventureiros, 20260930760000): migrations POSTERIORES desta mesma
    // expansão (monstros/vínculos, contratos) referenciam essas áreas
    // por FK, então um down() destrutivo aqui quebraria a reversão
    // dessas migrations. Ver comentário equivalente em
    // 20261026470000-...-monstros-vinculos.js.
    void queryInterface;
  },
};
