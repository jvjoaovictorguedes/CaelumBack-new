const Character = require("./Character");

BattleParticipant.belongsTo(Character, {
  foreignKey: "character_id",
  as: "character",
});

Character.hasMany(BattleParticipant, {
  foreignKey: "character_id",
  as: "battleParticipants",
});
