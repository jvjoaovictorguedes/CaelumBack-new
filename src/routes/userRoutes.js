const express = require("express");
const userController = require("../controllers/userController");
const authMiddleware = require("../middlewares/authMiddleware");
const { criarLimitador } = require("../middlewares/rateLimitMiddleware");

const router = express.Router();

const limitadorLogin = criarLimitador({ janelaMs: 15 * 60 * 1000, maxTentativas: 10 });
const limitadorRegistro = criarLimitador({ janelaMs: 60 * 60 * 1000, maxTentativas: 5 });

router.post("/register", limitadorRegistro, userController.registerUser);
router.post("/login", limitadorLogin, userController.loginUser);
router.get("/socket-ticket", authMiddleware, userController.getSocketTicket);
router.get("/", authMiddleware, userController.getAllUsers);

module.exports = router;
