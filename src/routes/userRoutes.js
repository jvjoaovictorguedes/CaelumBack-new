const express = require("express");
const userController = require("../controllers/userController");
const authMiddleware = require("../middlewares/authMiddleware");
const { criarLimitador } = require("../middlewares/rateLimitMiddleware");

const router = express.Router();

const limitadorLogin = criarLimitador({ janelaMs: 15 * 60 * 1000, maxTentativas: 10 });
const limitadorRegistro = criarLimitador({ janelaMs: 60 * 60 * 1000, maxTentativas: 5 });
// Mesmo limite curto pros dois passos do "esqueci minha senha" — sem
// isso, dava pra scriptar POST /forgot-password em loop (spam de
// e-mail pra qualquer endereço) ou forçar bruta o token de 32 bytes de
// /reset-password (embora isso já seja inviável por tamanho, o rate
// limit é uma segunda camada barata).
const limitadorResetSenha = criarLimitador({ janelaMs: 15 * 60 * 1000, maxTentativas: 5 });

router.post("/register", limitadorRegistro, userController.registerUser);
router.post("/login", limitadorLogin, userController.loginUser);
router.post("/forgot-password", limitadorResetSenha, userController.forgotPassword);
router.post("/reset-password", limitadorResetSenha, userController.resetPassword);
router.get("/socket-ticket", authMiddleware, userController.getSocketTicket);
router.get("/", authMiddleware, userController.getAllUsers);

module.exports = router;
