// Rebalanceamento de Powers §31 — powerCatalogAuditService é read-only e
// reaproveitável; aqui testamos cada invariante isoladamente, sempre
// filtrando os findings pelos ids das Powers criadas NESTE teste (nunca
// pelo catálogo inteiro do banco compartilhado, que outros testes/
// migrations também povoam e que não é o alvo desta suíte).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Power = require("../src/models/Power");
const PowerStatusEffect = require("../src/models/PowerStatusEffect");
const PowerCombatEffect = require("../src/models/PowerCombatEffect");
const { DamageAffinityType } = require("../src/models/combatTypingModels");
const { auditarCatalogoDePowers, gravesFalham } = require("../src/services/powerCatalogAuditService");

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

const powersCriados = [];
test.after(async () => {
  if (!temBanco) return;
  if (powersCriados.length > 0) await Power.destroy({ where: { id: powersCriados } });
  await sequelize.close();
});

async function pegarAfinidadeQualquer() {
  const afinidade = await DamageAffinityType.findOne({ order: [["id", "ASC"]] });
  if (!afinidade) throw new Error("damage_affinity_types vazio — rode as migrations antes dos testes.");
  return afinidade;
}

// findings do catálogo INTEIRO (outros testes/migrations também povoam o
// banco compartilhado) filtrados só pra Power(s) deste teste.
async function auditarApenas(...ids) {
  const todos = await auditarCatalogoDePowers();
  return todos.filter((f) => ids.includes(f.power_id));
}

testeComBanco("catálogo coerente (Ativa CHARACTER com cooldown, status/combat effect válidos) não gera ERRO", async () => {
  const power = await Power.create({
    nome: `AuditCoerente_${sufixo()}`,
    descricao: "poder coerente",
    tipo_poder: "Ativo",
    usage_scope: "CHARACTER",
    // UNIQUE_FEAT tem origem própria (o claim da Proeza) — isento do
    // check de origem (§2), nunca o alvo deste teste de qualquer forma.
    acquisition_scope: "UNIQUE_FEAT",
    escala_atributo: "Forca",
    valor_escala: 0.5,
    dano_base: 10,
    cooldown: 2,
    tipo_dano: "Fisico",
  });
  powersCriados.push(power.id);
  await PowerStatusEffect.create({ id_power: power.id, status_key: "BURN", chance_ppm: 500000, duration_turns: 2, target: "Enemy" });
  await PowerCombatEffect.create({ id_power: power.id, effect_key: "REGEN_HP_FLAT", target: "SELF", trigger: "TURN_END", magnitude_base: 1 });

  const findings = await auditarApenas(power.id);
  assert.deepEqual(gravesFalham(findings), []);
});

testeComBanco("Ativa CHARACTER sem cooldown (dado legado, criada ignorando hooks) é ERRO", async () => {
  const power = await Power.create(
    { nome: `AuditSemCooldown_${sufixo()}`, descricao: "sem cooldown", tipo_poder: "Ativo", usage_scope: "CHARACTER", escala_atributo: "Forca", valor_escala: 0, cooldown: null },
    { hooks: false },
  );
  powersCriados.push(power.id);
  const findings = await auditarApenas(power.id);
  assert.ok(findings.some((f) => f.categoria === "ATIVA_SEM_COOLDOWN" && f.severidade === "ERRO"));
});

testeComBanco("Ativa MONSTER sem cooldown NÃO é ERRO (regra é exclusiva de CHARACTER/BOTH)", async () => {
  const power = await Power.create(
    { nome: `AuditMonstroSemCooldown_${sufixo()}`, descricao: "monstro", tipo_poder: "Ativo", usage_scope: "MONSTER", escala_atributo: "Forca", valor_escala: 0, cooldown: null },
    { hooks: false },
  );
  powersCriados.push(power.id);
  const findings = await auditarApenas(power.id);
  assert.ok(!findings.some((f) => f.categoria === "ATIVA_SEM_COOLDOWN"));
});

testeComBanco("Passiva com custo_mana != 0 é ERRO", async () => {
  const power = await Power.create(
    { nome: `AuditPassivaComMana_${sufixo()}`, descricao: "passiva com mana", tipo_poder: "Passivo", custo_mana: 5, cooldown: 0, escala_atributo: "Forca", valor_escala: 0 },
    { hooks: false },
  );
  powersCriados.push(power.id);
  const findings = await auditarApenas(power.id);
  assert.ok(findings.some((f) => f.categoria === "PASSIVA_COM_MANA" && f.severidade === "ERRO"));
});

testeComBanco("Passiva com cooldown != 0 é ERRO", async () => {
  const power = await Power.create(
    { nome: `AuditPassivaComCooldown_${sufixo()}`, descricao: "passiva com cooldown", tipo_poder: "Passivo", custo_mana: 0, cooldown: 3, escala_atributo: "Forca", valor_escala: 0 },
    { hooks: false },
  );
  powersCriados.push(power.id);
  const findings = await auditarApenas(power.id);
  assert.ok(findings.some((f) => f.categoria === "PASSIVA_COM_COOLDOWN" && f.severidade === "ERRO"));
});

testeComBanco("affinity_mode EXPLICIT sem affinity_id é ERRO", async () => {
  const power = await Power.create(
    { nome: `AuditExplicitSemAfinidade_${sufixo()}`, descricao: "explicit sem afinidade", tipo_poder: "Ativo", usage_scope: "CHARACTER", cooldown: 1, escala_atributo: "Inteligencia", valor_escala: 0.5, tipo_dano: "Magico", affinity_mode: "EXPLICIT", affinity_id: null },
    { hooks: false },
  );
  powersCriados.push(power.id);
  const findings = await auditarApenas(power.id);
  assert.ok(findings.some((f) => f.categoria === "EXPLICIT_SEM_AFFINITY_ID" && f.severidade === "ERRO"));
});

testeComBanco("tipo_dano Verdadeiro com affinity_id ofensivo é ERRO + ALERTA de Verdadeiro não aprovado", async () => {
  const afinidade = await pegarAfinidadeQualquer();
  const power = await Power.create(
    { nome: `AuditVerdadeiroComAfinidade_${sufixo()}`, descricao: "verdadeiro com afinidade", tipo_poder: "Ativo", usage_scope: "CHARACTER", cooldown: 1, escala_atributo: "Forca", valor_escala: 0.5, dano_base: 10, tipo_dano: "Verdadeiro", affinity_id: afinidade.id },
    { hooks: false },
  );
  powersCriados.push(power.id);
  const findings = await auditarApenas(power.id);
  assert.ok(findings.some((f) => f.categoria === "TIPO_DANO_COM_AFINIDADE_OFENSIVA" && f.severidade === "ERRO"));
  assert.ok(findings.some((f) => f.categoria === "VERDADEIRO_NAO_APROVADO" && f.severidade === "ALERTA"));
});

testeComBanco("added_damage_pct > 0 sem added_affinity_id é ERRO", async () => {
  const power = await Power.create(
    { nome: `AuditAddedPctSemAfinidade_${sufixo()}`, descricao: "added pct sem afinidade", tipo_poder: "Ativo", usage_scope: "CHARACTER", cooldown: 1, escala_atributo: "Forca", valor_escala: 0.5, dano_base: 10, tipo_dano: "Fisico", added_damage_pct: 25, added_affinity_id: null },
    { hooks: false },
  );
  powersCriados.push(power.id);
  const findings = await auditarApenas(power.id);
  assert.ok(findings.some((f) => f.categoria === "ADDED_DAMAGE_PCT_SEM_AFFINITY" && f.severidade === "ERRO"));
});

testeComBanco("cura pura (sem dano) com afinidade ofensiva setada é ERRO", async () => {
  const afinidade = await pegarAfinidadeQualquer();
  const power = await Power.create(
    { nome: `AuditCuraComAfinidade_${sufixo()}`, descricao: "cura com afinidade", tipo_poder: "Ativo", usage_scope: "CHARACTER", cooldown: 2, escala_atributo: "Inteligencia", valor_escala: 0.5, dano_base: 0, cura_base: 50, affinity_id: afinidade.id },
    { hooks: false },
  );
  powersCriados.push(power.id);
  const findings = await auditarApenas(power.id);
  assert.ok(findings.some((f) => f.categoria === "CURA_COM_AFINIDADE_OFENSIVA" && f.severidade === "ERRO"));
});

testeComBanco("PowerStatusEffect com status_key inválida é ERRO", async () => {
  const power = await Power.create({
    nome: `AuditStatusInvalido_${sufixo()}`,
    descricao: "status inválido",
    tipo_poder: "Ativo",
    usage_scope: "CHARACTER",
    cooldown: 1,
    escala_atributo: "Forca",
    valor_escala: 0.5,
  });
  powersCriados.push(power.id);
  await PowerStatusEffect.create(
    { id_power: power.id, status_key: "CHAVE_INEXISTENTE", chance_ppm: 500000, duration_turns: 1, target: "Enemy" },
    { validate: false },
  );
  const findings = await auditarApenas(power.id);
  assert.ok(findings.some((f) => f.categoria === "STATUS_KEY_INVALIDA" && f.severidade === "ERRO"));
});

testeComBanco("PowerCombatEffect ON_CAST em SELF gera ALERTA (não ERRO) de possível efeito intrínseco", async () => {
  const power = await Power.create({
    nome: `AuditOnCastSelf_${sufixo()}`,
    descricao: "on cast self",
    tipo_poder: "Ativo",
    usage_scope: "CHARACTER",
    acquisition_scope: "UNIQUE_FEAT",
    cooldown: 2,
    escala_atributo: "Forca",
    valor_escala: 0.5,
  });
  powersCriados.push(power.id);
  await PowerCombatEffect.create({ id_power: power.id, effect_key: "DAMAGE_DEALT_PCT", target: "SELF", trigger: "ON_CAST", magnitude_base: 10 });

  const findings = await auditarApenas(power.id);
  assert.ok(findings.some((f) => f.categoria === "POSSIVEL_EFEITO_INTRINSECO_EM_ON_CAST_OU_ON_HIT" && f.severidade === "ALERTA"));
  assert.ok(!gravesFalham(findings).some((f) => f.power_id === power.id));
});
