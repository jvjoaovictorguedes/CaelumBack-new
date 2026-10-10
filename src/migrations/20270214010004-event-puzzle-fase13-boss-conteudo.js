"use strict";

// Evento "O Coração da Máquina Celestial" — Fase 13 (Boss Custódio do
// Meridiano). Cria o monstro-base temático, o EventPuzzleBossConfig
// ligado à EventDefinition já existente (Fase 12) e gated na sala
// "nucleo-da-convergencia" (id_blueprint_gatilho — ver
// eventPuzzleBossAttemptService.entrarOuRetomar pro enforcement real),
// mais fases de HP e resistências de status. Stats fixos do monstro-base
// são só o PISO/TETO do clamp de escala (templeBossScalingService já
// recalcula vida_maxima/dano_min/dano_max/defesa reais a partir do dpr/
// ehp do personagem) — nunca os valores que o jogador realmente enfrenta.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      const [[monstro]] = await queryInterface.sequelize.query(
        `INSERT INTO "AdventureMonsters"
           (nome, descricao, nivel, vida_maxima, dano_min, dano_max, defesa, agilidade, velocidade,
            xp_recompensa, ouro_recompensa, ativo, disponivel_emboscada, temple_exclusive, ai_profile,
            basic_attack_nature, "createdAt", "updatedAt")
         VALUES
           (:nome, :descricao, 50, 1200, 70, 100, 15, 30, 30,
            0, 0, true, false, false, 'BOSS',
            'Fisico', NOW(), NOW())
         RETURNING id;`,
        {
          replacements: {
            nome: "Custódio do Meridiano",
            descricao:
              "Um autômato guardião erguido no coração do Núcleo da Convergência, forjado pra proteger o mecanismo central da Máquina Celestial de quem a resolve sem autorização.",
          },
          transaction: t,
        },
      );

      const [[definicao]] = await queryInterface.sequelize.query(
        `SELECT id FROM event_definitions WHERE key = 'coracao-da-maquina-celestial';`,
        { transaction: t },
      );
      if (!definicao) throw new Error("EventDefinition 'coracao-da-maquina-celestial' não existe — rode a migration da Fase 12 primeiro.");

      const [[gatilho]] = await queryInterface.sequelize.query(
        `SELECT id FROM puzzle_blueprints WHERE id_event_definition = :idDefinicao AND key = 'nucleo-da-convergencia';`,
        { replacements: { idDefinicao: definicao.id }, transaction: t },
      );
      if (!gatilho) throw new Error("Blueprint 'nucleo-da-convergencia' não existe — rode a migration da Fase 12 primeiro.");

      const [[config]] = await queryInterface.sequelize.query(
        `INSERT INTO event_puzzle_boss_configs
           (id_event_definition, id_monstro_base, id_blueprint_gatilho, nome_exibicao, lore,
            target_turns_to_kill, target_boss_actions_survivable, scaling_min_multiplier, scaling_max_multiplier,
            reward_ouro_primeira_vitoria, reward_xp_primeira_vitoria, ativo, "createdAt", "updatedAt")
         VALUES
           (:idDefinicao, :idMonstro, :idGatilho, :nomeExibicao, :lore,
            8, 6, 0.5, 3,
            500, 1000, true, NOW(), NOW())
         RETURNING id;`,
        {
          replacements: {
            idDefinicao: definicao.id,
            idMonstro: monstro.id,
            idGatilho: gatilho.id,
            nomeExibicao: "Custódio do Meridiano",
            lore:
              "\"Quem sincroniza as três câmaras desperta o que as guarda.\" — talhado na base do Núcleo da Convergência. O Custódio só se ergue depois que mecânica, óptica e hidráulica convergem — a prova final de que o Coração pode, de fato, ser restaurado.",
          },
          transaction: t,
        },
      );

      // 3 fases por %HP — mesma lógica do Guardião do Templo
      // (faseAtivaPara em templeBossScalingService, reaproveitado sem
      // alteração): a de MAIOR ordem cujo threshold ainda não foi
      // cruzado pra baixo está ativa.
      const fases = [
        { ordem: 0, hp_threshold_pct: 100, nome_exibicao: "Guarda Estável", dano_multiplicador: 1, defesa_multiplicador: 1, enrage: false },
        { ordem: 1, hp_threshold_pct: 50, nome_exibicao: "Convergência Instável", dano_multiplicador: 1.25, defesa_multiplicador: 1, enrage: false },
        { ordem: 2, hp_threshold_pct: 20, nome_exibicao: "Colapso Iminente", dano_multiplicador: 1.5, defesa_multiplicador: 0.75, enrage: true },
      ];
      for (const fase of fases) {
        await queryInterface.sequelize.query(
          `INSERT INTO event_puzzle_boss_phases
             (id_boss_config, ordem, hp_threshold_pct, nome_exibicao, dano_multiplicador, defesa_multiplicador, enrage, "createdAt", "updatedAt")
           VALUES (:idConfig, :ordem, :hpThreshold, :nome, :danoMult, :defesaMult, :enrage, NOW(), NOW());`,
          {
            replacements: {
              idConfig: config.id,
              ordem: fase.ordem,
              hpThreshold: fase.hp_threshold_pct,
              nome: fase.nome_exibicao,
              danoMult: fase.dano_multiplicador,
              defesaMult: fase.defesa_multiplicador,
              enrage: fase.enrage,
            },
            transaction: t,
          },
        );
      }

      // Autômato de engrenagens e pressão — imune a controles que
      // pressupõem corpo biológico (congelamento/paralisia), resistente
      // (nunca imune) a fogo, sem resistência especial a sangramento/
      // veneno (não tem carne nem sangue, mas o dano típico desses
      // status já é físico/elemental tratado por combatTypingService,
      // não pela resistência de status em si).
      const resistencias = [
        { status_key: "FREEZE", imune: true, resistencia_pct: 0 },
        { status_key: "PARALYZE", imune: true, resistencia_pct: 0 },
        { status_key: "STUN", imune: false, resistencia_pct: 50 },
        { status_key: "BURN", imune: false, resistencia_pct: 40 },
      ];
      for (const resistencia of resistencias) {
        await queryInterface.sequelize.query(
          `INSERT INTO event_puzzle_boss_status_resistances
             (id_boss_config, status_key, imune, resistencia_pct, "createdAt", "updatedAt")
           VALUES (:idConfig, :statusKey, :imune, :resistenciaPct, NOW(), NOW());`,
          {
            replacements: {
              idConfig: config.id,
              statusKey: resistencia.status_key,
              imune: resistencia.imune,
              resistenciaPct: resistencia.resistencia_pct,
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

      const [[config]] = await queryInterface.sequelize.query(
        `SELECT id, id_monstro_base FROM event_puzzle_boss_configs WHERE id_event_definition = :idDefinicao;`,
        { replacements: { idDefinicao: definicao.id }, transaction: t },
      );
      if (!config) return;

      await queryInterface.sequelize.query(
        `DELETE FROM event_puzzle_boss_reward_grants WHERE id_attempt IN (SELECT id FROM event_puzzle_boss_attempts WHERE id_event_edition IN (SELECT id FROM event_editions WHERE id_event_definition = :idDefinicao));`,
        { replacements: { idDefinicao: definicao.id }, transaction: t },
      );
      await queryInterface.sequelize.query(
        `DELETE FROM event_puzzle_boss_attempts WHERE id_event_edition IN (SELECT id FROM event_editions WHERE id_event_definition = :idDefinicao);`,
        { replacements: { idDefinicao: definicao.id }, transaction: t },
      );
      await queryInterface.sequelize.query(
        `DELETE FROM event_puzzle_boss_status_resistances WHERE id_boss_config = :idConfig;`,
        { replacements: { idConfig: config.id }, transaction: t },
      );
      await queryInterface.sequelize.query(
        `DELETE FROM event_puzzle_boss_phases WHERE id_boss_config = :idConfig;`,
        { replacements: { idConfig: config.id }, transaction: t },
      );
      await queryInterface.sequelize.query(
        `DELETE FROM event_puzzle_boss_configs WHERE id = :idConfig;`,
        { replacements: { idConfig: config.id }, transaction: t },
      );
      await queryInterface.sequelize.query(
        `DELETE FROM "AdventureMonsters" WHERE id = :idMonstro;`,
        { replacements: { idMonstro: config.id_monstro_base }, transaction: t },
      );
    });
  },
};
