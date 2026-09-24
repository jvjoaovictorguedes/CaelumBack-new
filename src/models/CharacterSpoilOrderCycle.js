const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Balcão de Espólios §5.1/§8.4 — um ciclo de 5 encomendas por
// personagem, por janela de 4h. UNIQUE(id_personagem, janela_inicio)
// garante que refresh/logout/restart do servidor nunca gera um segundo
// conjunto dentro da mesma janela (§5.1/§15 critérios de aceite).
const CharacterSpoilOrderCycle = sequelize.define(
  "CharacterSpoilOrderCycle",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    janela_inicio: { type: DataTypes.DATE, allowNull: false },
    janela_fim: { type: DataTypes.DATE, allowNull: false },
    // §7.3 — bônus 5/5 concedido no MÁXIMO uma vez por ciclo; o flag é a
    // última linha de defesa contra duas requisições concorrentes na
    // quinta entrega concederem dois bônus.
    bonus_lote_concedido: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    bonus_reputacao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    bonus_percentual: { type: DataTypes.DECIMAL(5, 4), allowNull: true },
    bonus_ouro: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    tableName: "character_spoil_order_cycles",
  },
);

module.exports = CharacterSpoilOrderCycle;
