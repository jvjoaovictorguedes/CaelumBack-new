"use strict";

// Evolução do Motor de Status §4.1 — SLOW deixa de existir como chave
// válida (não fica só "inativo": precisa impedir conteúdo novo
// acidental). Remove qualquer linha de power_status_effects com
// status_key='SLOW' sem convertê-la automaticamente pra outro status
// (§9 — só um humano decide isso, se algum dia for pedido).
module.exports = {
  async up(queryInterface) {
    const [linhas] = await queryInterface.sequelize.query(
      `SELECT id_power FROM power_status_effects WHERE status_key = 'SLOW';`,
    );
    if (linhas.length > 0) {
      console.log(
        `[migration] Removendo ${linhas.length} linha(s) de power_status_effects com status_key='SLOW' (Powers: ${linhas.map((l) => l.id_power).join(", ")}).`,
      );
    }
    await queryInterface.sequelize.query(`DELETE FROM power_status_effects WHERE status_key = 'SLOW';`);
  },

  // Não recria as linhas removidas — eram SLOW, chave que deixou de
  // existir. Rollback desta migration só reverte o "não deve mais
  // existir", não o conteúdo em si.
  async down() {},
};
