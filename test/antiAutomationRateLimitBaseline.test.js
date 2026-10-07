const test = require("node:test");
const assert = require("node:assert/strict");
const { criarLimitador } = require("../src/middlewares/rateLimitMiddleware");

function chamar(limitador, req) {
  const resultado = { permitido: false, status: null, corpo: null };
  const res = {
    status(status) { resultado.status = status; return this; },
    json(corpo) { resultado.corpo = corpo; return this; },
  };
  limitador(req, res, () => { resultado.permitido = true; });
  return resultado;
}

test("BASELINE rate limiter: conta mantém limite após trocar IP, sem compartilhar NAT", () => {
  const limitador = criarLimitador({ janelaMs: 10000, maxTentativas: 1, obterChave: (req) => req.user.id });
  assert.equal(chamar(limitador, { ip: "NAT", user: { id: 1 } }).permitido, true);
  assert.equal(chamar(limitador, { ip: "OUTRO", user: { id: 1 } }).status, 429);
  assert.equal(chamar(limitador, { ip: "NAT", user: { id: 2 } }).permitido, true);
});

test("BASELINE rate limiter: default compartilha bucket entre contas no mesmo IP", () => {
  const limitador = criarLimitador({ janelaMs: 10000, maxTentativas: 1 });
  assert.equal(chamar(limitador, { ip: "NAT", user: { id: 1 } }).permitido, true);
  const bloqueado = chamar(limitador, { ip: "NAT", user: { id: 2 } });
  assert.equal(bloqueado.status, 429);
  assert.match(bloqueado.corpo.message, /Muitas tentativas/);
  assert.equal(bloqueado.corpo.code, "ACTION_RATE_LIMITED");
  assert.ok(bloqueado.corpo.retryAfterMs >= 0);
});

test("BASELINE rate limiter: janela atual só reinicia depois de resetAt", (t) => {
  let agora = 1000;
  t.mock.method(Date, "now", () => agora);
  const limitador = criarLimitador({ janelaMs: 1000, maxTentativas: 1 });
  assert.equal(chamar(limitador, { ip: "A" }).permitido, true);
  agora = 2000;
  assert.equal(chamar(limitador, { ip: "A" }).status, 429);
  agora = 2001;
  assert.equal(chamar(limitador, { ip: "A" }).permitido, true);
});

test("BASELINE rate limiter: recriar middleware perde contagem em memória", () => {
  const config = { janelaMs: 10000, maxTentativas: 1 };
  const original = criarLimitador(config);
  assert.equal(chamar(original, { ip: "A" }).permitido, true);
  assert.equal(chamar(original, { ip: "A" }).status, 429);
  assert.equal(chamar(criarLimitador(config), { ip: "A" }).permitido, true);
});
