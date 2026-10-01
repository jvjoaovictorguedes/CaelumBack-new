// Admin de Aventura — CRUD de efeitos de status por monstro (ideia #3 da
// fila de melhorias). Mesmo padrão de sincronizarLootMonstro: payload é a
// lista inteira, uma linha ausente é removida, uma com status_key já
// existente é atualizada em vez de duplicada.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo } = require("./helpers/db");
require("../src/models/associations");

const AdventureMonster = require("../src/models/AdventureMonster");
const MonsterStatusEffect = require("../src/models/MonsterStatusEffect");
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
    nome: `Monstro Status Teste ${sufixo()}`,
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

const ADMIN_FAKE = { idAdmin: 1, req: {} };

testeComBanco("sincronizarStatusEffectsMonstro cria, atualiza e remove efeitos conforme o payload", async () => {
  const monstro = await criarMonstro();

  // Cria 2 efeitos.
  let resultado = await adminAdventureService.sincronizarStatusEffectsMonstro(
    monstro.id,
    [
      { status_key: "POISON", chance_ppm: 300_000, duration_turns: 3, potency_base: 5, ativo: true },
      { status_key: "BLEED", chance_ppm: 200_000, duration_turns: 2, potency_base: 3, ativo: true },
    ],
    ADMIN_FAKE,
  );
  assert.equal(resultado.length, 2);

  // Atualiza POISON e remove BLEED (ausente do novo payload).
  resultado = await adminAdventureService.sincronizarStatusEffectsMonstro(
    monstro.id,
    [{ status_key: "POISON", chance_ppm: 500_000, duration_turns: 4, potency_base: 8, ativo: true }],
    ADMIN_FAKE,
  );
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].status_key, "POISON");
  assert.equal(resultado[0].chance_ppm, 500_000);
  assert.equal(resultado[0].duration_turns, 4);

  const linhasNoBanco = await MonsterStatusEffect.findAll({ where: { id_monstro: monstro.id } });
  assert.equal(linhasNoBanco.length, 1, "BLEED devia ter sido removido de verdade, não só desativado");
});

testeComBanco("rejeita status_key fora do Motor de Status", async () => {
  const monstro = await criarMonstro();
  await assert.rejects(
    adminAdventureService.sincronizarStatusEffectsMonstro(
      monstro.id,
      [{ status_key: "INVENTADO", chance_ppm: 100_000, duration_turns: 1, potency_base: 1, ativo: true }],
      ADMIN_FAKE,
    ),
    /status_key inválida/,
  );
});

testeComBanco("rejeita chance_ppm fora do intervalo 0..1_000_000", async () => {
  const monstro = await criarMonstro();
  await assert.rejects(
    adminAdventureService.sincronizarStatusEffectsMonstro(
      monstro.id,
      [{ status_key: "STUN", chance_ppm: 2_000_000, duration_turns: 1, potency_base: 0, ativo: true }],
      ADMIN_FAKE,
    ),
    /chance_ppm/,
  );
});

testeComBanco("rejeita duas linhas com o mesmo status_key no mesmo payload", async () => {
  const monstro = await criarMonstro();
  await assert.rejects(
    adminAdventureService.sincronizarStatusEffectsMonstro(
      monstro.id,
      [
        { status_key: "STUN", chance_ppm: 100_000, duration_turns: 1, potency_base: 0, ativo: true },
        { status_key: "STUN", chance_ppm: 200_000, duration_turns: 2, potency_base: 0, ativo: true },
      ],
      ADMIN_FAKE,
    ),
    /mesmo status_key/,
  );
});

testeComBanco("getAdminMonsterDetail inclui efeitosDeStatus do monstro", async () => {
  const monstro = await criarMonstro();
  await adminAdventureService.sincronizarStatusEffectsMonstro(
    monstro.id,
    [{ status_key: "SILENCE", chance_ppm: 1_000_000, duration_turns: 2, potency_base: 0, ativo: true }],
    ADMIN_FAKE,
  );

  const detalhe = await adminAdventureService.getAdminMonsterDetail(monstro.id);
  assert.equal(detalhe.efeitosDeStatus.length, 1);
  assert.equal(detalhe.efeitosDeStatus[0].status_key, "SILENCE");
});
