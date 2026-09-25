const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Torneio da Pesca — só a janela de tempo + escopo opcional de zona.
// Pontuação NUNCA é gravada aqui: é sempre calculada na leitura a partir
// de FishingCatchRecord (ver fishingTournamentService.js). Isso evita
// bolar um novo caminho de escrita concorrente com fishingService.js
// (que já é transacional e testado) sob pressão de tempo — ver
// relatório final da sessão pro raciocínio completo do corte de escopo.
const FishingTournament = sequelize.define(
  "FishingTournament",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(150), allowNull: false },
    id_zone: { type: DataTypes.INTEGER, allowNull: true },
    inicia_em: { type: DataTypes.DATE, allowNull: false },
    termina_em: { type: DataTypes.DATE, allowNull: false },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    id_admin_criador: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: "fishing_tournaments" },
);

module.exports = FishingTournament;
