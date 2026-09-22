const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Histórico de partidas da Arena Ranqueada, com rating antes/depois dos
// dois jogadores (§16 — observabilidade, essencial pra investigar
// exploração). Nunca reaproveita PvpMatches (aquele é do Duelo casual).
const RankedMatch = sequelize.define(
  "RankedMatch",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    season_id: { type: DataTypes.INTEGER, allowNull: false },
    id_jogador1: { type: DataTypes.INTEGER, allowNull: false },
    id_jogador2: { type: DataTypes.INTEGER, allowNull: false },
    id_vencedor: { type: DataTypes.INTEGER, allowNull: true },
    rating_jogador1_antes: { type: DataTypes.INTEGER, allowNull: false },
    rating_jogador1_depois: { type: DataTypes.INTEGER, allowNull: true },
    rating_jogador2_antes: { type: DataTypes.INTEGER, allowNull: false },
    rating_jogador2_depois: { type: DataTypes.INTEGER, allowNull: true },
    // Vitoria: resultado oficial de duelo. Abandono: grace period de
    // reconexão (§9) expirou sem o jogador voltar. FalhaServidor: erro
    // interno comprovado encerrou a partida sem alterar rating (§9).
    motivo_encerramento: {
      type: DataTypes.ENUM("Vitoria", "Abandono", "FalhaServidor"),
      allowNull: true,
    },
    // PvP v2 §6/§8 — partida assíncrona: id_jogador2 é um SNAPSHOT do
    // defensor, que joga controlado por IA e nunca tem rating/V-D
    // alterados. rating_jogador2_antes fica como auditoria, e
    // rating_jogador2_depois permanece NULL nessas partidas.
    defensor_controlado_por_ia: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Dia contábil (fuso de rankedConfig) da tentativa diária gasta —
    // usado pelo estorno (§11) e pelo anti-rematch por dia (§7).
    date_key: { type: DataTypes.STRING(10), allowNull: true },
    // §12 — guarda de idempotência: finalizar uma partida já Finalizada
    // é no-op.
    status: {
      type: DataTypes.ENUM("EmAndamento", "Finalizada"),
      allowNull: false,
      defaultValue: "EmAndamento",
    },
    delta_desafiante: { type: DataTypes.INTEGER, allowNull: true },
    iniciada_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    encerrada_em: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "ranked_matches", timestamps: false },
);

module.exports = RankedMatch;
