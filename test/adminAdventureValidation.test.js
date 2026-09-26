// Admin Aventura — validações de configuração (correção pontual, ver
// commit desta mudança). Cobre os 5 pontos endurecidos no
// adminAdventureService.js: faixa de nível da zona (com mescla de
// PATCH parcial), peso_aparicao, overrides de nível do
// AdventureZoneMonster (dentro do intervalo da zona), quantidade de
// loot e multiplicadores do monstro. Precisa de Postgres migrado
// (TEST_DATABASE_URL/DATABASE_URL) — sem banco, pulado por completo,
// mesmo padrão do resto da suíte (ver adminAdventureBalance.test.js).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo } = require("./helpers/db");
require("../src/models/associations");

const AdventureMonster = require("../src/models/AdventureMonster");
const AdventureZone = require("../src/models/AdventureZone");
const AdventureZoneMonster = require("../src/models/AdventureZoneMonster");
const AdventureMonsterLoot = require("../src/models/AdventureMonsterLoot");
const Item = require("../src/models/Item");
const { MULTIPLICADOR_MINIMO, MULTIPLICADOR_MAXIMO } = require("../src/config/monsterBalanceConfig");

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

const ADMIN_FAKE = { idAdmin: 1, req: { ip: "127.0.0.1", headers: {}, get: () => "teste-agent" } };

// "Teste" (T maiúsculo) é a convenção do projeto pra fixture
// descartável que não deve vazar pra contagens de outros arquivos (ver
// mesmo comentário em adminAdventureBalance.test.js/adventureHunts.test.js).
// AdventureMonsterLoot/AdventureZoneMonster/AdventureZone/AdventureMonster/
// Item criados aqui são removidos no test.after — aventuraExpansao.test.js
// varre TODO AdventureMonsterLoot da tabela (sem filtro por nome) pra
// checar que o item apontado é sempre do tipo "Espolio", então um loot
// de teste esquecido no banco quebraria aquele arquivo sem relação
// nenhuma com este.
const zonasCriadas = [];
const monstrosCriados = [];
const itensCriados = [];

async function criarZonaDeTeste({ min = 10, max = 20 } = {}) {
  const zona = await AdventureZone.create({
    nome: `Zona Teste ${sufixo()}`,
    nivel_monstro_min: min,
    nivel_monstro_max: max,
    ordem: 999,
    ativa: true,
  });
  zonasCriadas.push(zona.id);
  return zona;
}

async function criarMonstroDeTeste() {
  const monstro = await AdventureMonster.create({
    nome: `Monstro Teste ${sufixo()}`,
    multiplicador_vida: 1,
    multiplicador_dano: 1,
    multiplicador_agilidade: 1,
    multiplicador_velocidade: 1,
    ativo: true,
  });
  monstrosCriados.push(monstro.id);
  return monstro;
}

async function criarItemDeTeste() {
  const item = await Item.create({
    nome: `Item Teste ${sufixo()}`,
    descricao: "Item descartável de teste.",
    tipo_item: "Espolio",
    raridade: "Comum",
  });
  itensCriados.push(item.id);
  return item;
}

test.after(async () => {
  if (!temBanco) return;
  await AdventureMonsterLoot.destroy({ where: { id_monstro: monstrosCriados.length ? monstrosCriados : [-1] } });
  await AdventureZoneMonster.destroy({ where: { id_area: zonasCriadas.length ? zonasCriadas : [-1] } });
  await AdventureZone.destroy({ where: { id: zonasCriadas.length ? zonasCriadas : [-1] } });
  await AdventureMonster.destroy({ where: { id: monstrosCriados.length ? monstrosCriados : [-1] } });
  await Item.destroy({ where: { id: itensCriados.length ? itensCriados : [-1] } });
  const { sequelize } = require("../src/config/database");
  await sequelize.close();
});

// ------------------------------------------------------------------ ZONA

testeComBanco("zona: create com min <= max é aceito", async () => {
  const zona = await adminAdventureService.createAdminZone(
    { nome: `Zona Teste ${sufixo()}`, nivel_monstro_min: 10, nivel_monstro_max: 20 },
    ADMIN_FAKE,
  );
  zonasCriadas.push(zona.id);
  assert.equal(zona.nivel_monstro_min, 10);
  assert.equal(zona.nivel_monstro_max, 20);
});

testeComBanco("zona: create com min > max é rejeitado", async () => {
  await assert.rejects(
    () =>
      adminAdventureService.createAdminZone(
        { nome: `Zona Teste ${sufixo()}`, nivel_monstro_min: 20, nivel_monstro_max: 10 },
        ADMIN_FAKE,
      ),
    /nível mínimo.*máximo/i,
  );
});

testeComBanco("zona: create com valores não inteiros é rejeitado", async () => {
  await assert.rejects(
    () =>
      adminAdventureService.createAdminZone(
        { nome: `Zona Teste ${sufixo()}`, nivel_monstro_min: "abc", nivel_monstro_max: 20 },
        ADMIN_FAKE,
      ),
    /números inteiros/i,
  );
});

testeComBanco(
  "zona: PATCH parcial só com nivel_monstro_min maior que o max ATUAL é rejeitado (não valida só o campo enviado)",
  async () => {
    const zona = await criarZonaDeTeste({ min: 10, max: 20 });
    await assert.rejects(
      () => adminAdventureService.updateAdminZone(zona.id, { nivel_monstro_min: 30 }, ADMIN_FAKE),
      /nível mínimo.*máximo/i,
    );
    const depois = await AdventureZone.findByPk(zona.id);
    assert.equal(depois.nivel_monstro_min, 10, "não podia ter persistido o PATCH inválido");
  },
);

testeComBanco(
  "zona: PATCH parcial só com nivel_monstro_max menor que o min ATUAL é rejeitado",
  async () => {
    const zona = await criarZonaDeTeste({ min: 10, max: 20 });
    await assert.rejects(
      () => adminAdventureService.updateAdminZone(zona.id, { nivel_monstro_max: 5 }, ADMIN_FAKE),
      /nível mínimo.*máximo/i,
    );
    const depois = await AdventureZone.findByPk(zona.id);
    assert.equal(depois.nivel_monstro_max, 20);
  },
);

testeComBanco("zona: PATCH alterando min e max juntos para valores válidos é aceito", async () => {
  const zona = await criarZonaDeTeste({ min: 10, max: 20 });
  const atualizada = await adminAdventureService.updateAdminZone(
    zona.id,
    { nivel_monstro_min: 25, nivel_monstro_max: 35 },
    ADMIN_FAKE,
  );
  assert.equal(atualizada.nivel_monstro_min, 25);
  assert.equal(atualizada.nivel_monstro_max, 35);
});

testeComBanco("zona: PATCH que não toca nível nenhum continua funcionando normalmente", async () => {
  const zona = await criarZonaDeTeste({ min: 10, max: 20 });
  const atualizada = await adminAdventureService.updateAdminZone(zona.id, { ativa: false }, ADMIN_FAKE);
  assert.equal(atualizada.ativa, false);
  assert.equal(atualizada.nivel_monstro_min, 10);
  assert.equal(atualizada.nivel_monstro_max, 20);
});

// --------------------------------------------------------- PESO DE APARIÇÃO

testeComBanco("aparição: peso_aparicao > 0 é aceito", async () => {
  const zona = await criarZonaDeTeste();
  const monstro = await criarMonstroDeTeste();
  const aparicao = await adminAdventureService.createAdminZoneMonster(
    { id_area: zona.id, id_monstro: monstro.id, peso_aparicao: 5 },
    ADMIN_FAKE,
  );
  assert.equal(aparicao.peso_aparicao, 5);
});

testeComBanco("aparição: peso_aparicao = 0 é rejeitado", async () => {
  const zona = await criarZonaDeTeste();
  const monstro = await criarMonstroDeTeste();
  await assert.rejects(
    () =>
      adminAdventureService.createAdminZoneMonster(
        { id_area: zona.id, id_monstro: monstro.id, peso_aparicao: 0 },
        ADMIN_FAKE,
      ),
    /peso de aparição.*maior que zero/i,
  );
});

testeComBanco("aparição: peso_aparicao negativo é rejeitado", async () => {
  const zona = await criarZonaDeTeste();
  const monstro = await criarMonstroDeTeste();
  await assert.rejects(
    () =>
      adminAdventureService.createAdminZoneMonster(
        { id_area: zona.id, id_monstro: monstro.id, peso_aparicao: -10 },
        ADMIN_FAKE,
      ),
    /peso de aparição.*maior que zero/i,
  );
});

testeComBanco("aparição: peso_aparicao inválido (string/NaN/float) é rejeitado", async () => {
  const zona = await criarZonaDeTeste();
  const monstro = await criarMonstroDeTeste();
  await assert.rejects(
    () =>
      adminAdventureService.createAdminZoneMonster(
        { id_area: zona.id, id_monstro: monstro.id, peso_aparicao: "abc" },
        ADMIN_FAKE,
      ),
    /peso de aparição/i,
  );
  await assert.rejects(
    () =>
      adminAdventureService.createAdminZoneMonster(
        { id_area: zona.id, id_monstro: monstro.id, peso_aparicao: NaN },
        ADMIN_FAKE,
      ),
    /peso de aparição/i,
  );
  await assert.rejects(
    () =>
      adminAdventureService.createAdminZoneMonster(
        { id_area: zona.id, id_monstro: monstro.id, peso_aparicao: 2.5 },
        ADMIN_FAKE,
      ),
    /peso de aparição/i,
  );
});

testeComBanco("aparição: PATCH de peso_aparicao pra valor inválido é rejeitado sem persistir", async () => {
  const zona = await criarZonaDeTeste();
  const monstro = await criarMonstroDeTeste();
  const aparicao = await adminAdventureService.createAdminZoneMonster(
    { id_area: zona.id, id_monstro: monstro.id, peso_aparicao: 100 },
    ADMIN_FAKE,
  );
  await assert.rejects(
    () => adminAdventureService.updateAdminZoneMonster(aparicao.id, { peso_aparicao: -5 }, ADMIN_FAKE),
    /peso de aparição/i,
  );
  const depois = await AdventureZoneMonster.findByPk(aparicao.id);
  assert.equal(depois.peso_aparicao, 100);
});

// ---------------------------------------------------------------- OVERRIDE

testeComBanco("override: dentro do intervalo da zona é aceito", async () => {
  const zona = await criarZonaDeTeste({ min: 10, max: 20 });
  const monstro = await criarMonstroDeTeste();
  const aparicao = await adminAdventureService.createAdminZoneMonster(
    { id_area: zona.id, id_monstro: monstro.id, nivel_min_override: 15, nivel_max_override: 18 },
    ADMIN_FAKE,
  );
  assert.equal(aparicao.nivel_min_override, 15);
  assert.equal(aparicao.nivel_max_override, 18);
});

testeComBanco("override: min > max é rejeitado", async () => {
  const zona = await criarZonaDeTeste({ min: 10, max: 20 });
  const monstro = await criarMonstroDeTeste();
  await assert.rejects(
    () =>
      adminAdventureService.createAdminZoneMonster(
        { id_area: zona.id, id_monstro: monstro.id, nivel_min_override: 18, nivel_max_override: 15 },
        ADMIN_FAKE,
      ),
    /override.*não pode ser maior/i,
  );
});

testeComBanco("override: fora do intervalo permitido da zona é rejeitado (acima do máximo)", async () => {
  const zona = await criarZonaDeTeste({ min: 10, max: 20 });
  const monstro = await criarMonstroDeTeste();
  await assert.rejects(
    () =>
      adminAdventureService.createAdminZoneMonster(
        { id_area: zona.id, id_monstro: monstro.id, nivel_min_override: 25, nivel_max_override: 30 },
        ADMIN_FAKE,
      ),
    /dentro do intervalo da zona/i,
  );
});

testeComBanco("override: fora do intervalo permitido da zona é rejeitado (abaixo do mínimo)", async () => {
  const zona = await criarZonaDeTeste({ min: 10, max: 20 });
  const monstro = await criarMonstroDeTeste();
  await assert.rejects(
    () =>
      adminAdventureService.createAdminZoneMonster(
        { id_area: zona.id, id_monstro: monstro.id, nivel_min_override: 1, nivel_max_override: 5 },
        ADMIN_FAKE,
      ),
    /dentro do intervalo da zona/i,
  );
});

testeComBanco("override: PATCH que amplia o override pra fora da zona é rejeitado", async () => {
  const zona = await criarZonaDeTeste({ min: 10, max: 20 });
  const monstro = await criarMonstroDeTeste();
  const aparicao = await adminAdventureService.createAdminZoneMonster(
    { id_area: zona.id, id_monstro: monstro.id, nivel_min_override: 15, nivel_max_override: 18 },
    ADMIN_FAKE,
  );
  await assert.rejects(
    () => adminAdventureService.updateAdminZoneMonster(aparicao.id, { nivel_max_override: 25 }, ADMIN_FAKE),
    /dentro do intervalo da zona/i,
  );
  const depois = await AdventureZoneMonster.findByPk(aparicao.id);
  assert.equal(depois.nivel_max_override, 18, "não podia ter persistido o override inválido");
});

testeComBanco("override: sem override nenhum (null/null) continua válido — cai pra faixa da zona", async () => {
  const zona = await criarZonaDeTeste({ min: 10, max: 20 });
  const monstro = await criarMonstroDeTeste();
  const aparicao = await adminAdventureService.createAdminZoneMonster(
    { id_area: zona.id, id_monstro: monstro.id },
    ADMIN_FAKE,
  );
  assert.equal(aparicao.nivel_min_override, null);
  assert.equal(aparicao.nivel_max_override, null);
});

// -------------------------------------------------------------------- LOOT

testeComBanco("loot: quantidade 1-3 é aceita", async () => {
  const monstro = await criarMonstroDeTeste();
  const item = await criarItemDeTeste();
  const loot = await adminAdventureService.createAdminMonsterLoot(
    { id_monstro: monstro.id, id_item: item.id, chance_ppm: 500000, quantidade_min: 1, quantidade_max: 3 },
    ADMIN_FAKE,
  );
  assert.equal(loot.quantidade_min, 1);
  assert.equal(loot.quantidade_max, 3);
});

testeComBanco("loot: quantidade 5-5 (min == max) é aceita", async () => {
  const monstro = await criarMonstroDeTeste();
  const item = await criarItemDeTeste();
  const loot = await adminAdventureService.createAdminMonsterLoot(
    { id_monstro: monstro.id, id_item: item.id, chance_ppm: 500000, quantidade_min: 5, quantidade_max: 5 },
    ADMIN_FAKE,
  );
  assert.equal(loot.quantidade_min, 5);
  assert.equal(loot.quantidade_max, 5);
});

testeComBanco("loot: quantidade_min 0 é rejeitada", async () => {
  const monstro = await criarMonstroDeTeste();
  const item = await criarItemDeTeste();
  await assert.rejects(
    () =>
      adminAdventureService.createAdminMonsterLoot(
        { id_monstro: monstro.id, id_item: item.id, chance_ppm: 500000, quantidade_min: 0, quantidade_max: 3 },
        ADMIN_FAKE,
      ),
    /quantidade mínima.*maior ou igual a 1/i,
  );
});

testeComBanco("loot: quantidade_min negativa é rejeitada", async () => {
  const monstro = await criarMonstroDeTeste();
  const item = await criarItemDeTeste();
  await assert.rejects(
    () =>
      adminAdventureService.createAdminMonsterLoot(
        { id_monstro: monstro.id, id_item: item.id, chance_ppm: 500000, quantidade_min: -1, quantidade_max: 3 },
        ADMIN_FAKE,
      ),
    /quantidade mínima.*maior ou igual a 1/i,
  );
});

testeComBanco("loot: quantidade fracionária (1.5) é rejeitada", async () => {
  const monstro = await criarMonstroDeTeste();
  const item = await criarItemDeTeste();
  await assert.rejects(
    () =>
      adminAdventureService.createAdminMonsterLoot(
        { id_monstro: monstro.id, id_item: item.id, chance_ppm: 500000, quantidade_min: 1.5, quantidade_max: 3 },
        ADMIN_FAKE,
      ),
    /quantidade mínima.*inteiro/i,
  );
});

testeComBanco("loot: quantidade_min > quantidade_max (5-2) é rejeitada", async () => {
  const monstro = await criarMonstroDeTeste();
  const item = await criarItemDeTeste();
  await assert.rejects(
    () =>
      adminAdventureService.createAdminMonsterLoot(
        { id_monstro: monstro.id, id_item: item.id, chance_ppm: 500000, quantidade_min: 5, quantidade_max: 2 },
        ADMIN_FAKE,
      ),
    /quantidade mínima.*não pode ser maior/i,
  );
});

testeComBanco("loot: create sem informar quantidade nenhuma usa o default (1-1), válido", async () => {
  const monstro = await criarMonstroDeTeste();
  const item = await criarItemDeTeste();
  const loot = await adminAdventureService.createAdminMonsterLoot(
    { id_monstro: monstro.id, id_item: item.id, chance_ppm: 500000 },
    ADMIN_FAKE,
  );
  assert.equal(loot.quantidade_min, 1);
  assert.equal(loot.quantidade_max, 1);
});

testeComBanco("loot: create informando só quantidade_min acima do default de max (1) é rejeitado", async () => {
  const monstro = await criarMonstroDeTeste();
  const item = await criarItemDeTeste();
  await assert.rejects(
    () =>
      adminAdventureService.createAdminMonsterLoot(
        { id_monstro: monstro.id, id_item: item.id, chance_ppm: 500000, quantidade_min: 5 },
        ADMIN_FAKE,
      ),
    /quantidade mínima.*não pode ser maior/i,
  );
});

testeComBanco(
  "loot: PATCH parcial só com quantidade_min maior que o quantidade_max ATUAL é rejeitado",
  async () => {
    const monstro = await criarMonstroDeTeste();
    const item = await criarItemDeTeste();
    const loot = await adminAdventureService.createAdminMonsterLoot(
      { id_monstro: monstro.id, id_item: item.id, chance_ppm: 500000, quantidade_min: 1, quantidade_max: 3 },
      ADMIN_FAKE,
    );
    await assert.rejects(
      () => adminAdventureService.updateAdminMonsterLoot(loot.id, { quantidade_min: 10 }, ADMIN_FAKE),
      /quantidade mínima.*não pode ser maior/i,
    );
    const depois = await AdventureMonsterLoot.findByPk(loot.id);
    assert.equal(depois.quantidade_min, 1);
  },
);

// ------------------------------------------------------ MULTIPLICADORES

testeComBanco("multiplicadores: valores válidos são aceitos", async () => {
  const monstro = await adminAdventureService.createAdminMonster(
    {
      nome: `Monstro Teste ${sufixo()}`,
      multiplicador_vida: 1.5,
      multiplicador_dano: 1.2,
      multiplicador_agilidade: 0.9,
      multiplicador_velocidade: 1.1,
    },
    ADMIN_FAKE,
  );
  monstrosCriados.push(monstro.id);
  assert.equal(monstro.multiplicador_vida, 1.5);
});

testeComBanco("multiplicadores: valor negativo é rejeitado", async () => {
  await assert.rejects(
    () =>
      adminAdventureService.createAdminMonster(
        { nome: `Monstro Teste ${sufixo()}`, multiplicador_vida: -1 },
        ADMIN_FAKE,
      ),
    /multiplicador_vida.*válido/i,
  );
});

testeComBanco("multiplicadores: NaN é rejeitado", async () => {
  await assert.rejects(
    () =>
      adminAdventureService.createAdminMonster(
        { nome: `Monstro Teste ${sufixo()}`, multiplicador_dano: NaN },
        ADMIN_FAKE,
      ),
    /multiplicador_dano.*válido/i,
  );
});

testeComBanco("multiplicadores: Infinity é rejeitado", async () => {
  await assert.rejects(
    () =>
      adminAdventureService.createAdminMonster(
        { nome: `Monstro Teste ${sufixo()}`, multiplicador_agilidade: Infinity },
        ADMIN_FAKE,
      ),
    /multiplicador_agilidade.*válido/i,
  );
});

testeComBanco("multiplicadores: valor não numérico (string) é rejeitado", async () => {
  await assert.rejects(
    () =>
      adminAdventureService.createAdminMonster(
        { nome: `Monstro Teste ${sufixo()}`, multiplicador_velocidade: "abc" },
        ADMIN_FAKE,
      ),
    /multiplicador_velocidade.*válido/i,
  );
});

testeComBanco("multiplicadores: fora do limite técnico superior é rejeitado", async () => {
  await assert.rejects(
    () =>
      adminAdventureService.createAdminMonster(
        { nome: `Monstro Teste ${sufixo()}`, multiplicador_vida: MULTIPLICADOR_MAXIMO + 1000 },
        ADMIN_FAKE,
      ),
    /multiplicador_vida.*válido/i,
  );
});

testeComBanco("multiplicadores: PATCH com valor inválido é rejeitado sem persistir", async () => {
  const monstro = await criarMonstroDeTeste();
  await assert.rejects(
    () => adminAdventureService.updateAdminMonster(monstro.id, { multiplicador_dano: -5 }, ADMIN_FAKE),
    /multiplicador_dano.*válido/i,
  );
  const depois = await AdventureMonster.findByPk(monstro.id);
  assert.equal(depois.multiplicador_dano, 1);
});

testeComBanco("multiplicadores: PATCH tocando só outro campo não exige revalidar os que não vieram", async () => {
  const monstro = await criarMonstroDeTeste();
  const atualizado = await adminAdventureService.updateAdminMonster(monstro.id, { ativo: false }, ADMIN_FAKE);
  assert.equal(atualizado.ativo, false);
  assert.equal(atualizado.multiplicador_vida, 1);
});

testeComBanco("multiplicadores: limite mínimo técnico (MULTIPLICADOR_MINIMO) ainda é aceito", async () => {
  const monstro = await adminAdventureService.createAdminMonster(
    { nome: `Monstro Teste ${sufixo()}`, multiplicador_vida: MULTIPLICADOR_MINIMO },
    ADMIN_FAKE,
  );
  monstrosCriados.push(monstro.id);
  assert.equal(monstro.multiplicador_vida, MULTIPLICADOR_MINIMO);
});
