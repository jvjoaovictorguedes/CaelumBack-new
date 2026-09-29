"use strict";

// Classes V2 Fase 2 (Admin) — id_item_requisito era NOT NULL (schema
// legado, de quando cada caminho só podia ter UM requisito de item fixo
// embutido na própria linha). Requirement genérico (ClassEvolutionRequirement,
// tipo ITEM) já é a fonte de verdade lida pelo runtime desde a migration
// anterior (20261226010000) — mas a coluna antiga ainda bloqueava criar
// um caminho NOVO pelo Admin sem inventar um item falso só pra
// satisfazer o NOT NULL. Só relaxa a constraint (Expand, nunca remove a
// coluna nem os dados existentes — mesma política de Contract adiada já
// usada nas migrations anteriores desta feature).
module.exports = {
  async up(queryInterface) {
    await queryInterface.changeColumn("class_evolution_paths", "id_item_requisito", {
      type: require("sequelize").INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.changeColumn("class_evolution_paths", "id_item_requisito", {
      type: require("sequelize").INTEGER,
      allowNull: false,
    });
  },
};
