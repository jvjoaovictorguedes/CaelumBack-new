const test=require('node:test');const assert=require('node:assert/strict');
const {sequelize,bancoDisponivel}=require('./helpers/db');
const M=require('../src/models/combatTypingModels');
const typing=require('../src/services/combatTypingService');
const core=require('../src/services/combatActionEngine');
const duel=require('../src/services/duelEngine');
let ids={},profile,family,powerId;
test.before(async()=>{
 assert.equal(await bancoDisponivel(),true,'Immunity integration requires local Postgres; do not report skipped checks as passed.');
 const c=await typing.catalog();for(const key of ['FIRE','ICE','WATER','WIND','SLASH'])ids[key]=c.DamageAffinityType.find(a=>a.key===key).id;
 profile=await M.CombatAffinityProfile.create({key:`IMMUNITY_${Date.now()}`,nome:'Individual immunity fixture'});
 for(const [key,multiplier] of Object.entries({FIRE:0,ICE:1.5,WATER:1.5,WIND:.5}))await M.CombatAffinityProfileEntry.create({id_profile:profile.id,id_affinity:ids[key],multiplier});
 family=await M.MonsterFamily.create({key:`IMMUNITY_FAMILY_${Date.now()}`,nome:'Fixture family'});
 powerId=(await require("../src/models/Power").findOne()).id;
 await M.PowerFamilyBonus.create({power_id:powerId,monster_family_id:family.id,damage_bonus_pct:50});
 typing.invalidate();await typing.catalog();
});
test.after(async()=>{if(family){await M.PowerFamilyBonus.destroy({where:{monster_family_id:family.id}});await family.destroy();}if(profile){await M.CombatAffinityProfileEntry.destroy({where:{id_profile:profile.id}});await profile.destroy();}typing.invalidate();await sequelize.close();});
function target(id=27,defesa=0){return {id,agilidade:0,defesa,vida_atual:10000,mana_atual:0,combatTyping:typing.monsterProfile({monster_family_id:family.id,affinity_profile_id:profile.id})};}
function power(key='FIRE'){return {id:powerId,nome:'Fixture',tipo_poder:'Ativo',tipo_dano:'Magico',dano_base:100,cura_base:20,custo_mana:0,escala_atributo:'Inteligencia',valor_escala:0,affinity_mode:'EXPLICIT',affinity_id:ids[key]};}
function actor(){return {id:123,nivel:10,forca:20,inteligencia:20,agilidade:0,velocidade:0,vida_atual:50,mana_atual:1000,combatTyping:{weapon:{nature:'Magico',affinityId:ids.FIRE}}};}
test('27/36 fixture profiles: fire zero despite defense, critical damage and incoming modifiers; payload/telemetry IMUNE',()=>{
 for(const id of [27,36]) for(const defesa of [0,999999]) for(const finalMultiplier of [.01,10]){
  const r=typing.resolveDamage({amount:50000,actor:actor(),target:target(id,defesa),power:power(),finalMultiplier,defenderBuffs:[{affinityId:ids.FIRE,effectKey:'AFFINITY_RECEIVED_PCT',magnitude:400}]});
  assert.equal(r.components[0].familyBonusPct,50);assert.equal(r.totalDamage,0);assert.equal(r.components[0].finalDamage,0);assert.equal(r.components[0].affinityMultiplier,0);assert.equal(r.components[0].effectivenessLabel,'IMUNE');assert.match(typing.describe(r),/Fogo: IMUNE.*0 de dano/);
  assert.deepEqual(JSON.parse(JSON.stringify(r)),r);
 }
 assert.ok(typing.summaries().PVE.labels.IMUNE>0);
 assert.equal(typing.publicDefense(target()).find(a=>a.key==='FIRE').multiplier,0);
});
test('water/ice 1.5 and wind .5; normal minimum one, true damage and PvP unchanged',()=>{
 for(const [key,m] of Object.entries({WATER:1.5,ICE:1.5,WIND:.5}))assert.equal(typing.resolveDamage({amount:100,target:target(),power:power(key)}).components[0].affinityMultiplier,m);
 assert.equal(typing.resolveDamage({amount:.01,target:target(27,999999),power:power('WIND')}).totalDamage,1);
 assert.equal(typing.resolveDamage({amount:100,target:target(),power:{...power(),tipo_dano:'Verdadeiro'}}).totalDamage,150);
 for(const context of ['PVP_CASUAL','RANKED','TOURNAMENT']) assert.equal(typing.resolveDamage({amount:100,target:target(),power:power(),context}).totalDamage,100);
});
test('no immunity inferred from family, equipment, caster nature or basic attack affinity; positive individual entry overrides family',()=>{
 for(const combatTyping of [{basicAffinityId:ids.FIRE},{multipliers:{[ids.FIRE]:0},inherited:{[ids.FIRE]:0}},{multipliers:{[ids.FIRE]:0},percentages:{[ids.FIRE]:-100}},{multipliers:{[ids.FIRE]:1.5},inherited:{[ids.FIRE]:1.5},overrides:{[ids.FIRE]:1.5}}]){
  const r=typing.resolveDamage({amount:100,target:{defesa:0,combatTyping},power:power()});assert.ok(r.totalDamage>0);assert.notEqual(r.components[0].effectivenessLabel,'IMUNE');
 }
 const individual={combatTyping:{multipliers:{[ids.FIRE]:1.5},overrides:{[ids.FIRE]:1.5},inherited:{[ids.FIRE]:1.5}}};assert.equal(typing.defensiveMultiplier(individual,ids.FIRE),1.5);
 assert.equal(typing.defensiveMultiplier({combatTyping:{overrides:{[ids.SLASH]:0},multipliers:{[ids.SLASH]:0}}},ids.SLASH),.05);
});
test('full immunity preserves HP/shield, suppresses mixed healing, lifesteal and hit/critical procs in every PvE core context',t=>{
 t.mock.method(Math,'random',()=>.2);
 for(const contexto of ['PVE','PARTY','GUILD_BOSS','WORLD_BOSS','TEMPLE_BOSS','EVENT_PUZZLE_BOSS'])for(const tipo of ['attack','power']){
  const a=actor(),b=target();const shield={valor:200,remainingTurns:3};
  const r=core.aplicarAcao({atacante:a,defensor:b,acao:tipo==='power'?{tipo,power:power()}:{tipo},contexto,vidaMaxAtacante:100,escudoDefensor:shield,modificadoresAtacante:new Map([['LIFESTEAL_PCT',100],['CRIT_CHANCE_PCT',100]]),gatilhosAtacante:new Map([['ON_HIT',[{effect_key:'REGEN_HP_FLAT',magnitude:7,chance_ppm:1000000}]],['ON_CRIT',[{effect_key:'REGEN_HP_FLAT',magnitude:7,chance_ppm:1000000}]]])});
  assert.equal(r.critico,true);assert.equal(r.dano,0);assert.equal(b.vida_atual,10000);assert.deepEqual(r.novoEscudoDefensor,shield);assert.equal(a.vida_atual,50);assert.equal(r.cura,0);
 }
});
test('hybrid slash + immune fire damages shield only by surviving component',t=>{
 t.mock.method(Math,'random',()=>.99);
 const a=actor();a.combatTyping.weapon={nature:'Fisico',affinityId:ids.SLASH,nativeElementId:ids.FIRE,elementalPct:50};
 const b=target();const shield={valor:200,remainingTurns:3};
 const r=core.aplicarAcao({atacante:a,defensor:b,acao:{tipo:'attack'},contexto:'PARTY',escudoDefensor:shield});
 assert.equal(r.damageResolution.components[1].finalDamage,0);assert.ok(r.damageResolution.components[0].finalDamage>0);assert.equal(r.dano,r.damageResolution.components[0].finalDamage);assert.equal(r.novoEscudoDefensor.valor,200-r.dano);assert.equal(b.vida_atual,10000);
});

test('Burn requires surviving damage; hybrid hits preserve Burn and normal ON_HIT',async t=>{
 t.mock.method(Math,'random',()=>.99);
 const burn={status_key:'BURN',ativo:true,chance_ppm:1000000,duration_turns:3,potency_base:5};
 for(const hybrid of [false,true]){
  const a=actor(),b=target();if(hybrid)a.combatTyping.weapon={nature:'Fisico',affinityId:ids.SLASH,nativeElementId:ids.FIRE,elementalPct:50};
  const r=await duel.resolverTurnoComStatus({atacante:a,defensor:b,acao:{tipo:'attack'},vidaMaxAtacante:100,vidaMaxDefensor:10000,statusAtacante:[],statusDefensor:[],turno:1,casterActorId:'fixture',nomeAtacante:'Caster',nomeDefensor:'Target',contexto:'PARTY',efeitosDeStatusAtacante:[burn],gatilhosAtacante:new Map([['ON_HIT',[{effect_key:'REGEN_HP_FLAT',magnitude:7,chance_ppm:1000000}]]])});
  assert.equal(r.statusDefensor.some(e=>e.key==='BURN'),hybrid);assert.equal(a.vida_atual,hybrid?57:50);
 }
});
test('monster skill adapters respect zero damage, status, mixed healing and shield (solo and party)',t=>{
 t.mock.method(Math,'random',()=>.99);
 const adapter=require('../src/services/monsterCombatAdapter');
 const skill={nome:'Fire',danoBase:100,curaBase:20,powerTyping:power(),statusEffects:[{status_key:'BURN',ativo:true,chance_ppm:1000000,duration_turns:3,potency_base:5}],combatEffectsExecutaveis:[]};
 const npc={nome:'Caster',vida_atual:50,vida_maxima:100,velocidade:0,agilidade:0};
 const b=target();const status={player:[],enemy:[]},buffs={player:[],enemy:[]},shield={player:{valor:200,remainingTurns:3},enemy:null};
 adapter.executarPoder({habilidade:skill,inimigoAtual:npc,personagemAtual:b,statusEffects:status,combatBuffs:buffs,escudo:shield,modificadoresJogador:new Map(),multiplicadorDefesaTaverna:1,combatTurn:1,log:[]});
 assert.equal(b.vida_atual,10000);assert.equal(shield.player.valor,200);assert.equal(npc.vida_atual,50);assert.deepEqual(status.player,[]);
 const c=target();const r=adapter.executarPoderEmGrupo({habilidade:skill,inimigo:npc,alvoEstado:c,alvoStatus:[],alvoBuffs:[],modificadoresDefensor:new Map(),combatTurn:1,log:[]});
 assert.equal(r.dano,0);assert.equal(c.vida_atual,10000);assert.equal(npc.vida_atual,50);
});
test('solo controller persists immune HP/shield and returns IMUNE feedback for a real turn',async t=>{
 t.mock.method(Math,'random',()=>.99);
 const {personagem}=await require('./helpers/db').criarPersonagem({nivel:5});
 const p=personagem.toJSON();
 personagem.encontro_pve={...target(),nome:'Immunity fixture',nivel:1,forca:1,vitalidade:1,velocidade:0,dano_min:1,dano_max:1,vida_maxima:10000,criadoEm:Date.now(),statsPersonagem:{nivel:p.nivel,forca:p.forca,vitalidade:p.vitalidade,agilidade:p.agilidade,inteligencia:p.inteligencia,velocidade:p.velocidade,defesa:0,arma_equipada:null,multiplicador_vida_por_nivel:1,multiplicador_mana_por_nivel:1,multiplicador_dano_fisico:1,multiplicador_dano_magico:1,combatTyping:actor().combatTyping},statusEffects:{player:[],enemy:[]},combatBuffs:{player:[],enemy:[]},escudo:{player:null,enemy:{valor:200,remainingTurns:3}},cooldowns:{player:{},enemy:{}},combatTurn:0,ai_profile:'BASIC',habilidades:[]};
 personagem.vida_atual=200;personagem.mana_atual=100;await personagem.save();
 let code,body;const res={status(c){code=c;return this},json(b){body=b;return this}};
 await require('../src/controllers/combatController').executarTurno({personagemAtual:{id:personagem.id},body:{action:{type:'attack'}}},res);
 assert.equal(code,200,JSON.stringify(body));assert.ok(body.data.log.some(l=>l.includes('IMUNE — 0 de dano')));
 await personagem.reload();assert.equal(personagem.encontro_pve.vida_atual,10000);assert.equal(personagem.encontro_pve.escudo.enemy.valor,200);
});
test('world boss skill returns zero damage/healing with existing typed payload',t=>{
 t.mock.method(Math,'random',()=>.99);
 const r=require('../src/services/worldBossRuntimeService').resolverEfeitoDeHabilidade({snapshot:actor(),fase:{modificador_dano_percentual:50},furiaPct:100,ability:{power_snapshot:power(),escala_com_furia:true},alvoBase:target(),alvoDefesa:0,multiplicadorDanoRecebido:3});
 assert.equal(r.dano,0);assert.equal(r.cura,0);assert.equal(r.damageResolution.components[0].effectivenessLabel,'IMUNE');
});
