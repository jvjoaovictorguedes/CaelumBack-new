"use strict";
// Expand/backfill only: retain legacy weapon ENUM and all existing damage values.
module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      const opts = { transaction };
      const id = () => ({
        type: S.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      });
      const ref = (model, nullable = true) => ({
        type: S.INTEGER,
        allowNull: nullable,
        references: { model, key: "id" },
        onDelete: "RESTRICT",
      });
      const timestamps = () => ({
        createdAt: {
          type: S.DATE,
          allowNull: false,
          defaultValue: S.fn("NOW"),
        },
        updatedAt: {
          type: S.DATE,
          allowNull: false,
          defaultValue: S.fn("NOW"),
        },
      });
      const catalog = () => ({
        id: id(),
        key: { type: S.STRING(60), allowNull: false, unique: true },
        nome: { type: S.STRING(120), allowNull: false },
        descricao: { type: S.TEXT },
        icon_key: { type: S.STRING(120) },
        imagem_url: { type: S.STRING(500) },
        ativo: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
        ordem: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
        ...timestamps(),
      });
      await q.createTable(
        "damage_affinity_types",
        { ...catalog(), categoria: { type: S.STRING(20), allowNull: false } },
        opts,
      );
      await q.createTable("combat_affinity_profiles", catalog(), opts);
      await q.createTable(
        "combat_affinity_profile_entries",
        {
          id: id(),
          id_profile: ref("combat_affinity_profiles", false),
          id_affinity: ref("damage_affinity_types", false),
          multiplier: { type: S.DECIMAL(10, 4), allowNull: false },
          ...timestamps(),
        },
        opts,
      );
      await q.addIndex(
        "combat_affinity_profile_entries",
        ["id_profile", "id_affinity"],
        { unique: true, ...opts },
      );
      await q.createTable(
        "monster_families",
        {
          ...catalog(),
          default_affinity_profile_id: ref("combat_affinity_profiles"),
        },
        opts,
      );
      await q.createTable(
        "weapon_types",
        {
          ...catalog(),
          default_damage_nature: { type: S.STRING(20), allowNull: false },
          default_affinity_id: ref("damage_affinity_types"),
        },
        opts,
      );
      for (const [table, owner, target, value] of [
        [
          "equipment_affinity_modifiers",
          "id_item",
          "Items",
          "received_damage_pct",
        ],
        [
          "weapon_type_family_bonuses",
          "weapon_type_id",
          "weapon_types",
          "damage_bonus_pct",
        ],
        ["weapon_family_bonuses", "item_id", "Items", "damage_bonus_pct"],
        ["power_family_bonuses", "power_id", "Powers", "damage_bonus_pct"],
      ]) {
        const affinity = table === "equipment_affinity_modifiers";
        const other = affinity ? "id_affinity" : "monster_family_id";
        await q.createTable(
          table,
          {
            id: id(),
            [owner]: ref(target, false),
            [other]: ref(
              affinity ? "damage_affinity_types" : "monster_families",
              false,
            ),
            [value]: { type: S.DECIMAL(10, 4), allowNull: false },
            ...timestamps(),
          },
          opts,
        );
        await q.addIndex(table, [owner, other], { unique: true, ...opts });
      }
      const weapon = {
        weapon_type_id: ref("weapon_types"),
        damage_nature_override: { type: S.STRING(20) },
        affinity_mode: {
          type: S.STRING(20),
          allowNull: false,
          defaultValue: "INHERIT",
        },
        affinity_id: ref("damage_affinity_types"),
        native_element_id: ref("damage_affinity_types"),
        elemental_damage_pct: {
          type: S.DECIMAL(10, 4),
          allowNull: false,
          defaultValue: 0,
        },
      };
      const power = {
        affinity_mode: {
          type: S.STRING(20),
          allowNull: false,
          defaultValue: "NEUTRAL",
        },
        affinity_id: ref("damage_affinity_types"),
        added_affinity_id: ref("damage_affinity_types"),
        added_damage_pct: {
          type: S.DECIMAL(10, 4),
          allowNull: false,
          defaultValue: 0,
        },
        imbue_affinity_id: ref("damage_affinity_types"),
        imbue_damage_pct: {
          type: S.DECIMAL(10, 4),
          allowNull: false,
          defaultValue: 0,
        },
        imbue_duration_turns: {
          type: S.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
      };
      const monster = {
        monster_family_id: ref("monster_families"),
        affinity_profile_id: ref("combat_affinity_profiles"),
        basic_attack_nature: {
          type: S.STRING(20),
          allowNull: false,
          defaultValue: "Fisico",
        },
        basic_attack_affinity_id: ref("damage_affinity_types"),
      };
      for (const [table, fields] of [
        ["WeaponProperties", weapon],
        ["Powers", power],
        ["AdventureMonsters", monster],
        ["guild_boss_configs", monster],
        ["world_boss_configs", monster],
      ])
        for (const [name, definition] of Object.entries(fields))
          await q.addColumn(table, name, definition, opts);
      await q.sequelize.query(
        'ALTER TABLE "WeaponProperties" ALTER COLUMN tipo_arma DROP NOT NULL',
        opts,
      );
      const affinities = [
        ["SLASH", "Corte", "PHYSICAL"],
        ["PIERCE", "Perfuração", "PHYSICAL"],
        ["BLUNT", "Impacto", "PHYSICAL"],
        ["FIRE", "Fogo", "ELEMENTAL"],
        ["ICE", "Gelo", "ELEMENTAL"],
        ["LIGHTNING", "Raio", "ELEMENTAL"],
        ["WATER", "Água", "ELEMENTAL"],
        ["EARTH", "Terra", "ELEMENTAL"],
        ["WIND", "Vento", "ELEMENTAL"],
        ["LIGHT", "Luz", "ELEMENTAL"],
        ["DARK", "Trevas", "ELEMENTAL"],
      ];
      for (const [ordem, [key, nome, categoria]] of affinities.entries())
        await q.bulkInsert(
          "damage_affinity_types",
          [
            {
              key,
              nome,
              categoria,
              ativo: true,
              ordem,
              ...{ createdAt: new Date(), updatedAt: new Date() },
            },
          ],
          opts,
        );
      const families = [
        ["HUMANOID", "Humanoide"],
        ["BEAST", "Besta"],
        ["INSECT", "Inseto"],
        ["PLANT", "Planta"],
        ["AQUATIC", "Aquático"],
        ["UNDEAD", "Morto-vivo"],
        ["SPIRIT", "Espírito"],
        ["CONSTRUCT", "Construto"],
        ["DRAGON", "Dragão"],
        ["DEMON", "Demônio"],
      ];
      await q.bulkInsert(
        "monster_families",
        families.map(([key, nome], ordem) => ({
          key,
          nome,
          ordem,
          ativo: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        opts,
      );
      for (const [key, nome, nature, affinity, legacy] of [
        ["SWORD", "Espada", "Fisico", "SLASH", "Espada"],
        ["AXE", "Machado", "Fisico", "SLASH", "Machado"],
        ["DAGGER", "Adaga", "Fisico", "PIERCE", "Adaga"],
        ["SPEAR", "Lança", "Fisico", "PIERCE", "Lança"],
        ["HAMMER", "Martelo", "Fisico", "BLUNT", null],
        ["CLEAVER", "Cutelo", "Fisico", "SLASH", null],
        ["STAFF", "Cajado", "Magico", null, "Cajado"],
        ["BOOK", "Livro", "Magico", null, null],
        ["ORB", "Orbe", "Magico", null, "Orbe"],
      ]) {
        await q.sequelize.query(
          'INSERT INTO weapon_types (key,nome,default_damage_nature,default_affinity_id,ativo,ordem,"createdAt","updatedAt") SELECT :key,:nome,:nature,a.id,true,0,NOW(),NOW() FROM (SELECT 1) seed LEFT JOIN damage_affinity_types a ON a.key=:affinity',
          { ...opts, replacements: { key, nome, nature, affinity } },
        );
        if (legacy)
          await q.sequelize.query(
            'UPDATE "WeaponProperties" SET weapon_type_id=(SELECT id FROM weapon_types WHERE key=:key),damage_nature_override=tipo_dano::text WHERE tipo_arma::text=:legacy',
            { ...opts, replacements: { key, legacy } },
          );
      }
      await q.sequelize.query(
        "UPDATE \"Powers\" SET affinity_mode=CASE WHEN tipo_dano::text='Fisico' THEN 'INHERIT_WEAPON' ELSE 'NEUTRAL' END",
        opts,
      );
      for (const [key, description] of [
        ["combat_typing.view", "Consultar tipagens e afinidades"],
        ["combat_typing.manage", "Gerenciar tipagens e afinidades"],
      ]) {
        await q.sequelize.query(
          'INSERT INTO admin_permissions (chave,descricao,"createdAt","updatedAt") VALUES (:key,:description,NOW(),NOW()) ON CONFLICT (chave) DO NOTHING',
          { ...opts, replacements: { key, description } },
        );
        await q.sequelize.query(
          'INSERT INTO admin_role_permissions (id_role,id_permission,"createdAt","updatedAt") SELECT r.id,p.id,NOW(),NOW() FROM admin_roles r CROSS JOIN admin_permissions p WHERE r.nome=\'SuperAdmin\' AND p.chave=:key ON CONFLICT DO NOTHING',
          { ...opts, replacements: { key } },
        );
      }
    });
  },
  async down(q) {
    await q.sequelize.transaction(async (transaction) => {
      const opts = { transaction };
      // New catalog-only weapon types cannot be represented by the retained ENUM.
      const [unrepresentable] = await q.sequelize.query(
        'SELECT 1 FROM "WeaponProperties" WHERE tipo_arma IS NULL LIMIT 1',
        opts,
      );
      if (unrepresentable.length)
        throw new Error("Restore legacy weapon types before schema rollback.");
      for (const [table, names] of [
        [
          "WeaponProperties",
          [
            "weapon_type_id",
            "damage_nature_override",
            "affinity_mode",
            "affinity_id",
            "native_element_id",
            "elemental_damage_pct",
          ],
        ],
        [
          "Powers",
          [
            "affinity_mode",
            "affinity_id",
            "added_affinity_id",
            "added_damage_pct",
            "imbue_affinity_id",
            "imbue_damage_pct",
            "imbue_duration_turns",
          ],
        ],
        ...[
          "AdventureMonsters",
          "guild_boss_configs",
          "world_boss_configs",
        ].map((table) => [
          table,
          [
            "monster_family_id",
            "affinity_profile_id",
            "basic_attack_nature",
            "basic_attack_affinity_id",
          ],
        ]),
      ])
        for (const name of names) await q.removeColumn(table, name, opts);
      await q.sequelize.query(
        'ALTER TABLE "WeaponProperties" ALTER COLUMN tipo_arma SET NOT NULL',
        opts,
      );
      for (const table of [
        "power_family_bonuses",
        "weapon_family_bonuses",
        "weapon_type_family_bonuses",
        "equipment_affinity_modifiers",
        "combat_affinity_profile_entries",
        "weapon_types",
        "monster_families",
        "combat_affinity_profiles",
        "damage_affinity_types",
      ])
        await q.dropTable(table, opts);
      await q.sequelize.query(
        "DELETE FROM admin_role_permissions WHERE id_permission IN (SELECT id FROM admin_permissions WHERE chave IN ('combat_typing.view','combat_typing.manage'))",
        opts,
      );
      await q.sequelize.query(
        "DELETE FROM admin_permissions WHERE chave IN ('combat_typing.view','combat_typing.manage')",
        opts,
      );
    });
  },
};
