// Bug real pedido pelo jogador: "As contas admin não devem aparecer em
// nenhum ranking." As listas (ranking*) já excluíam admins via
// SQL_EXCLUIR_ADMINS, mas as 5 queries raw de "sua posição" (posicao*)
// não tinham filtro nenhum — um admin no topo do ranking inflava a
// posição relatada a um jogador real em 1, mesmo o admin nunca
// aparecendo na lista visível. fishingRankingService.js tinha o mesmo
// problema, só que nem a lista filtrava (nenhuma das duas funções).
//
// Cada teste cria um admin estritamente melhor que o jogador real na
// métrica da categoria e prova que a posição relatada ao jogador real
// continua 1 (ele é o melhor não-admin), não 2 (que seria o resultado
// se o admin contasse).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
require("../src/models/associations");

const rankingService = require("../src/services/rankingService");
const fishingRankingService = require("../src/services/fishingRankingService");
const Character = require("../src/models/Character");
const CharacterForgeProgress = require("../src/models/CharacterForgeProgress");
const PvpStatus = require("../src/models/PvpStatus");
const CharacterFishingProgress = require("../src/models/CharacterFishingProgress");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

// O banco de teste é compartilhado entre sessões e pode ter dados de
// execuções anteriores, então nenhum teste assume posição absoluta 1 —
// cada um mede a posição do jogador ANTES de inserir o admin melhor e
// prova que ela não muda depois (o admin, mesmo "melhor" que todo
// mundo, nunca pode empurrar a posição relatada pra baixo).

testeComBanco("posicaoNivel: admin com nível/XP maiores não altera a posição do jogador real", async () => {
  const { personagem: jogador } = await criarPersonagem({ nivel: 50 });
  await Character.update({ experiencia: 100 }, { where: { id: jogador.id } });
  const posicaoAntes = await rankingService.posicaoNivel(jogador.id);

  const { personagem: admin } = await criarPersonagem({ nivel: 99, isAdmin: true });
  await Character.update({ experiencia: 99999 }, { where: { id: admin.id } });

  const posicaoDepois = await rankingService.posicaoNivel(jogador.id);
  assert.equal(
    posicaoDepois,
    posicaoAntes,
    `admin não pode contar como alguém acima do jogador real — antes: ${posicaoAntes}, depois: ${posicaoDepois}`,
  );
});

testeComBanco("posicaoGold: admin com ouro maior não altera a posição do jogador real", async () => {
  const { personagem: jogador } = await criarPersonagem();
  await Character.update({ dinheiro_total_ganho: 1000 }, { where: { id: jogador.id } });
  const posicaoAntes = await rankingService.posicaoGold(jogador.id);

  const { personagem: admin } = await criarPersonagem({ isAdmin: true });
  await Character.update({ dinheiro_total_ganho: 999999999 }, { where: { id: admin.id } });

  const posicaoDepois = await rankingService.posicaoGold(jogador.id);
  assert.equal(
    posicaoDepois,
    posicaoAntes,
    `admin não pode contar como alguém acima do jogador real — antes: ${posicaoAntes}, depois: ${posicaoDepois}`,
  );
});

testeComBanco("posicaoForja: admin com XP de forja maior não altera a posição do jogador real", async () => {
  const { personagem: jogador } = await criarPersonagem();
  await CharacterForgeProgress.create({ id_personagem: jogador.id, nivel: 5, experiencia: 100 });
  const posicaoAntes = await rankingService.posicaoForja(jogador.id);

  const { personagem: admin } = await criarPersonagem({ isAdmin: true });
  await CharacterForgeProgress.create({ id_personagem: admin.id, nivel: 99, experiencia: 999999 });

  const posicaoDepois = await rankingService.posicaoForja(jogador.id);
  assert.equal(
    posicaoDepois,
    posicaoAntes,
    `admin não pode contar como alguém acima do jogador real — antes: ${posicaoAntes}, depois: ${posicaoDepois}`,
  );
});

testeComBanco("posicaoPvpCasual: admin com saldo maior não altera a posição do jogador real", async () => {
  const { personagem: jogador } = await criarPersonagem();
  await PvpStatus.create({
    id_personagem: jogador.id,
    total_batalhas: 5,
    vitorias: 3,
    derrotas: 2,
    sistema_classificacao: "Vitorias",
  });
  const antes = await rankingService.posicaoPvpCasual(jogador.id);
  assert.equal(antes.elegivel, true);

  const { personagem: admin } = await criarPersonagem({ isAdmin: true });
  await PvpStatus.create({
    id_personagem: admin.id,
    total_batalhas: 50,
    vitorias: 50,
    derrotas: 0,
    sistema_classificacao: "Vitorias",
  });

  const depois = await rankingService.posicaoPvpCasual(jogador.id);
  assert.equal(
    depois.posicao,
    antes.posicao,
    `admin não pode contar como alguém acima do jogador real — antes: ${antes.posicao}, depois: ${depois.posicao}`,
  );
});

testeComBanco(
  "rankingPescaTotal/posicaoPescaTotal: admin não aparece na lista nem conta na posição do jogador real",
  async () => {
    const { personagem: jogador } = await criarPersonagem();
    await CharacterFishingProgress.create({ id_personagem: jogador.id, nivel: 5, total_capturado: 10 });
    const antes = await fishingRankingService.posicaoPescaTotal(jogador.id);
    assert.equal(antes.elegivel, true);

    const { personagem: admin } = await criarPersonagem({ isAdmin: true });
    await CharacterFishingProgress.create({ id_personagem: admin.id, nivel: 99, total_capturado: 999999 });

    const lista = await fishingRankingService.rankingPescaTotal(1);
    assert.ok(
      !lista.itens.some((i) => i.id === admin.id),
      "conta admin não pode aparecer na lista do ranking de pesca",
    );

    const depois = await fishingRankingService.posicaoPescaTotal(jogador.id);
    assert.equal(
      depois.posicao,
      antes.posicao,
      `admin não pode contar como alguém acima do jogador real — antes: ${antes.posicao}, depois: ${depois.posicao}`,
    );
  },
);
