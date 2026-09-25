// Sistema de Proezas Únicas — testes de integração (precisam de um
// Postgres migrado em TEST_DATABASE_URL/DATABASE_URL). Sem banco, o
// arquivo inteiro é pulado (mesmo padrão de rankedIntegracao.test.js).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const uniqueFeatService = require("../src/services/uniqueFeatService");
const triggerRegistry = require("../src/services/uniqueFeatTriggerRegistry");
const UniqueFeat = require("../src/models/UniqueFeat");
const UniqueFeatClaim = require("../src/models/UniqueFeatClaim");
const CharacterAbilities = require("../src/models/CharacterAbilities");
const Power = require("../src/models/Power");

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

// zoneId único por chamada — os testes de integração compartilham o
// mesmo Postgres (sem reset entre arquivos/execuções), então um valor
// fixo como "zoneId: 4" repetido em dois testes faria o segundo `check`
// enxergar a Proeza do primeiro teste também como "condição cumprida"
// (ambas ainda ativas e sem claim), quebrando a contagem esperada de
// conquistas por chamada.
let contadorZona = 0;
function zonaUnica() {
  contadorZona += 1;
  return Date.now() * 1000 + contadorZona;
}

async function criarPowerUnico() {
  return Power.create({
    nome: `Legado de teste ${sufixo()}`,
    descricao: "Power de teste pra Proeza Única.",
    tipo_poder: "Ativo",
    custo_mana: 10,
    escala_atributo: "Forca",
    valor_escala: 1,
    acquisition_scope: "UNIQUE_FEAT",
  });
}

async function criarFeat({ triggerKey = "ADVENTURE_VICTORY", triggerConfig = {}, ativa = true } = {}) {
  const power = await criarPowerUnico();
  return UniqueFeat.create({
    key: `teste_${sufixo()}`,
    nome: "Proeza de teste",
    descricao_publica: "Lore pública de teste.",
    descricao_secreta_admin: "Condição secreta de teste.",
    trigger_key: triggerKey,
    trigger_config: triggerConfig,
    id_power_reward: power.id,
    ativa,
  });
}

// -------------------- uniqueFeatTriggerRegistry --------------------

test("validarTriggerConfig aceita config válida (literal, min/max, in)", () => {
  assert.doesNotThrow(() => triggerRegistry.validarTriggerConfig("FISH_CAUGHT", { speciesId: 7, peso: { min: 40 } }));
  assert.doesNotThrow(() => triggerRegistry.validarTriggerConfig("FORGE_CRAFT_COMPLETED", { raridade: { in: ["Lendario", "Mitico"] } }));
  assert.doesNotThrow(() => triggerRegistry.validarTriggerConfig("ADVENTURE_VICTORY", { itemIds: { contains: 42 } }));
});

test("validarTriggerConfig rejeita trigger_key desconhecido", () => {
  assert.throws(() => triggerRegistry.validarTriggerConfig("CUSTOM_JS", {}));
});

test("validarTriggerConfig rejeita campo fora do schema do trigger", () => {
  assert.throws(() => triggerRegistry.validarTriggerConfig("FISH_CAUGHT", { campoInventado: 1 }));
});

test("validarTriggerConfig rejeita tipo errado", () => {
  assert.throws(() => triggerRegistry.validarTriggerConfig("FISH_CAUGHT", { speciesId: "nao-e-numero" }));
  assert.throws(() => triggerRegistry.validarTriggerConfig("FISH_CAUGHT", { peso: { min: "quarenta" } }));
});

test("avaliar: literal, min/max e in batem exatamente como esperado", () => {
  assert.equal(triggerRegistry.avaliar("FISH_CAUGHT", { speciesId: 7 }, { speciesId: 7 }), true);
  assert.equal(triggerRegistry.avaliar("FISH_CAUGHT", { speciesId: 7 }, { speciesId: 8 }), false);
  assert.equal(triggerRegistry.avaliar("FISH_CAUGHT", { peso: { min: 40 } }, { peso: 41 }), true);
  assert.equal(triggerRegistry.avaliar("FISH_CAUGHT", { peso: { min: 40 } }, { peso: 39 }), false);
  assert.equal(
    triggerRegistry.avaliar("FORGE_CRAFT_COMPLETED", { raridade: { in: ["Lendario"] } }, { raridade: "Lendario" }),
    true,
  );
  assert.equal(
    triggerRegistry.avaliar("FORGE_CRAFT_COMPLETED", { raridade: { in: ["Lendario"] } }, { raridade: "Comum" }),
    false,
  );
});

test("avaliar: campo ausente no context nunca casa por omissão", () => {
  assert.equal(triggerRegistry.avaliar("FISH_CAUGHT", { speciesId: 7 }, {}), false);
});

test("avaliar: config vazia bate com qualquer context (Proeza 'primeiro a fazer X')", () => {
  assert.equal(triggerRegistry.avaliar("ADVENTURE_VICTORY", {}, { zoneId: 1 }), true);
});

test("avaliar: array contains/containsAll", () => {
  assert.equal(triggerRegistry.avaliar("ADVENTURE_VICTORY", { itemIds: { contains: 5 } }, { itemIds: [1, 5, 9] }), true);
  assert.equal(triggerRegistry.avaliar("ADVENTURE_VICTORY", { itemIds: { contains: 5 } }, { itemIds: [1, 9] }), false);
  assert.equal(
    triggerRegistry.avaliar("ADVENTURE_VICTORY", { itemIds: { containsAll: [1, 9] } }, { itemIds: [1, 9, 20] }),
    true,
  );
  assert.equal(
    triggerRegistry.avaliar("ADVENTURE_VICTORY", { itemIds: { containsAll: [1, 9] } }, { itemIds: [1] }),
    false,
  );
});

// -------------------- uniqueFeatService --------------------

testeComBanco("check() exige transaction e characterId", async (t) => {
  await assert.rejects(() => uniqueFeatService.check("ADVENTURE_VICTORY", {}, { characterId: 1 }));
  await sequelize.transaction(async (transaction) => {
    await assert.rejects(() => uniqueFeatService.check("ADVENTURE_VICTORY", {}, { transaction }));
  });
});

testeComBanco("condição não cumprida nunca gera claim", async () => {
  const zona = zonaUnica();
  const feat = await criarFeat({ triggerConfig: { zoneId: zona } });
  const { personagem } = await criarPersonagem();

  const conquistadas = await sequelize.transaction((transaction) =>
    uniqueFeatService.check("ADVENTURE_VICTORY", { zoneId: zona + 1 }, { transaction, characterId: personagem.id }),
  );

  assert.equal(conquistadas.length, 0);
  const claim = await UniqueFeatClaim.findOne({ where: { id_unique_feat: feat.id } });
  assert.equal(claim, null);
});

testeComBanco("condição cumprida concede claim + CharacterAbilities nível 1 inativo", async () => {
  const zona = zonaUnica();
  const feat = await criarFeat({ triggerConfig: { zoneId: zona } });
  const { personagem } = await criarPersonagem({ nivel: 12 });

  const conquistadas = await sequelize.transaction((transaction) =>
    uniqueFeatService.check("ADVENTURE_VICTORY", { zoneId: zona }, { transaction, characterId: personagem.id }),
  );

  assert.equal(conquistadas.length, 1);
  assert.equal(conquistadas[0].feat.id, feat.id);

  const claim = await UniqueFeatClaim.findOne({ where: { id_unique_feat: feat.id } });
  assert.ok(claim);
  assert.equal(claim.id_personagem, personagem.id);
  assert.equal(claim.status, "VALID");

  const ability = await CharacterAbilities.findOne({
    where: { id_personagem: personagem.id, id_power: feat.id_power_reward },
  });
  assert.ok(ability);
  assert.equal(ability.is_active, false);
  assert.equal(ability.nivel_habilidade, 1);
  assert.equal(ability.level_learned, 12);
});

testeComBanco("Proeza inativa nunca é avaliada mesmo com condição cumprida", async () => {
  const zona = zonaUnica();
  await criarFeat({ triggerConfig: { zoneId: zona }, ativa: false });
  const { personagem } = await criarPersonagem();

  const conquistadas = await sequelize.transaction((transaction) =>
    uniqueFeatService.check("ADVENTURE_VICTORY", { zoneId: zona }, { transaction, characterId: personagem.id }),
  );
  assert.equal(conquistadas.length, 0);
});

testeComBanco("dois personagens no mesmo instante — exatamente 1 vencedor global (§8)", async () => {
  const zona = zonaUnica();
  const feat = await criarFeat({ triggerConfig: { zoneId: zona } });
  const { personagem: p1 } = await criarPersonagem();
  const { personagem: p2 } = await criarPersonagem();

  const tentar = (personagem) =>
    sequelize.transaction((transaction) =>
      uniqueFeatService.check("ADVENTURE_VICTORY", { zoneId: zona }, { transaction, characterId: personagem.id }),
    );

  const [r1, r2] = await Promise.all([tentar(p1), tentar(p2)]);
  const vencedores = [r1, r2].filter((r) => r.length > 0);
  assert.equal(vencedores.length, 1, "exatamente um dos dois personagens venceu a Proeza");

  const claims = await UniqueFeatClaim.findAll({ where: { id_unique_feat: feat.id } });
  assert.equal(claims.length, 1, "só existe UM claim pra essa Proeza mesmo sob concorrência");

  const abilities = await CharacterAbilities.findAll({ where: { id_power: feat.id_power_reward } });
  assert.equal(abilities.length, 1, "só o vencedor recebeu o CharacterAbilities do Legado");
});

testeComBanco("retry/evento repetido nunca concede duas vezes (idempotência por claim único)", async () => {
  const zona = zonaUnica();
  const feat = await criarFeat({ triggerConfig: { zoneId: zona } });
  const { personagem } = await criarPersonagem();

  const primeiro = await sequelize.transaction((transaction) =>
    uniqueFeatService.check("ADVENTURE_VICTORY", { zoneId: zona }, { transaction, characterId: personagem.id }),
  );
  assert.equal(primeiro.length, 1);

  const segundo = await sequelize.transaction((transaction) =>
    uniqueFeatService.check("ADVENTURE_VICTORY", { zoneId: zona }, { transaction, characterId: personagem.id }),
  );
  assert.equal(segundo.length, 0, "a mesma Proeza já tem dono — segunda chamada não conquista de novo");

  const claims = await UniqueFeatClaim.findAll({ where: { id_unique_feat: feat.id } });
  assert.equal(claims.length, 1);
});

testeComBanco("CharacterAbilities já existente (corrupção) falha de verdade, não vira NOT_CLAIMED silencioso (§8)", async () => {
  const zona = zonaUnica();
  const feat = await criarFeat({ triggerConfig: { zoneId: zona } });
  const { personagem } = await criarPersonagem();

  // Simula um grant manual/corrompido anterior — a MESMA linha que
  // tryClaimAtomic tentaria criar.
  await CharacterAbilities.create({
    id_personagem: personagem.id,
    id_power: feat.id_power_reward,
    level_learned: personagem.nivel,
    is_active: false,
    nivel_habilidade: 1,
  });

  await assert.rejects(
    () =>
      sequelize.transaction((transaction) =>
        uniqueFeatService.check("ADVENTURE_VICTORY", { zoneId: zona }, { transaction, characterId: personagem.id }),
      ),
    /SequelizeUniqueConstraintError|unique/i,
  );

  // A transaction falhou inteira — nenhum claim órfão ficou gravado.
  const claim = await UniqueFeatClaim.findOne({ where: { id_unique_feat: feat.id } });
  assert.equal(claim, null, "claim não pode ficar órfão quando a concessão do Power falha");
});
