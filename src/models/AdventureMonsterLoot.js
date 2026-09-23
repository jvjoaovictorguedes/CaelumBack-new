const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Espólio por MONSTRO (Expansão Aventura Beta §20) — substitui
// AdventureZoneLoot (por zona) como fonte de loot da Aventura: o modelo
// antigo deixava um monstro receber drop de outro da mesma área (ex.:
// Lobo dropando Teia de Aranha só por estarem na mesma zona). Cada
// entrada rola INDEPENDENTE (§21 — ver adventureRewardService.js),
// nunca uma escolha exclusiva entre os drops do mesmo monstro.
// AdventureZoneLoot continua existindo no banco (não apagado nesta
// expansão, §22 passo 5), só deixa de ser lido pelo service.
const AdventureMonsterLoot = sequelize.define(
  "AdventureMonsterLoot",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_monstro: { type: DataTypes.INTEGER, allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    // Partes por milhão — 650000 = 65%, 1000000 = 100% (§19).
    chance_ppm: { type: DataTypes.INTEGER, allowNull: false },
    quantidade_min: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    quantidade_max: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    categoria: {
      type: DataTypes.ENUM("Principal", "Secundario", "Especial"),
      allowNull: false,
      defaultValue: "Principal",
    },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: "AdventureMonsterLoots",
  },
);

module.exports = AdventureMonsterLoot;
