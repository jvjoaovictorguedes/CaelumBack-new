"use strict";

// Bug reportado: "alguns atributos de equipamentos dão valores quebrados
// (1.1 / 1.3 / 1.5 / etc) — corrija pra que os valores sejam exatos e
// não quebrados". Origem: várias migrations de forja calculavam
// `WeaponProperties.valor_bonus_atributo` com
// `Math.round(1 * fator * 10) / 10` (arredondava pra 1 casa decimal, não
// pra inteiro), e a coluna sempre foi FLOAT — diferente das colunas
// equivalentes de ArmorProperties (bonus_forca/bonus_vitalidade/...),
// que sempre foram INTEGER. Corrige os dois lados: arredonda o que já
// existe e muda a coluna pra INTEGER, pra nunca mais salvar fração
// (armas antigas continuam idempotentes: rodar de novo não muda nada).
module.exports = {
  async up(queryInterface, Sequelize) {
    const [afetados] = await queryInterface.sequelize.query(
      `UPDATE "WeaponProperties"
       SET valor_bonus_atributo = ROUND(valor_bonus_atributo)
       WHERE valor_bonus_atributo <> ROUND(valor_bonus_atributo)
       RETURNING id_item;`,
    );
    if (afetados.length > 0) {
      console.log(`[migration] ${afetados.length} arma(s) com bônus de atributo arredondado(s) pra inteiro.`);
    }

    await queryInterface.changeColumn("WeaponProperties", "valor_bonus_atributo", {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false,
    });
    console.log('[migration] "WeaponProperties"."valor_bonus_atributo" agora é INTEGER (igual ArmorProperties).');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("WeaponProperties", "valor_bonus_atributo", {
      type: Sequelize.FLOAT,
      defaultValue: 0.0,
      allowNull: false,
    });
  },
};
