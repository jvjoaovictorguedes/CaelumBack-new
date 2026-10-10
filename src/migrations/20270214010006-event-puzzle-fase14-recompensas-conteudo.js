"use strict";

// Evento "O Coração da Máquina Celestial" — Fase 14 (Recompensas
// temáticas do evento). Cria 4 itens-troféu temáticos (um por sala
// real da Fase 12) + a conquista/título capstone de terminar o Núcleo
// da Convergência, e liga tudo via PuzzleRewardDefinition — nunca um
// catálogo de loot paralelo (mesma simplificação deliberada do Boss,
// ver eventPuzzleRewardModels.js). trigger INSTANCE_COMPLETED em todas
// (mesmo critério de "primeiro-a-resolver" da Fase 10) — a recompensa é
// por terminar a sala, não por um objetivo intermediário específico.
const SALAS = [
  {
    key: "oficina-dos-eixos",
    itemNome: "Engrenagem da Oficina",
    itemDescricao: "Uma engrenagem de bronze, ainda quente do atrito — prova de que você sincronizou a transmissão da Oficina dos Eixos.",
    ouro: 50,
    xp: 100,
  },
  {
    key: "observatorio",
    itemNome: "Lente do Observatório",
    itemDescricao: "Uma lente polida que ainda guarda um brilho residual — prova de que você guiou a luz através do Observatório.",
    ouro: 50,
    xp: 100,
  },
  {
    key: "sala-das-mares",
    itemNome: "Válvula da Sala das Marés",
    itemDescricao: "Uma válvula de latão corroída pela maré — prova de que você equilibrou a pressão da Sala das Marés.",
    ouro: 50,
    xp: 100,
  },
  {
    key: "nucleo-da-convergencia",
    itemNome: "Fragmento do Núcleo",
    itemDescricao: "Um fragmento cristalino do Núcleo da Convergência, ainda pulsando fracamente — prova de que você uniu as três câmaras.",
    ouro: 150,
    xp: 400,
    achievementKey: "coracao-restaurado",
  },
];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      const [[definicao]] = await queryInterface.sequelize.query(
        `SELECT id FROM event_definitions WHERE key = 'coracao-da-maquina-celestial';`,
        { transaction: t },
      );
      if (!definicao) throw new Error("EventDefinition 'coracao-da-maquina-celestial' não existe — rode a migration da Fase 12 primeiro.");

      const [[achievement]] = await queryInterface.sequelize.query(
        `INSERT INTO achievements (key, nome, descricao, categoria, ativa, "createdAt", "updatedAt")
         VALUES ('coracao-restaurado', 'Coração Restaurado', 'Resolveu as câmaras mecânica, óptica e hidráulica e sincronizou o Núcleo da Convergência, restaurando o Coração da Máquina Celestial.', 'Evento', true, NOW(), NOW())
         RETURNING id;`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `INSERT INTO titles (key, nome, descricao, id_achievement_desbloqueia, ativa, "createdAt", "updatedAt")
         VALUES ('restaurador-do-coracao', 'Restaurador do Coração', 'Concedido a quem restaurou o Coração da Máquina Celestial.', :idAchievement, true, NOW(), NOW());`,
        { replacements: { idAchievement: achievement.id }, transaction: t },
      );

      for (const sala of SALAS) {
        const [[blueprint]] = await queryInterface.sequelize.query(
          `SELECT id FROM puzzle_blueprints WHERE id_event_definition = :idDefinicao AND key = :key;`,
          { replacements: { idDefinicao: definicao.id, key: sala.key }, transaction: t },
        );
        if (!blueprint) throw new Error(`Blueprint '${sala.key}' não existe — rode a migration da Fase 12 primeiro.`);

        const [[item]] = await queryInterface.sequelize.query(
          `INSERT INTO "Items" (nome, descricao, tipo_item, raridade, valor_compra, valor_venda, disponivel_loja, negociavel_mercado, ativo, "createdAt", "updatedAt")
           VALUES (:nome, :descricao, 'Material', 'Raro', 0, 0, false, false, true, NOW(), NOW())
           RETURNING id;`,
          { replacements: { nome: sala.itemNome, descricao: sala.itemDescricao }, transaction: t },
        );

        await queryInterface.sequelize.query(
          `INSERT INTO puzzle_reward_definitions
             (id_blueprint, key, titulo_exibicao, descricao_exibicao, trigger_type, objective_id,
              reward_ouro, reward_xp, id_item, item_quantidade, achievement_key, ordem, "createdAt", "updatedAt")
           VALUES
             (:idBlueprint, 'recompensa-tematica', :titulo, :descricao, 'INSTANCE_COMPLETED', NULL,
              :ouro, :xp, :idItem, 1, :achievementKey, 0, NOW(), NOW());`,
          {
            replacements: {
              idBlueprint: blueprint.id,
              titulo: sala.itemNome,
              descricao: sala.itemDescricao,
              ouro: sala.ouro,
              xp: sala.xp,
              idItem: item.id,
              achievementKey: sala.achievementKey ?? null,
            },
            transaction: t,
          },
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      const [[definicao]] = await queryInterface.sequelize.query(
        `SELECT id FROM event_definitions WHERE key = 'coracao-da-maquina-celestial';`,
        { transaction: t },
      );
      if (!definicao) return;

      const [blueprints] = await queryInterface.sequelize.query(
        `SELECT id FROM puzzle_blueprints WHERE id_event_definition = :idDefinicao AND key IN (:keys);`,
        { replacements: { idDefinicao: definicao.id, keys: SALAS.map((s) => s.key) }, transaction: t },
      );
      const idsBlueprints = blueprints.map((b) => b.id);
      if (idsBlueprints.length === 0) return;

      const [definicoesRecompensa] = await queryInterface.sequelize.query(
        `SELECT id, id_item FROM puzzle_reward_definitions WHERE id_blueprint IN (:ids) AND key = 'recompensa-tematica';`,
        { replacements: { ids: idsBlueprints }, transaction: t },
      );
      const idsDefinicoes = definicoesRecompensa.map((d) => d.id);
      const idsItens = definicoesRecompensa.map((d) => d.id_item).filter(Boolean);

      if (idsDefinicoes.length > 0) {
        await queryInterface.sequelize.query(
          `DELETE FROM character_puzzle_reward_grants WHERE id_reward_definition IN (:ids);`,
          { replacements: { ids: idsDefinicoes }, transaction: t },
        );
        await queryInterface.sequelize.query(
          `DELETE FROM puzzle_reward_definitions WHERE id IN (:ids);`,
          { replacements: { ids: idsDefinicoes }, transaction: t },
        );
      }
      if (idsItens.length > 0) {
        await queryInterface.sequelize.query(`DELETE FROM "Items" WHERE id IN (:ids);`, {
          replacements: { ids: idsItens },
          transaction: t,
        });
      }

      await queryInterface.sequelize.query(`DELETE FROM titles WHERE key = 'restaurador-do-coracao';`, { transaction: t });
      await queryInterface.sequelize.query(`DELETE FROM achievements WHERE key = 'coracao-restaurado';`, { transaction: t });
    });
  },
};
