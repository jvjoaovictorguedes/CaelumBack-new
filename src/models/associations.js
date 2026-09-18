// Fonte ÚNICA das associações Item <-> WeaponProperties/ArmorProperties/
// ConsumableProperties, com alias EXPLÍCITO — antes essas três
// associações eram declaradas de forma idêntica (e redundante) em três
// arquivos diferentes (itemsController.js, equipmentBonusService.js,
// consumablePropertiesController.js), sempre sem `as`, dependendo da
// singularização automática do Sequelize (hasOne "WeaponProperties" via
// "WeaponProperty", "ArmorProperties" via "ArmorProperty") — um alias
// implícito, fácil de gerar inconsistência entre quem lê (ex.: front
// esperando "WeaponProperties" plural, backend servindo "WeaponProperty"
// singular) e nada que documente o nome de verdade num lugar só.
//
// Requerido uma única vez no boot (ver app.js) — precisa rodar antes de
// qualquer `include` que use esses aliases.
const Item = require("./Item");
const WeaponProperties = require("./WeaponProperties");
const ArmorProperties = require("./ArmorProperties");
const ConsumableProperties = require("./ConsumableProperties");
const Character = require("./Character");
const Mission = require("./Mission");
const CharacterMissionProgress = require("./CharacterMissionProgress");
const MarketListing = require("./MarketListing");

Item.hasOne(WeaponProperties, { foreignKey: "id_item", as: "weaponProperties" });
WeaponProperties.belongsTo(Item, { foreignKey: "id_item" });

Item.hasOne(ArmorProperties, { foreignKey: "id_item", as: "armorProperties" });
ArmorProperties.belongsTo(Item, { foreignKey: "id_item" });

Item.hasOne(ConsumableProperties, { foreignKey: "id_item", as: "consumableProperties" });
ConsumableProperties.belongsTo(Item, { foreignKey: "id_item" });

// Missões — catálogo (Mission) x progresso por personagem
// (CharacterMissionProgress). Item de recompensa é opcional (nem toda
// missão dá item), por isso o alias fica só do lado "progress -> mission".
Mission.hasMany(CharacterMissionProgress, { foreignKey: "id_mission", as: "progressos" });
CharacterMissionProgress.belongsTo(Mission, { foreignKey: "id_mission", as: "mission" });
CharacterMissionProgress.belongsTo(Character, { foreignKey: "id_personagem", as: "personagem" });
Mission.belongsTo(Item, { foreignKey: "recompensa_item_id", as: "itemRecompensa" });

// Marketplace P2P — anúncio criado por um personagem (vendedor),
// opcionalmente fechado por outro (comprador).
MarketListing.belongsTo(Item, { foreignKey: "id_item", as: "item" });
MarketListing.belongsTo(Character, { foreignKey: "id_personagem_vendedor", as: "vendedor" });
MarketListing.belongsTo(Character, { foreignKey: "id_personagem_comprador", as: "comprador" });

module.exports = {};
