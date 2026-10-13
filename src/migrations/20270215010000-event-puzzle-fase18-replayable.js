"use strict";

// Evento "O Coração da Máquina Celestial" — correção de lifecycle/UX
// (seção 3 da encomenda: "Replayable"). `config.replayable` já é
// opcional e já tem default `false` NO SERVIDOR (ver
// puzzleInstanceService.criarOuObterInstancia — ausência de
// `replayable`/qualquer valor != true nunca permite replay), então
// esta migration não é necessária pro COMPORTAMENTO — é curadoria de
// CONTEÚDO: deixa as 4 câmaras principais do evento com
// `replayable: false` EXPLÍCITO no config já publicado, pra nunca
// depender implicitamente do default e documentar a decisão no
// próprio dado.
//
// Patch, não reescrita: a migration de conteúdo original
// (20270214010002) já pode ter sido aplicada em ambientes antes desta
// correção existir — mesmo padrão de
// 20270213010001-patch-note-public-rollout.js (UPDATE em cima do
// conteúdo já seedado, nunca editar o arquivo antigo). `jsonb_set`
// muta só a chave `replayable`, preserva qualquer outra chave do
// config (components/connections/objectives/titulo_publico/etc.)
// intocada.
const KEYS = ["oficina-dos-eixos", "observatorio", "sala-das-mares", "nucleo-da-convergencia"];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      // `key` de PuzzleBlueprint só é UNIQUE por id_event_definition
      // (nunca globalmente) — escopa pelo evento "O Coração da Máquina
      // Celestial" explicitamente, nunca por `key` sozinha, pra nunca
      // acertar por acaso um blueprint de outro evento que reuse a
      // mesma key.
      await queryInterface.sequelize.query(
        `UPDATE puzzle_blueprint_versions v
         SET config = jsonb_set(v.config, '{replayable}', 'false'::jsonb, true)
         FROM puzzle_blueprints b
         JOIN event_definitions d ON d.id = b.id_event_definition
         WHERE v.id_blueprint = b.id
           AND d.key = 'coracao-da-maquina-celestial'
           AND b.key IN (:keys)
           AND v.status = 'PUBLISHED';`,
        { replacements: { keys: KEYS }, transaction: t },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query(
        `UPDATE puzzle_blueprint_versions v
         SET config = v.config - 'replayable'
         FROM puzzle_blueprints b
         JOIN event_definitions d ON d.id = b.id_event_definition
         WHERE v.id_blueprint = b.id
           AND d.key = 'coracao-da-maquina-celestial'
           AND b.key IN (:keys)
           AND v.status = 'PUBLISHED';`,
        { replacements: { keys: KEYS }, transaction: t },
      );
    });
  },
};
