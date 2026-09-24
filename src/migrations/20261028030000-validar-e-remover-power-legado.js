"use strict";

// Evolução do Motor de Status §8.1/§9 — remove definitivamente o campo
// legado de status em Power. ANTES de dropar as colunas, valida que
// todo Power com efeito_status preenchido já tem uma linha equivalente
// em power_status_effects (criada pelo backfill de
// 20261026320000-power-status-effect.js) — se sobrar algum Power sem
// backfill (por exemplo, o texto de efeito_status não bateu com nenhuma
// chave conhecida naquele backfill), a migration ABORTA e lista os IDs
// em vez de perder o efeito silenciosamente.
module.exports = {
  async up(queryInterface) {
    const [powersComEfeitoLegado] = await queryInterface.sequelize.query(
      `SELECT id, nome, efeito_status FROM "Powers" WHERE efeito_status IS NOT NULL;`,
    );

    const semBackfill = [];
    for (const power of powersComEfeitoLegado) {
      const [[{ count }]] = await queryInterface.sequelize.query(
        `SELECT COUNT(*)::int AS count FROM power_status_effects WHERE id_power = :id_power;`,
        { replacements: { id_power: power.id } },
      );
      if (count === 0) semBackfill.push(power);
    }

    if (semBackfill.length > 0) {
      const lista = semBackfill.map((p) => `#${p.id} "${p.nome}" (efeito_status="${p.efeito_status}")`).join("; ");
      throw new Error(
        `[migration] ABORTADO: ${semBackfill.length} Power(s) com efeito_status legado sem nenhuma linha em ` +
          `power_status_effects — corrija manualmente antes de remover as colunas legadas: ${lista}`,
      );
    }

    console.log(
      `[migration] Verificação OK: ${powersComEfeitoLegado.length} Power(s) legado(s) já têm PowerStatusEffect equivalente. Removendo colunas legadas.`,
    );

    await queryInterface.removeColumn("Powers", "efeito_status");
    await queryInterface.removeColumn("Powers", "duracao_efeito");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("Powers", "efeito_status", { type: Sequelize.STRING(100), allowNull: true });
    await queryInterface.addColumn("Powers", "duracao_efeito", { type: Sequelize.INTEGER, allowNull: true });
  },
};
