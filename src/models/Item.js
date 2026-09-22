const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Item = sequelize.define("Item", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  nome: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  tipo_item: {
    type: DataTypes.ENUM(
      "Consumivel",
      "Armadura",
      "Capacete",
      "Escudo",
      "Arma",
      "Acessorio1",
      "Acessorio2",
      "Material",
      "QuestItem",
      "Currencia",
      "Espolio"
    ),
    allowNull: false,
  },
  raridade: {
    type: DataTypes.ENUM(
      "Comum",
      "Incomum",
      "Raro",
      "Epico",
      "Lendario",
      "Mitico"
    ),
    allowNull: false,
  },
  valor_compra: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: { min: 0 },
  },
  valor_venda: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: { min: 0 },
  },
  peso: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0.0,
    validate: { min: 0 },
  },
  imagem_url: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  // Controle explícito de disponibilidade na loja — não confiar em
  // "aparecer ou não no frontend", raridade ou valor_venda pra decidir
  // se um item pode ser comprado. /shop/purchase checa este campo
  // antes de vender; um item raro/de evento/não-comercializável fica
  // com disponivel_loja: false e não pode ser comprado direto por ID
  // mesmo que o cliente descubra o id_item.
  disponivel_loja: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Faixa de poder REAL da receita/modelo (1 = mais forte, 5 = mais
  // básico — spec de Tier §17). Null pra tipos não equipáveis
  // (Material/Consumivel/QuestItem/Currencia/Espolio); obrigatório pra
  // Arma/Armadura/Capacete/Escudo/Acessorio1/Acessorio2 daqui pra
  // frente. Nunca muda por Fabricação/Refinamento — é fixo pelo
  // catálogo (ver equipmentTierConfig.js/equipmentTierService.js).
  tier_equipamento: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { min: 1, max: 5 },
  },
});

module.exports = Item;
