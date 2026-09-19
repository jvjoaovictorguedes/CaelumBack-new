"use strict";

// Modo Aventura v1 — camada de "Áreas de Caça" sobre o PvE já existente
// (ver Especificacao_Modo_Aventura_v1_Caelum). O jogo não tinha catálogo
// de monstros (Aventura sempre gerou um inimigo com nome sorteado de
// uma lista fixa, calibrado só pelos atributos do JOGADOR — ver
// gerarInimigo em combatController.js); a spec pede monstros com
// identidade própria por área, então esta migration cria:
//
// - AdventureMonster: catálogo de perfis de combate (novo — não existia
//   nenhum catálogo de monstro antes disso).
// - AdventureZone: as áreas de caça.
// - AdventureZoneMonster: vínculo N:N zona<->monstro com peso de
//   aparição e tipo (Comum/Raro) — nada disso fica hardcoded no
//   controller, como a spec pede.
// - AdventureZoneLoot: tabela de espólio por zona, com flag pra marcar
//   entradas exclusivas do raro.
// - CharacterAdventureSession: sessão de caça ativa do personagem —
//   sem sessão ativa, gerarInimigoParaPersonagem (combatController.js)
//   passa a recusar a criação de um encontro novo.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("AdventureMonsters")) {
      await queryInterface.createTable("AdventureMonsters", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        nome: { type: Sequelize.STRING(100), allowNull: false, unique: true },
        descricao: { type: Sequelize.TEXT, allowNull: true },
        imagem_url: { type: Sequelize.STRING(255), allowNull: true },
        // Perfil de combate (§9) — multiplica em cima da calibração
        // padrão de gerarInimigo (que já parte dos atributos do
        // jogador), dando identidade a cada monstro sem inventar uma
        // escala de poder paralela: um "brute" sobe multiplicador_dano
        // e desce multiplicador_vida, um "tank" faz o oposto, etc.
        multiplicador_vida: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 1 },
        multiplicador_dano: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 1 },
        multiplicador_agilidade: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 1 },
        multiplicador_velocidade: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 1 },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
    }

    if (!tabelas.includes("AdventureZones")) {
      await queryInterface.createTable("AdventureZones", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        nome: { type: Sequelize.STRING(100), allowNull: false, unique: true },
        descricao: { type: Sequelize.TEXT, allowNull: true },
        nivel_monstro_min: { type: Sequelize.INTEGER, allowNull: false },
        nivel_monstro_max: { type: Sequelize.INTEGER, allowNull: false },
        imagem_url: { type: Sequelize.STRING(255), allowNull: true },
        ordem: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ativa: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
    }

    if (!tabelas.includes("AdventureZoneMonsters")) {
      await queryInterface.createTable("AdventureZoneMonsters", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_area: { type: Sequelize.INTEGER, allowNull: false, references: { model: "AdventureZones", key: "id" }, onDelete: "CASCADE" },
        id_monstro: { type: Sequelize.INTEGER, allowNull: false, references: { model: "AdventureMonsters", key: "id" } },
        // Peso relativo (§7) — não é percentual direto, é um peso
        // somado com os outros da mesma zona (ex.: 475/475/50 de 1000).
        peso_aparicao: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
        tipo_aparicao: { type: Sequelize.ENUM("Comum", "Raro"), allowNull: false, defaultValue: "Comum" },
        nivel_min_override: { type: Sequelize.INTEGER, allowNull: true },
        nivel_max_override: { type: Sequelize.INTEGER, allowNull: true },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex("AdventureZoneMonsters", ["id_area", "id_monstro"], {
        unique: true,
        name: "adventure_zone_monsters_area_monstro_unique",
      });
    }

    if (!tabelas.includes("AdventureZoneLoots")) {
      await queryInterface.createTable("AdventureZoneLoots", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_area: { type: Sequelize.INTEGER, allowNull: false, references: { model: "AdventureZones", key: "id" }, onDelete: "CASCADE" },
        id_item: { type: Sequelize.INTEGER, allowNull: false, references: { model: "Items", key: "id" } },
        peso: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
        quantidade_min: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        quantidade_max: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        // §12 — só entra no sorteio quando o encontro era o Raro da
        // zona (nunca aparece pros comuns).
        exclusivo_raro: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
    }

    if (!tabelas.includes("CharacterAdventureSessions")) {
      await queryInterface.createTable("CharacterAdventureSessions", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        // 1 sessão ativa por personagem — unique parcial (ativo=true)
        // seria ideal, mas pra ficar portável entre migrations futuras
        // a regra de "só uma ativa" é garantida em código
        // (adventureService.entrarNaZona sempre encerra a anterior).
        id_personagem: { type: Sequelize.INTEGER, allowNull: false, references: { model: "Characters", key: "id" }, onDelete: "CASCADE" },
        id_area: { type: Sequelize.INTEGER, allowNull: false, references: { model: "AdventureZones", key: "id" } },
        iniciado_em: { type: Sequelize.DATE, allowNull: false },
        encerrado_em: { type: Sequelize.DATE, allowNull: true },
        monstros_derrotados: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        raros_encontrados: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        xp_obtida: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ouro_obtido: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        espolios_obtidos: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex("CharacterAdventureSessions", ["id_personagem", "ativo"], {
        name: "character_adventure_sessions_personagem_ativo_idx",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("CharacterAdventureSessions");
    await queryInterface.dropTable("AdventureZoneLoots");
    await queryInterface.dropTable("AdventureZoneMonsters");
    await queryInterface.dropTable("AdventureZones");
    await queryInterface.dropTable("AdventureMonsters");
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_AdventureZoneMonsters_tipo_aparicao";`);
  },
};
