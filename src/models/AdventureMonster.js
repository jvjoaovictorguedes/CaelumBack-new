const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Catálogo de monstros do Modo Aventura — não existia nenhum catálogo
// de monstro antes disso (Aventura sempre gerou um nome sorteado de uma
// lista fixa em combatController.js, calibrado só pelos atributos do
// jogador). Cada linha aqui é um PERFIL de combate (§9 da spec): os
// multiplicadores entram em cima da calibração padrão de gerarInimigo
// (ver adventureEncounterService.js), dando identidade sem inventar uma
// escala de poder paralela.
//
// Reformulação V2 (Stats Fixos, migration 20261208010000-monstros-
// stats-fixos-expand) — multiplicador_* passam a ser LEGADO (removidos
// no Contract, só existem agora pra runtime antigo continuar
// funcionando durante o Switch). A fonte de verdade nova é o bloco de
// stats fixos abaixo: nivel/vida_maxima/dano_min/dano_max/agilidade/
// velocidade/xp_recompensa/ouro_recompensa, sempre os MESMOS em
// qualquer zona, Party, Caçada ou Bestiário — nunca mais sorteados ou
// derivados de personagem de referência. Nullable só até o Backfill
// (migration seguinte) preencher todo o catálogo existente.
//
// sprite_key: a coluna já existia no banco desde as migrations
// 20261026430000/20261026450000/20261026470000/20261026780000 —
// combatController/bestiaryService/partySocket já liam
// `monstro.sprite_key`, mas como o model nunca declarava o atributo, o
// Sequelize nunca populava esse valor (bug real, corrigido aqui).
const AdventureMonster = sequelize.define(
  "AdventureMonster",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    imagem_url: { type: DataTypes.STRING(255), allowNull: true },
    sprite_key: { type: DataTypes.STRING(100), allowNull: true },
    multiplicador_vida: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
    multiplicador_dano: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
    multiplicador_agilidade: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
    multiplicador_velocidade: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
    // --- Stats fixos V2 (nullable até o Backfill) ---
    nivel: { type: DataTypes.INTEGER, allowNull: true },
    vida_maxima: { type: DataTypes.INTEGER, allowNull: true },
    dano_min: { type: DataTypes.INTEGER, allowNull: true },
    dano_max: { type: DataTypes.INTEGER, allowNull: true },
    agilidade: { type: DataTypes.INTEGER, allowNull: true },
    velocidade: { type: DataTypes.INTEGER, allowNull: true },
    xp_recompensa: { type: DataTypes.INTEGER, allowNull: true },
    ouro_recompensa: { type: DataTypes.INTEGER, allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: "AdventureMonsters",
  },
);

module.exports = AdventureMonster;
