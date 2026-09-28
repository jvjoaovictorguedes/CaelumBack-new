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

test("Poder carrega a versão da fórmula (§9, v2 desde a Especificação Admin Aventura+Defesa/Poder de Monstros)", () => {
  const resultado = combatPowerService.calcularPoderPersonagemDeSnapshot(snapshotBase());
  assert.equal(resultado.version, 2);
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
  const fraco = combatPowerService.calcularPoderMonstro({ dano_min: 5, dano_max: 5, vida_maxima: 50 });
  const forte = combatPowerService.calcularPoderMonstro({ dano_min: 50, dano_max: 50, vida_maxima: 500 });
  assert.ok(forte.combatPower > fraco.combatPower);
  assert.equal(fraco.version, 2);
});

test("calcularPoderMonstro: defesa=0 reproduz EHP=vida_maxima (§12.2)", () => {
  const resultado = combatPowerService.calcularPoderMonstro({ dano_min: 10, dano_max: 10, vida_maxima: 100, defesa: 0 });
  assert.equal(resultado.ehp, 100);
  assert.equal(resultado.mitigacao, 0);
});

test("calcularPoderMonstro: aumentar defesa aumenta EHP/Poder (§12.2)", () => {
  const semDefesa = combatPowerService.calcularPoderMonstro({ dano_min: 10, dano_max: 10, vida_maxima: 100, defesa: 0 });
  const comDefesa = combatPowerService.calcularPoderMonstro({ dano_min: 10, dano_max: 10, vida_maxima: 100, defesa: 50 });
  assert.ok(comDefesa.ehp > semDefesa.ehp);
  assert.ok(comDefesa.combatPower > semDefesa.combatPower);
});

test("calcularPoderMonstro: aumentar dano_min/dano_max aumenta Poder (§12.2)", () => {
  const danoBaixo = combatPowerService.calcularPoderMonstro({ dano_min: 5, dano_max: 5, vida_maxima: 100, defesa: 0 });
  const danoAlto = combatPowerService.calcularPoderMonstro({ dano_min: 20, dano_max: 20, vida_maxima: 100, defesa: 0 });
  assert.ok(danoAlto.combatPower > danoBaixo.combatPower);
});

test("calcularPoderMonstro: aceita dano_base legado (encontro antigo/hunterRewardService) sem quebrar (§6.6)", () => {
  const resultado = combatPowerService.calcularPoderMonstro({ dano_base: 20, vida_maxima: 100 });
  assert.equal(resultado.danoMedio, 20);
  assert.ok(resultado.combatPower > 0);
});

test("calcularPoderMonstro: defesa ausente (encontro antigo persistido) vira 0 — mesmo resultado de antes da Defesa existir (§11.1)", () => {
  const semCampo = combatPowerService.calcularPoderMonstro({ dano_min: 10, dano_max: 10, vida_maxima: 100 });
  const comZero = combatPowerService.calcularPoderMonstro({ dano_min: 10, dano_max: 10, vida_maxima: 100, defesa: 0 });
  assert.equal(semCampo.combatPower, comZero.combatPower);
});

test("calcularPoderPersonagem(characterId) monta o snapshot efetivo e devolve um Poder válido", async (t) => {
  if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
  const { personagem } = await criarPersonagem({ nivel: 15 });
  const resultado = await combatPowerService.calcularPoderPersonagem(personagem.id);
  assert.ok(resultado);
  assert.equal(resultado.version, 2);
  assert.ok(resultado.combatPower > 0);
  assert.ok(Number.isFinite(resultado.combatPower));
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
