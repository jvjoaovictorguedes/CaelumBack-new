"use strict";
module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      const opts = { transaction };
      await q.addColumn(
        "weapon_types",
        "legacy_tipo_arma",
        { type: S.STRING(30), allowNull: true, unique: true },
        opts,
      );
      for (const [key, legacy] of [
        ["SWORD", "Espada"],
        ["AXE", "Machado"],
        ["DAGGER", "Adaga"],
        ["SPEAR", "Lança"],
        ["STAFF", "Cajado"],
        ["ORB", "Orbe"],
      ])
        await q.sequelize.query(
          "UPDATE weapon_types SET legacy_tipo_arma=:legacy WHERE key=:key",
          { ...opts, replacements: { key, legacy } },
        );
      await q.addColumn(
        "Powers",
        "defensive_affinity_id",
        {
          type: S.INTEGER,
          allowNull: true,
          references: { model: "damage_affinity_types", key: "id" },
          onDelete: "RESTRICT",
        },
        opts,
      );
      await q.addColumn(
        "Powers",
        "defensive_received_pct",
        { type: S.DECIMAL(10, 4), allowNull: false, defaultValue: 0 },
        opts,
      );
      await q.addColumn(
        "Powers",
        "defensive_duration_turns",
        { type: S.INTEGER, allowNull: false, defaultValue: 0 },
        opts,
      );
    });
  },
  async down(q) {
    await q.sequelize.transaction(async (transaction) => {
      for (const col of [
        "defensive_affinity_id",
        "defensive_received_pct",
        "defensive_duration_turns",
      ])
        await q.removeColumn("Powers", col, { transaction });
      await q.removeColumn("weapon_types", "legacy_tipo_arma", { transaction });
    });
  },
};
