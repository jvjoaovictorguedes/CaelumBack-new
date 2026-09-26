// Admin Aventura — Editor de Balanceamento de Monstros por Resultado
// (§14.1 "Testes unitários"). Tudo aqui é puro/determinístico — não
// precisa de banco, então roda sempre (nunca pulado).
const test = require("node:test");
const assert = require("node:assert/strict");

const combatController = require("../src/controllers/combatController");
const combatFormulas = require("../src/services/combatFormulas");
const monsterBalancePreviewService = require("../src/services/monsterBalancePreviewService");
const {
  PRESETS_MONSTRO,
  MULTIPLICADOR_MINIMO,
  MULTIPLICADOR_MAXIMO,
  ESQUIVA_MINIMA_PCT,
  ESQUIVA_MAXIMA_PCT,
  classificarDificuldade,
  multiplicadorValido,
} = require("../src/config/monsterBalanceConfig");

// -------------------------------------------------------------- §14.1.1
// "Base determinística por nível bate com o valor médio esperado de
// gerarInimigo sem variação." — mocka Math.random pra travar a
// variação ±10% real em EXATAMENTE 1 (0.9 + 0.5*0.2 = 1.0) e compara
// com a função determinística chamada com variacao=()=>1.
test("statsFinaisDoMonstroPorNivel(variacao=1) bate com gerarInimigo com Math.random travado em 0.5", () => {
  const randomOriginal = Math.random;
  try {
    Math.random = () => 0.5;
    for (const nivel of [1, 5, 20, 47]) {
      const mult = { vida: 1.3, dano: 0.8, agilidade: 1.1, velocidade: 0.9 };
      const inimigo = combatController.gerarInimigo({ nivel }, "Teste", { nivelForcado: nivel, multiplicadores: mult });
      const determinístico = combatController.statsFinaisDoMonstroPorNivel(nivel, mult, () => 1);

      assert.equal(inimigo.vida_maxima, determinístico.vidaMaxima, `nível ${nivel} vida`);
      assert.equal(inimigo.dano_base, determinístico.danoBase, `nível ${nivel} dano`);
      assert.equal(inimigo.agilidade, determinístico.agilidade, `nível ${nivel} agilidade`);
      assert.equal(inimigo.velocidade, determinístico.velocidade, `nível ${nivel} velocidade`);
    }
  } finally {
    Math.random = randomOriginal;
  }
});

// Regressão estatística real (com RNG de verdade): a MÉDIA de muitas
// chamadas de gerarInimigo deve convergir pro valor determinístico —
// prova que a extração da fórmula não mudou a distribuição do jogo.
test("média de 500 gerarInimigo() reais converge pro valor determinístico (±10% de tolerância)", () => {
  const nivel = 20;
  const mult = { vida: 1, dano: 1, agilidade: 1, velocidade: 1 };
  const amostras = 500;
  let somaVida = 0;
  let somaDano = 0;

  for (let i = 0; i < amostras; i += 1) {
    const inimigo = combatController.gerarInimigo({ nivel }, "Teste", { nivelForcado: nivel, multiplicadores: mult });
    somaVida += inimigo.vida_maxima;
    somaDano += inimigo.dano_base;
  }

  const determinístico = combatController.statsFinaisDoMonstroPorNivel(nivel, mult, () => 1);
  const mediaVida = somaVida / amostras;
  const mediaDano = somaDano / amostras;

  assert.ok(
    Math.abs(mediaVida - determinístico.vidaMaxima) / determinístico.vidaMaxima < 0.1,
    `média de vida (${mediaVida}) longe do determinístico (${determinístico.vidaMaxima})`,
  );
  assert.ok(
    Math.abs(mediaDano - determinístico.danoBase) / determinístico.danoBase < 0.1,
    `média de dano (${mediaDano}) longe do determinístico (${determinístico.danoBase})`,
  );
});

// -------------------------------------------------------------- §14.1.3
test("probabilidadeDeEsquiva respeita piso de 5% e teto de 35%", () => {
  assert.equal(combatFormulas.probabilidadeDeEsquiva({ agilidade: 1 }, { agilidade: 50 }), 0.05);
  assert.equal(combatFormulas.probabilidadeDeEsquiva({ agilidade: 10 }, { agilidade: 10 }), 0.05);
  assert.equal(combatFormulas.probabilidadeDeEsquiva({ agilidade: 1000 }, { agilidade: 1 }), 0.35);
});

// -------------------------------------------------------------- §14.1.4
test("faixa ±10% (min/média/máx) nunca gera valor inválido/negativo em nenhum nível 1-100", () => {
  for (let nivel = 1; nivel <= 100; nivel += 7) {
    const stats = monsterBalancePreviewService.statsFinaisComFaixa(nivel, { vida: 1, dano: 1, agilidade: 1, velocidade: 1 });
    for (const chave of ["vida", "dano", "agilidade", "velocidade"]) {
      assert.ok(Number.isFinite(stats[chave].min) && stats[chave].min > 0, `${chave}.min inválido no nível ${nivel}`);
      assert.ok(Number.isFinite(stats[chave].media) && stats[chave].media > 0, `${chave}.media inválido no nível ${nivel}`);
      assert.ok(Number.isFinite(stats[chave].max) && stats[chave].max > 0, `${chave}.max inválido no nível ${nivel}`);
      assert.ok(stats[chave].min <= stats[chave].media && stats[chave].media <= stats[chave].max, `${chave} fora de ordem no nível ${nivel}`);
    }
  }
});

// -------------------------------------------------------------- §14.1.2
// "Conversão target -> multiplier -> preview retorna aproximadamente o
// target, respeitando arredondamento."
test("converterDesejadoParaMultiplicadores: ida e volta aproxima o valor desejado", () => {
  const nivel = 20;
  const desired = { hpMean: 450, damageMean: 50, dodgeVsAveragePct: 12, speedMean: 19 };
  const { multiplicadores, avisos } = monsterBalancePreviewService.converterDesejadoParaMultiplicadores(nivel, desired);

  assert.equal(avisos.length, 0, "esquiva dentro dos limites não devia gerar aviso");

  const statsResultantes = monsterBalancePreviewService.statsFinaisComFaixa(nivel, multiplicadores);
  assert.ok(Math.abs(statsResultantes.vida.media - desired.hpMean) <= 1, `vida ${statsResultantes.vida.media} longe de ${desired.hpMean}`);
  assert.ok(Math.abs(statsResultantes.dano.media - desired.damageMean) <= 1, `dano ${statsResultantes.dano.media} longe de ${desired.damageMean}`);
  assert.ok(Math.abs(statsResultantes.velocidade.media - desired.speedMean) <= 1, `velocidade ${statsResultantes.velocidade.media} longe de ${desired.speedMean}`);

  const esquivaResultante = monsterBalancePreviewService.esquivaContraPerfis(nivel, statsResultantes.agilidade.media);
  assert.ok(Math.abs(esquivaResultante.MEDIO - desired.dodgeVsAveragePct) <= 1.5, `esquiva vs médio ${esquivaResultante.MEDIO} longe de ${desired.dodgeVsAveragePct}`);
});

test("converterDesejadoParaMultiplicadores: esquiva fora dos limites reais é ajustada e avisada, nunca lança silenciosamente", () => {
  const nivel = 20;
  const abaixo = monsterBalancePreviewService.converterDesejadoParaMultiplicadores(nivel, {
    hpMean: 300,
    damageMean: 30,
    dodgeVsAveragePct: 0,
    speedMean: 15,
  });
  assert.ok(abaixo.avisos.some((a) => a.includes(String(ESQUIVA_MINIMA_PCT))));

  const acima = monsterBalancePreviewService.converterDesejadoParaMultiplicadores(nivel, {
    hpMean: 300,
    damageMean: 30,
    dodgeVsAveragePct: 90,
    speedMean: 15,
  });
  assert.ok(acima.avisos.some((a) => a.includes(String(ESQUIVA_MAXIMA_PCT))));
});

test("converterDesejadoParaMultiplicadores: valor desejado inválido (<=0/NaN) lança erro claro, nunca NaN/Infinity silencioso", () => {
  assert.throws(() => monsterBalancePreviewService.converterDesejadoParaMultiplicadores(20, { hpMean: 0, damageMean: 30, dodgeVsAveragePct: 10, speedMean: 15 }));
  assert.throws(() => monsterBalancePreviewService.converterDesejadoParaMultiplicadores(20, { hpMean: 300, damageMean: -5, dodgeVsAveragePct: 10, speedMean: 15 }));
  assert.throws(() => monsterBalancePreviewService.converterDesejadoParaMultiplicadores(20, { hpMean: 300, damageMean: 30, dodgeVsAveragePct: 10, speedMean: NaN }));
});

// -------------------------------------------------------------- §14.1.5
test("presets produzem multiplicadores válidos dentro dos limites técnicos e não guardam vínculo dinâmico", () => {
  for (const [chave, preset] of Object.entries(PRESETS_MONSTRO)) {
    for (const [campo, valor] of Object.entries(preset.multiplicadores)) {
      assert.ok(multiplicadorValido(valor), `preset ${chave}.${campo} = ${valor} fora dos limites técnicos`);
    }
    // "Não persistir uma dependência dinâmica do preset" — a config só
    // guarda NÚMEROS concretos, nunca uma referência/função/chave viva
    // que precisaria ser resolvida de novo no futuro.
    assert.equal(typeof preset.label, "string");
    for (const valor of Object.values(preset.multiplicadores)) {
      assert.equal(typeof valor, "number");
    }
  }
});

test("limites de multiplicador rejeitam Infinity/NaN/overflow", () => {
  assert.equal(multiplicadorValido(Infinity), false);
  assert.equal(multiplicadorValido(NaN), false);
  assert.equal(multiplicadorValido(-1), false);
  assert.equal(multiplicadorValido(0), false);
  assert.equal(multiplicadorValido(MULTIPLICADOR_MAXIMO + 1000), false);
  assert.equal(multiplicadorValido(1), true);
  assert.equal(multiplicadorValido(MULTIPLICADOR_MINIMO), true);
  assert.equal(multiplicadorValido(MULTIPLICADOR_MAXIMO), true);
});

// -------------------------------------------------------------- §7.3
test("classificarDificuldade respeita as faixas da especificação", () => {
  assert.equal(classificarDificuldade(0.99).chave, "TRIVIAL");
  assert.equal(classificarDificuldade(0.98).chave, "FACIL"); // > 98% estrito — exatamente 98% cai em Fácil
  assert.equal(classificarDificuldade(0.95).chave, "FACIL");
  assert.equal(classificarDificuldade(0.8).chave, "NORMAL");
  assert.equal(classificarDificuldade(0.5).chave, "DIFICIL");
  assert.equal(classificarDificuldade(0.3).chave, "MUITO_DIFICIL");
  assert.equal(classificarDificuldade(0.05).chave, "EXTREMO");
});

// -------------------------------------------------------------- §4.4/§9.2
test("perfis sintéticos nunca leem personagem real e são independentes entre chamadas", () => {
  const fraco1 = monsterBalancePreviewService.construirPerfilSintetico(20, "FRACO");
  const fraco2 = monsterBalancePreviewService.construirPerfilSintetico(20, "FRACO");
  assert.deepEqual(fraco1, fraco2, "mesmo nível/perfil devia sempre gerar o mesmo perfil sintético (determinístico)");

  const forte = monsterBalancePreviewService.construirPerfilSintetico(20, "FORTE");
  assert.ok(forte.agilidade >= fraco1.agilidade, "Forte devia ter atributos >= Fraco no mesmo nível");
  assert.ok(forte.defesa >= fraco1.defesa, "Forte devia ter defesa >= Fraco no mesmo nível");
});
