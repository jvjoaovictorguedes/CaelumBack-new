const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Power = sequelize.define("Power", {
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
  tipo_poder: {
    type: DataTypes.ENUM("Ativo", "Passivo"),
    allowNull: false,
  },
  custo_mana: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  dano_base: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: true,
  },
  cura_base: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: true,
  },
  cooldown: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  escala_atributo: {
    type: DataTypes.ENUM(
      "Forca",
      "Vitalidade",
      "Agilidade",
      "Inteligencia",
      "Velocidade"
    ),
    allowNull: false,
  },
  valor_escala: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
    allowNull: false,
  },
  imagem_url: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  // Classes V2 §4 — TIPO de dano, separado da ESCALA de atributo.
  // escala_atributo diz qual atributo cresce o efeito; tipo_dano diz
  // qual multiplicador de Classe (físico/mágico) e mitigação são
  // usados no combate. Antes o motor inferia "Inteligência = mágico,
  // resto = físico" (ver combatFormulas.js) — um poder de Agilidade
  // nunca podia ser mágico, nem um de Força. Nenhum = cura/passivo sem
  // componente de dano (nunca recebe multiplicador de dano nenhum).
  tipo_dano: {
    type: DataTypes.ENUM("Fisico", "Magico", "Verdadeiro", "Nenhum"),
    allowNull: false,
    defaultValue: "Fisico",
  },
  // Sistema de Proezas Únicas §9 — marca técnica de aquisição restrita.
  // UNIQUE_FEAT nunca pode ser concedido por classe/raça/evolução/loja/
  // drop/seed genérico; só pelo claim atômico de uma Proeza (ver
  // uniqueFeatService.js). Checar este campo em qualquer ponto que
  // conceda Powers em massa/normalmente.
  acquisition_scope: {
    type: DataTypes.ENUM("NORMAL", "UNIQUE_FEAT"),
    allowNull: false,
    defaultValue: "NORMAL",
  },
});

module.exports = Power;
