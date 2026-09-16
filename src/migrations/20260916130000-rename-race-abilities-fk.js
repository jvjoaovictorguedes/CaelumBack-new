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

module.exports = {
  async up(queryInterface) {
    const tableName = await findTableByColumn(queryInterface, "nivel_aprendizado");
    await queryInterface.renameColumn(tableName, "id_race", "id_raca");
  },

  async down(queryInterface) {
    const tableName = await findTableByColumn(queryInterface, "nivel_aprendizado");
    await queryInterface.renameColumn(tableName, "id_raca", "id_race");
  },
};
