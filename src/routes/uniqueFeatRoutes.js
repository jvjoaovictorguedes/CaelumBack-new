// src/routes/uniqueFeatRoutes.js — Sistema de Proezas Únicas §17, API
// pública (qualquer usuário autenticado, sem permissão de admin).
const express = require("express");
const uniqueFeatController = require("../controllers/uniqueFeatController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.get("/hall", authMiddleware, uniqueFeatController.getHall);
router.get("/me", authMiddleware, carregarPersonagemAtual, uniqueFeatController.getMinhasProezas);
router.get("/:key/public", authMiddleware, uniqueFeatController.getFeatPublico);

module.exports = router;
