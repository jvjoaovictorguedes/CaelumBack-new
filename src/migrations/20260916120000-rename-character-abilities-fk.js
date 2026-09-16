"use strict";

const { QueryTypes } = require("sequelize");

// Em vez de chutar o nome real da tabela (a pluralização automática do
// Sequelize pode ou não alterar "CharacterAbilities"), localizamos a tabela
// pela coluna "level_learned", que só existe nela. Se a busca não achar
// exatamente 1 tabela, a migration aborta em vez de arriscar mexer na
// tabela errada.
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
    const tableName = await findTableByColumn(queryInterface, "level_learned");
    await queryInterface.renameColumn(tableName, "id_character", "id_personagem");
  },

  async down(queryInterface) {
    const tableName = await findTableByColumn(queryInterface, "level_learned");
    await queryInterface.renameColumn(tableName, "id_personagem", "id_character");
  },
};
