// Precisão (Velocidade do atacante) — pedido do jogador: "Velocidade
// também deve influenciar em precisão" (contrapondo a Agilidade de
// esquiva) "e a precisão também dá uma possibilidade de crítico". Testa
// só combatFormulas.js (puro, sem banco) — mesmo padrão de
// combatDificuldadePorNivel.test.js pra fórmula pura.
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  probabilidadeDeEsquiva,
  precisaoDe,
  probabilidadeDeCritico,
  calcularDanoBasico,
  calcularEfeitoPoder,
  calcularEfeitoPoderEsperado,
  MULTIPLICADOR_DANO_CRITICO,
} = require("../src/services/combatFormulas");

// `contexto` (usado por combatController/duelEngine/worldBossRuntimeService
// pra saber se ESTE golpe foi crítico e devolver a flag pro frontend) é um
// efeito colateral OPCIONAL — precisa bater com o multiplicador de fato
// aplicado no dano, e nunca quebrar quem chama sem passar nada.
test("calcularDanoBasico: contexto.critico reflete de verdade se o multiplicador foi aplicado", () => {
  const rapido = { forca: 10, velocidade: 9999 }; // 40% de chance, mas sempre determinável pelo contexto
  const AMOSTRAS = 300;
  let viuCritico = false;
  let viuNaoCritico = false;
  for (let i = 0; i < AMOSTRAS; i++) {
    const contexto = {};
    const dano = calcularDanoBasico(rapido, contexto);
    assert.equal(typeof contexto.critico, "boolean");
    if (contexto.critico) {
      viuCritico = true;
      // Sem arma, base = 4 + 10*0.9 = 13; variação 0.85-1.15; crítico
      // multiplica por 1.5 por cima disso. Sem crítico, o teto seria
      // round(13 * 1.15) = 15. Com crítico, o piso passa a ser bem
      // acima disso (round(13 * 0.85 * 1.5) ~= 17).
      assert.ok(dano >= 16, `dano crítico esperado bem acima do teto não-crítico (obtido ${dano})`);
    } else {
      viuNaoCritico = true;
    }
  }
  assert.ok(viuCritico, "esperava ver ao menos um crítico em 300 rolagens com 40% de chance");
  assert.ok(viuNaoCritico, "esperava ver ao menos um não-crítico em 300 rolagens com 40% de chance");
});

test("calcularDanoBasico: sem contexto continua funcionando exatamente como antes (retorna só o número)", () => {
  const atacante = { forca: 10, velocidade: 5 };
  const dano = calcularDanoBasico(atacante);
  assert.equal(typeof dano, "number");
});

test("calcularEfeitoPoder: contexto.critico nunca fica true pra poder sem dano_base (só cura)", () => {
  const powerCura = { dano_base: 0, cura_base: 50, valor_escala: 0, escala_atributo: "Vitalidade" };
  const rapido = { vitalidade: 0, velocidade: 9999 };
  for (let i = 0; i < 50; i++) {
    const contexto = {};
    calcularEfeitoPoder(powerCura, rapido, 1, contexto);
    assert.equal(contexto.critico, false);
  }
});

test("precisaoDe: escala linear com Velocidade, zero sem Velocidade", () => {
  assert.equal(precisaoDe({ velocidade: 0 }), 0);
  assert.equal(precisaoDe({}), 0);
  assert.equal(precisaoDe({ velocidade: 10 }), 5);
  assert.equal(precisaoDe({ velocidade: 20 }), 10);
});

test("probabilidadeDeEsquiva: Velocidade do atacante reduz a esquiva do defensor (Precisão contra Agilidade)", () => {
  const defensorAgil = { agilidade: 20 };
  const semVelocidade = probabilidadeDeEsquiva(defensorAgil, { agilidade: 0, velocidade: 0 });
  const comVelocidade = probabilidadeDeEsquiva(defensorAgil, { agilidade: 0, velocidade: 20 });
  assert.ok(comVelocidade < semVelocidade, "Velocidade do atacante devia reduzir a chance de esquiva do defensor");
  // Diferença 20 fica bem abaixo do teto de 35% dos dois lados (0.25 sem
  // Velocidade, 0.15 com 20 de Velocidade), então a queda é visível de
  // verdade e não é mascarada pelo teto.
  const defensorModerado = { agilidade: 15 };
  const semVelocidade2 = probabilidadeDeEsquiva(defensorModerado, { agilidade: 0, velocidade: 0 });
  const comVelocidade2 = probabilidadeDeEsquiva(defensorModerado, { agilidade: 0, velocidade: 10 });
  assert.equal(semVelocidade2, 0.05 + 15 * 0.01);
  assert.equal(comVelocidade2, 0.05 + (15 - 5) * 0.01, "10 de Velocidade (peso 0.5) deve valer 5 pontos de Agilidade equivalentes");
});

test("probabilidadeDeEsquiva: nunca fica negativa nem passa do teto de 35%, mesmo com Velocidade altíssima", () => {
  const chance = probabilidadeDeEsquiva({ agilidade: 0 }, { agilidade: 0, velocidade: 9999 });
  assert.ok(chance >= 0);
  assert.ok(chance <= 0.35);
  assert.equal(chance, 0.05, "sem diferença de Agilidade a favor do defensor, o piso continua 5%");
});

test("probabilidadeDeCritico: base 5% sem Velocidade, sobe com Velocidade, trava em 40%", () => {
  assert.equal(probabilidadeDeCritico({ velocidade: 0 }), 0.05);
  assert.equal(probabilidadeDeCritico({ velocidade: 10 }), 0.05 + 10 * 0.004);
  assert.equal(probabilidadeDeCritico({ velocidade: 9999 }), 0.4);
});

test("calcularDanoBasico: Velocidade alta produz dano médio maior que Velocidade zero (crítico entra na rolagem)", () => {
  const base = { forca: 20, velocidade: 0 };
  const rapido = { forca: 20, velocidade: 9999 }; // chance de crítico no teto (40%)

  const AMOSTRAS = 4000;
  let somaBase = 0;
  let somaRapido = 0;
  for (let i = 0; i < AMOSTRAS; i++) {
    somaBase += calcularDanoBasico(base);
    somaRapido += calcularDanoBasico(rapido);
  }
  const mediaBase = somaBase / AMOSTRAS;
  const mediaRapido = somaRapido / AMOSTRAS;

  // Só crítico (40% de chance, 1.5x) separa os dois — esperado ~1.20x
  // (0.6*1 + 0.4*1.5). Margem generosa (>1.05x) pra nunca ser flaky.
  assert.ok(mediaRapido > mediaBase * 1.05, `esperava dano médio maior com Velocidade alta (base=${mediaBase}, rápido=${mediaRapido})`);
});

test("calcularEfeitoPoder: crítico multiplica o DANO mas nunca a CURA", () => {
  const powerDano = { dano_base: 100, cura_base: 0, valor_escala: 0, escala_atributo: "Forca", tipo_dano: "Fisico" };
  const powerCura = { dano_base: 0, cura_base: 100, valor_escala: 0, escala_atributo: "Vitalidade" };
  const rapido = { forca: 0, vitalidade: 0, velocidade: 9999 };

  const AMOSTRAS = 3000;
  let somaDano = 0;
  let somaCura = 0;
  let maxCura = 0;
  for (let i = 0; i < AMOSTRAS; i++) {
    somaDano += calcularEfeitoPoder(powerDano, rapido).dano;
    const cura = calcularEfeitoPoder(powerCura, rapido).cura;
    somaCura += cura;
    maxCura = Math.max(maxCura, cura);
  }
  const mediaDano = somaDano / AMOSTRAS;
  // Sem crítico, variacao é 0.9-1.1 sobre dano_base=100 -> média ~100.
  // Com 40% de crítico (1.5x), a média sobe pra ~120.
  assert.ok(mediaDano > 108, `esperava dano crítico elevando a média bem acima de 100 (obtido ${mediaDano})`);
  // Cura, mesma variação (0.9-1.1) sobre cura_base=100 -> nunca passa de 110,
  // mesmo com Velocidade no teto — crítico NUNCA entra na cura.
  assert.ok(maxCura <= 110, `cura não pode ser amplificada por crítico (máximo observado ${maxCura})`);
});

test("calcularEfeitoPoderEsperado (Power Score): continua determinístico, nunca aplica crítico", () => {
  const power = { dano_base: 100, cura_base: 0, valor_escala: 0, escala_atributo: "Forca", tipo_dano: "Fisico" };
  const rapido = { forca: 0, velocidade: 9999 };
  const primeiro = calcularEfeitoPoderEsperado(power, rapido).dano;
  const segundo = calcularEfeitoPoderEsperado(power, rapido).dano;
  assert.equal(primeiro, segundo, "Power Score precisa ser 100% determinístico, mesmo com Velocidade no teto");
  assert.equal(primeiro, 100, "sem variação nem crítico, dano_base=100 sem escala deve voltar exatamente 100");
});
