// Deliberately outside src/migrations: npm start/db:migrate NEVER executes this.
const assert = require('node:assert/strict');
const TARGETS = [{ id: 27, nome: 'Elemental de Cinzas' }, { id: 36, nome: 'Salamandra de Obsidiana' }];
const BACKUP = 'manual_v9_elemental_immunity_backup';
const quote = name => '"' + name.replaceAll('"','""') + '"';
async function references(client) {
  return (await client.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() AND column_name IN ('affinity_profile_id','default_affinity_profile_id') ORDER BY table_name,column_name`)).rows;
}
async function lockConfiguration(client) {
  const tables=[...new Set(['AdventureMonsters','monster_families','combat_affinity_profiles','combat_affinity_profile_entries','damage_affinity_types',...(await references(client)).map(r=>r.table_name)])].sort();
  await client.query(`LOCK TABLE ${tables.map(quote).join(',')} IN SHARE ROW EXCLUSIVE MODE`);
}
async function snapshot(client, fireValue = 0.05) {
  const { rows: monsters } = await client.query(`SELECT id,nome,affinity_profile_id FROM "AdventureMonsters" WHERE id = ANY($1::int[]) ORDER BY id`, [TARGETS.map(t=>t.id)]);
  assert.equal(monsters.length, 2, 'V9 ausente: as duas criaturas devem existir.');
  const profiles = [];
  for (let i=0;i<monsters.length;i++) {
    const m=monsters[i]; assert.equal(m.nome,TARGETS[i].nome,'Identidade da criatura divergente.');
    assert.ok(m.affinity_profile_id,'V9 ausente: perfil individual não configurado.');
    const { rows:p } = await client.query('SELECT id,key FROM combat_affinity_profiles WHERE id=$1',[m.affinity_profile_id]);
    assert.equal(p.length,1); assert.ok(p[0].key,'Perfil sem chave.');
    const {rows: monsterReferences}=await client.query('SELECT id FROM "AdventureMonsters" WHERE affinity_profile_id=$1 ORDER BY id',[m.affinity_profile_id]);
    assert.deepEqual(monsterReferences.map(r=>r.id),[m.id],'Perfil compartilhado com outra criatura.');
    const {rows: families}=await client.query('SELECT id FROM monster_families WHERE default_affinity_profile_id=$1',[m.affinity_profile_id]);
    assert.equal(families.length,0,'Perfil é utilizado por uma família.');
    for(const ref of await references(client)) {
      if(['AdventureMonsters','monster_families'].includes(ref.table_name))continue;
      const result=await client.query(`SELECT 1 FROM ${quote(ref.table_name)} WHERE ${quote(ref.column_name)}=$1 LIMIT 1`,[m.affinity_profile_id]);
      assert.equal(result.rowCount,0,`Perfil compartilhado com ${ref.table_name}.`);
    }
    const { rows:entries }=await client.query(`SELECT e.id,e.id_profile,e.id_affinity,a.key,a.categoria,e.multiplier::text AS multiplier FROM combat_affinity_profile_entries e JOIN damage_affinity_types a ON a.id=e.id_affinity WHERE e.id_profile=$1 ORDER BY a.key,e.id`,[m.affinity_profile_id]);
    assert.equal(new Set(entries.map(e=>e.key)).size,entries.length,'Afinidades duplicadas.');
    for(const [key,value] of Object.entries({FIRE:fireValue,ICE:1.5,WATER:1.5,WIND:.5})) {
      const entry=entries.find(e=>e.key===key); assert.ok(entry,`V9 ausente: ${key}.`); assert.equal(entry.categoria,'ELEMENTAL'); assert.equal(Number(entry.multiplier),value,`${key} divergente: não aplicar automaticamente.`);
    }
    profiles.push({monster:m,profile:p[0],entries});
  }
  assert.notEqual(profiles[0].profile.id,profiles[1].profile.id,'Perfis individuais precisam ser distintos.');
  return {version:1,profiles};
}
async function up(client, expected) {
  await client.query('BEGIN');
  try {
    // Lock all references as well as entries: snapshot validation and UPDATE
    // must see the same state, including concurrent administrative edits.
    await lockConfiguration(client);
    const {rows:table}=await client.query('SELECT to_regclass($1) AS name',[BACKUP]);
    if(table[0].name) {
      const {rows:backup}=await client.query(`SELECT before_snapshot,after_snapshot FROM ${BACKUP} WHERE id=1`);
      assert.equal(backup.length,1,'Backup inválido.');
      assert.deepEqual(expected,backup[0].before_snapshot,'Snapshot aprovado divergente.');
      assert.deepEqual(await snapshot(client,0),backup[0].after_snapshot,'Estado pós-migração divergente.');
      await client.query('COMMIT'); return {changed:0};
    }
    const before=await snapshot(client); assert.deepEqual(before,expected,'Snapshot mudou desde o SELECT de conferência.');
    await client.query(`CREATE TABLE ${BACKUP} (id integer PRIMARY KEY CHECK(id=1),before_snapshot jsonb NOT NULL,after_snapshot jsonb NOT NULL)`);
    for(const p of before.profiles) {
      const e=p.entries.find(e=>e.key==='FIRE');
      const result=await client.query('UPDATE combat_affinity_profile_entries SET multiplier=0 WHERE id=$1 AND id_profile=$2 AND id_affinity=$3 AND multiplier=0.05',[e.id,e.id_profile,e.id_affinity]);
      assert.equal(result.rowCount,1,'Entrada FIRE divergente.');
    }
    const after=await snapshot(client,0);
    await client.query(`INSERT INTO ${BACKUP} VALUES (1,$1::jsonb,$2::jsonb)`,[JSON.stringify(before),JSON.stringify(after)]);
    await client.query('COMMIT'); return {changed:2};
  } catch(error) {await client.query('ROLLBACK');throw error;}
}
async function down(client) {
  await client.query('BEGIN');
  try {
    await lockConfiguration(client);
    const {rows:table}=await client.query('SELECT to_regclass($1) AS name',[BACKUP]);
    if(!table[0].name) {await client.query('COMMIT');return {changed:0};}
    const {rows:backup}=await client.query(`SELECT before_snapshot,after_snapshot FROM ${BACKUP} WHERE id=1`);
    assert.equal(backup.length,1);assert.deepEqual(await snapshot(client,0),backup[0].after_snapshot,'Rollback bloqueado: configuração mudou.');
    for(const p of backup[0].before_snapshot.profiles) {
      const e=p.entries.find(e=>e.key==='FIRE');
      const r=await client.query('UPDATE combat_affinity_profile_entries SET multiplier=$1 WHERE id=$2 AND id_profile=$3 AND id_affinity=$4 AND multiplier=0',[e.multiplier,e.id,e.id_profile,e.id_affinity]);assert.equal(r.rowCount,1);
    }
    assert.deepEqual(await snapshot(client),backup[0].before_snapshot);
    await client.query(`DROP TABLE ${BACKUP}`);await client.query('COMMIT');return {changed:2};
  }catch(error){await client.query('ROLLBACK');throw error;}
}
module.exports={snapshot,up,down};
if(require.main===module) (async()=>{
  const fs=require('node:fs');const {Client}=require('pg');
  const [action,file]=process.argv.slice(2);
  if(!['inspect','up','down'].includes(action) || (action!=='down'&&!file)) throw new Error('Uso: node scripts/manual-migrations/v9-elemental-immunity.js inspect|up arquivo-snapshot.json | down');
  // Explicit separate binding: no fallback to the application's production DB.
  if(!process.env.IMMUNITY_DATABASE_URL)throw new Error('Configure IMMUNITY_DATABASE_URL no ambiente seguro.');
  const client=new Client({connectionString:process.env.IMMUNITY_DATABASE_URL});await client.connect();
  try {
    if(action==='inspect') {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const data=await snapshot(client);await client.query('COMMIT');fs.writeFileSync(file,JSON.stringify(data,null,2),{flag:'wx',mode:0o600});console.log('SELECT validado; snapshot salvo sem escrita no banco.');
    }else console.log(action==='up'?await up(client,JSON.parse(fs.readFileSync(file,'utf8'))):await down(client));
  }finally{await client.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
