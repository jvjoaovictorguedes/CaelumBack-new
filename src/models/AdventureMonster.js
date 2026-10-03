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
const AdventureMonster = sequelize.define(
  "AdventureMonster",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    // sprite_key (sprite animado fixo embutido no front) foi removido —
    // os 9 monstros legados que ainda dependiam dele (migration
    // 20261026450000) passam a usar imagem_url, igual aos outros 31 e
    // igual a Guild Boss/World Boss (nenhum dos dois nunca teve sprite
    // fixo). Ver migration 20270203010000-remove-sprite-key-monstro.js.
    imagem_url: { type: DataTypes.STRING(255), allowNull: true },
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
    // Especificação "Admin de Aventura + Defesa/Poder de Monstros" v3 —
    // mesma regra de mitigação do motor de combate (aplicarMitigacaoDeDefesa
    // em combatFormulas.js), nunca uma fórmula própria de monstro.
    defesa: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Emboscada da Expedição (Mineração/Silvicultura/Exploração) — admin
    // escolhe quais monstros do catálogo podem aparecer nela (ver
    // migration 20270114010000-monstro-disponivel-emboscada.js).
    disponivel_emboscada: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // IA de Combate PvE & Habilidades de Monstros V1 (§4.4) — BASIC
    // (default, nenhum monstro muda de comportamento até o Admin montar
    // uma build de verdade em MonsterAbility) -> TACTICAL -> BOSS ->
    // ELITE_BOSS (reservado ao Templo, não liberado nesta V1).
    ai_profile: {
      type: DataTypes.ENUM("BASIC", "TACTICAL", "BOSS", "ELITE_BOSS"),
      allowNull: false,
      defaultValue: "BASIC",
    },
  },
  {
    tableName: "AdventureMonsters",
  },
);

module.exports = AdventureMonster;
