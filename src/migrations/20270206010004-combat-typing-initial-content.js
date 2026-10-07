"use strict";
// Initial DEV balance proposal. Names occur only in this content backfill, never
// in combat rules. Missing/previously classified creatures are left untouched.
const profiles = {
  HUMANOID: {},
  BEAST: { SLASH: 1.15, BLUNT: 0.9, FIRE: 1.15 },
  INSECT: { BLUNT: 1.25, PIERCE: 0.9, FIRE: 1.15 },
  PLANT: { SLASH: 1.25, FIRE: 1.25, WATER: 0.75, EARTH: 0.9 },
  AQUATIC: { LIGHTNING: 1.25, WATER: 0.6, FIRE: 0.75, ICE: 0.9 },
  UNDEAD: { BLUNT: 1.15, LIGHT: 1.25, DARK: 0.75, PIERCE: 0.9 },
  SPIRIT: { SLASH: 0.75, PIERCE: 0.75, BLUNT: 0.75, LIGHT: 1.25, DARK: 0.9 },
  CONSTRUCT: {
    SLASH: 0.75,
    PIERCE: 0.6,
    BLUNT: 1.25,
    EARTH: 0.6,
    LIGHTNING: 0.75,
    WIND: 1.25,
  },
  DRAGON: { FIRE: 0.75, SLASH: 0.9, PIERCE: 1.15, ICE: 1.15 },
  DEMON: { LIGHT: 1.25, DARK: 0.6, FIRE: 0.9, WATER: 1.15 },
};
const creatures = [
  ["Aparição Cinzenta", "SPIRIT", "Magico", "DARK"],
  ["Aranha Venenosa", "INSECT", "Fisico", "PIERCE"],
  ["Aranha de Pedra", "INSECT", "Fisico", "PIERCE"],
  ["Arqueiro Renegado", "HUMANOID", "Fisico", "PIERCE"],
  ["Bandido Errante", "HUMANOID", "Fisico", "SLASH"],
  ["Basilisco de Pedra", "BEAST", "Fisico", "PIERCE"],
  ["Capitão Mercenário", "HUMANOID", "Fisico", "SLASH"],
  ["Cavaleiro Amaldiçoado", "UNDEAD", "Fisico", "SLASH"],
  ["Chefe Orc Sangrento", "HUMANOID", "Fisico", "SLASH"],
  ["Cultista Renegado", "HUMANOID", "Magico", "DARK"],
  ["Cão de Guerra", "BEAST", "Fisico", "PIERCE"],
  ["Draco de Obsidiana", "DRAGON", "Fisico", "SLASH"],
  ["Draconídeo Jovem", "DRAGON", "Fisico", "SLASH"],
  ["Draconídeo Veterano", "DRAGON", "Fisico", "SLASH"],
  ["Elemental de Cinzas", "SPIRIT", "Magico", "FIRE"],
  ["Escorpião de Cinzas", "INSECT", "Fisico", "PIERCE"],
  ["Espectro Sussurrante", "SPIRIT", "Magico", "DARK"],
  ["Esqueleto Guardião", "UNDEAD", "Fisico", "SLASH"],
  ["Goblin Batedor", "HUMANOID", "Fisico", "PIERCE"],
  ["Goblin Saqueador", "HUMANOID", "Fisico", "SLASH"],
  ["Golem de Pedra", "CONSTRUCT", "Fisico", "BLUNT"],
  ["Guardião Rúnico Ancestral", "CONSTRUCT", "Magico", "EARTH"],
  ["Guardião Taurino", "BEAST", "Fisico", "BLUNT"],
  ["Harpia da Garganta", "BEAST", "Fisico", "SLASH"],
  ["Hidra Jovem", "DRAGON", "Fisico", "PIERCE"],
  ["Hiena das Cinzas", "BEAST", "Fisico", "PIERCE"],
  ["Javali Selvagem", "BEAST", "Fisico", "PIERCE"],
  ["Lobo Alfa da Campina", "BEAST", "Fisico", "PIERCE"],
  ["Lobo das Sombras", "BEAST", "Fisico", "PIERCE"],
  ["Lodo Vivo", "AQUATIC", "Fisico", "BLUNT"],
  ["Minotauro", "BEAST", "Fisico", "BLUNT"],
  ["Morcego Cristalino", "BEAST", "Fisico", "PIERCE"],
  ["Ogro do Labirinto", "HUMANOID", "Fisico", "BLUNT"],
  ["Orc Guerreiro", "HUMANOID", "Fisico", "SLASH"],
  ["Rato das Campinas", "BEAST", "Fisico", "PIERCE"],
  ["Salamandra de Obsidiana", "BEAST", "Magico", "FIRE"],
  ["Sapo Venenoso", "AQUATIC", "Fisico", "BLUNT"],
  ["Sentinela Rúnica", "CONSTRUCT", "Fisico", "BLUNT"],
  ["Serpente do Brejo", "BEAST", "Fisico", "PIERCE"],
  ["Troll das Pedras", "HUMANOID", "Fisico", "BLUNT"],
];
module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      const opts = { transaction };
      await q.createTable(
        "combat_typing_content_backup",
        {
          kind: { type: S.STRING(30), primaryKey: true },
          id: { type: S.INTEGER, primaryKey: true },
          before: { type: S.JSONB, allowNull: false },
          after: { type: S.JSONB, allowNull: false },
        },
        opts,
      );
      const backup = async (kind, id, before, after) =>
        q.bulkInsert(
          "combat_typing_content_backup",
          [
            {
              kind,
              id,
              before: JSON.stringify(before),
              after: JSON.stringify(after),
            },
          ],
          opts,
        );
      for (const [key, entries] of Object.entries(profiles)) {
        const [families] = await q.sequelize.query(
          "SELECT id,nome,default_affinity_profile_id FROM monster_families WHERE key=:key",
          { ...opts, replacements: { key } },
        );
        const family = families[0];
        if (!family || family.default_affinity_profile_id != null) continue;
        const [p] = await q.sequelize.query(
          'INSERT INTO combat_affinity_profiles (key,nome,descricao,ativo,ordem,"createdAt","updatedAt") VALUES (:key,:nome,\'Perfil inicial de teste; editável no Admin\',true,0,NOW(),NOW()) RETURNING id',
          {
            ...opts,
            replacements: {
              key: `INITIAL_${key}`,
              nome: `Inicial — ${family.nome}`,
            },
          },
        );
        const profileId = p[0].id;
        for (const [affinity, multiplier] of Object.entries(entries))
          await q.sequelize.query(
            'INSERT INTO combat_affinity_profile_entries (id_profile,id_affinity,multiplier,"createdAt","updatedAt") SELECT :id,id,:multiplier,NOW(),NOW() FROM damage_affinity_types WHERE key=:affinity',
            { ...opts, replacements: { id: profileId, affinity, multiplier } },
          );
        await backup(
          "family",
          family.id,
          { default_affinity_profile_id: null },
          { default_affinity_profile_id: profileId },
        );
        await q.sequelize.query(
          "UPDATE monster_families SET default_affinity_profile_id=:profileId WHERE id=:id",
          { ...opts, replacements: { profileId, id: family.id } },
        );
      }
      for (const [nome, family, nature, affinity] of creatures) {
        const [rows] = await q.sequelize.query(
          'SELECT id,monster_family_id,affinity_profile_id,basic_attack_nature,basic_attack_affinity_id FROM "AdventureMonsters" WHERE nome=:nome AND monster_family_id IS NULL AND affinity_profile_id IS NULL AND basic_attack_affinity_id IS NULL',
          { ...opts, replacements: { nome } },
        );
        if (!rows.length) continue;
        const row = rows[0];
        const [ids] = await q.sequelize.query(
          "SELECT f.id AS family,a.id AS affinity FROM monster_families f CROSS JOIN damage_affinity_types a WHERE f.key=:family AND a.key=:affinity",
          { ...opts, replacements: { family, affinity } },
        );
        if (!ids.length) continue;
        const after = {
          monster_family_id: ids[0].family,
          affinity_profile_id: null,
          basic_attack_nature: nature,
          basic_attack_affinity_id: ids[0].affinity,
        };
        const { id, ...before } = row;
        await backup("monster", id, before, after);
        await q.sequelize.query(
          'UPDATE "AdventureMonsters" SET monster_family_id=:monster_family_id,basic_attack_nature=:basic_attack_nature,basic_attack_affinity_id=:basic_attack_affinity_id WHERE id=:id',
          { ...opts, replacements: { ...after, id } },
        );
      }
      const [bonus] = await q.sequelize.query(
        "INSERT INTO weapon_type_family_bonuses (weapon_type_id,monster_family_id,damage_bonus_pct,\"createdAt\",\"updatedAt\") SELECT w.id,f.id,20,NOW(),NOW() FROM weapon_types w CROSS JOIN monster_families f WHERE w.key='HAMMER' AND f.key='CONSTRUCT' ON CONFLICT (weapon_type_id,monster_family_id) DO NOTHING RETURNING id",
        opts,
      );
      if (bonus.length) await backup("bonus", bonus[0].id, {}, {});
    });
  },
  async down(q) {
    await q.sequelize.transaction(async (transaction) => {
      const opts = { transaction };
      const [rows] = await q.sequelize.query(
        "SELECT * FROM combat_typing_content_backup",
        opts,
      );
      for (const row of rows.filter((r) => r.kind === "monster")) {
        const b = row.before,
          a = row.after;
        await q.sequelize.query(
          'UPDATE "AdventureMonsters" SET monster_family_id=:oldFamily,affinity_profile_id=:oldProfile,basic_attack_nature=:oldNature,basic_attack_affinity_id=:oldAffinity WHERE id=:id AND monster_family_id IS NOT DISTINCT FROM :newFamily AND affinity_profile_id IS NULL AND basic_attack_nature=:newNature AND basic_attack_affinity_id=:newAffinity',
          {
            ...opts,
            replacements: {
              id: row.id,
              oldFamily: b.monster_family_id,
              oldProfile: b.affinity_profile_id,
              oldNature: b.basic_attack_nature,
              oldAffinity: b.basic_attack_affinity_id,
              newFamily: a.monster_family_id,
              newNature: a.basic_attack_nature,
              newAffinity: a.basic_attack_affinity_id,
            },
          },
        );
      }
      for (const row of rows.filter((r) => r.kind === "bonus"))
        await q.sequelize.query(
          "DELETE FROM weapon_type_family_bonuses WHERE id=:id AND damage_bonus_pct=20",
          { ...opts, replacements: { id: row.id } },
        );
      for (const row of rows.filter((r) => r.kind === "family")) {
        await q.sequelize.query(
          "UPDATE monster_families SET default_affinity_profile_id=:before WHERE id=:id AND default_affinity_profile_id=:after",
          {
            ...opts,
            replacements: {
              id: row.id,
              before: row.before.default_affinity_profile_id,
              after: row.after.default_affinity_profile_id,
            },
          },
        );
        await q.sequelize.query(
          "DELETE FROM combat_affinity_profile_entries WHERE id_profile=:id",
          {
            ...opts,
            replacements: { id: row.after.default_affinity_profile_id },
          },
        );
        await q.sequelize.query(
          "DELETE FROM combat_affinity_profiles WHERE id=:id",
          {
            ...opts,
            replacements: { id: row.after.default_affinity_profile_id },
          },
        );
      }
      await q.dropTable("combat_typing_content_backup", opts);
    });
  },
};
