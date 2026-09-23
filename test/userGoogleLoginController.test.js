// Cobre só os ramos de erro de loginComGoogle que NÃO dependem de um ID
// token assinado de verdade pelo Google (idToken ausente, servidor sem
// GOOGLE_CLIENT_ID configurado) — o caminho feliz (perfil verificado →
// cria/vincula conta) já é coberto por googleLoginService.test.js
// direto contra a lógica de negócio, sem precisar forjar uma
// assinatura do Google.
const test = require("node:test");
const assert = require("node:assert/strict");

const userController = require("../src/controllers/userController");

function reqRes(body) {
  let statusCode = null;
  let corpo = null;
  const req = { body };
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

test("loginComGoogle sem idToken no corpo responde 400", async () => {
  const chamada = reqRes({});
  await userController.loginComGoogle(chamada.req, chamada.res);
  assert.equal(chamada.resultado().statusCode, 400);
});

test("loginComGoogle sem GOOGLE_CLIENT_ID configurado no servidor responde 500 (bug de config, não credencial errada)", async () => {
  const anterior = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  try {
    const chamada = reqRes({ idToken: "qualquer-coisa" });
    await userController.loginComGoogle(chamada.req, chamada.res);
    assert.equal(chamada.resultado().statusCode, 500);
  } finally {
    if (anterior === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = anterior;
  }
});
