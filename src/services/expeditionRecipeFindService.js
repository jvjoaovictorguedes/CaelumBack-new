const {Op}=require('sequelize');
const {sequelize}=require('../config/database');
const GameSetting=require('../models/GameSetting');
const Item=require('../models/Item');
const {registrarAcao}=require('./adminAuditService');
const KEY='expedition.recipeFind';
const DEFAULT={chance_ppm:1000,item_ids:null};
function validate(value){
 if(!value||!Number.isInteger(value.chance_ppm)||value.chance_ppm<0||value.chance_ppm>1000000)throw Object.assign(new Error('Chance deve estar entre 0 e 100%.'),{statusCode:400});
 if(value.item_ids!==null&&(!Array.isArray(value.item_ids)||value.item_ids.length>10000||value.item_ids.some(id=>!Number.isSafeInteger(id)||id<=0)))throw Object.assign(new Error('Selecione IDs de receitas válidos.'),{statusCode:400});
 return {chance_ppm:value.chance_ppm,item_ids:value.item_ids===null?null:[...new Set(value.item_ids)]};
}
async function config(transaction){
 const row=await GameSetting.findByPk(KEY,{transaction});
 if(!row)return {...DEFAULT};
 try{return validate({chance_ppm:row.valor?.chance_ppm ?? row.valor?.CHANCE_RECEITA_PPM ?? DEFAULT.chance_ppm,item_ids:row.valor?.item_ids ?? null});}
 catch{return {chance_ppm:0,item_ids:[]};}
}
async function candidates(value,transaction){
 const [forge,alchemy]=await Promise.all([
  require('../models/ForgeRecipe').findAll({where:{ativo:true},attributes:['id_item'],transaction,raw:true}),
  require('../models/AlchemyRecipe').findAll({where:{ativo:true,modo_desbloqueio:'DESCOBERTA',id_item_receita:{[Op.ne]:null}},attributes:['id_item_receita'],transaction,raw:true})]);
 const known=[...new Set([...forge.map(r=>r.id_item),...alchemy.map(r=>r.id_item_receita)])];
 const ids=value.item_ids===null?known:known.filter(id=>value.item_ids.includes(id));
 return Item.findAll({where:{ativo:true,tipo_item:'Receita',id:{[Op.in]:ids}},attributes:['id','nome','raridade','imagem_url'],order:[['nome','ASC']],transaction,raw:true});}
async function catalog(){return {config:await config(),receitas:await candidates(DEFAULT)};}
async function save(value,{idAdmin,req}={}){
 value=validate(value);
 await sequelize.transaction(async transaction=>{
  if(value.item_ids!==null){const valid=await candidates(value,transaction);if(valid.length!==value.item_ids.length)throw Object.assign(new Error('Uma receita selecionada não existe ou está desativada.'),{statusCode:400});}
  const before=await GameSetting.findByPk(KEY,{transaction,lock:transaction.LOCK.UPDATE});
  await GameSetting.upsert({chave:KEY,valor:value,tipo:'json',editavel_admin:true,updated_by_admin_id:idAdmin},{transaction});
  await registrarAcao({idAdmin,acao:'UPDATE_EXPEDITION_RECIPE_FIND',entidade:'GameSetting',dadosAntes:before?.toJSON()||null,dadosDepois:{chave:KEY,valor:value},req,transaction});
 });
 return catalog();
}
module.exports={KEY,DEFAULT,validate,config,candidates,catalog,save};
