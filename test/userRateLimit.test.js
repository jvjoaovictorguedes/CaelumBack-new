// Rate limit de contas/IP (userRoutes.js) — bug real reportado: um
// jogador levou "Muitas tentativas, tente novamente em ~3000 segundos"
// no /register sem ter feito nada de errado, porque o limitador antigo
// contava só por IP (5 tentativas/hora pra TODO MUNDO atrás do mesmo
// IP — CGNAT, Wi-Fi compartilhado etc.). Reestruturado em duas camadas:
// por CONTA (e-mail/token, bem mais apertada) e por IP (bem mais
// generosa, só pra pegar spam de massa). Este teste prova que jogadores
// DIFERENTES no mesmo IP não se atrapalham mais, e que a camada por
// conta ainda bloqueia quem insiste na MESMA conta.
const test = require("node:test");
const assert = require("node:assert/strict");

const userRoutes = require("../src/routes/userRoutes");

function pegarMiddlewaresDaRota(path, metodo) {
  const layer = userRoutes.stack.find(
    (l) => l.route?.path === path && l.route.methods[metodo],
  );
  if (!layer) throw new Error(`rota ${metodo.toUpperCase()} ${path} não encontrada`);
  // Todas as camadas MENOS a última (o controller de verdade, que
  // precisaria de banco) — só queremos os limitadores.
  return layer.route.stack.slice(0, -1).map((l) => l.handle);
}

function fakeReqRes({ ip, body = {}, user } = {}) {
  const req = { ip, body, user };
  let statusCode = null;
  let corpo = null;
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

// Roda a cadeia de middlewares em sequência, parando no primeiro que
// não chamar next() (isto é, no primeiro que bloquear com 429).
function rodarCadeia(middlewares, req, res) {
  let bloqueadoEm = -1;
  for (let i = 0; i < middlewares.length; i++) {
    let chamouNext = false;
    middlewares[i](req, res, () => {
      chamouNext = true;
    });
    if (!chamouNext) {
      bloqueadoEm = i;
      break;
    }
  }
  return bloqueadoEm; // -1 = passou por tudo (não bloqueou)
}

test("register: e-mails diferentes no MESMO IP não se bloqueiam entre si (bug real corrigido)", () => {
  const middlewares = pegarMiddlewaresDaRota("/register", "post");
  const ipCompartilhado = "203.0.113.9";

  // 6 tentativas é o limite por CONTA — se o limite ainda fosse só por
  // IP (era 5/hora antes da correção), a 6ª pessoa nesse IP já teria
  // sido barrada mesmo usando um e-mail que nunca tentou antes.
  for (let i = 0; i < 6; i++) {
    const { req, res, resultado } = fakeReqRes({
      ip: ipCompartilhado,
      body: { email: `jogador${i}@teste.local`, username: `j${i}`, password: "senha123" },
    });
    const bloqueadoEm = rodarCadeia(middlewares, req, res);
    assert.equal(
      bloqueadoEm,
      -1,
      `jogador ${i} (e-mail novo) não pode ser bloqueado só por dividir IP com outros — resultado: ${JSON.stringify(resultado())}`,
    );
  }
});

test("register: a MESMA conta insistindo é bloqueada pela camada por conta, mesmo de IPs diferentes", () => {
  const middlewares = pegarMiddlewaresDaRota("/register", "post");
  const email = `mesma-conta-${Date.now()}@teste.local`;

  let ultimoBloqueio = -1;
  for (let i = 0; i < 8; i++) {
    const { req, res, resultado } = fakeReqRes({
      ip: `198.51.100.${i}`, // IP diferente a cada tentativa, de propósito
      body: { email, username: "x", password: "senha123" },
    });
    const bloqueadoEm = rodarCadeia(middlewares, req, res);
    if (bloqueadoEm !== -1) {
      ultimoBloqueio = i;
      assert.equal(resultado().statusCode, 429);
      break;
    }
  }
  assert.ok(
    ultimoBloqueio >= 0 && ultimoBloqueio < 8,
    "a mesma conta insistindo (mesmo trocando de IP) precisa ser barrada pela camada por conta antes da 8ª tentativa",
  );
});

test("change-password: bloqueio é por CONTA (req.user.id), não por IP — duas contas no mesmo IP não se atrapalham", () => {
  // A rota é [authMiddleware, limitadorTrocaSenha, controller] — aqui
  // testamos só o limitador (índice 1), simulando o req.user que
  // authMiddleware já teria deixado pronto (testar authMiddleware de
  // verdade exigiria um JWT/banco real, fora do escopo deste teste).
  const middlewares = [pegarMiddlewaresDaRota("/change-password", "post")[1]];
  const ipCompartilhado = "203.0.113.50";

  // Esgota o limite (5) da conta 111 — todas essas 5 primeiras tentativas
  // precisam passar.
  for (let i = 0; i < 5; i++) {
    const { req, res, resultado } = fakeReqRes({
      ip: ipCompartilhado,
      user: { id: 111 },
      body: { senhaAtual: "errada", novaSenha: "novaSenha123" },
    });
    const bloqueadoEm = rodarCadeia(middlewares, req, res);
    assert.equal(
      bloqueadoEm,
      -1,
      `tentativa ${i} da conta 111 deveria passar (limite é 5) — resultado: ${JSON.stringify(resultado())}`,
    );
  }

  // Conta DIFERENTE (222), mesmo IP — não pode herdar o bloqueio da 111.
  const { req, res, resultado } = fakeReqRes({
    ip: ipCompartilhado,
    user: { id: 222 },
    body: { senhaAtual: "errada", novaSenha: "novaSenha123" },
  });
  const bloqueadoEm = rodarCadeia(middlewares, req, res);
  assert.equal(
    bloqueadoEm,
    -1,
    `conta 222 não pode ser bloqueada pelo histórico da conta 111 só por dividir IP — resultado: ${JSON.stringify(resultado())}`,
  );
});
