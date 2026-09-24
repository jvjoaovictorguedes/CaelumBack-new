// Fabricação da Forja demorava muito pra carregar (e às vezes nem
// carregava) porque listarBlueprints resolvia os ingredientes de TODO
// o catálogo (121 blueprints x 6 qualidades x N ingredientes) com 2
// queries sequenciais por ingrediente por qualidade — centenas/milhares
// de round-trips ao banco numa chamada só. A correção: resolver os
// vínculos recurso->item em LOTE (2 queries pra tabela inteira, uma vez
// só) e permitir filtrar por categoria, pra a tela carregar as seções
// fechadas por padrão e só pedir os dados completos de uma categoria
// quando o jogador abre ela.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel } = require("./helpers/db");
const { criarPersonagem } = require("./helpers/db");
const forgeCraftingService = require("../src/services/forgeCraftingService");

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

testeComBanco("listarResumoPorCategoria: contagem bate com listarBlueprints sem filtro", async () => {
  const { personagem } = await criarPersonagem();
  const [resumo, tudo] = await Promise.all([
    forgeCraftingService.listarResumoPorCategoria(),
    forgeCraftingService.listarBlueprints(personagem.id),
  ]);

  const contagemReal = new Map();
  for (const bp of tudo) {
    contagemReal.set(bp.categoria_equipamento, (contagemReal.get(bp.categoria_equipamento) ?? 0) + 1);
  }
  for (const { categoria_equipamento, total } of resumo) {
    assert.equal(total, contagemReal.get(categoria_equipamento), `contagem errada pra ${categoria_equipamento}`);
  }
});

testeComBanco("listarBlueprints(categoria): só devolve blueprints daquela categoria", async () => {
  const { personagem } = await criarPersonagem();
  const resumo = await forgeCraftingService.listarResumoPorCategoria();
  if (resumo.length === 0) return; // catálogo vazio nesse ambiente — nada a verificar

  const { categoria_equipamento: categoria, total } = resumo[0];
  const filtrado = await forgeCraftingService.listarBlueprints(personagem.id, categoria);

  assert.equal(filtrado.length, total);
  assert.ok(filtrado.every((bp) => bp.categoria_equipamento === categoria));
});

testeComBanco("listarBlueprints(categoria): dados de cada blueprint batem com a listagem sem filtro", async () => {
  const { personagem } = await criarPersonagem();
  const resumo = await forgeCraftingService.listarResumoPorCategoria();
  if (resumo.length === 0) return;

  const categoria = resumo[0].categoria_equipamento;
  const [tudo, filtrado] = await Promise.all([
    forgeCraftingService.listarBlueprints(personagem.id),
    forgeCraftingService.listarBlueprints(personagem.id, categoria),
  ]);

  const porIdTudo = new Map(tudo.map((bp) => [bp.id, bp]));
  for (const bpFiltrado of filtrado) {
    const bpTudo = porIdTudo.get(bpFiltrado.id);
    assert.ok(bpTudo, `blueprint ${bpFiltrado.id} sumiu da listagem sem filtro`);
    assert.equal(bpFiltrado.nome, bpTudo.nome);
    assert.equal(bpFiltrado.variantes.length, bpTudo.variantes.length);
    for (const varianteFiltrada of bpFiltrado.variantes) {
      const varianteTudo = bpTudo.variantes.find((v) => v.qualidade === varianteFiltrada.qualidade);
      assert.ok(varianteTudo);
      assert.equal(varianteFiltrada.pode_fabricar, varianteTudo.pode_fabricar);
      assert.equal(varianteFiltrada.tempo_segundos, varianteTudo.tempo_segundos);
      // Mesmo conjunto de ingredientes (id_item + quantidade), ordem à
      // parte — a ordem em si já era não-determinística antes desta
      // mudança (Sequelize não força ORDER BY na associação).
      const assinatura = (lista) =>
        lista
          .map((i) => `${i.id_item}:${i.quantidade_necessaria}`)
          .sort()
          .join(",");
      assert.equal(assinatura(varianteFiltrada.ingredientes), assinatura(varianteTudo.ingredientes));
    }
  }
});

testeComBanco("listarBlueprints: categoria sem nenhum blueprint devolve lista vazia", async () => {
  const { personagem } = await criarPersonagem();
  const resultado = await forgeCraftingService.listarBlueprints(personagem.id, "CategoriaInexistente");
  assert.deepEqual(resultado, []);
});
