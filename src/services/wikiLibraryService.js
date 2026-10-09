const {Op}=require('sequelize');
const {buildReferenceArticles}=require('./wikiReferenceService');
const {buildCraftingArticles}=require('./wikiCraftingService');
const {buildItemArticles}=require('./wikiItemService');
const model=name=>require(`../models/${name}`);
async function getLibrary(characterId,entries,typing){
 const progress=await model('CharacterAlchemyProgress').findOne({where:{id_personagem:characterId}});
 const [forge,alchemy,legacyModels,inventory,equipment,shop,blueprints,regions,fishingZones,boss,crisis,catalog]=await Promise.all([
 require('./forgeCraftingService').listarBlueprints(characterId),require('./alchemyRecipeService').listarCatalogo(characterId,progress),require('./craftingService').listarReceitasComItens(),
 model('CharacterInventory').findAll({where:{id_personagem:characterId},raw:true}),model('CharacterEquipmentInstance').findAll({where:{id_personagem:characterId},raw:true}),
 model('Item').findAll({where:{ativo:true,disponivel_loja:true},raw:true}),model('ForgeBlueprint').findAll({where:{ativo:true},raw:true}),
 model('ExpeditionRegion').findAll({where:{ativo:true},raw:true}),model('FishingZone').findAll({where:{ativo:true},raw:true}),
 require('./worldBossStatusService').obterStatusPublico(),require('./worldCrisisService').status(null),typing.catalog()]);
 const visibleForge=new Set(forge.map(r=>r.id));
 const hiddenResults=new Set(blueprints.filter(b=>b.modo_desbloqueio==='Receita'&&!visibleForge.has(b.id)).map(b=>b.id_item_resultado));
 const legacy=legacyModels.map(r=>r.toJSON?r.toJSON():r).filter(r=>!hiddenResults.has(r.id_item));
 const visibleAlchemy=alchemy.filter(r=>r.resultado && (r.modo_desbloqueio!=='DESCOBERTA'||r.desbloqueada));
 const sources=new Map(); const add=(id,text)=>{if(!id)return;const list=sources.get(id)||[];if(!list.includes(text))list.push(text);sources.set(id,list);};
 [...inventory.filter(r=>Number(r.quantidade)>0),...equipment].forEach(r=>add(r.id_item,'Já pertence ao seu personagem.'));
 shop.forEach(r=>add(r.id,'Disponível no catálogo da loja.'));
 forge.forEach(r=>{const b=blueprints.find(b=>b.id===r.id);add(b?.id_item_resultado,`Fabricado pelo modelo conhecido: ${r.nome}.`);r.variantes.forEach(v=>v.ingredientes.forEach(i=>add(i.id_item,`Material usado em: ${r.nome}.`)));});
 visibleAlchemy.forEach(r=>{add(r.resultado.id_item,`Preparado pela fórmula: ${r.nome}.`);r.ingredientes.forEach(i=>add(i.id_item,`Ingrediente usado em: ${r.nome}.`));});
 legacy.forEach(r=>{add(r.id_item,`Resultado da receita fixa: ${r.item?.nome || 'Fabricação'}.`);r.ingredientes.forEach(i=>add(i.id_item_material,`Material da receita: ${r.item?.nome || 'Fabricação'}.`));});
 const monsters=entries.filter(e=>e.kind==='monster').map(e=>({id:Number(e.slug.replace('criatura-','')),nome:e.titulo})).filter(m=>Number.isInteger(m.id)&&m.id>0);
 const loots=monsters.length?await model('AdventureMonsterLoot').findAll({where:{ativo:true,id_monstro:{[Op.in]:monsters.map(m=>m.id)}},raw:true}):[];
 const lootItems=loots.length?await model('Item').findAll({where:{id:{[Op.in]:loots.map(l=>l.id_item)},ativo:true,tipo_item:{[Op.ne]:'Receita'}},raw:true}):[];
 loots.filter(l=>lootItems.some(i=>i.id===l.id_item)).forEach(l=>add(l.id_item,`Espólio conhecido: ${monsters.find(m=>m.id===l.id_monstro)?.nome}.`));
 const ids=[...sources.keys()];
 const items=ids.length?await model('Item').findAll({where:{id:{[Op.in]:ids},ativo:true},order:[['nome','ASC']],raw:true}):[];
 const read=name=>ids.length?model(name).findAll({where:{id_item:{[Op.in]:ids}},raw:true}):[];
 const [weapons,armors,consumables,overrides,effects,weaponEffects]=await Promise.all(['WeaponProperties','ArmorProperties','ConsumableProperties','ItemRarityAttributeOverride','ConsumableEffect','WeaponStatusEffect'].map(read));
 return [...buildReferenceArticles({catalog,typingConfig:typing.config(),regions,fishingZones,boss:boss||{},crisis:crisis||{}}),...buildCraftingArticles({forge,alchemy:visibleAlchemy,legacy}),...buildItemArticles({items,weapons,armors,consumables,overrides,effects,weaponEffects,sources})];
}
module.exports={getLibrary};
