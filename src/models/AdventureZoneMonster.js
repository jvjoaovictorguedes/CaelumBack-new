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
    // LEGADO (Reformulação V2) — nivel_min_override/nivel_max_override
    // só existem enquanto o sorteio antigo (adventureRollService.
    // sortearNivelMonstro) não for removido no Contract. AdventureMonster.
    // nivel é a ÚNICA fonte de verdade do nível-base a partir do Switch.
    nivel_min_override: { type: DataTypes.INTEGER, allowNull: true },
    nivel_max_override: { type: DataTypes.INTEGER, allowNull: true },
    // V2 (§4.3) — controla só ELEGIBILIDADE de aparição: jogador abaixo
    // disso não vê esse vínculo no pool ponderado. Nunca altera
    // AdventureMonster.nivel/stats.
    nivel_jogador_minimo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
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
