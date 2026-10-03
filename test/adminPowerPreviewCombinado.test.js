// Habilidades V2.0 (item 9) — preview combinado (dano/cura/status-DoT/
// modificadores passivos) por nível 1-10 numa única resposta.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");
const Power = require("../src/models/Power");
const PowerStatusEffect = require("../src/models/PowerStatusEffect");
const PowerCombatEffect = require("../src/models/PowerCombatEffect");
const adminPowerService = require("../src/services/adminPowerService");

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
  if (powersCriados.length > 0) {
    await PowerStatusEffect.destroy({ where: { id_power: powersCriados } });
    await PowerCombatEffect.destroy({ where: { id_power: powersCriados } });
    await Power.destroy({ where: { id: powersCriados } });
  }
  await sequelize.close();
});

testeComBanco("previewCombinadoPorNivel: 10 níveis, dano escala, status não escala, modificador passivo escala quando configurado", async () => {
  const power = await Power.create({
    nome: `Combinada ${sufixo()}`,
    descricao: "Preview combinado.",
    tipo_poder: "Ativo",
    custo_mana: 10,
    escala_atributo: "Forca",
    valor_escala: 1,
    tipo_dano: "Fisico",
    dano_base: 20,
  });
  powersCriados.push(power.id);

  await PowerStatusEffect.create({
    id_power: power.id,
    status_key: "BURN",
    chance_ppm: 500000,
    duration_turns: 2,
    potency_base: 10,
    target: "Enemy",
    ativo: true,
  });

  await PowerCombatEffect.create({
    id_power: power.id,
    trigger: "PASSIVE",
    effect_key: "CRIT_CHANCE_PCT",
    magnitude_base: 2,
    scale_with_ability_level: true,
    chance_ppm: 1_000_000,
    ativo: true,
  });

  const preview = await adminPowerService.previewCombinadoPorNivel(power.id, 100);
  assert.equal(preview.niveis.length, 10);

  const nivel1 = preview.niveis[0];
  const nivel10 = preview.niveis[9];
  assert.ok(nivel10.dano > nivel1.dano, "dano cresce com o nível");
  assert.equal(nivel1.status[0].status_key, "BURN");
  assert.equal(nivel1.status[0].potencia_estimada, nivel10.status[0].potencia_estimada, "status/DoT não escala por nível hoje");
  assert.ok(
    nivel10.modificadores_passivos[0].magnitude_no_nivel > nivel1.modificadores_passivos[0].magnitude_no_nivel,
    "modificador passivo com scale_with_ability_level cresce com o nível",
  );
});
