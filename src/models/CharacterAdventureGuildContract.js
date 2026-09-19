const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Contrato ACEITO por um personagem (§16: oferta ≠ contrato aceito) —
// tanto contratos normais de Rank (vêm de uma AdventureGuildOffer)
// quanto a Provação (eh_provacao=true, sem id_offer — iniciada direto
// via POST /trial/start, nunca aparece no quadro de 5 ofertas).
const CharacterAdventureGuildContract = sequelize.define(
  "CharacterAdventureGuildContract",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    // Null pra Provação (não vem de uma rotação/oferta).
    id_offer: { type: DataTypes.INTEGER, allowNull: true },
    id_mission: { type: DataTypes.INTEGER, allowNull: false },
    eh_provacao: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    progresso_atual: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: {
      type: DataTypes.ENUM("Ativo", "Concluido", "Expirado", "Resgatado", "Falhou"),
      allowNull: false,
      defaultValue: "Ativo",
    },
    aceito_em: { type: DataTypes.DATE, allowNull: false },
    // Null pra Provação (sem prazo de 6h, §28-§31 não menciona timer
    // pra Provação, só cooldown depois de falhar).
    expira_em: { type: DataTypes.DATE, allowNull: true },
    concluido_em: { type: DataTypes.DATE, allowNull: true },
    resgatado_em: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "character_adventure_guild_contracts",
  },
);

module.exports = CharacterAdventureGuildContract;
