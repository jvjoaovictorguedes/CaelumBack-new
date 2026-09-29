"use strict";

// Ameaça Mundial V2 (Caelum_Especificacao_Ameaca_Mundial_V2.docx) —
// Etapa 1: migrations e modelos. Só schema nesta migration; a lógica de
// runtime/IA/socket/ranking que USA estas colunas entra nas etapas
// seguintes (worldBossRuntimeService, worldBossAiService, etc).
//
// Rollout seguro (§22.1): todo default aqui é NEUTRO — dano_min/
// dano_max de fase nascem em 0, furia_por_acao_pct nasce em 0, e o loop
// ofensivo do Boss só é ligado depois que os catálogos V2 forem
// configurados (feature flag entra na Etapa 3/4). Nenhum boss existente
// vira letal só por rodar esta migration.
//
// Tudo dentro de UMA transaction: sem isso, uma falha no meio (ex.: um
// nome de constraint duplicado, uma FK que não bate) deixa colunas já
// adicionadas mas a migration não registrada como aplicada — um retry
// então quebra em "column already exists" num passo que não tem nada de
// errado. Postgres permite ALTER TYPE ADD VALUE/RENAME VALUE dentro de
// transaction desde o PG12 (o único cuidado é não usar o valor novo
// numa comparação na MESMA transaction, o que não fazemos aqui).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // 4.1 — novos atributos de combate/raid do catálogo.
      await queryInterface.addColumn(
        "world_boss_configs",
        "nivel",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_configs",
        "forca",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_configs",
        "vitalidade",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_configs",
        "agilidade",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_configs",
        "inteligencia",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_configs",
        "velocidade",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_configs",
        "mana_maxima",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_configs",
        "regeneracao_mana_por_acao",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction },
      );
      // §3.2 — intervalo base do relógio global do Boss; 3000ms é o
      // "valor seguro" sugerido pela spec (§15.1) até o admin configurar.
      await queryInterface.addColumn(
        "world_boss_configs",
        "intervalo_acao_ms",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 3000 },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_configs",
        "reentrada_permitida",
        { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_configs",
        "cooldown_reentrada_segundos",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction },
      );

      // 5.1 — faixa de dano e curva de Fúria por fase. Defaults em 0 são
      // deliberados (§22.1): uma fase sem dano_max configurado não ataca
      // ninguém até o admin definir os números reais.
      await queryInterface.addColumn(
        "world_boss_phases",
        "dano_min",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_phases",
        "dano_max",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_phases",
        "furia_por_acao_pct",
        { type: Sequelize.DECIMAL(6, 2), allowNull: false, defaultValue: 0 },
        { transaction },
      );
      // NULL = sem limite (soft-enrage, §5.4) — só perigoso combinado
      // com furia_por_acao_pct > 0, que por sua vez nasce em 0 acima.
      await queryInterface.addColumn(
        "world_boss_phases",
        "limite_furia_pct",
        { type: Sequelize.DECIMAL(6, 2), allowNull: true },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_phases",
        "intervalo_acao_ms",
        { type: Sequelize.INTEGER, allowNull: true },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_phases",
        "mana_ao_entrar",
        { type: Sequelize.INTEGER, allowNull: true },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_phases",
        "ativo",
        { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        { transaction },
      );
      await queryInterface.addConstraint("world_boss_phases", {
        fields: ["dano_max"],
        type: "check",
        name: "world_boss_phases_dano_max_check",
        where: { dano_max: { [Sequelize.Op.gte]: Sequelize.col("dano_min") } },
        transaction,
      });

      // 9.1 — runtime persistente do evento (relógio/Furia/Mana/cast) e
      // 10.7 — vencedor oficial congelado do ranking.
      await queryInterface.addColumn(
        "world_boss_events",
        "mana_current",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_events",
        "boss_action_seq",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_events",
        "phase_action_seq",
        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_events",
        "furia_current_pct",
        { type: Sequelize.DECIMAL(6, 2), allowNull: false, defaultValue: 0 },
        { transaction },
      );
      // Scheduler multi-instância (§9.2) — NULL até o evento ficar ACTIVE
      // e o worker começar a agendar ações; nunca decidido em memória.
      await queryInterface.addColumn(
        "world_boss_events",
        "next_action_at",
        { type: Sequelize.DATE, allowNull: true },
        { transaction },
      );
      // Cooldowns/status/cast em andamento (§6.6/§9.1) — formato
      // definido pelas Etapas 5/6, aqui só o espaço reservado.
      await queryInterface.addColumn(
        "world_boss_events",
        "runtime_state",
        { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_events",
        "top_damage_character_id",
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "Characters", key: "id" },
          onDelete: "SET NULL",
        },
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_events",
        "top_damage_total",
        { type: Sequelize.BIGINT, allowNull: true },
        { transaction },
      );
      await queryInterface.addIndex("world_boss_events", ["status", "next_action_at"], {
        name: "world_boss_events_status_next_action_idx",
        transaction,
      });

      // 10.5 — desempate determinístico do ranking: last_damage_at só
      // avança quando dano EFETIVO > 0 (nunca em esquiva/ação sem dano —
      // isso é responsabilidade do service, não desta migration).
      await queryInterface.addColumn(
        "world_boss_contributions",
        "last_damage_at",
        { type: Sequelize.DATE, allowNull: true },
        { transaction },
      );

      // 8.1/15.6 — participante derrotado pelo Boss sai do pool de
      // alvos ativos, mas a contribuição permanece (a linha de
      // Contribution não é tocada por isto). derrotado_at alimenta o
      // cooldown de reentrada da Etapa 7.
      await queryInterface.sequelize.query(
        `ALTER TYPE "enum_world_boss_combat_sessions_status" ADD VALUE IF NOT EXISTS 'Derrotado';`,
        { transaction },
      );
      await queryInterface.addColumn(
        "world_boss_combat_sessions",
        "derrotado_at",
        { type: Sequelize.DATE, allowNull: true },
        { transaction },
      );

      // 11.2 — TOP_DAMAGE precisa existir no mesmo pipeline idempotente
      // de WorldBossRewardGrant. OPTIONAL_TOP era um valor da V1
      // reservado pra essa exata ideia e nunca chegou a ser usado em
      // nenhum service (grep confirmado) — renomear em vez de adicionar
      // um terceiro nome pro mesmo conceito. Guardado por uma checagem
      // no catálogo porque "RENAME VALUE" não é idempotente por si só.
      const [[{ existe: existeOptionalTop }]] = await queryInterface.sequelize.query(
        `
        SELECT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'OPTIONAL_TOP'
            AND enumtypid = 'enum_world_boss_reward_grants_reward_kind'::regtype
        ) AS existe;
      `,
        { transaction },
      );
      if (existeOptionalTop) {
        await queryInterface.sequelize.query(
          `ALTER TYPE "enum_world_boss_reward_grants_reward_kind" RENAME VALUE 'OPTIONAL_TOP' TO 'TOP_DAMAGE';`,
          { transaction },
        );
      }

      // 15.3 — novas tabelas: habilidades do Boss, resistência/imunidade
      // a status e faixas de recompensa por colocação no ranking.
      await queryInterface.createTable(
        "world_boss_abilities",
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
          id_world_boss_config: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "world_boss_configs", key: "id" },
            onDelete: "CASCADE",
          },
          id_power: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "Powers", key: "id" },
            onDelete: "RESTRICT",
          },
          peso_uso: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
          prioridade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          // Relação normalizada com as fases em que a habilidade é
          // elegível (§6.2) — array de id de world_boss_phases; vazio/
          // NULL = todas as fases do catálogo. Mantido simples (array de
          // INTEGER) em vez de uma tabela pivot pra não multiplicar
          // joins só pra listar habilidades elegíveis por fase —
          // reavaliar se algum dia precisar de metadado extra por
          // vínculo fase×habilidade.
          fases_permitidas: { type: Sequelize.ARRAY(Sequelize.INTEGER), allowNull: true },
          tipo_alvo: {
            type: Sequelize.ENUM("ALEATORIO", "MAIOR_DANO", "MENOR_VIDA", "N_ALEATORIOS", "TODOS", "SELF"),
            allowNull: false,
            defaultValue: "ALEATORIO",
          },
          quantidade_alvos: { type: Sequelize.INTEGER, allowNull: true },
          tempo_conjuracao_ms: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          cooldown_override: { type: Sequelize.INTEGER, allowNull: true },
          custo_mana_override: { type: Sequelize.INTEGER, allowNull: true },
          escala_com_furia: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
          updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        },
        { transaction },
      );
      await queryInterface.addIndex("world_boss_abilities", ["id_world_boss_config"], {
        name: "world_boss_abilities_config_idx",
        transaction,
      });

      await queryInterface.createTable(
        "world_boss_status_resistances",
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
          id_world_boss_config: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "world_boss_configs", key: "id" },
            onDelete: "CASCADE",
          },
          // Não é ENUM de propósito: a whitelist de verdade é
          // statusEffectConfig.CHAVES_VALIDAS (motor de status
          // existente, §7 "obrigatório: não criar um segundo sistema de
          // status") — um ENUM de banco duplicaria essa lista e
          // exigiria migration toda vez que o motor de status ganhasse
          // uma chave nova. Validado no model (isIn) e no service da
          // Etapa 6.
          status_key: { type: Sequelize.STRING(30), allowNull: false },
          imune: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          resistencia_pct: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
          updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        },
        { transaction },
      );
      await queryInterface.addConstraint("world_boss_status_resistances", {
        fields: ["id_world_boss_config", "status_key"],
        type: "unique",
        name: "world_boss_status_resistances_config_status_unique",
        transaction,
      });
      await queryInterface.addConstraint("world_boss_status_resistances", {
        fields: ["resistencia_pct"],
        type: "check",
        name: "world_boss_status_resistances_pct_range_check",
        where: {
          [Sequelize.Op.and]: [
            { resistencia_pct: { [Sequelize.Op.gte]: 0 } },
            { resistencia_pct: { [Sequelize.Op.lte]: 100 } },
          ],
        },
        transaction,
      });

      await queryInterface.createTable(
        "world_boss_ranking_rewards",
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
          id_world_boss_config: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "world_boss_configs", key: "id" },
            onDelete: "CASCADE",
          },
          posicao_inicio: { type: Sequelize.INTEGER, allowNull: false },
          posicao_fim: { type: Sequelize.INTEGER, allowNull: false },
          id_item: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: "Items", key: "id" },
            onDelete: "SET NULL",
          },
          quantidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          gold: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          xp: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
          updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        },
        { transaction },
      );
      await queryInterface.addConstraint("world_boss_ranking_rewards", {
        fields: ["posicao_fim"],
        type: "check",
        name: "world_boss_ranking_rewards_posicao_range_check",
        where: { posicao_fim: { [Sequelize.Op.gte]: Sequelize.col("posicao_inicio") } },
        transaction,
      });
      await queryInterface.addIndex("world_boss_ranking_rewards", ["id_world_boss_config"], {
        name: "world_boss_ranking_rewards_config_idx",
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("world_boss_ranking_rewards", { transaction });
      await queryInterface.dropTable("world_boss_status_resistances", { transaction });
      await queryInterface.dropTable("world_boss_abilities", { transaction });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_world_boss_abilities_tipo_alvo";', {
        transaction,
      });

      // Nota: Postgres não reverte ALTER TYPE ... RENAME VALUE nem ADD
      // VALUE de forma limpa dentro de um down() — reverter esses dois
      // exigiria recriar o tipo inteiro. Como ambos são só extensões de
      // whitelist (nunca removem um valor em uso), o down() desta
      // migration deliberadamente não desfaz o rename/add value;
      // reverter por completo, se algum dia necessário, é uma migration
      // própria.

      await queryInterface.removeColumn("world_boss_combat_sessions", "derrotado_at", { transaction });
      await queryInterface.removeColumn("world_boss_contributions", "last_damage_at", { transaction });

      await queryInterface.removeIndex("world_boss_events", "world_boss_events_status_next_action_idx", {
        transaction,
      });
      await queryInterface.removeColumn("world_boss_events", "top_damage_total", { transaction });
      await queryInterface.removeColumn("world_boss_events", "top_damage_character_id", { transaction });
      await queryInterface.removeColumn("world_boss_events", "runtime_state", { transaction });
      await queryInterface.removeColumn("world_boss_events", "next_action_at", { transaction });
      await queryInterface.removeColumn("world_boss_events", "furia_current_pct", { transaction });
      await queryInterface.removeColumn("world_boss_events", "phase_action_seq", { transaction });
      await queryInterface.removeColumn("world_boss_events", "boss_action_seq", { transaction });
      await queryInterface.removeColumn("world_boss_events", "mana_current", { transaction });

      await queryInterface.removeConstraint("world_boss_phases", "world_boss_phases_dano_max_check", {
        transaction,
      });
      await queryInterface.removeColumn("world_boss_phases", "ativo", { transaction });
      await queryInterface.removeColumn("world_boss_phases", "mana_ao_entrar", { transaction });
      await queryInterface.removeColumn("world_boss_phases", "intervalo_acao_ms", { transaction });
      await queryInterface.removeColumn("world_boss_phases", "limite_furia_pct", { transaction });
      await queryInterface.removeColumn("world_boss_phases", "furia_por_acao_pct", { transaction });
      await queryInterface.removeColumn("world_boss_phases", "dano_max", { transaction });
      await queryInterface.removeColumn("world_boss_phases", "dano_min", { transaction });

      await queryInterface.removeColumn("world_boss_configs", "cooldown_reentrada_segundos", { transaction });
      await queryInterface.removeColumn("world_boss_configs", "reentrada_permitida", { transaction });
      await queryInterface.removeColumn("world_boss_configs", "intervalo_acao_ms", { transaction });
      await queryInterface.removeColumn("world_boss_configs", "regeneracao_mana_por_acao", { transaction });
      await queryInterface.removeColumn("world_boss_configs", "mana_maxima", { transaction });
      await queryInterface.removeColumn("world_boss_configs", "velocidade", { transaction });
      await queryInterface.removeColumn("world_boss_configs", "inteligencia", { transaction });
      await queryInterface.removeColumn("world_boss_configs", "agilidade", { transaction });
      await queryInterface.removeColumn("world_boss_configs", "vitalidade", { transaction });
      await queryInterface.removeColumn("world_boss_configs", "forca", { transaction });
      await queryInterface.removeColumn("world_boss_configs", "nivel", { transaction });
    });
  },
};
