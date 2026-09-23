// Poder de Combate — testes unitários (§78 da Especificação Consolidada
// Poder/Status/Cooldown/Balanceamento). A parte pura roda sem banco; a
// parte que envolve `calcularPoderPersonagem(characterId)` usa o mesmo
// helper de banco dos testes de PvP e se marca como skip sem Postgres.
const test = require("node:test");
const assert = require("node:assert/strict");

const combatPowerService = require("../src/services/combatPowerService");
const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
});

function snapshotBase(overrides = {}) {
  return {
    nivel: 10,
    forca: 20,
    vitalidade: 20,
    agilidade: 10,
    inteligencia: 20,
    velocidade: 10,
    defesa: 10,
    multiplicador_dano_fisico: 1,
    multiplicador_dano_magico: 1,
    habilidadesAtivas: [],
    ...overrides,
  };
}

test("mesmo snapshot gera sempre o mesmo Poder (determinístico, sem Math.random)", () => {
  const snapshot = snapshotBase();
  const resultados = new Set();
  for (let i = 0; i < 20; i += 1) {
    resultados.add(combatPowerService.calcularPoderPersonagemDeSnapshot(snapshot).combatPower);
  }
  assert.equal(resultados.size, 1, "20 cálculos do mesmo snapshot deviam bater exatamente igual");
});

test("Poder carrega a versão da fórmula (§9)", () => {
  const resultado = combatPowerService.calcularPoderPersonagemDeSnapshot(snapshotBase());
  assert.equal(resultado.version, 1);
});

test("aumentar stats reais nunca reduz o Poder sem trade-off (monotonicidade)", () => {
  const base = combatPowerService.calcularPoderPersonagemDeSnapshot(snapshotBase());
  const maisForca = combatPowerService.calcularPoderPersonagemDeSnapshot(snapshotBase({ forca: 40 }));
  const maisVitalidade = combatPowerService.calcularPoderPersonagemDeSnapshot(snapshotBase({ vitalidade: 40 }));
  const maisDefesa = combatPowerService.calcularPoderPersonagemDeSnapshot(snapshotBase({ defesa: 40 }));
  assert.ok(maisForca.combatPower >= base.combatPower);
  assert.ok(maisVitalidade.combatPower >= base.combatPower);
  assert.ok(maisDefesa.combatPower >= base.combatPower);
});

test("campos irrelevantes (ex.: um Tier cru no snapshot) não mudam o Poder — evita dupla contagem", () => {
  const semTier = combatPowerService.calcularPoderPersonagemDeSnapshot(snapshotBase());
  const comTierBruto = combatPowerService.calcularPoderPersonagemDeSnapshot(
    snapshotBase({ tier_equipamento: "I", raridade_bonus: 999 }),
  );
  assert.equal(semTier.combatPower, comTierBruto.combatPower, "só os atributos EFETIVOS entram na conta");
});

test("cooldown reduz o valor esperado de spam de uma habilidade forte", () => {
  const poderForte = { id: 1, dano_base: 500, valor_escala: 0, escala_atributo: "Inteligencia", custo_mana: 0, cooldown: 0 };
  const poderFraco = { id: 2, dano_base: 5, valor_escala: 0, escala_atributo: "Inteligencia", custo_mana: 0, cooldown: 0 };

  const semCooldown = combatPowerService.otimizarJanelaDeDano({
    personagem: snapshotBase(),
    habilidadesAtivas: [{ power: poderForte, nivelHabilidade: 1 }],
    horizonte: 4,
  });

  const comCooldownAlto = combatPowerService.otimizarJanelaDeDano({
    personagem: snapshotBase(),
    habilidadesAtivas: [{ power: { ...poderForte, cooldown: 3 }, nivelHabilidade: 1 }],
    horizonte: 4,
  });

  assert.ok(
    comCooldownAlto < semCooldown,
    "com cooldown alto, a janela de 4 ações não pode repetir a habilidade forte toda hora",
  );
});

test("Poder do monstro vem do snapshot real, não fixo — muda com nível/multiplicadores diferentes", () => {
  const fraco = combatPowerService.calcularPoderMonstro({ dano_base: 5, vida_maxima: 50 });
  const forte = combatPowerService.calcularPoderMonstro({ dano_base: 50, vida_maxima: 500 });
  assert.ok(forte.combatPower > fraco.combatPower);
  assert.equal(fraco.version, 1);
});

test("calcularPoderPersonagem(characterId) monta o snapshot efetivo e devolve um Poder válido", async (t) => {
  if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
  const { personagem } = await criarPersonagem({ nivel: 15 });
  const resultado = await combatPowerService.calcularPoderPersonagem(personagem.id);
  assert.ok(resultado);
  assert.equal(resultado.version, 1);
  assert.ok(resultado.combatPower > 0);
  assert.ok(Number.isFinite(resultado.combatPower));
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
