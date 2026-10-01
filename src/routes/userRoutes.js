const express = require("express");
const userController = require("../controllers/userController");
const authMiddleware = require("../middlewares/authMiddleware");
const { criarLimitador } = require("../middlewares/rateLimitMiddleware");

const router = express.Router();

// Duas camadas em vez de uma só por IP (pedido real: IP compartilhado —
// CGNAT, Wi-Fi de prédio/faculdade, rede corporativa — trancava jogador
// nenhum tinha culpa junto com quem de fato abusou):
//   - Camada por CONTA (e-mail/token do que está sendo tentado): pega
//     quem insiste na MESMA conta/token, sem depender de IP nenhum.
//   - Camada por IP: bem mais generosa, só existe pra pegar spam de
//     massa (muitas contas/e-mails DIFERENTES saindo do mesmo IP num
//     intervalo curto) — jogador normal num IP compartilhado nunca
//     chega perto dela, porque cada um usa seu próprio e-mail.
// As duas rodam em sequência (array de middlewares); qualquer uma que
// travar já barra a requisição, a outra nem chega a ser avaliada.
function chavePorEmail(req) {
  const email = (req.body?.email || "").trim().toLowerCase();
  // Sem e-mail no corpo (não deveria acontecer nas rotas onde isso é
  // aplicado — validação de campo obrigatório vem depois, no
  // controller), cai pro IP mesmo, pra nunca ficar sem key nenhuma.
  return email ? `conta:${email}` : `ip:${req.ip}`;
}

function chavePorToken(req) {
  const token = req.body?.token;
  return token ? `token:${token}` : `ip:${req.ip}`;
}

const limitadorRegistroIP = criarLimitador({ janelaMs: 60 * 60 * 1000, maxTentativas: 30 });
const limitadorRegistroConta = criarLimitador({
  janelaMs: 60 * 60 * 1000,
  maxTentativas: 6,
  obterChave: chavePorEmail,
});

const limitadorLoginIP = criarLimitador({ janelaMs: 15 * 60 * 1000, maxTentativas: 40 });
const limitadorLoginConta = criarLimitador({
  janelaMs: 15 * 60 * 1000,
  maxTentativas: 8,
  obterChave: chavePorEmail,
});

const limitadorForgotPasswordIP = criarLimitador({ janelaMs: 60 * 60 * 1000, maxTentativas: 20 });
const limitadorForgotPasswordConta = criarLimitador({
  janelaMs: 60 * 60 * 1000,
  maxTentativas: 5,
  obterChave: chavePorEmail,
});

const limitadorResetPasswordIP = criarLimitador({ janelaMs: 60 * 60 * 1000, maxTentativas: 20 });
const limitadorResetPasswordConta = criarLimitador({
  janelaMs: 60 * 60 * 1000,
  maxTentativas: 5,
  obterChave: chavePorToken,
});

// change-password já roda autenticado — não faz sentido nenhum contar
// por IP aqui (dois jogadores na mesma rede trocando a própria senha
// quase ao mesmo tempo não têm nada a ver um com o outro). authMiddleware
// vem ANTES do limitador pra req.user.id já existir na hora de montar a
// chave.
const limitadorTrocaSenha = criarLimitador({
  janelaMs: 15 * 60 * 1000,
  maxTentativas: 5,
  obterChave: (req) => `conta:${req.user.id}`,
});

// Checagem ao vivo do campo "Quem te indicou?" (GET /referral-check) —
// pública de propósito (ver userController.verificarIndicador), só por
// IP já que ainda não existe conta/sessão nesse ponto do registro.
// Generoso o bastante pra digitação normal com debounce (várias
// chamadas numa mesma tentativa de registro), apertado o bastante pra
// não virar um jeito barato de varrer nomes de personagem em massa.
const limitadorReferralCheckIP = criarLimitador({ janelaMs: 10 * 60 * 1000, maxTentativas: 60 });
router.get("/referral-check", limitadorReferralCheckIP, userController.verificarIndicador);

router.post("/register", [limitadorRegistroConta, limitadorRegistroIP], userController.registerUser);
router.post("/login", [limitadorLoginConta, limitadorLoginIP], userController.loginUser);
router.post("/google-login", limitadorLoginIP, userController.loginComGoogle);
router.post(
  "/forgot-password",
  [limitadorForgotPasswordConta, limitadorForgotPasswordIP],
  userController.forgotPassword,
);
router.post(
  "/reset-password",
  [limitadorResetPasswordConta, limitadorResetPasswordIP],
  userController.resetPassword,
);
router.post("/change-password", authMiddleware, limitadorTrocaSenha, userController.changePassword);
router.get("/socket-ticket", authMiddleware, userController.getSocketTicket);
router.post("/refresh", authMiddleware, userController.refreshToken);
router.get("/", authMiddleware, userController.getAllUsers);

module.exports = router;
