const {article, table, number:n}=require('./wikiContent');
const rarity=require('./equipmentRarityService');
const {RARITY_POWER_MULTIPLIER}=require('../config/equipmentTierConfig');
function buildItemArticles({items,weapons=[],armors=[],consumables=[],overrides=[],effects=[],weaponEffects=[],sources=new Map()}) {
 return items.map(item=>{
 const weapon=weapons.find(p=>p.id_item===item.id),armor=armors.find(p=>p.id_item===item.id),consumable=consumables.find(p=>p.id_item===item.id);
 const parts=[item.descricao,table(['Propriedade','Valor'],[['Tipo',item.tipo_item],['Tier do modelo',item.tier_equipamento || 'Não se aplica'],['Raridade de catálogo',item.raridade],['Peso',n(item.peso)],['Compra na loja',item.disponivel_loja?`${n(item.valor_compra)} gold`:'Não disponível'],['Valor cadastrado de venda',`${n(item.valor_venda)} gold`]])];
 if(weapon)parts.push('## Atributos por raridade',table(['Raridade','Dano mínimo','Dano máximo','Atributo bônus','Bônus'],Object.keys(RARITY_POWER_MULTIPLIER).map(q=>{const p=rarity.aplicarRaridadeArma(weapon,q,overrides.filter(o=>o.id_item===item.id));return[q,n(p.dano_min),n(p.dano_max),p.bonus_atributo || 'Nenhum',n(p.valor_bonus_atributo)];})),`Natureza de dano: ${weapon.damage_nature_override || weapon.tipo_dano}. Tipo de arma: ${weapon.tipo_arma}.`);
 if(armor)parts.push('## Atributos por raridade',table(['Raridade','Defesa','Força','Vitalidade','Inteligência','Agilidade','Velocidade'],Object.keys(RARITY_POWER_MULTIPLIER).map(q=>{const p=rarity.aplicarRaridadeArmadura(armor,q,overrides.filter(o=>o.id_item===item.id));return[q,...['defesa','bonus_forca','bonus_vitalidade','bonus_inteligencia','bonus_agilidade','bonus_velocidade'].map(k=>n(p[k]))];})),`Slot: ${item.tipo_item==='Escudo'?'Arma secundária':armor.slot_equipamento}.`);
 if(weapon||armor)parts.push('A prévia usa os ajustes cadastrados para cada raridade e não inclui refinamento, atributos do personagem, buffs ou bônus de classe. A raridade real pertence à cópia do equipamento.');
 if(consumable)parts.push('## Efeitos de consumo',table(['Efeito','Valor'],[['Vida restaurada',n(consumable.efeito_vida)],['Mana restaurada',n(consumable.efeito_mana)],['Redistribuição de atributos',consumable.efeito_reset_atributos?'Sim':'Não']]),'Confira os efeitos adicionais e as condições de uso na tela do item antes de consumir.');
 const labels={CLEANSE_STATUS:'Remove status',CLEANSE_CATEGORY:'Remove categoria de status',HEAL_HP_FLAT:'Restaura vida',HEAL_HP_PERCENT:'Restaura vida máxima (%)',RESTORE_MANA_FLAT:'Restaura mana',RESTORE_MANA_PERCENT:'Restaura mana máxima (%)',APPLY_COMBAT_BUFF:'Bônus de combate',GRANT_SHIELD:'Escudo'};
 const status=require('../config/statusEffectConfig').STATUS;
 const additional=effects.filter(e=>e.id_item===item.id&&e.ativo);
 if(additional.length)parts.push('## Efeitos adicionais',table(['Efeito','Magnitude','Duração (turnos)','Detalhe'],additional.map(e=>[labels[e.effect_key]||'Efeito específico',n(e.magnitude),e.duration_turns??'Imediato',status[e.config?.status_key]?.nomeUi||({DOT:'Dano periódico',CONTROLE:'Controle'})[e.config?.category]||e.config?.atributo||'—'])));
 const hits=weaponEffects.filter(e=>e.id_item===item.id&&e.ativo);
 if(hits.length)parts.push('## Status da arma',table(['Status','Chance por ativação','Duração (turnos)','Potência base'],hits.map(e=>[status[e.status_key]?.nomeUi||e.status_key,`${n(Number(e.chance_ppm)/10000)}%`,e.duration_turns,n(e.potency_base)])),'A potência e sua unidade seguem o status; escalamento e regras de ativação também podem alterar o efeito no combate.');
 parts.push('## Registros conhecidos' ,...(sources.get(item.id)||['Item conhecido pelo personagem.']));
 return article(`item-${item.id}`,item.nome,'item','Equipamentos e itens',parts,{resumo:`${item.tipo_item} · ${item.raridade}`,imagem_url:item.imagem_url,item_type:item.tipo_item});
 });
}
module.exports={buildItemArticles};
