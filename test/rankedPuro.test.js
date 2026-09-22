// PvP v2 §3/§9/§13 — regras puras: soft reset, IA ranqueada e fórmula
// do ranking casual. Nenhum banco envolvido.
const test = require("node:test");
const assert = require("node:assert/strict");

const { softReset } = require("../src/services/rankedRatingService");
const rankedAiService = require("../src/services/rankedAiService");
const { IA_LIMIAR_CURA_PERCENTUAL } = require("../src/config/rankedConfig");

test("soft reset bate o exemplo da spec: 1800 / 60% / 20 jogos → 1670", () => {
  // Base = 1000 + 800*0,8 = 1640; AjusteBruto = clamp(0,1*300) = 30;
  // FatorAmostra = min(1, 20/10) = 1; AjusteFinal = 30 → 1670.
  assert.equal(softReset(1800, { jogos: 20, vitorias: 12 }), 1670);
});

test("soft reset sem jogos usa só a base (winrate 0 e amostra 0)", () => {
  assert.equal(softReset(1800, { jogos: 0, vitorias: 0 }), 1640);
  assert.equal(softReset(1000, { jogos: 0, vitorias: 0 }), 1000);
});

test("soft reset limita o ajuste a ±60 e escala por amostra", () => {
  // 100% de winrate em 100 jogos: ajuste bruto seria 150, limitado a 60.
  assert.equal(softReset(2000, { jogos: 100, vitorias: 100 }), 1000 + 800 + 60);
  // Mesma taxa com 5 jogos: fator de amostra 0,5 → ajuste 30.
  assert.equal(softReset(2000, { jogos: 5, vitorias: 5 }), 1000 + 800 + 30);
});

test("soft reset nunca devolve rating negativo", () => {
  assert.ok(softReset(0, { jogos: 10, vitorias: 0 }) >= 0);
});

// -------------------- IA ranqueada (§9) --------------------

function lutadorDeTeste({ vida = 100, vidaMax = 100, mana = 100, manaMax = 100, poderes = [] } = {}) {
  return {
    estado: { vida_atual: vida, mana_atual: mana, forca: 10, inteligencia: 10 },
    vidaMax,
    manaMax,
    poderes,
  };
}

const PODER_CURA = {
  id: 1,
  nome: "Cura Leve",
  tipo_poder: "Ativo",
  custo_mana: 10,
  dano_base: 0,
  cura_base: 40,
  nivel_habilidade: 1,
};
const PODER_FOGO = {
  id: 2,
  nome: "Bola de Fogo",
  tipo_poder: "Ativo",
  custo_mana: 10,
  dano_base: 30,
  cura_base: 0,
  nivel_habilidade: 1,
};
const PODER_CARO = {
  id: 3,
  nome: "Meteoro",
  tipo_poder: "Ativo",
  custo_mana: 90,
  dano_base: 45,
  cura_base: 0,
  nivel_habilidade: 1,
};
const PODER_PASSIVO = {
  id: 4,
  nome: "Pele de Pedra",
  tipo_poder: "Passivo",
  custo_mana: 0,
  dano_base: 10,
  cura_base: 0,
  nivel_habilidade: 1,
};

test("IA cura quando a vida está abaixo do limiar", () => {
  const vidaBaixa = Math.floor(100 * IA_LIMIAR_CURA_PERCENTUAL) - 1;
  const { acao } = rankedAiService.escolherAcaoIA(
    lutadorDeTeste({ vida: vidaBaixa, poderes: [PODER_CURA, PODER_FOGO] }),
  );
  assert.equal(acao.tipo, "power");
  assert.equal(acao.power.nome, "Cura Leve");
});

test("IA não cura com a vida cheia", () => {
  for (let i = 0; i < 25; i += 1) {
    const { acao } = rankedAiService.escolherAcaoIA(
      lutadorDeTeste({ vida: 100, poderes: [PODER_CURA, PODER_FOGO] }),
    );
    if (acao.tipo === "power") assert.notEqual(acao.power.nome, "Cura Leve");
  }
});

test("IA usa ataque básico quando não há mana para nenhum poder", () => {
  const { acao } = rankedAiService.escolherAcaoIA(
    lutadorDeTeste({ mana: 1, poderes: [PODER_FOGO, PODER_CARO] }),
  );
  assert.equal(acao.tipo, "attack");
});

test("IA nunca usa consumível e nunca escolhe poder passivo", () => {
  for (let i = 0; i < 100; i += 1) {
    const { acao } = rankedAiService.escolherAcaoIA(
      lutadorDeTeste({ vida: 20, poderes: [PODER_FOGO, PODER_PASSIVO, PODER_CARO] }),
    );
    assert.notEqual(acao.tipo, "item");
    if (acao.tipo === "power") assert.equal(acao.power.tipo_poder, "Ativo");
  }
});

test("IA prefere eficiência de mana, mas não é 100% determinística", () => {
  const escolhas = new Set();
  for (let i = 0; i < 200; i += 1) {
    const { acao } = rankedAiService.escolherAcaoIA(
      lutadorDeTeste({ poderes: [PODER_FOGO, PODER_CARO] }),
    );
    escolhas.add(acao.tipo === "power" ? acao.power.nome : "ataque");
  }
  // Bola de Fogo (3 de dano por mana) tem que aparecer; o conjunto de
  // escolhas tem que ter mais de uma opção (aleatoriedade §9).
  assert.ok(escolhas.has("Bola de Fogo"));
  assert.ok(escolhas.size > 1);
});

// -------------------- Ranking casual (§3) --------------------

const { pontuacaoCasual } = require("../src/services/rankingService");

test("pontuação casual segue a fórmula da spec", () => {
  // 10 vitórias, 5 derrotas → saldo 5, combates 15, bônus min(30,3)=3.
  assert.equal(pontuacaoCasual({ vitorias: 10, derrotas: 5 }), 53);
  // Saldo negativo pontua negativo, bônus de atividade continua.
  assert.equal(pontuacaoCasual({ vitorias: 0, derrotas: 10 }), -98);
  // Bônus de atividade satura em 30 (a partir de 150 combates).
  assert.equal(pontuacaoCasual({ vitorias: 200, derrotas: 0 }), 2030);
  assert.equal(pontuacaoCasual({ vitorias: 0, derrotas: 0 }), 0);
});
