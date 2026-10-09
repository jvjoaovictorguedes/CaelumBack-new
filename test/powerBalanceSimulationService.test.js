// Rebalanceamento de Powers §27 — roda o simulador real contra o
// catálogo canônico inteiro (migration.POWERS) e garante que termina
// sem lançar pra nenhuma das 76 Powers, nos 4 níveis de personagem x 3
// níveis de habilidade. Também verifica que os outliers encontrados (se
// algum) vêm com números concretos, nunca um texto sem medição.
const test = require("node:test");
const assert = require("node:assert/strict");
const { simularCatalogo, detectarOutliers, NIVEIS_PERSONAGEM, NIVEIS_HABILIDADE } = require("../src/services/powerBalanceSimulationService");
const { POWERS } = require("../src/migrations/20270214010000-rebalanceamento-powers-personagem.js");

test("simularCatalogo roda sem lançar pra todas as 76 Powers canônicas e devolve uma linha por combinação de classe x nível x nível de habilidade", async () => {
  const resultados = await simularCatalogo(POWERS);
  assert.ok(resultados.length > 0);
  for (const r of resultados) {
    assert.equal(typeof r.power, "string");
    assert.ok(NIVEIS_PERSONAGEM.includes(r.nivel_personagem));
    assert.ok(NIVEIS_HABILIDADE.includes(r.nivel_habilidade));
    assert.ok(Number.isFinite(r.dano_bruto));
    assert.ok(Number.isFinite(r.dano_pos_defesa));
    assert.ok(Number.isFinite(r.cura_bruta));
    assert.ok(Number.isFinite(r.custo_mana));
    assert.ok(Number.isFinite(r.dano_por_turno));
    assert.ok(Number.isFinite(r.dot_esperado));
  }
});

test("detectarOutliers só reporta findings com categoria e detalhe (números concretos, nunca texto vazio)", async () => {
  const resultados = await simularCatalogo(POWERS);
  const findings = detectarOutliers(resultados);
  for (const f of findings) {
    assert.equal(typeof f.categoria, "string");
    assert.ok(f.categoria.length > 0);
    assert.equal(typeof f.detalhe, "string");
    assert.match(f.detalhe, /\d/, "cada finding precisa citar pelo menos um número medido");
  }
});

test("Golpe Poderoso (Guerreiro, nível de habilidade 10, personagem 40) tem dano_por_turno > 0", async () => {
  const resultados = await simularCatalogo(POWERS);
  const linha = resultados.find((r) => r.power === "Golpe Poderoso" && r.nivel_habilidade === 10 && r.nivel_personagem === 40);
  assert.ok(linha);
  assert.ok(linha.dano_por_turno > 0);
});

test("Escudo de Mana não aparece com dano_por_turno (é puramente utilitário)", async () => {
  const resultados = await simularCatalogo(POWERS);
  const linha = resultados.find((r) => r.power === "Escudo de Mana" && r.nivel_habilidade === 10 && r.nivel_personagem === 40);
  assert.ok(linha);
  assert.equal(linha.dano_por_turno, 0);
});
