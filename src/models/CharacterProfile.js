const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("./Character");
const Title = require("./Title");

// Personalização do Perfil (Especificação Perfil de Jogador, §27) —
// separada de Character de propósito, pra não poluir o núcleo de
// combate com campos cosméticos. Nem todo personagem tem uma linha
// aqui: characterProfileService usa findOrCreate só quando o jogador
// edita (§50 — sem backfill antecipado).
const CharacterProfile = sequelize.define(
  "CharacterProfile",
  {
    id_personagem: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      references: { model: Character, key: "id" },
    },
    frase: { type: DataTypes.STRING(140), allowNull: true },
    id_titulo_selecionado: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: Title, key: "id" },
    },
    // Reservado pra v2 — não usado na v1.
    background_key: { type: DataTypes.STRING(60), allowNull: true },
  },
  { tableName: "character_profiles" },
);

module.exports = CharacterProfile;
