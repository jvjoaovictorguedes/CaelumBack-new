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
const MarketTransaction = require("./MarketTransaction");
const PvPSeason = require("./PvPSeason");
const CharacterPvpSeason = require("./CharacterPvpSeason");
const RankedMatch = require("./RankedMatch");
const CharacterRankedDailyUsage = require("./CharacterRankedDailyUsage");
const Tournament = require("./Tournament");
const TournamentParticipant = require("./TournamentParticipant");
const TournamentSeries = require("./TournamentSeries");
const TournamentMatch = require("./TournamentMatch");
const User = require("./User");
const WorldTerritory = require("./WorldTerritory");
const WorldMapNode = require("./WorldMapNode");
const WorldMapConnection = require("./WorldMapConnection");
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
const AdventureMonsterLoot = require("./AdventureMonsterLoot");
const CharacterAdventureSession = require("./CharacterAdventureSession");
const CharacterAdventureGuildProgress = require("./CharacterAdventureGuildProgress");
const AdventureGuildMission = require("./AdventureGuildMission");
const AdventureGuildMissionReward = require("./AdventureGuildMissionReward");
const AdventureGuildOffer = require("./AdventureGuildOffer");
const CharacterAdventureGuildContract = require("./CharacterAdventureGuildContract");
const CharacterInventory = require("./CharacterInventory");
const CharacterSpoilPreference = require("./CharacterSpoilPreference");
const CharacterHunterProgress = require("./CharacterHunterProgress");
const CharacterAdventureHunt = require("./CharacterAdventureHunt");
const CharacterSpoilSale = require("./CharacterSpoilSale");
const CharacterSpoilSaleItem = require("./CharacterSpoilSaleItem");
const CharacterSpoilOrderCycle = require("./CharacterSpoilOrderCycle");
const CharacterSpoilOrder = require("./CharacterSpoilOrder");
const Guild = require("./Guild");
const GuildBuff = require("./GuildBuff");
const GuildMission = require("./GuildMission");
const GuildMissionCycle = require("./GuildMissionCycle");
const GuildMemberMissionProgress = require("./GuildMemberMissionProgress");
const GuildBossConfig = require("./GuildBossConfig");
const GuildBossAttempt = require("./GuildBossAttempt");
const GuildBossContribution = require("./GuildBossContribution");
const EquipmentSet = require("./EquipmentSet");
const EquipmentSetPiece = require("./EquipmentSetPiece");
const EquipmentSetBonus = require("./EquipmentSetBonus");
const WeaponStatusEffect = require("./WeaponStatusEffect");
const AdminRole = require("./AdminRole");
const AdminPermission = require("./AdminPermission");
const AdminRolePermission = require("./AdminRolePermission");
const UserAdminRole = require("./UserAdminRole");
const AlchemyRecipe = require("./AlchemyRecipe");
const AlchemyRecipeIngredient = require("./AlchemyRecipeIngredient");
const ConsumableEffect = require("./ConsumableEffect");
const CharacterAlchemyRecipeUnlock = require("./CharacterAlchemyRecipeUnlock");

Item.hasOne(WeaponProperties, { foreignKey: "id_item", as: "weaponProperties" });
WeaponProperties.belongsTo(Item, { foreignKey: "id_item" });

Item.hasOne(ArmorProperties, { foreignKey: "id_item", as: "armorProperties" });
ArmorProperties.belongsTo(Item, { foreignKey: "id_item" });

// Override admin de atributos por Raridade (ver equipmentRarityService.js
// e migration 20261213010000) — até 6 linhas por Item (uma por
// qualidade), carregadas junto sempre que weaponProperties/
// armorProperties/fishingRodProperties também forem, pra
// aplicarRaridade* nunca precisar de uma query extra em runtime.
const ItemRarityAttributeOverride = require("./ItemRarityAttributeOverride");
Item.hasMany(ItemRarityAttributeOverride, { foreignKey: "id_item", as: "raridadeOverrides" });
ItemRarityAttributeOverride.belongsTo(Item, { foreignKey: "id_item" });

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

// Mercado v2 — cada linha é uma compra de verdade (permite parcial de
// stack); histórico de preço e receita líquida acumulada de "Meus
// Anúncios" vêm daqui, nunca recalculados a partir do MarketListing.
MarketListing.hasMany(MarketTransaction, { foreignKey: "id_listing", as: "transacoes" });
MarketTransaction.belongsTo(MarketListing, { foreignKey: "id_listing", as: "listing" });
MarketTransaction.belongsTo(Item, { foreignKey: "id_item", as: "item" });
MarketTransaction.belongsTo(Character, { foreignKey: "id_personagem_vendedor", as: "vendedor" });
MarketTransaction.belongsTo(Character, { foreignKey: "id_personagem_comprador", as: "comprador" });

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
// Reformulação V2 — o Item canônico do blueprint (ver comentário no
// model ForgeBlueprint). Ainda não usado em runtime nesta fase Expand.
ForgeBlueprint.belongsTo(Item, { foreignKey: "id_item_resultado", as: "itemResultado" });

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

// Expansão Aventura Beta §20 — loot por monstro (ver AdventureMonsterLoot.js).
AdventureMonster.hasMany(AdventureMonsterLoot, { foreignKey: "id_monstro", as: "espolios" });
AdventureMonsterLoot.belongsTo(AdventureMonster, { foreignKey: "id_monstro" });
AdventureMonsterLoot.belongsTo(Item, { foreignKey: "id_item", as: "item" });

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

// Balcão de Espólios — preferências/histórico de venda por personagem,
// e o ciclo de 5 encomendas (id_ciclo -> N CharacterSpoilOrder), tudo
// independente do catálogo/rotação de Rank acima (ver spec "Balcão de
// Espólios").
CharacterSpoilPreference.belongsTo(Character, { foreignKey: "id_personagem" });
CharacterSpoilPreference.belongsTo(Item, { foreignKey: "id_item", as: "item" });

// spoilCounterService precisa fazer join de CharacterInventory -> Item
// (listar espólios vendáveis) sem depender de characterInventoryController.js
// registrar essa associação primeiro (esse controller usa alias
// default, nem sempre carregado antes — ver bug real de teste corrigido
// na spec "Balcão de Espólios"). Alias PRÓPRIO evita colisão com
// qualquer associação default que outro módulo registre depois.
CharacterInventory.belongsTo(Item, { foreignKey: "id_item", as: "itemEspolio" });

CharacterSpoilSale.belongsTo(Character, { foreignKey: "id_personagem" });
CharacterSpoilSale.hasMany(CharacterSpoilSaleItem, { foreignKey: "id_sale", as: "linhas" });
CharacterSpoilSaleItem.belongsTo(CharacterSpoilSale, { foreignKey: "id_sale" });
CharacterSpoilSaleItem.belongsTo(Item, { foreignKey: "id_item", as: "item" });

CharacterSpoilOrderCycle.belongsTo(Character, { foreignKey: "id_personagem" });
CharacterSpoilOrderCycle.hasMany(CharacterSpoilOrder, { foreignKey: "id_ciclo", as: "encomendas" });
CharacterSpoilOrder.belongsTo(CharacterSpoilOrderCycle, { foreignKey: "id_ciclo", as: "ciclo" });
CharacterSpoilOrder.belongsTo(Item, { foreignKey: "id_item", as: "item" });

// Caçadas da Guilda dos Aventureiros.
CharacterHunterProgress.belongsTo(Character, { foreignKey: "id_personagem" });
CharacterAdventureHunt.belongsTo(Character, { foreignKey: "id_personagem" });
CharacterAdventureHunt.belongsTo(AdventureMonster, { foreignKey: "id_monstro", as: "monstro" });
CharacterAdventureHunt.belongsTo(AdventureZone, { foreignKey: "id_zona_referencia", as: "zona" });

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

// Arena Ranqueada (PvP Competitivo v1) — também é a fonte da aba PvP do
// Ranking geral (rankingService.js); o Duelo casual (PvpStatus) fica de
// fora de qualquer ranking, ver rankedConfig.js.
PvPSeason.hasMany(CharacterPvpSeason, { foreignKey: "season_id", as: "participacoes" });
CharacterPvpSeason.belongsTo(PvPSeason, { foreignKey: "season_id", as: "temporada" });
CharacterPvpSeason.belongsTo(Character, { foreignKey: "character_id", as: "personagem" });
Character.hasMany(CharacterPvpSeason, { foreignKey: "character_id", as: "temporadasRanked" });

PvPSeason.hasMany(RankedMatch, { foreignKey: "season_id", as: "partidas" });
RankedMatch.belongsTo(PvPSeason, { foreignKey: "season_id", as: "temporada" });
RankedMatch.belongsTo(Character, { foreignKey: "id_jogador1", as: "jogador1" });
RankedMatch.belongsTo(Character, { foreignKey: "id_jogador2", as: "jogador2" });
RankedMatch.belongsTo(Character, { foreignKey: "id_vencedor", as: "vencedor" });

// PvP v2 §11 — limite diário de partidas ranqueadas.
CharacterRankedDailyUsage.belongsTo(Character, { foreignKey: "character_id" });
Character.hasMany(CharacterRankedDailyUsage, { foreignKey: "character_id", as: "usoDiarioRanked" });

// Torneios (PvP v2 §16) — isolados de rating ranqueado e de PvpStatus
// casual; só se relacionam com Character (participante) e User (admin
// que criou).
Tournament.hasMany(TournamentParticipant, { foreignKey: "tournament_id", as: "participantes" });
TournamentParticipant.belongsTo(Tournament, { foreignKey: "tournament_id", as: "torneio" });
TournamentParticipant.belongsTo(Character, { foreignKey: "character_id", as: "personagem" });
Character.hasMany(TournamentParticipant, { foreignKey: "character_id", as: "torneios" });
Tournament.belongsTo(User, { foreignKey: "created_by", as: "criadoPor" });

Tournament.hasMany(TournamentSeries, { foreignKey: "tournament_id", as: "series" });
TournamentSeries.belongsTo(Tournament, { foreignKey: "tournament_id", as: "torneio" });
TournamentSeries.belongsTo(TournamentParticipant, { foreignKey: "participant_a_id", as: "participanteA" });
TournamentSeries.belongsTo(TournamentParticipant, { foreignKey: "participant_b_id", as: "participanteB" });
TournamentSeries.belongsTo(TournamentParticipant, { foreignKey: "winner_participant_id", as: "vencedor" });

TournamentSeries.hasMany(TournamentMatch, { foreignKey: "series_id", as: "jogos" });
TournamentMatch.belongsTo(TournamentSeries, { foreignKey: "series_id", as: "serie" });
TournamentMatch.belongsTo(TournamentParticipant, { foreignKey: "winner_participant_id", as: "vencedor" });

// Mapa Mundial (spec de Mapa v1 §12/§13/§17/§22) — WorldTerritory
// contém vários WorldMapNode (id_territorio null = zona neutra, nunca
// obrigatório); WorldMapConnection só referencia dois Nodes, sem
// bloquear nada (puramente visual nesta versão).
WorldTerritory.hasMany(WorldMapNode, { foreignKey: "id_territorio", as: "nodes" });
WorldMapNode.belongsTo(WorldTerritory, { foreignKey: "id_territorio", as: "territorio" });
WorldMapConnection.belongsTo(WorldMapNode, { foreignKey: "id_origem", as: "origem" });
WorldMapConnection.belongsTo(WorldMapNode, { foreignKey: "id_destino", as: "destino" });

// Motor de Status (§30 da Especificação Consolidada Poder/Status/
// Cooldown/Balanceamento) — uma Power pode ter zero, uma ou várias
// linhas de efeito (habilidade com dois efeitos diferentes, por ex.).
const Power = require("./Power");
const PowerStatusEffect = require("./PowerStatusEffect");
Power.hasMany(PowerStatusEffect, { foreignKey: "id_power", as: "efeitosDeStatus" });
PowerStatusEffect.belongsTo(Power, { foreignKey: "id_power", as: "power" });

// Perfil de Jogador (Especificação Perfil de Jogador Caelum) — conquistas
// e títulos são catálogos globais; CharacterAchievement/CharacterTitle
// são o que cada personagem desbloqueou; CharacterProfile é a
// personalização (frase/título selecionado); os *Highlight são os
// destaques (até 3 cada) escolhidos pelo jogador.
const Achievement = require("./Achievement");
const Title = require("./Title");
const CharacterProfile = require("./CharacterProfile");
const CharacterAchievement = require("./CharacterAchievement");
const CharacterTitle = require("./CharacterTitle");
const CharacterProfileAchievementHighlight = require("./CharacterProfileAchievementHighlight");
const CharacterProfileMonsterHighlight = require("./CharacterProfileMonsterHighlight");

Title.belongsTo(Achievement, { foreignKey: "id_achievement_desbloqueia", as: "conquistaQueDesbloqueia" });

CharacterProfile.belongsTo(Character, { foreignKey: "id_personagem" });
CharacterProfile.belongsTo(Title, { foreignKey: "id_titulo_selecionado", as: "tituloSelecionado" });

CharacterAchievement.belongsTo(Character, { foreignKey: "id_personagem" });
CharacterAchievement.belongsTo(Achievement, { foreignKey: "id_achievement", as: "achievement" });
Character.hasMany(CharacterAchievement, { foreignKey: "id_personagem", as: "conquistas" });

CharacterTitle.belongsTo(Character, { foreignKey: "id_personagem" });
CharacterTitle.belongsTo(Title, { foreignKey: "id_title", as: "title" });
Character.hasMany(CharacterTitle, { foreignKey: "id_personagem", as: "titulos" });

CharacterProfileAchievementHighlight.belongsTo(Character, { foreignKey: "id_personagem" });
CharacterProfileAchievementHighlight.belongsTo(Achievement, { foreignKey: "id_achievement", as: "achievement" });
Character.hasMany(CharacterProfileAchievementHighlight, { foreignKey: "id_personagem", as: "destaquesDeConquista" });

CharacterProfileMonsterHighlight.belongsTo(Character, { foreignKey: "id_personagem" });
CharacterProfileMonsterHighlight.belongsTo(AdventureMonster, { foreignKey: "id_monstro", as: "monstro" });
Character.hasMany(CharacterProfileMonsterHighlight, { foreignKey: "id_personagem", as: "destaquesDeMonstro" });

// Sistema de Conjuntos de Equipamentos (§4/§20) — EquipmentSetPiece
// liga um Item do catálogo a um conjunto (deduplicado por piece_key,
// nunca por id_item/instância); EquipmentSetBonus são os thresholds
// (2/6, 4/6, 6/6, ...) do próprio conjunto. `Item.hasMany(..., as:
// "setPieces")` é o que equipmentSetService usa pra descobrir, a partir
// de um item equipado, a quais conjuntos ele pertence.
Item.hasMany(EquipmentSetPiece, { foreignKey: "item_id", as: "setPieces" });
EquipmentSetPiece.belongsTo(Item, { foreignKey: "item_id", as: "item" });
EquipmentSetPiece.belongsTo(EquipmentSet, { foreignKey: "equipment_set_id", as: "equipmentSet" });
EquipmentSet.hasMany(EquipmentSetPiece, { foreignKey: "equipment_set_id", as: "pecas" });
// Peça por blueprint (qualquer raridade do blueprint conta) — ver
// comentário no model EquipmentSetPiece e na migration
// 20261206010000-equipment-set-piece-por-blueprint.
ForgeBlueprint.hasMany(EquipmentSetPiece, { foreignKey: "id_blueprint", as: "setPiecesPorBlueprint" });
EquipmentSetPiece.belongsTo(ForgeBlueprint, { foreignKey: "id_blueprint", as: "blueprint" });

EquipmentSetBonus.belongsTo(EquipmentSet, { foreignKey: "equipment_set_id", as: "equipmentSet" });
EquipmentSet.hasMany(EquipmentSetBonus, { foreignKey: "equipment_set_id", as: "bonuses" });

// Evolução do Motor de Status §12.1 — efeitos de status por arma,
// ligados a WeaponProperties.id_item (nunca Item.id direto): só um item
// com registro de arma pode ter WeaponStatusEffect.
WeaponProperties.hasMany(WeaponStatusEffect, { foreignKey: "id_item", as: "statusEffects" });
WeaponStatusEffect.belongsTo(WeaponProperties, { foreignKey: "id_item", as: "arma" });

// Painel Administrativo (§6/§7) — permissões granulares por role;
// User<->AdminRole é N:N via UserAdminRole (um usuário pode acumular
// mais de uma role, ex.: Conteúdo + Eventos).
AdminRole.belongsToMany(AdminPermission, {
  through: AdminRolePermission,
  foreignKey: "id_role",
  otherKey: "id_permission",
  as: "permissoes",
});
AdminPermission.belongsToMany(AdminRole, {
  through: AdminRolePermission,
  foreignKey: "id_permission",
  otherKey: "id_role",
  as: "roles",
});
User.belongsToMany(AdminRole, {
  through: UserAdminRole,
  foreignKey: "id_user",
  otherKey: "id_role",
  as: "adminRoles",
});
AdminRole.belongsToMany(User, {
  through: UserAdminRole,
  foreignKey: "id_role",
  otherKey: "id_user",
  as: "usuarios",
});

// Alquimia / Caldeirão (spec §6.6) — domínio próprio, NUNCA reaproveita
// as associações de ForgeBlueprint acima. Resultado e ingrediente
// apontam pra Item por id_item_resultado/id_item (FK simples, sem
// belongsTo com alias pra não confundir com equipamento); o `include`
// típico do serviço de Alquimia resolve os Items num segundo passo em
// lote (mesma técnica de forgeCraftingService.carregarResolvedorEmLote).
AlchemyRecipe.hasMany(AlchemyRecipeIngredient, { foreignKey: "id_recipe", as: "ingredientes" });
AlchemyRecipeIngredient.belongsTo(AlchemyRecipe, { foreignKey: "id_recipe" });

Item.hasMany(ConsumableEffect, { foreignKey: "id_item", as: "consumableEffects" });
ConsumableEffect.belongsTo(Item, { foreignKey: "id_item" });

AlchemyRecipe.hasMany(CharacterAlchemyRecipeUnlock, { foreignKey: "id_recipe" });
CharacterAlchemyRecipeUnlock.belongsTo(AlchemyRecipe, { foreignKey: "id_recipe" });

// ---------------------------------------------------------------------
// Pesca & Navegação (ver spec completa em pesca_spec.txt) — domínio
// próprio; reaproveita Item/CharacterEquipmentInstance/WorldMapNode/
// WorldMapConnection como INFRAESTRUTURA, nunca duplicando tabelas.
// ---------------------------------------------------------------------
const FishingSpecies = require("./FishingSpecies");
const FishingZone = require("./FishingZone");
const FishingZoneSpecies = require("./FishingZoneSpecies");
const FishingBait = require("./FishingBait");
const FishingBaitAffinity = require("./FishingBaitAffinity");
const FishingRodProperties = require("./FishingRodProperties");
const CharacterFishingProgress = require("./CharacterFishingProgress");
const CharacterFishingLoadout = require("./CharacterFishingLoadout");
const FishingSession = require("./FishingSession");
const FishingCatchRecord = require("./FishingCatchRecord");
const CharacterFishingSpeciesDiscovery = require("./CharacterFishingSpeciesDiscovery");
const Vessel = require("./Vessel");
const CharacterVessel = require("./CharacterVessel");
const FishingPort = require("./FishingPort");
const MarineRoute = require("./MarineRoute");
const CharacterNavigationState = require("./CharacterNavigationState");
const FishingTournament = require("./FishingTournament");

Item.hasOne(FishingRodProperties, { foreignKey: "id_item", as: "fishingRodProperties" });
FishingRodProperties.belongsTo(Item, { foreignKey: "id_item" });

FishingSpecies.belongsTo(Item, { foreignKey: "id_item", as: "item" });

FishingZone.belongsTo(WorldMapNode, { foreignKey: "id_world_node" });

FishingZone.hasMany(FishingZoneSpecies, { foreignKey: "id_zone", as: "pool" });
FishingZoneSpecies.belongsTo(FishingZone, { foreignKey: "id_zone" });
FishingZoneSpecies.belongsTo(FishingSpecies, { foreignKey: "id_species", as: "species" });
FishingSpecies.hasMany(FishingZoneSpecies, { foreignKey: "id_species" });

FishingBait.belongsTo(Item, { foreignKey: "id_item", as: "item" });
FishingBait.hasMany(FishingBaitAffinity, { foreignKey: "id_bait_item", as: "afinidades" });
FishingBaitAffinity.belongsTo(FishingBait, { foreignKey: "id_bait_item" });
FishingBaitAffinity.belongsTo(FishingSpecies, { foreignKey: "id_species", as: "species" });

FishingSession.belongsTo(FishingZone, { foreignKey: "id_zone" });
FishingSession.belongsTo(FishingSpecies, { foreignKey: "id_species" });
FishingCatchRecord.belongsTo(FishingSpecies, { foreignKey: "id_species", as: "species" });
FishingCatchRecord.belongsTo(FishingZone, { foreignKey: "id_zone" });
FishingCatchRecord.belongsTo(Character, { foreignKey: "id_personagem" });
Character.hasMany(FishingCatchRecord, { foreignKey: "id_personagem" });
CharacterFishingProgress.belongsTo(Character, { foreignKey: "id_personagem" });
Character.hasOne(CharacterFishingProgress, { foreignKey: "id_personagem" });

// Torneio da Pesca (ranking materializado na leitura — ver
// fishingTournamentService.js) — escopo de zona é OPCIONAL (torneio
// global quando null).
FishingTournament.belongsTo(FishingZone, { foreignKey: "id_zone", as: "zona" });

Vessel.hasMany(CharacterVessel, { foreignKey: "id_vessel" });
CharacterVessel.belongsTo(Vessel, { foreignKey: "id_vessel", as: "vessel" });

FishingPort.belongsTo(WorldMapNode, { foreignKey: "id_world_node" });
MarineRoute.belongsTo(WorldMapConnection, { foreignKey: "id_world_connection" });
MarineRoute.belongsTo(FishingPort, { foreignKey: "id_port_origem", as: "portoOrigem" });
MarineRoute.belongsTo(FishingZone, { foreignKey: "id_zone_destino", as: "zonaDestino" });

// Sistema de Taverna (§7) — CharacterTavernBuff é a linha ATUAL por
// categoria (Refeicao/Bebida), nunca histórico; TavernGameBet é o
// histórico imutável de apostas.
const TavernMenuItem = require("./TavernMenuItem");
const CharacterTavernBuff = require("./CharacterTavernBuff");
const TavernGame = require("./TavernGame");
const TavernGameBet = require("./TavernGameBet");

Character.hasMany(CharacterTavernBuff, { foreignKey: "id_personagem", as: "buffsTaverna" });
CharacterTavernBuff.belongsTo(Character, { foreignKey: "id_personagem" });
CharacterTavernBuff.belongsTo(TavernMenuItem, { foreignKey: "source_menu_item_id", as: "oferta" });
TavernMenuItem.hasMany(CharacterTavernBuff, { foreignKey: "source_menu_item_id" });

Character.hasMany(TavernGameBet, { foreignKey: "id_personagem", as: "apostasTaverna" });
TavernGameBet.belongsTo(Character, { foreignKey: "id_personagem" });
TavernGame.hasMany(TavernGameBet, { foreignKey: "id_game", as: "apostas" });
TavernGameBet.belongsTo(TavernGame, { foreignKey: "id_game", as: "jogo" });

// Boss Global / Ameaça Mundial (Caelum_Boss_Global.docx) — domínio
// separado de GuildBoss (escopo de servidor inteiro, não de guilda).
const WorldBossConfig = require("./WorldBossConfig");
const WorldBossConfigZone = require("./WorldBossConfigZone");
const WorldBossPhase = require("./WorldBossPhase");
const WorldBossEvent = require("./WorldBossEvent");
const WorldBossContribution = require("./WorldBossContribution");
const WorldBossCombatSession = require("./WorldBossCombatSession");
const WorldBossRewardGrant = require("./WorldBossRewardGrant");

WorldBossConfig.hasMany(WorldBossConfigZone, { foreignKey: "id_world_boss_config", as: "zonas" });
WorldBossConfigZone.belongsTo(WorldBossConfig, { foreignKey: "id_world_boss_config" });
WorldBossConfigZone.belongsTo(AdventureZone, { foreignKey: "id_zone", as: "zona" });

WorldBossConfig.hasMany(WorldBossPhase, { foreignKey: "id_world_boss_config", as: "fases" });
WorldBossPhase.belongsTo(WorldBossConfig, { foreignKey: "id_world_boss_config" });

WorldBossConfig.hasMany(WorldBossEvent, { foreignKey: "id_world_boss_config" });
WorldBossEvent.belongsTo(WorldBossConfig, { foreignKey: "id_world_boss_config", as: "config" });
WorldBossEvent.belongsTo(Character, { foreignKey: "discoverer_character_id", as: "descobridor" });
WorldBossEvent.belongsTo(AdventureZone, { foreignKey: "discovery_zone_id", as: "zonaDescoberta" });
WorldBossEvent.belongsTo(Character, { foreignKey: "final_blow_character_id", as: "golpeFinalPor" });

WorldBossEvent.hasMany(WorldBossContribution, { foreignKey: "event_id", as: "contribuicoes" });
WorldBossContribution.belongsTo(WorldBossEvent, { foreignKey: "event_id" });
Character.hasMany(WorldBossContribution, { foreignKey: "character_id" });
WorldBossContribution.belongsTo(Character, { foreignKey: "character_id" });

WorldBossEvent.hasMany(WorldBossCombatSession, { foreignKey: "event_id" });
WorldBossCombatSession.belongsTo(WorldBossEvent, { foreignKey: "event_id" });
Character.hasMany(WorldBossCombatSession, { foreignKey: "character_id" });
WorldBossCombatSession.belongsTo(Character, { foreignKey: "character_id" });

WorldBossEvent.hasMany(WorldBossRewardGrant, { foreignKey: "event_id", as: "premiacoes" });
WorldBossRewardGrant.belongsTo(WorldBossEvent, { foreignKey: "event_id" });
Character.hasMany(WorldBossRewardGrant, { foreignKey: "character_id" });
WorldBossRewardGrant.belongsTo(Character, { foreignKey: "character_id" });

// Sistema de Proezas Únicas (Caelum_Proezas_Unicas_Claude.docx) —
// UniqueFeat é a autoridade mecânica; Achievement/Title continuam só
// representação pública opcional (§2/§39). id_unique_feat em
// UniqueFeatClaim é UNIQUE (ver migration) — a garantia real de "um
// vencedor global" mora no banco, não só nestas associações.
const UniqueFeat = require("./UniqueFeat");
const UniqueFeatClaim = require("./UniqueFeatClaim");
const UniquePowerEffect = require("./UniquePowerEffect");

UniqueFeat.belongsTo(Power, { foreignKey: "id_power_reward", as: "powerRecompensa" });
UniqueFeat.belongsTo(Achievement, { foreignKey: "id_achievement_reward", as: "achievementRecompensa" });
UniqueFeat.belongsTo(Title, { foreignKey: "id_title_reward", as: "titleRecompensa" });
UniqueFeat.hasOne(UniqueFeatClaim, { foreignKey: "id_unique_feat", as: "claim" });
UniqueFeatClaim.belongsTo(UniqueFeat, { foreignKey: "id_unique_feat", as: "proeza" });
UniqueFeatClaim.belongsTo(Character, { foreignKey: "id_personagem", as: "personagem" });
Character.hasMany(UniqueFeatClaim, { foreignKey: "id_personagem", as: "proezasConquistadas" });

Power.hasOne(UniquePowerEffect, { foreignKey: "id_power", as: "efeitoUnico" });
UniquePowerEffect.belongsTo(Power, { foreignKey: "id_power" });

// Painel Administrativo de Músicas — ver spec "Painel Administrativo de
// Músicas" §3. MusicAssignment/MusicPoolTrackAssignment pertencem a uma
// MusicConfigVersion (draft/publicada/arquivada); tracks/pools são
// catálogo à parte.
const MusicTrack = require("./MusicTrack");
const MusicTrackFileVersion = require("./MusicTrackFileVersion");
const MusicPool = require("./MusicPool");
const MusicConfigVersion = require("./MusicConfigVersion");
const MusicAssignment = require("./MusicAssignment");
const MusicPoolTrackAssignment = require("./MusicPoolTrackAssignment");

MusicTrack.hasMany(MusicTrackFileVersion, { foreignKey: "id_track", as: "versoesArquivo" });
MusicTrackFileVersion.belongsTo(MusicTrack, { foreignKey: "id_track", as: "track" });

MusicConfigVersion.hasMany(MusicAssignment, { foreignKey: "id_config_version", as: "assignments" });
MusicAssignment.belongsTo(MusicConfigVersion, { foreignKey: "id_config_version", as: "configVersion" });
MusicAssignment.belongsTo(MusicTrack, { foreignKey: "id_track", as: "track" });
MusicAssignment.belongsTo(MusicPool, { foreignKey: "id_pool", as: "pool" });

MusicConfigVersion.hasMany(MusicPoolTrackAssignment, { foreignKey: "id_config_version", as: "poolMemberships" });
MusicPoolTrackAssignment.belongsTo(MusicConfigVersion, { foreignKey: "id_config_version", as: "configVersion" });
MusicPoolTrackAssignment.belongsTo(MusicPool, { foreignKey: "id_pool", as: "pool" });
MusicPoolTrackAssignment.belongsTo(MusicTrack, { foreignKey: "id_track", as: "track" });
MusicPool.hasMany(MusicPoolTrackAssignment, { foreignKey: "id_pool", as: "memberships" });
MusicTrack.hasMany(MusicPoolTrackAssignment, { foreignKey: "id_track", as: "poolMemberships" });

module.exports = {};
