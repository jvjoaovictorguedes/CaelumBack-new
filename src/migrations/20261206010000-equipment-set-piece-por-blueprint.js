"use strict";

// Bug de arquitetura reportado: o Sistema de Conjuntos de Equipamentos
// amarrava cada peça a UM item_id fixo. Como o catálogo hoje representa
// cada raridade como uma linha PRÓPRIA de Item (ex.: "Anel Forjado de
// Ferro — Raro" e "Anel Forjado de Ferro — Épico" são dois Items
// diferentes, com stats diferentes de verdade — WeaponProperties/
// ArmorProperties são 1-pra-1 com item_id, não dá pra eliminar isso sem
// reescrever como stats são versionados), um conjunto cadastrado com a
// variante Rara nunca reconhecia a Épica do "mesmo" equipamento — o
// admin tinha que cadastrar uma peça POR raridade, ou o conjunto ficava
// preso a uma raridade só.
//
// A Forja já resolve exatamente esse problema pro PRÓPRIO domínio dela:
// ForgeBlueprint é a "família" (ex.: "Anel Forjado de Ferro") e
// ForgeBlueprintResult mapeia (blueprint, qualidade) -> item_id — ou
// seja, o "muitos-pra-muitos" que families/raridades precisam já existe
// e já é mantido. Em vez de duplicar essa tabela pro Sistema de
// Conjuntos, esta migration deixa uma EquipmentSetPiece apontar tanto
// pra um item_id fixo (comportamento de sempre, pra itens que não vêm
// de blueprint) QUANTO pra um id_blueprint (novo — qualquer raridade
// resultante daquele blueprint conta pra peça). Nunca os dois ao mesmo
// tempo (CHECK constraint abaixo).
//
// O CHECK é "no máximo um dos dois", não XOR estrito: precisa permitir
// os DOIS nulos ao mesmo tempo, porque é exatamente o que ON DELETE SET
// NULL produz quando o blueprint referenciado é excluído (vira peça
// "órfã", que o admin precisa notar e corrigir, em vez de o conjunto
// inteiro sumir ou a exclusão do blueprint ficar bloqueada). Um XOR
// estrito rejeitaria esse UPDATE ... SET id_blueprint = NULL do próprio
// Postgres e quebraria a exclusão do blueprint.
//
// Nenhum conjunto/peça existente quebra: id_blueprint nasce NULL em
// toda peça já cadastrada, então o CHECK continua satisfeito por elas
// exatamente como estavam.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.changeColumn(
        "equipment_set_pieces",
        "item_id",
        { type: Sequelize.INTEGER, allowNull: true },
        { transaction },
      );

      await queryInterface.addColumn(
        "equipment_set_pieces",
        "id_blueprint",
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "forge_blueprints", key: "id" },
          // SET NULL (nunca CASCADE): excluir um blueprint da Forja não
          // pode apagar silenciosamente uma peça de conjunto — vira uma
          // peça "órfã" (nem item_id nem id_blueprint), que o admin
          // precisa notar e corrigir, em vez de o conjunto inteiro sumir.
          onDelete: "SET NULL",
        },
        { transaction },
      );
      await queryInterface.addIndex("equipment_set_pieces", ["id_blueprint"], { transaction });

      await queryInterface.sequelize.query(
        `ALTER TABLE equipment_set_pieces ADD CONSTRAINT equipment_set_pieces_item_xor_blueprint ` +
          `CHECK (NOT (item_id IS NOT NULL AND id_blueprint IS NOT NULL))`,
        { transaction },
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeConstraint("equipment_set_pieces", "equipment_set_pieces_item_xor_blueprint", {
        transaction,
      });
      await queryInterface.removeIndex("equipment_set_pieces", ["id_blueprint"], { transaction });
      await queryInterface.removeColumn("equipment_set_pieces", "id_blueprint", { transaction });
      // Peças órfãs (dos dois nulos, cenário que o CHECK acima passou a
      // permitir) impediriam voltar item_id pra NOT NULL — nesse ponto
      // do down() elas já perderam id_blueprint, então teriam item_id
      // NULL sem chance de recuperação; documentado aqui de propósito
      // pra quem for rodar down() num banco que já tenha peças órfãs
      // reais precisar resolver isso manualmente antes.
      await queryInterface.changeColumn(
        "equipment_set_pieces",
        "item_id",
        { type: Sequelize.INTEGER, allowNull: false },
        { transaction },
      );
    });
  },
};
