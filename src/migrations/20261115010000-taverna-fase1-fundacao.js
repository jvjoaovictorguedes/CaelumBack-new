"use strict";

// Sistema de Taverna (Caelum_Taverna_Claude.docx) — Fase 1: Fundação.
// Descanso/Cardápio/Jogos, permissão tavern.manage e as 4 tabelas do
// domínio (§7 da spec): TavernMenuItem, CharacterTavernBuff, TavernGame,
// TavernGameBet. A Taverna nunca cria uma segunda fonte de verdade pra
// vida/mana/ouro — essas tabelas guardam só o que é exclusivo dela
// (buffs temporários e histórico de apostas).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("tavern_menu_items")) {
      await queryInterface.createTable("tavern_menu_items", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        nome: { type: Sequelize.STRING(100), allowNull: false, unique: true },
        descricao: { type: Sequelize.TEXT, allowNull: false },
        categoria: { type: Sequelize.ENUM("Refeicao", "Bebida"), allowNull: false },
        preco_gold: { type: Sequelize.INTEGER, allowNull: false, validate: { min: 0 } },
        // Chave validada em runtime contra tavernConfig.TAVERN_BUFF_KEYS —
        // nunca uma fórmula/nome livre executável vinda do banco (§6).
        buff_key: { type: Sequelize.STRING(40), allowNull: false },
        magnitude: { type: Sequelize.FLOAT, allowNull: false },
        duracao_segundos: { type: Sequelize.INTEGER, allowNull: false, validate: { min: 1 } },
        imagem_url: { type: Sequelize.STRING, allowNull: true },
        ordem: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addIndex("tavern_menu_items", ["categoria", "ativo"], {
        name: "tavern_menu_items_categoria_ativo_idx",
      });
    }

    if (!tabelas.includes("character_tavern_buffs")) {
      await queryInterface.createTable("character_tavern_buffs", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        categoria: { type: Sequelize.ENUM("Refeicao", "Bebida"), allowNull: false },
        // Snapshot no momento da compra (§8.1) — nunca recalculado a
        // partir do TavernMenuItem depois, pra editar o catálogo não
        // mudar um buff já ativo em jogadores.
        buff_key: { type: Sequelize.STRING(40), allowNull: false },
        magnitude: { type: Sequelize.FLOAT, allowNull: false },
        source_menu_item_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "tavern_menu_items", key: "id" },
          onDelete: "SET NULL",
        },
        activated_at: { type: Sequelize.DATE, allowNull: false },
        expires_at: { type: Sequelize.DATE, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      // Uma linha ATUAL por categoria (§7.2) — comprar de novo faz
      // upsert nesta mesma linha, nunca acumula histórico aqui (o
      // histórico de Taverna é só o de apostas, TavernGameBet).
      await queryInterface.addConstraint("character_tavern_buffs", {
        fields: ["id_personagem", "categoria"],
        type: "unique",
        name: "character_tavern_buffs_personagem_categoria_unique",
      });
      await queryInterface.addIndex("character_tavern_buffs", ["expires_at"], {
        name: "character_tavern_buffs_expires_at_idx",
      });
    }

    if (!tabelas.includes("tavern_games")) {
      await queryInterface.createTable("tavern_games", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        key: { type: Sequelize.STRING(40), allowNull: false, unique: true },
        nome: { type: Sequelize.STRING(100), allowNull: false },
        descricao: { type: Sequelize.TEXT, allowNull: false },
        presentation_key: {
          type: Sequelize.ENUM("COIN", "RUNES", "DICE_PARITY", "CARD_SIDE"),
          allowNull: false,
        },
        win_chance_ppm: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 500000 },
        payout_multiplier: { type: Sequelize.FLOAT, allowNull: false },
        min_bet: { type: Sequelize.INTEGER, allowNull: false, validate: { min: 1 } },
        max_bet: { type: Sequelize.INTEGER, allowNull: false },
        ordem: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
    }

    if (!tabelas.includes("tavern_game_bets")) {
      await queryInterface.createTable("tavern_game_bets", {
        id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
        // Idempotência por personagem (§7.4/§8.2) — o mesmo request_id
        // pro MESMO personagem nunca gera um segundo roll; personagens
        // diferentes podem gerar o mesmo UUID por coincidência
        // estatisticamente irrelevante, mas o unique é composto mesmo
        // assim pra bater exatamente com a regra descrita na spec.
        request_id: { type: Sequelize.STRING(64), allowNull: false },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        id_game: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "tavern_games", key: "id" },
          onDelete: "RESTRICT",
        },
        bet_amount: { type: Sequelize.INTEGER, allowNull: false },
        choice_key: { type: Sequelize.STRING(20), allowNull: false },
        outcome: { type: Sequelize.ENUM("Win", "Lose"), allowNull: false },
        payout_amount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        net_change: { type: Sequelize.INTEGER, allowNull: false },
        // Auditoria técnica do roll (§7.4) — nunca devolvido ao
        // cliente antes da aposta, só guardado pra investigar disputa/
        // abuso depois.
        roll_ppm: { type: Sequelize.INTEGER, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addConstraint("tavern_game_bets", {
        fields: ["id_personagem", "request_id"],
        type: "unique",
        name: "tavern_game_bets_personagem_request_unique",
      });
      await queryInterface.addIndex("tavern_game_bets", ["id_personagem", "createdAt"], {
        name: "tavern_game_bets_personagem_data_idx",
      });
      await queryInterface.addIndex("tavern_game_bets", ["id_game", "createdAt"], {
        name: "tavern_game_bets_jogo_data_idx",
      });
    }

    // Permissão tavern.manage (mesmo padrão de
    // 20261101010000-admin-panel-fase1-permissoes.js) — Conteúdo ganha
    // por padrão (Taverna é conteúdo/catálogo balanceável), SuperAdmin
    // sempre ganha tudo.
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'tavern.manage' LIMIT 1;`,
    );
    if (existente.length === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt")
         VALUES ('tavern.manage', 'Criar/editar/desativar cardápio, jogos e configurações da Taverna', now(), now());`,
      );
    }

    const [[permissao]] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'tavern.manage' LIMIT 1;`,
    );
    const rolesParaEstender = ["Conteudo", "SuperAdmin"];
    for (const nomeRole of rolesParaEstender) {
      const [[role]] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_roles WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: nomeRole } },
      );
      if (!role || !permissao) continue;
      await queryInterface.sequelize.query(
        `INSERT INTO admin_role_permissions (id_role, id_permission, "createdAt", "updatedAt")
         VALUES (:idRole, :idPermission, now(), now())
         ON CONFLICT DO NOTHING;`,
        { replacements: { idRole: role.id, idPermission: permissao.id } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM admin_role_permissions WHERE id_permission = (SELECT id FROM admin_permissions WHERE chave = 'tavern.manage');`,
    );
    await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = 'tavern.manage';`);

    await queryInterface.dropTable("tavern_game_bets");
    await queryInterface.dropTable("tavern_games");
    await queryInterface.dropTable("character_tavern_buffs");
    await queryInterface.dropTable("tavern_menu_items");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_tavern_game_bets_outcome";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_tavern_games_presentation_key";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_character_tavern_buffs_categoria";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_tavern_menu_items_categoria";');
  },
};
