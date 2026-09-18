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
const CraftingRecipe = require("./CraftingRecipe");
const CraftingRecipeIngredient = require("./CraftingRecipeIngredient");
const CharacterCraftingQueue = require("./CharacterCraftingQueue");
const CharacterProfession = require("./CharacterProfession");
const ExpeditionRegion = require("./ExpeditionRegion");
const ExpeditionResource = require("./ExpeditionResource");
const ExpeditionRegionResource = require("./ExpeditionRegionResource");
const ExpeditionResourceItem = require("./ExpeditionResourceItem");

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

// Forja v2 — receita fixa por item (id_item), com N ingredientes
// (materiais + quantidade) e no máximo 1 forja em andamento por
// personagem.
CraftingRecipe.belongsTo(Item, { foreignKey: "id_item", as: "item" });
CraftingRecipe.hasMany(CraftingRecipeIngredient, { foreignKey: "id_receita", as: "ingredientes" });
CraftingRecipeIngredient.belongsTo(CraftingRecipe, { foreignKey: "id_receita" });
CraftingRecipeIngredient.belongsTo(Item, { foreignKey: "id_item_material", as: "material" });
CharacterCraftingQueue.belongsTo(CraftingRecipe, { foreignKey: "id_receita", as: "receita" });

// Expedição — região tem N recursos possíveis (peso relativo), cada
// recurso tem até 6 Items (1 por qualidade).
CharacterProfession.belongsTo(Character, { foreignKey: "id_personagem" });
ExpeditionRegion.hasMany(ExpeditionRegionResource, { foreignKey: "id_regiao", as: "recursosDaRegiao" });
ExpeditionRegionResource.belongsTo(ExpeditionRegion, { foreignKey: "id_regiao" });
ExpeditionRegionResource.belongsTo(ExpeditionResource, { foreignKey: "id_recurso", as: "recurso" });
ExpeditionResource.hasMany(ExpeditionResourceItem, { foreignKey: "id_recurso", as: "itensPorQualidade" });
ExpeditionResourceItem.belongsTo(ExpeditionResource, { foreignKey: "id_recurso" });
ExpeditionResourceItem.belongsTo(Item, { foreignKey: "id_item", as: "item" });

module.exports = {};
