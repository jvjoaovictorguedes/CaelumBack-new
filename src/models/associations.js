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
const CharacterForgeProgress = require("./CharacterForgeProgress");
const CharacterEquipmentInstance = require("./CharacterEquipmentInstance");
const CharacterEquipment = require("./CharacterEquipment");
const ForgeBlueprint = require("./ForgeBlueprint");
const ForgeBlueprintIngredient = require("./ForgeBlueprintIngredient");
const ForgeBlueprintResult = require("./ForgeBlueprintResult");
const ForgeBarItem = require("./ForgeBarItem");
const ForgeScroll = require("./ForgeScroll");
const ForgeScrollIngredient = require("./ForgeScrollIngredient");
const CharacterForgeQueue = require("./CharacterForgeQueue");
const AdventureZone = require("./AdventureZone");
const AdventureMonster = require("./AdventureMonster");
const AdventureZoneMonster = require("./AdventureZoneMonster");
const AdventureZoneLoot = require("./AdventureZoneLoot");
const CharacterAdventureSession = require("./CharacterAdventureSession");
const CharacterAdventureGuildProgress = require("./CharacterAdventureGuildProgress");
const AdventureGuildMission = require("./AdventureGuildMission");
const AdventureGuildMissionReward = require("./AdventureGuildMissionReward");
const AdventureGuildOffer = require("./AdventureGuildOffer");
const CharacterAdventureGuildContract = require("./CharacterAdventureGuildContract");
const Guild = require("./Guild");
const GuildBuff = require("./GuildBuff");
const GuildMission = require("./GuildMission");
const GuildMissionCycle = require("./GuildMissionCycle");
const GuildMemberMissionProgress = require("./GuildMemberMissionProgress");
const GuildBossConfig = require("./GuildBossConfig");
const GuildBossAttempt = require("./GuildBossAttempt");
const GuildBossContribution = require("./GuildBossContribution");

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
// Inventário v2 — só preenchido quando o anúncio é de equipamento (ver
// MarketListing.js), pra mostrar o refinamento de verdade no anúncio.
MarketListing.belongsTo(CharacterEquipmentInstance, { foreignKey: "id_instancia", as: "instancia" });

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

// Forja v3 — instâncias de equipamento (refinamento individual),
// blueprints (equipamento-base -> Item por qualidade) e a fila com
// slots Fundicao/Forja. Ver 20260930300000-forge-v3-progress-and-
// instances.js pro motivo de character_equipment.id_instancia ser
// nullable (equipamento fora da Forja v3 continua sem instância).
CharacterForgeProgress.belongsTo(Character, { foreignKey: "id_personagem" });

CharacterEquipmentInstance.belongsTo(Character, { foreignKey: "id_personagem" });
CharacterEquipmentInstance.belongsTo(Item, { foreignKey: "id_item", as: "item" });
CharacterEquipment.belongsTo(CharacterEquipmentInstance, { foreignKey: "id_instancia", as: "instancia" });

ForgeBlueprint.hasMany(ForgeBlueprintIngredient, { foreignKey: "id_blueprint", as: "ingredientes" });
ForgeBlueprintIngredient.belongsTo(ForgeBlueprint, { foreignKey: "id_blueprint" });
ForgeBlueprintIngredient.belongsTo(ExpeditionResource, { foreignKey: "id_recurso", as: "recurso" });
ForgeBlueprint.hasMany(ForgeBlueprintResult, { foreignKey: "id_blueprint", as: "resultados" });
ForgeBlueprintResult.belongsTo(ForgeBlueprint, { foreignKey: "id_blueprint" });
ForgeBlueprintResult.belongsTo(Item, { foreignKey: "id_item", as: "item" });

ForgeBarItem.belongsTo(ExpeditionResource, { foreignKey: "id_recurso", as: "recurso" });
ForgeBarItem.belongsTo(Item, { foreignKey: "id_item", as: "item" });

ForgeScroll.belongsTo(Item, { foreignKey: "id_item", as: "item" });
ForgeScroll.hasMany(ForgeScrollIngredient, { foreignKey: "id_scroll_item", as: "ingredientes" });
ForgeScrollIngredient.belongsTo(ForgeScroll, { foreignKey: "id_scroll_item" });
ForgeScrollIngredient.belongsTo(Item, { foreignKey: "id_item_material", as: "material" });

CharacterForgeQueue.belongsTo(Character, { foreignKey: "id_personagem" });

// Modo Aventura v1 — área tem N monstros vinculados (peso + tipo) e N
// entradas de espólio; sessão de caça referencia área + personagem.
AdventureZone.hasMany(AdventureZoneMonster, { foreignKey: "id_area", as: "monstros" });
AdventureZoneMonster.belongsTo(AdventureZone, { foreignKey: "id_area" });
AdventureZoneMonster.belongsTo(AdventureMonster, { foreignKey: "id_monstro", as: "monstro" });
AdventureMonster.hasMany(AdventureZoneMonster, { foreignKey: "id_monstro" });

AdventureZone.hasMany(AdventureZoneLoot, { foreignKey: "id_area", as: "espolios" });
AdventureZoneLoot.belongsTo(AdventureZone, { foreignKey: "id_area" });
AdventureZoneLoot.belongsTo(Item, { foreignKey: "id_item", as: "item" });

CharacterAdventureSession.belongsTo(Character, { foreignKey: "id_personagem" });
CharacterAdventureSession.belongsTo(AdventureZone, { foreignKey: "id_area", as: "area" });

// Guilda dos Aventureiros — catálogo (AdventureGuildMission) com N
// recompensas e objetivo estruturado (monstro/área/item opcionais);
// ofertas de uma rotação apontam pra uma missão do catálogo; contrato
// aceito por um personagem referencia a oferta (quando não é Provação)
// e sempre a missão em si.
CharacterAdventureGuildProgress.belongsTo(Character, { foreignKey: "id_personagem" });

AdventureGuildMission.belongsTo(AdventureMonster, { foreignKey: "id_monstro_alvo", as: "monstroAlvo" });
AdventureGuildMission.belongsTo(AdventureZone, { foreignKey: "id_area_alvo", as: "areaAlvo" });
AdventureGuildMission.belongsTo(Item, { foreignKey: "id_item_alvo", as: "itemAlvo" });
AdventureGuildMission.hasMany(AdventureGuildMissionReward, { foreignKey: "id_mission", as: "recompensas" });
AdventureGuildMissionReward.belongsTo(AdventureGuildMission, { foreignKey: "id_mission" });
AdventureGuildMissionReward.belongsTo(Item, { foreignKey: "id_item", as: "item" });

AdventureGuildOffer.belongsTo(AdventureGuildMission, { foreignKey: "id_mission", as: "missao" });

CharacterAdventureGuildContract.belongsTo(Character, { foreignKey: "id_personagem" });
CharacterAdventureGuildContract.belongsTo(AdventureGuildOffer, { foreignKey: "id_offer", as: "oferta" });
CharacterAdventureGuildContract.belongsTo(AdventureGuildMission, { foreignKey: "id_mission", as: "missao" });

// Aprimoramento do Sistema de Guildas — Buffs (1 linha por tipo/guilda),
// Missões da Guilda (catálogo -> ciclo ativo -> progresso individual) e
// Boss da Guilda (config por rank -> tentativa semanal -> dano por
// membro), ver guildMissionService.js/guildBossService.js.
Guild.hasMany(GuildBuff, { foreignKey: "id_guild", as: "buffs" });
GuildBuff.belongsTo(Guild, { foreignKey: "id_guild" });

GuildMissionCycle.belongsTo(Guild, { foreignKey: "id_guild" });
GuildMissionCycle.belongsTo(GuildMission, { foreignKey: "id_guild_mission", as: "missao" });
GuildMission.hasMany(GuildMissionCycle, { foreignKey: "id_guild_mission" });

GuildMemberMissionProgress.belongsTo(GuildMissionCycle, { foreignKey: "id_guild_mission_cycle", as: "ciclo" });
GuildMissionCycle.hasMany(GuildMemberMissionProgress, { foreignKey: "id_guild_mission_cycle", as: "progressos" });
GuildMemberMissionProgress.belongsTo(Character, { foreignKey: "id_personagem" });

GuildBossAttempt.belongsTo(GuildBossConfig, { foreignKey: "id_guild_boss_config", as: "chefe" });
GuildBossAttempt.belongsTo(Guild, { foreignKey: "id_guild" });
GuildBossContribution.belongsTo(GuildBossAttempt, { foreignKey: "id_guild_boss_attempt" });
GuildBossContribution.belongsTo(Character, { foreignKey: "id_personagem" });

module.exports = {};
