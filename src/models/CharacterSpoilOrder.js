const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Balcão de Espólios §5/§8.5 — uma das 5 vagas (ordem 1..5) de um
// ciclo. valor_unitario_snapshot é o Item.valor_venda congelado no
// momento da GERAÇÃO da encomenda (§5.3) — o valor-base fica estável
// durante a janela inteira mesmo que o catálogo mude no meio dela.
// concluida_em NULL = ainda entregável; não nulo = vaga fechada, nunca
// substituída até o reset da janela (§5.2).
const CharacterSpoilOrder = sequelize.define(
  "CharacterSpoilOrder",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_ciclo: { type: DataTypes.INTEGER, allowNull: false },
    ordem: { type: DataTypes.INTEGER, allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    quantidade_exigida: { type: DataTypes.INTEGER, allowNull: false },
    valor_unitario_snapshot: { type: DataTypes.INTEGER, allowNull: false },
    concluida_em: { type: DataTypes.DATE, allowNull: true },
    ouro_pago: { type: DataTypes.INTEGER, allowNull: true },
    reputacao_paga: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    tableName: "character_spoil_orders",
  },
);

module.exports = CharacterSpoilOrder;
