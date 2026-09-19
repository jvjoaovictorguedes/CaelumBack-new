const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Um registro por COMPRA de verdade — um único MarketListing de stack
// pode gerar várias linhas aqui se for vendido em partes por
// compradores diferentes (spec v2 §7). Fonte pra "Meus Anúncios"
// mostrar receita líquida acumulada e pro histórico de preço (§12).
const MarketTransaction = sequelize.define(
  "MarketTransaction",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_listing: { type: DataTypes.INTEGER, allowNull: false },
    id_personagem_vendedor: { type: DataTypes.INTEGER, allowNull: false },
    id_personagem_comprador: { type: DataTypes.INTEGER, allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    id_instancia: { type: DataTypes.INTEGER, allowNull: true },
    // Só preenchido em venda de equipamento — capturado NO MOMENTO da
    // venda (nunca derivado da instância depois), pra o histórico de
    // preço (spec §12) não misturar o refinamento de quando foi vendida
    // com um refinamento mais alto que ela tenha ganhado DEPOIS de
    // trocar de dono (Forja é sempre feita pelo dono atual).
    refinamento: { type: DataTypes.INTEGER, allowNull: true },
    quantidade: { type: DataTypes.INTEGER, allowNull: false },
    preco_unitario: { type: DataTypes.INTEGER, allowNull: false },
    preco_total: { type: DataTypes.INTEGER, allowNull: false },
    taxa: { type: DataTypes.INTEGER, allowNull: false },
    valor_liquido_vendedor: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: "market_transactions", updatedAt: false },
);

module.exports = MarketTransaction;
