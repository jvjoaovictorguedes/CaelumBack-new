// Bug reportado: "o ranking na parte que mostra sua posição está
// contabilizando com os admins, não deve". As LISTAS de ranking
// (rankingNivel/rankingGold/rankingForja/rankingPvp/rankingPvpCasual)
// já excluíam contas admin via SQL_EXCLUIR_ADMINS — só as funções de
// "sua posição" (posicaoNivel/posicaoGold/posicaoForja/posicaoPvp/
// posicaoPvpCasual) tinham ficado de fora dessa exclusão, cada uma com
// sua própria query COUNT(*) raw sem o filtro. Resultado: um jogador
// comum aparecia "atrás" de um admin com stats melhores, mesmo o admin
// nunca aparecendo na lista visível — a posição numérica não batia com
// o que a lista realmente mostrava.
//
// Cada teste aqui prova a mesma coisa: calcula a posição do jogador
// ANTES de existir um admin com stats melhores, cria o admin, recalcula
// — a posição não pode mudar (o admin não deve ser contado).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
require("../src/models/associations");

const CharacterForgeProgress = require("../src/models/CharacterForgeProgress");
const CharacterPvpSeason = require("../src/models/CharacterPvpSeason");
const PvpStatus = require("../src/models/PvpStatus");
const rankingService = require("../src/services/rankingService");
const { obterOuIniciarTemporadaAtiva } = require("../src/services/rankedSeasonService");

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

test.after(async () => {
  if (temBanco) await sequelize.close();
});

testeComBanco("posicaoNivel: admin com nível maior não conta como estando na frente", async () => {
  const { personagem: jogador } = await criarPersonagem({ nivel: 5 });
  const posicaoAntes = await rankingService.posicaoNivel(jogador.id);

  await criarPersonagem({ nivel: 99, isAdmin: true });

  const posicaoDepois = await rankingService.posicaoNivel(jogador.id);
  assert.equal(posicaoDepois, posicaoAntes, "admin com nível 99 não pode mudar a posição de um jogador comum");
});

testeComBanco("posicaoGold: admin com mais ouro ganho não conta como estando na frente", async () => {
  const { personagem: jogador } = await criarPersonagem();
  jogador.dinheiro_total_ganho = 1000;
  await jogador.save();
  const posicaoAntes = await rankingService.posicaoGold(jogador.id);

  const { personagem: admin } = await criarPersonagem({ isAdmin: true });
  admin.dinheiro_total_ganho = 999999999;
  await admin.save();

  const posicaoDepois = await rankingService.posicaoGold(jogador.id);
  assert.equal(posicaoDepois, posicaoAntes, "admin com muito mais ouro não pode mudar a posição de um jogador comum");
});

testeComBanco("posicaoForja: admin com XP de Forja maior não conta como estando na frente", async () => {
  const { personagem: jogador } = await criarPersonagem();
  await CharacterForgeProgress.create({ id_personagem: jogador.id, nivel: 3, experiencia: 500 });
  const posicaoAntes = await rankingService.posicaoForja(jogador.id);

  const { personagem: admin } = await criarPersonagem({ isAdmin: true });
  await CharacterForgeProgress.create({ id_personagem: admin.id, nivel: 10, experiencia: 999999 });

  const posicaoDepois = await rankingService.posicaoForja(jogador.id);
  assert.equal(posicaoDepois, posicaoAntes, "admin com muito mais XP de Forja não pode mudar a posição de um jogador comum");
});

testeComBanco("posicaoPvp (Arena Ranqueada): admin com rating maior não conta como estando na frente", async () => {
  const temporada = await obterOuIniciarTemporadaAtiva();

  const { personagem: jogador } = await criarPersonagem();
  await CharacterPvpSeason.create({ character_id: jogador.id, season_id: temporada.id, rating: 1000, jogos: 5, vitorias: 3, derrotas: 2 });
  const posicaoAntes = await rankingService.posicaoPvp(jogador.id);
  assert.equal(posicaoAntes.elegivel, true);

  const { personagem: admin } = await criarPersonagem({ isAdmin: true });
  await CharacterPvpSeason.create({ character_id: admin.id, season_id: temporada.id, rating: 9999, jogos: 10, vitorias: 10, derrotas: 0 });

  const posicaoDepois = await rankingService.posicaoPvp(jogador.id);
  assert.equal(posicaoDepois.posicao, posicaoAntes.posicao, "admin com rating muito maior não pode mudar a posição de um jogador comum");
});

testeComBanco("posicaoPvpCasual: admin com pontuação maior não conta como estando na frente", async () => {
  const { personagem: jogador } = await criarPersonagem();
  await PvpStatus.create({ id_personagem: jogador.id, sistema_classificacao: "Elo", vitorias: 5, derrotas: 2 });
  const posicaoAntes = await rankingService.posicaoPvpCasual(jogador.id);
  assert.equal(posicaoAntes.elegivel, true);

  const { personagem: admin } = await criarPersonagem({ isAdmin: true });
  await PvpStatus.create({ id_personagem: admin.id, sistema_classificacao: "Elo", vitorias: 50, derrotas: 0 });

  const posicaoDepois = await rankingService.posicaoPvpCasual(jogador.id);
  assert.equal(posicaoDepois.posicao, posicaoAntes.posicao, "admin com pontuação muito maior não pode mudar a posição de um jogador comum");
});
