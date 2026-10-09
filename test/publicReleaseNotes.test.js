const test=require('node:test');const assert=require('node:assert/strict');
const migration=require('../src/migrations/20270213010001-patch-note-public-rollout');
test('Published release notes omit hidden features and use the existing patch-note publication flow',async()=>{
 const writes=[];const sequelize={transaction:async fn=>fn({}),query:async(sql,options)=>{if(sql.startsWith('SELECT id'))return[[]];if(sql.includes('INSERT INTO'))writes.push(options.replacements);return[[]];}};
 await migration.up({sequelize});assert.equal(writes.length,1);const note=writes[0];assert.equal(note.versao,'2026.10.08');assert.doesNotMatch(note.descricao,/templo|puzzle|guardião|convergência/i);assert.match(note.descricao,/0,1%/);assert.match(note.descricao,/tier e divisão/);
});
test('Already published release note is preserved rather than duplicated or overwritten',async()=>{let writes=0;await migration.up({sequelize:{transaction:async fn=>fn({}),query:async sql=>{if(sql.startsWith('SELECT id'))return[[{id:1}]];if(sql.includes('INSERT INTO'))writes++;return[[]];}}});assert.equal(writes,0);});
