const test=require('node:test');const assert=require('node:assert/strict');
const release=require('../src/services/templeReleaseService');const Setting=require('../src/models/GameSetting');const cache=require('../src/services/gameSettingCache');
test.afterEach(()=>test.mock.restoreAll());
test('Unconfigured, false and malformed release settings fail closed',async()=>{for(const value of [null,{valor:false},{valor:'true'},{valor:{enabled:true}}]){const stub=test.mock.method(Setting,'findByPk',async()=>value);assert.equal(await release.enabled(),false);await assert.rejects(release.requireEnabled(),e=>e.statusCode===404);stub.mock.restore();}});
test('Enabled database flag admits players; stale cached true cannot admit background work after disabling',async()=>{test.mock.method(cache,'obter',()=>true);test.mock.method(Setting,'findByPk',async()=>({valor:true}));assert.equal(await release.enabled(),true);await release.requireEnabled();test.mock.restoreAll();test.mock.method(cache,'obter',()=>true);test.mock.method(Setting,'findByPk',async()=>({valor:false}));assert.equal(await release.backgroundEnabled(),false);});
test('Disabled temple neither advances lifecycle nor queries character mission progress',async()=>{test.mock.method(release,'backgroundEnabled',async()=>false);const life=test.mock.method(require('../src/services/templeLifecycleService'),'promoverEstados',async()=>{throw Error('Should not advance');});await require('../src/services/templeScheduler').tick();assert.equal(life.mock.callCount(),0);assert.deepEqual(await require('../src/services/templeObjectiveService').registrarProgresso(1,'COMPLETE_EXPEDITIONS',{},null),[]);});
test('Socket entry and combat actions are blocked while temple is disabled',async()=>{
 test.mock.method(release,'requireEnabled',async()=>{throw Object.assign(Error('O Templo está indisponível.'),{statusCode:404});});
 const handlers={},emitted=[];const socket={characterId:1,on:(name,fn)=>{handlers[name]=fn;},emit:(...args)=>emitted.push(args)};
 require('../src/socket/templeBossSocket')({on:(_name,fn)=>fn(socket)});
 const events=require('../src/contracts/socketEvents').TEMPLEBOSS;
 await handlers[events.ENTRAR]();await handlers[events.ACAO]({tipo:'attack'});
 assert.equal(emitted.length,2);assert.ok(emitted.every(([name,payload])=>name===events.ERRO&&payload.mensagem.includes('indisponível')));
});
