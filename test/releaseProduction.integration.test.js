const test=require('node:test');const assert=require('node:assert/strict');
const {bancoDisponivel,sequelize,sufixo,criarPersonagem}=require('./helpers/db');
const Item=require('../src/models/Item'),Blueprint=require('../src/models/ForgeBlueprint'),Recipe=require('../src/models/ForgeRecipe');
test('Recipe selection excludes orphan, inactive and unchecked items on a real database',async t=>{
 if(!await bancoDisponivel())return t.skip('Banco indisponível');
 const tx=await sequelize.transaction();
 try{
  const item=await Item.create({nome:'Receita '+sufixo(),tipo_item:'Receita',descricao:'Receita de teste',raridade:'Comum',ativo:true},{transaction:tx});
  const orphan=await Item.create({nome:'Receita órfã '+sufixo(),tipo_item:'Receita',descricao:'Receita de teste',raridade:'Comum',ativo:true},{transaction:tx});
  const blueprint=await Blueprint.create({nome:'Modelo '+sufixo(),categoria_equipamento:'Arma',tier_equipamento:5,modo_desbloqueio:'Receita'},{transaction:tx});
  const recipe=await Recipe.create({id_blueprint:blueprint.id,id_item:item.id,raridade_receita:'Comum',ativo:true},{transaction:tx});
  const service=require('../src/services/expeditionRecipeFindService');
  assert.deepEqual((await service.candidates({item_ids:[item.id,orphan.id]},tx)).map(r=>r.id),[item.id]);
  assert.deepEqual(await service.candidates({item_ids:[]},tx),[]);
  await recipe.update({ativo:false},{transaction:tx});assert.deepEqual(await service.candidates({item_ids:[item.id]},tx),[]);
 }finally{await tx.rollback();}
});
test('Authenticated HTTP players cannot reach temple missions or draw rewards when disabled',async t=>{
 if(!await bancoDisponivel())return t.skip('Banco indisponível');
 t.mock.method(require('../src/services/templeReleaseService'),'enabled',async()=>false);
 const {usuario}=await criarPersonagem({});
 const jwt=require('jsonwebtoken');const {JWT_SECRET}=require('../src/config/jwt');
 const token=jwt.sign({id:usuario.id,proposito:'session'},JWT_SECRET,{expiresIn:'1h'});
 const app=require('express')();app.use(require('express').json());app.use('/temple',require('../src/routes/templeRoutes'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const url='http://127.0.0.1:'+server.address().port;const availability=await fetch(url+'/temple/availability');assert.deepEqual(await availability.json(),{enabled:false});assert.equal(availability.headers.get('cache-control'),'no-store');
 for(const [path,method] of [['/missions','GET'],['/relicary/draw','POST']]){const response=await fetch(url+'/temple'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({count:1})}:{})});assert.equal(response.status,404);}
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test.after(async()=>{await sequelize.close();});
