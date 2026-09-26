// Bug reportado: aba "PvP Ranqueado" no Ranking mostra "Não foi possível
// carregar o ranking agora." O frontend (RankingClient.tsx, commit
// e460f69 "Ranking casual/ranqueado separados") manda GET /ranking?type=
// pvp_ranked, mas rankingController.js (commit cb1a5c3, mesma feature,
// sessão diferente) só aceitava type=pvp — nomes divergiram entre os dois
// lados na mesma mudança. O front recebia 400 "Tipo de ranking inválido"
// e mostrava a mensagem genérica de erro. Esta suíte exercita o
// controller exatamente como a rota HTTP real (querystring + req/res),
// provando que cada `type` que o frontend realmente envia é aceito.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
require("../src/models/associations");

const rankingController = require("../src/controllers/rankingController");

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

function reqRes({ query, personagemAtual } = {}) {
  let statusCode = null;
  let corpo = null;
  const req = { query: query ?? {}, personagemAtual: personagemAtual ?? null };
  const res = {
    status(codigo) {
      statusCode = codigo;
      return this;
    },
    json(payload) {
      corpo = payload;
      return this;
    },
  };
  return { req, res, resultado: () => ({ statusCode, corpo }) };
}

// Os mesmos valores de `type` que RankingClient.tsx (frontend) manda em
// cada aba — level/gold/guild/pvp_ranked/pvp_casual/forge/boss.
const TIPOS_QUE_O_FRONTEND_ENVIA = ["level", "gold", "guild", "pvp_ranked", "pvp_casual", "forge", "boss"];

for (const type of TIPOS_QUE_O_FRONTEND_ENVIA) {
  testeComBanco(`GET /ranking?type=${type} (sem personagem logado) responde 200, nunca 400/500`, async () => {
    const { req, res, resultado } = reqRes({ query: { type, page: "1" } });
    await rankingController.obterRanking(req, res);
    const { statusCode, corpo } = resultado();
    assert.equal(statusCode, 200, `esperava 200, recebeu ${statusCode} — corpo: ${JSON.stringify(corpo)}`);
    assert.equal(corpo.status, "success");
    assert.ok(Array.isArray(corpo.data.itens));
  });
}

testeComBanco("GET /ranking?type=pvp_ranked com personagem logado inclui minhaPosicao (Elo/rating)", async () => {
  const { personagem } = await criarPersonagem();
  const { req, res, resultado } = reqRes({
    query: { type: "pvp_ranked", page: "1" },
    personagemAtual: { id: personagem.id },
  });
  await rankingController.obterRanking(req, res);
  const { statusCode, corpo } = resultado();
  assert.equal(statusCode, 200);
  assert.ok(corpo.data.minhaPosicao, "esperava minhaPosicao presente pra personagem logado");
  assert.equal(typeof corpo.data.minhaPosicao.elegivel, "boolean");
});

testeComBanco("GET /ranking?type=pvp (nome antigo, pré-separação casual/ranqueado) é rejeitado com 400", async () => {
  const { req, res, resultado } = reqRes({ query: { type: "pvp", page: "1" } });
  await rankingController.obterRanking(req, res);
  const { statusCode, corpo } = resultado();
  assert.equal(statusCode, 400);
  assert.match(corpo.message, /Tipo de ranking inválido/);
});
