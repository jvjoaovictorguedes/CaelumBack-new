"use strict";

// Forja — Materiais (pedido: "Forja pode usar materiais da
// silvicultura, exploração e caldeirão como ingredientes"). Silvicultura
// e Exploração JÁ eram suportadas pela infraestrutura de dados (ambas
// são só profissões de ExpeditionResource, mesmo tipo_insumo
// "RecursoExpedicao" que Mineração já usa) — a lacuna real era só o
// painel admin nunca deixar escolher outra profissão além de Mineração
// na hora de montar um ingrediente (corrigido no service/frontend, não
// aqui). Caldeirão (Alquimia) é o que realmente falta no schema: nunca
// existiu como tipo_insumo.
//
// tipo_insumo ganha o valor 'ProdutoAlquimia' (AlchemyRecipe.id em
// id_recurso, resolvido pra AlchemyRecipe.id_item_resultado — Alquimia
// não tem variante de qualidade como Barra/RecursoExpedicao, então a
// mesma qualidade_resultado vale nas 6 qualidades da Forja, ver
// forgeMaterialsService.js).
//
// id_recurso deixa de ter FK só pra expedition_resources — o campo já
// era "polimórfico" NA PRÁTICA (Barra e RecursoExpedicao apontam pro
// mesmo catálogo hoje, mas por motivos DIFERENTES: Barra é o minério
// que virou barra, RecursoExpedicao é o recurso cru em si), então
// adicionar um terceiro significado (AlchemyRecipe.id) só estende o
// mesmo padrão. Postgres não tem FK condicional por coluna irmã sem
// trigger — a integridade referencial passa a ser responsabilidade da
// aplicação (mesmo já acontecia com Item.imagem_url e outras
// referências "livres" deste projeto), garantida pela matriz de
// resolução do admin (resolverMatrizIngredientes) que bloqueia ativar
// um blueprint com ingrediente não resolvível em alguma qualidade.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_forge_blueprint_ingredients_tipo_insumo" ADD VALUE IF NOT EXISTS 'ProdutoAlquimia';`,
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE "forge_blueprint_ingredients" DROP CONSTRAINT IF EXISTS "forge_blueprint_ingredients_id_recurso_fkey";`,
    );
  },

  // Down best-effort (mesmo padrão de 20261212010000/20261214010000):
  // não dá pra remover um valor de ENUM no Postgres, e recriar a FK só
  // funciona se nenhuma linha ProdutoAlquimia ainda existir (senão
  // sobra referência "solta" que a FK rejeitaria). Ambiente de
  // desenvolvimento típico (sem dado de produção) não tem esse
  // problema; um rollback em produção precisaria remover as linhas
  // ProdutoAlquimia primeiro.
  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE "forge_blueprint_ingredients"
       ADD CONSTRAINT "forge_blueprint_ingredients_id_recurso_fkey"
       FOREIGN KEY (id_recurso) REFERENCES expedition_resources(id) ON DELETE RESTRICT;`,
    );
  },
};
