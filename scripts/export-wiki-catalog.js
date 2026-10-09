// Exports only game catalogs. No account, character, inventory or audit data.
const fs = require("node:fs");
const path = require("node:path");
process.env.DOTENV_CONFIG_QUIET = "true";
require("dotenv").config({ quiet: true });
const TABLES = [
  "AdventureMonsters",
  "AdventureZones",
  "AdventureZoneMonsters",
  "AdventureMonsterLoots",
  "Items",
  "Powers",
  "Classes",
  "Races",
  "monster_abilities",
  "monster_ability_conditions",
  "class_evolution_paths",
  "class_evolution_requirements",
  "class_evolution_abilities",
  "wiki_articles",
  "damage_affinity_types",
  "weapon_types",
  "monster_families",
  "combat_affinity_profiles",
  "combat_affinity_profile_entries",
  "weapon_type_family_bonuses",
];
async function exportCatalog(sequelize, { environment = "unknown" } = {}) {
  return sequelize.transaction(
    { isolationLevel: "REPEATABLE READ" },
    async (transaction) => {
      await sequelize.query("SET TRANSACTION READ ONLY", { transaction });
      await sequelize.query("SET LOCAL statement_timeout = '20s'", {
        transaction,
      });
      const [available] = await sequelize.query(
        "SELECT table_name AS catalog_table FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
        { transaction },
      );
      const names = new Set(available.map((r) => r.catalog_table));
      const result = {
        format: "caelum-wiki-catalog-v1",
        exported_at: new Date().toISOString(),
        environment,
        read_only: true,
        tables: {},
        missing_tables: [],
      };
      for (const table of TABLES) {
        if (!names.has(table)) {
          result.missing_tables.push(table);
          continue;
        }
        // Table identifiers originate exclusively from the constant allowlist above.
        const [rows] = await sequelize.query(
          `SELECT * FROM "${table}" ORDER BY id LIMIT 20001`,
          { transaction },
        );
        if (rows.length > 20000)
          throw new Error(
            `Catálogo ${table} excede o limite de exportação. Nenhum arquivo incompleto foi gerado.`,
          );
        result.tables[table] = rows;
      }
      return result;
    },
  );
}
async function main() {
  const production = process.argv.includes("--production");
  if (production && process.env.CAELUM_RELEASE_ENV !== "production")
    throw new Error(
      "Execute no backend de produção com CAELUM_RELEASE_ENV=production.",
    );
  const { sequelize } = require("../src/config/database");
  try {
    const data = await exportCatalog(sequelize, {
      environment: process.env.CAELUM_RELEASE_ENV || "development",
    });
    const json = JSON.stringify(data, null, 2) + "\n";
    if (process.argv.includes("--stdout")) process.stdout.write(json);
    else {
      const target = path.resolve(
        process.argv.find((arg) => arg.startsWith("--output="))?.slice(9) ||
          "/tmp/caelum-wiki-producao.json",
      );
      fs.writeFileSync(target, json, { mode: 0o600 });
      console.log(`Catálogos exportados em modo somente leitura: ${target}`);
      for (const [name, rows] of Object.entries(data.tables))
        console.log(`${name}: ${rows.length} registros`);
      console.log(
        "Contas, personagens, senhas, tokens, inventários e auditorias não foram consultados.",
      );
    }
  } finally {
    await sequelize.close();
  }
}
if (require.main === module)
  main().catch((e) => {
    console.error(
      e.message.startsWith("Execute ") || e.message.startsWith("Catálogo ")
        ? e.message
        : "Não foi possível exportar os catálogos. Confira a conexão e o acesso de leitura ao banco.",
    );
    process.exitCode = 1;
  });
module.exports = { exportCatalog, TABLES };
