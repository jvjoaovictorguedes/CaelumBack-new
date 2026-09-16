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

async function columnExists(queryInterface, tableName, columnName) {
  const description = await queryInterface.describeTable(tableName);
  return Object.prototype.hasOwnProperty.call(description, columnName);
}

module.exports = {
  async up(queryInterface) {
    const tableName = await findTableByColumn(queryInterface, "level_learned");
    // Num banco criado do zero pela migration baseline, a tabela já nasce
    // com "id_personagem" — não há o que renomear.
    if (!(await columnExists(queryInterface, tableName, "id_character"))) {
      console.log(`[migration] "${tableName}" já está com "id_personagem" — pulando rename.`);
      return;
    }
    await queryInterface.renameColumn(tableName, "id_character", "id_personagem");
  },

  async down(queryInterface) {
    const tableName = await findTableByColumn(queryInterface, "level_learned");
    if (!(await columnExists(queryInterface, tableName, "id_personagem"))) {
      console.log(`[migration] "${tableName}" já está com "id_character" — pulando rollback.`);
      return;
    }
    await queryInterface.renameColumn(tableName, "id_personagem", "id_character");
  },
};
