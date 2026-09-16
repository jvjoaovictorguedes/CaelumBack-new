"use strict";

const { QueryTypes } = require("sequelize");

// Mesma lógica da migration de CharacterAbilities: localiza a tabela pela
// coluna "nivel_aprendizado", que só existe em RaceAbilities, em vez de
// assumir o nome pluralizado da tabela.
async function findTableByColumn(queryInterface, columnName) {
  const rows = await queryInterface.sequelize.query(
    `SELECT table_name FROM information_schema.columns
     WHERE column_name = :columnName AND table_schema = current_schema()`,
    { replacements: { columnName }, type: QueryTypes.SELECT },
  );

  if (rows.length !== 1) {
    throw new Error(
      `Esperava encontrar exatamente 1 tabela com a coluna "${columnName}" (encontrei ${rows.length}). Abortando por segurança — confira manualmente antes de rodar de novo.`,
    );
  }

  return rows[0].table_name;
}

async function columnExists(queryInterface, tableName, columnName) {
  const description = await queryInterface.describeTable(tableName);
  return Object.prototype.hasOwnProperty.call(description, columnName);
}

module.exports = {
  async up(queryInterface) {
    const tableName = await findTableByColumn(queryInterface, "nivel_aprendizado");
    // Num banco criado do zero pela migration baseline, a tabela já nasce
    // com "id_raca" — não há o que renomear.
    if (!(await columnExists(queryInterface, tableName, "id_race"))) {
      console.log(`[migration] "${tableName}" já está com "id_raca" — pulando rename.`);
      return;
    }
    await queryInterface.renameColumn(tableName, "id_race", "id_raca");
  },

  async down(queryInterface) {
    const tableName = await findTableByColumn(queryInterface, "nivel_aprendizado");
    if (!(await columnExists(queryInterface, tableName, "id_raca"))) {
      console.log(`[migration] "${tableName}" já está com "id_race" — pulando rollback.`);
      return;
    }
    await queryInterface.renameColumn(tableName, "id_raca", "id_race");
  },
};
