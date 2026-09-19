const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Vínculo N:N zona<->monstro (§6/§7/§23) — peso_aparicao é configurável
// aqui, nunca hardcoded no controller. tipo_aparicao decide se essa
// entrada conta como o(s) Comum(ns) ou o Raro da zona (§10/§11/§12
// dependem dessa marcação pra dar recompensa/loot maiores).
const AdventureZoneMonster = sequelize.define(
  "AdventureZoneMonster",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_area: { type: DataTypes.INTEGER, allowNull: false },
    id_monstro: { type: DataTypes.INTEGER, allowNull: false },
    peso_aparicao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
    tipo_aparicao: { type: DataTypes.ENUM("Comum", "Raro"), allowNull: false, defaultValue: "Comum" },
    // Override opcional (§8) — quando NULL, usa a faixa da própria
    // AdventureZone; o Raro normalmente usa isso pra ficar mais perto
    // do topo da faixa da região.
    nivel_min_override: { type: DataTypes.INTEGER, allowNull: true },
    nivel_max_override: { type: DataTypes.INTEGER, allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: "AdventureZoneMonsters",
    indexes: [
      { unique: true, fields: ["id_area", "id_monstro"], name: "adventure_zone_monsters_area_monstro_unique" },
    ],
  },
);

module.exports = AdventureZoneMonster;
