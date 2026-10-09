const test = require('node:test');
const assert = require('node:assert/strict');
const {Op}=require('sequelize');
const {buildEncyclopedia,creatureArticle}=require('../src/services/wikiEncyclopediaService');
function fixtures(){const calls=[];const rows={
 Kill:[{id_personagem:7,nome_monstro:'Lobo',primeira_derrota_em:'2026-01-01',quantidade:2},{id_personagem:8,nome_monstro:'Segredo',primeira_derrota_em:'2026-01-01'},{id_personagem:7,nome_monstro:'Ainda oculto',primeira_derrota_em:null}],
 Monster:[{id:1,nome:'Lobo',ativo:true,nivel:8,vida_maxima:170,dano_min:41,dano_max:90,descricao:'Caça em silêncio.'},{id:2,nome:'Segredo',ativo:true},{id:3,nome:'Ainda oculto',ativo:true},{id:4,nome:'Desativado',ativo:false}],
 Zone:[{id:1,nome:'Bosque',ativa:true,nivel_jogador_minimo:6}],
 Link:[{id:1,id_area:1,id_monstro:1,ativo:true,tipo_aparicao:'Raro',nivel_jogador_minimo:8},{id:2,id_area:1,id_monstro:2,ativo:true},{id:3,id_area:1,id_monstro:3,ativo:true}],
 Loot:[{id:1,id_monstro:1,id_item:1,ativo:true,chance_ppm:1,quantidade_min:1,quantidade_max:1},{id:2,id_monstro:1,id_item:2,ativo:true,chance_ppm:1000}],
 Item:[{id:1,nome:'Gema',tipo_item:'Material'},{id:2,nome:'Receita secreta',tipo_item:'Receita'}],Ability:[],Power:[],Class:[],Race:[]};
 const matches=(row,where)=>Object.entries(where||{}).every(([k,v])=>typeof v==='object'&&v!==null?(v[Op.in]?v[Op.in].includes(row[k]):row[k]!==v[Op.ne]):row[k]===v);
 const models=Object.fromEntries(Object.entries(rows).map(([name,data])=>[name,{findAll:async options=>{calls.push({name,options});return data.filter(row=>matches(row,options.where));}}]));return {rows,models,calls};}
test('Only this character first victories reveal active creatures; no recipes or secret totals',async()=>{const {models}=fixtures();const result=await buildEncyclopedia(7,models);const monsters=result.filter(a=>a.kind==='monster');assert.equal(monsters.length,1);assert.equal(monsters[0].titulo,'Lobo');assert.match(monsters[0].conteudo,/0,0001%/);assert.match(monsters[0].conteudo,/170/);assert.match(monsters[0].conteudo,/Gema/);assert.doesNotMatch(JSON.stringify(result),/Receita secreta|Ainda oculto|Segredo/);});
test('No discoveries do not query monster catalog or leak hidden creatures',async()=>{const {models,calls}=fixtures();const result=await buildEncyclopedia(99,models);assert.equal(result.length,3);assert.ok(calls.every(c=>!['Monster','Loot','Ability'].includes(c.name)));});
test('Inactive zones and links remove discovered monsters from encyclopedia',async()=>{const {models,rows}=fixtures();rows.Zone[0].ativa=false;assert.equal((await buildEncyclopedia(7,models)).filter(a=>a.kind==='monster').length,0);});
test('Catalog edits are reflected on next request without rewriting admin articles',async()=>{const {models,rows}=fixtures();await buildEncyclopedia(7,models);rows.Monster[0].vida_maxima=999;const result=await buildEncyclopedia(7,models);assert.match(result.find(a=>a.kind==='monster').conteudo,/999/);});
test('Ability zero overrides take precedence and damage remains labelled base',()=>{const a=creatureArticle({id:1,nome:'Lobo'},[],[],[{ability:{custo_mana_override:0,cooldown_override:0},power:{nome:'Mordida',descricao:'Golpe',custo_mana:12,cooldown:3,dano_base:10,valor_escala:0.5,escala_atributo:'Forca'}}],1);assert.match(a.conteudo,/Mana \| 0/);assert.match(a.conteudo,/Recarga \(turnos\) \| 0/);assert.match(a.conteudo,/0,5 × Forca/);});

test('Discovered but globally inactive monster remains hidden',async()=>{const {models,rows}=fixtures();rows.Kill.push({id_personagem:7,nome_monstro:'Desativado',primeira_derrota_em:'2026-01-01'});rows.Link.push({id:4,id_monstro:4,id_area:1,ativo:true});const result=await buildEncyclopedia(7,models);assert.doesNotMatch(JSON.stringify(result),/Desativado/);});
