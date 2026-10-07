// Bug reportado pelo dono do produto: "NÃO ESTÁ DANDO PARA REMOVER
// MONSTROS NEM DROP DE MONSTROS DO PAINEL DE ADMIN DA AVENTURA" — só
// existia "Desativar" (ativo:false), nunca uma exclusão de verdade.
// Cobre os dois novos endpoints: DELETE /admin/adventure/monsters/:id e
// DELETE /admin/adventure/loot/:id (adminAdventureService.deleteAdminMonster
// / deleteAdminMonsterLoot).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo } = require("./helpers/db");
require("../src/models/associations");

const AdventureMonster = require("../src/models/AdventureMonster");
const AdventureZone = require("../src/models/AdventureZone");
const AdventureZoneMonster = require("../src/models/AdventureZoneMonster");
const AdventureMonsterLoot = require("../src/models/AdventureMonsterLoot");
const CharacterAdventureHunt = require("../src/models/CharacterAdventureHunt");
const Item = require("../src/models/Item");
const adminAdventureService = require("../src/services/adminAdventureService");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

async function criarMonstro() {
  return AdventureMonster.create({
    nome: `Monstro Exclusao Teste ${sufixo()}`,
    nivel: 1,
    vida_maxima: 10,
    dano_min: 1,
    dano_max: 2,
    agilidade: 1,
    velocidade: 1,
    xp_recompensa: 1,
    ouro_recompensa: 1,
    ativo: true,
  });
}

testeComBanco("deleteAdminMonster: exclui de verdade um monstro sem histórico, junto com seu drop e vínculo de zona", async () => {
  const monstro = await criarMonstro();
  const zona = await AdventureZone.create({
    nome: `Zona Exclusao Teste ${sufixo()}`,
    nivel_monstro_min: 1,
    nivel_monstro_max: 99,
    ativa: true,
  });
  const vinculo = await AdventureZoneMonster.create({
    id_area: zona.id,
    id_monstro: monstro.id,
    peso_aparicao: 100,
    tipo_aparicao: "Comum",
    nivel_jogador_minimo: 1,
    ativo: true,
  });
  const item = await Item.findOne();
  assert.ok(item, "precisa de pelo menos 1 Item no banco de teste pra montar o drop");
  const loot = await AdventureMonsterLoot.create({
    id_monstro: monstro.id,
    id_item: item.id,
    chance_ppm: 100000,
    quantidade_min: 1,
    quantidade_max: 1,
    categoria: "Principal",
    ativo: true,
  });

  await adminAdventureService.deleteAdminMonster(monstro.id, { idAdmin: 1, req: null });

  assert.equal(await AdventureMonster.findByPk(monstro.id), null);
  assert.equal(await AdventureZoneMonster.findByPk(vinculo.id), null, "vínculo de zona precisa sumir junto");
  assert.equal(await AdventureMonsterLoot.findByPk(loot.id), null, "drop precisa sumir junto");
});

testeComBanco("deleteAdminMonster: recusa excluir monstro com histórico real (Caçada), pede pra desativar em vez disso", async () => {
  const monstro = await criarMonstro();
  const agora = new Date();
  const { personagem } = await criarPersonagem();
  await CharacterAdventureHunt.create({
    id_personagem: personagem.id,
    id_monstro: monstro.id,
    rotation_start: agora,
    rotation_end: agora,
    status: "Completed",
    difficulty: "Dangerous",
    quantity_required: 1,
    progress: 1,
    title_snapshot: "teste",
    story_template_key: "teste",
    story_snapshot: "teste",
    hp_multiplier_snapshot: 1,
    damage_multiplier_snapshot: 1,
    reward_multiplier_snapshot: 1,
    gold_reward_snapshot: 0,
    reputation_reward_snapshot: 0,
    random_factor_snapshot: 1,
  });

  await assert.rejects(
    () => adminAdventureService.deleteAdminMonster(monstro.id, { idAdmin: 1, req: null }),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /desative/i);
      return true;
    },
  );

  assert.ok(await AdventureMonster.findByPk(monstro.id), "monstro com histórico não pode ter sido excluído");
});

testeComBanco("deleteAdminMonsterLoot: exclui de verdade um drop (linha some do banco, não só ativo:false)", async () => {
  const monstro = await criarMonstro();
  const item = await Item.findOne();
  const loot = await AdventureMonsterLoot.create({
    id_monstro: monstro.id,
    id_item: item.id,
    chance_ppm: 100000,
    quantidade_min: 1,
    quantidade_max: 1,
    categoria: "Principal",
    ativo: true,
  });

  await adminAdventureService.deleteAdminMonsterLoot(loot.id, { idAdmin: 1, req: null });

  assert.equal(await AdventureMonsterLoot.findByPk(loot.id), null);
});
