"use strict";

// Evento "O Coração da Máquina Celestial" — Fase 1 (Fundação Persistente,
// Schemas e Ciclo de Vida), conforme Fase 0 revisada (aprovada). Cria só
// as 5 entidades de domínio pedidas — EventDefinition, EventEdition,
// PuzzleBlueprint(+Version), PuzzleInstance, PuzzleParticipant — sem
// Pioneiros, pistas, recompensas ou boss (isso é Fase 2+).
//
// Decisões de arquitetura (ver relatório de entrega da Fase 1 pro
// raciocínio completo):
//
// 1. Versionamento de Blueprint: identidade lógica (`puzzle_blueprints`)
//    + revisão imutável publicada (`puzzle_blueprint_versions`, UNIQUE
//    (id_blueprint, version)). PuzzleInstance aponta pra
//    id_blueprint_version exata, nunca pra "blueprint atual" — editar um
//    draft depois de publicado nunca muda uma instância existente,
//    porque a instância referencia a REVISÃO, não a identidade.
//
// 2. Concorrência de PuzzleInstance: `state_version` é autoritativo no
//    Postgres (INTEGER, nunca confiar em cópia em memória/cliente).
//    `actionGuardService.exclusive()` é process-local — NÃO é suficiente
//    com múltiplas réplicas, então nenhuma mutação de PuzzleInstance
//    depende dele como garantia; a garantia real é o UPDATE condicional
//    `WHERE id=:id AND state_version=:expectedVersion` (ver
//    puzzleInstanceService.aplicarMutacao). actionGuardService.
//    assertVersion() continua útil como validação rápida em memória,
//    mas nunca substitui essa garantia atômica do banco.
//
// 3. Lifecycles são DELIBERADAMENTE diferentes por entidade (nunca um
//    enum de status compartilhado) — ver os 4 ENUMs abaixo.
//
// 4. "1 ativa por X": só aplicado onde o invariante é limpo de expressar
//    num índice parcial de 1 tabela (EventEdition: 1 ACTIVE por
//    definição). Para "1 PuzzleInstance ativa por personagem por
//    blueprint", NÃO foi criado um índice parcial cross-table (exigiria
//    desnormalizar id_blueprint em puzzle_participants só pra isso) —
//    a garantia é um check-then-create transacional em
//    puzzleInstanceService (mesma honestidade de trade-off documentada
//    no relatório de entrega, seção 13 da encomenda).
module.exports = {
  async up(queryInterface, Sequelize) {
    const S = Sequelize;

    await queryInterface.createTable("event_definitions", {
      id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      key: { type: S.STRING(60), allowNull: false, unique: true },
      nome: { type: S.STRING(160), allowNull: false },
      descricao: { type: S.TEXT, allowNull: true },
      // DRAFT: ainda não pronto pra ter edições/blueprints publicados.
      // PUBLISHED: template em uso, pode ganhar novas edições.
      // ARCHIVED: terminal — nunca mais edições/blueprints novos.
      status: {
        type: S.ENUM("DRAFT", "PUBLISHED", "ARCHIVED"),
        allowNull: false,
        defaultValue: "DRAFT",
      },
      // Notas administrativas internas (ex.: link do doc de design) —
      // nunca exposto em DTO público nenhum.
      metadata: { type: S.JSONB, allowNull: true },
      createdAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
      updatedAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
    });

    await queryInterface.createTable("event_editions", {
      id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_event_definition: {
        type: S.INTEGER,
        allowNull: false,
        references: { model: "event_definitions", key: "id" },
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
      key: { type: S.STRING(60), allowNull: false },
      nome: { type: S.STRING(160), allowNull: false },
      // DRAFT → SCHEDULED → ACTIVE → ENDED, com CANCELLED alcançável de
      // qualquer estado não-terminal (ver eventEditionService.TRANSICOES).
      status: {
        type: S.ENUM("DRAFT", "SCHEDULED", "ACTIVE", "ENDED", "CANCELLED"),
        allowNull: false,
        defaultValue: "DRAFT",
      },
      starts_at: { type: S.DATE, allowNull: true },
      ends_at: { type: S.DATE, allowNull: true },
      metadata: { type: S.JSONB, allowNull: true },
      createdAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
      updatedAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
    });
    await queryInterface.addConstraint("event_editions", {
      fields: ["id_event_definition", "key"],
      type: "unique",
      name: "event_editions_id_event_definition_key_unique",
    });
    await queryInterface.sequelize.query(
      `ALTER TABLE event_editions ADD CONSTRAINT event_editions_ends_at_depois_de_starts_at
       CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at);`,
    );
    await queryInterface.addIndex("event_editions", ["id_event_definition"]);
    // Só 1 edição ACTIVE por definição por vez — mesmo padrão de
    // "1 ativa por X" já comprovado em character_adventure_hunts
    // (20261105050000-cacadas-tabelas.js), aplicado aqui no nível de
    // edição em vez de personagem.
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX event_editions_uma_ativa_por_definicao
       ON event_editions (id_event_definition)
       WHERE status = 'ACTIVE';`,
    );

    await queryInterface.createTable("puzzle_blueprints", {
      id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_event_definition: {
        type: S.INTEGER,
        allowNull: false,
        references: { model: "event_definitions", key: "id" },
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
      key: { type: S.STRING(60), allowNull: false },
      nome: { type: S.STRING(160), allowNull: false },
      // Notas de design internas — nunca a fonte do Public Blueprint
      // DTO (esse vem de campos curados dentro de
      // puzzle_blueprint_versions.config, nunca deste texto livre).
      descricao: { type: S.TEXT, allowNull: true },
      createdAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
      updatedAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
    });
    await queryInterface.addConstraint("puzzle_blueprints", {
      fields: ["id_event_definition", "key"],
      type: "unique",
      name: "puzzle_blueprints_id_event_definition_key_unique",
    });

    await queryInterface.createTable("puzzle_blueprint_versions", {
      id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_blueprint: {
        type: S.INTEGER,
        allowNull: false,
        references: { model: "puzzle_blueprints", key: "id" },
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
      version: { type: S.INTEGER, allowNull: false },
      // DRAFT → PUBLISHED → ARCHIVED (ou DRAFT → ARCHIVED, abandonar sem
      // publicar). PUBLISHED é IMUTÁVEL — nenhuma linha com
      // status != DRAFT pode ter `config` alterado
      // (puzzleBlueprintService.atualizarDraft valida isso).
      status: {
        type: S.ENUM("DRAFT", "PUBLISHED", "ARCHIVED"),
        allowNull: false,
        defaultValue: "DRAFT",
      },
      // Definição estrutural declarativa do puzzle — pode conter campos
      // secretos (ex.: golden_solution) que NUNCA saem num DTO público;
      // a filtragem é sempre feita no service, nunca confiar em quem lê
      // a coluna direto. Guarda de tamanho é no service (ver
      // puzzleBlueprintService.MAX_CONFIG_BYTES), não aqui — Postgres
      // não tem um jeito prático de CHECK em tamanho de JSONB.
      config: { type: S.JSONB, allowNull: false, defaultValue: {} },
      published_at: { type: S.DATE, allowNull: true },
      published_by_admin_id: {
        type: S.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },
      createdAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
      updatedAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
    });
    await queryInterface.addConstraint("puzzle_blueprint_versions", {
      fields: ["id_blueprint", "version"],
      type: "unique",
      name: "puzzle_blueprint_versions_id_blueprint_version_unique",
    });
    await queryInterface.sequelize.query(
      `ALTER TABLE puzzle_blueprint_versions ADD CONSTRAINT puzzle_blueprint_versions_version_positiva
       CHECK (version > 0);`,
    );
    await queryInterface.addIndex("puzzle_blueprint_versions", ["id_blueprint", "status"]);

    await queryInterface.createTable("puzzle_instances", {
      id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_event_edition: {
        type: S.INTEGER,
        allowNull: false,
        references: { model: "event_editions", key: "id" },
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
      // Referência exata e IMUTÁVEL à revisão usada na criação — nunca
      // atualizada depois, mesmo que uma versão mais nova seja publicada.
      id_blueprint_version: {
        type: S.INTEGER,
        allowNull: false,
        references: { model: "puzzle_blueprint_versions", key: "id" },
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
      // CREATED → ACTIVE → COMPLETED|FAILED|ABANDONED|EXPIRED (CREATED e
      // ACTIVE também alcançam ABANDONED/EXPIRED direto — ver
      // puzzleInstanceService.TRANSICOES_VALIDAS). Nenhuma transição de
      // volta; os 4 terminais nunca mudam de novo.
      status: {
        type: S.ENUM("CREATED", "ACTIVE", "COMPLETED", "FAILED", "ABANDONED", "EXPIRED"),
        allowNull: false,
        defaultValue: "CREATED",
      },
      // Estado mutável da EXECUÇÃO (progresso) — nunca config estrutural
      // (isso é do Blueprint/version). Convenção reservada: só o
      // subárvore `state.public` é devolvida em DTO de runtime; qualquer
      // outra chave é só-servidor. Guarda de tamanho em app-level, não
      // DB-level (mesmo motivo do config acima).
      state: { type: S.JSONB, allowNull: false, defaultValue: {} },
      // Autoritativo no Postgres — toda mutação precisa do UPDATE
      // condicional `WHERE id=:id AND state_version=:expectedVersion`;
      // nunca confiar em contador local/em memória.
      state_version: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
      // Gerado só no servidor (crypto), nunca aceito do cliente.
      seed: { type: S.STRING(64), allowNull: false },
      started_at: { type: S.DATE, allowNull: true },
      completed_at: { type: S.DATE, allowNull: true },
      // Gancho de housekeeping futuro (expiração automática) — nullable,
      // sem lógica nenhuma de enforcement nesta fase.
      expires_at: { type: S.DATE, allowNull: true },
      createdAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
      updatedAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
    });
    await queryInterface.sequelize.query(
      `ALTER TABLE puzzle_instances ADD CONSTRAINT puzzle_instances_state_version_nao_negativa
       CHECK (state_version >= 0);`,
    );
    await queryInterface.addIndex("puzzle_instances", ["id_event_edition"]);
    await queryInterface.addIndex("puzzle_instances", ["id_blueprint_version"]);
    await queryInterface.addIndex("puzzle_instances", ["status"]);

    await queryInterface.createTable("puzzle_participants", {
      id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_instance: {
        type: S.INTEGER,
        allowNull: false,
        references: { model: "puzzle_instances", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      // Nullable + SET NULL — histórico do puzzle sobrevive à exclusão
      // da conta (mesma política já usada em GuildLog/GuildTreasury).
      id_personagem: {
        type: S.INTEGER,
        allowNull: true,
        references: { model: "Characters", key: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },
      // Snapshot mínimo pra manter a linha legível depois de um SET
      // NULL — nunca duplicar o resto dos dados pessoais do personagem.
      personagem_nome_snapshot: { type: S.STRING(120), allowNull: false },
      // SOLO hoje; MEMBER reservado pra Fase 2+ (party/colaboração) —
      // nenhuma lógica de colaboração implementada nesta fase, só o
      // campo existe pra não precisar de migration destrutiva depois.
      role: {
        type: S.STRING(20),
        allowNull: false,
        defaultValue: "SOLO",
      },
      joined_at: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
      // Reservado pra Fase 2+ (saída antecipada de um grupo) — sem
      // lógica nenhuma de enforcement nesta fase.
      left_at: { type: S.DATE, allowNull: true },
      createdAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
      updatedAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
    });
    await queryInterface.sequelize.query(
      `ALTER TABLE puzzle_participants ADD CONSTRAINT puzzle_participants_role_valido
       CHECK (role IN ('SOLO', 'MEMBER'));`,
    );
    // Nunca o mesmo personagem 2x na MESMA instância (pedido explícito
    // da encomenda, seção 4).
    await queryInterface.addConstraint("puzzle_participants", {
      fields: ["id_instance", "id_personagem"],
      type: "unique",
      name: "puzzle_participants_id_instance_id_personagem_unique",
    });
    await queryInterface.addIndex("puzzle_participants", ["id_personagem"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("puzzle_participants");
    await queryInterface.dropTable("puzzle_instances");
    await queryInterface.dropTable("puzzle_blueprint_versions");
    await queryInterface.dropTable("puzzle_blueprints");
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS event_editions_uma_ativa_por_definicao;`);
    await queryInterface.dropTable("event_editions");
    await queryInterface.dropTable("event_definitions");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_puzzle_instances_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_puzzle_blueprint_versions_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_event_editions_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_event_definitions_status";');
  },
};
