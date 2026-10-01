"use strict";

// Forja-Materiais — 4ª fonte de ingrediente lógico (pedido: "na criação
// de novos equipamentos ou poções, é possível utilizar espólios
// também"). Alquimia já aceitava qualquer Item como ingrediente sem
// filtro de tipo_item (AlchemyRecipeIngredient.id_item é FK direta —
// ver model/adminAlchemyService.validarIngredientesPayload), então
// Espólio já funciona lá hoje sem nenhuma migration. Só a Forja tinha
// tipo_insumo fechado em ENUM (Barra/RecursoExpedicao/ProdutoAlquimia).
//
// Segue exatamente o mesmo padrão de 20261216010000 (ProdutoAlquimia):
// tipo_insumo ganha 'Espolio', e id_recurso passa a significar, pra
// esse tipo, o próprio Item.id do Espólio (sem catálogo de recurso
// intermediário nem variante de qualidade — cada Espólio já É um Item
// concreto, mesmo racional de ProdutoAlquimia). Nenhuma FK nova a
// remover: a FK de id_recurso pra expedition_resources já foi
// removida na migration do ProdutoAlquimia.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_forge_blueprint_ingredients_tipo_insumo" ADD VALUE IF NOT EXISTS 'Espolio';`,
    );
  },

  // Down best-effort (mesmo padrão de 20261216010000): Postgres não
  // permite remover um valor de ENUM.
  async down(queryInterface) {
    void queryInterface;
  },
};
