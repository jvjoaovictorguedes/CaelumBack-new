// Modo Manutenção — gate global: quando ativo, bloqueia toda API pra
// quem não é admin (visitante deslogado ou jogador comum), liberando só
// a lista mínima abaixo (status público + login, pra um admin conseguir
// entrar durante a manutenção). Montado em app.js ANTES de todas as
// rotas de /api — cada router individual continua tendo seu próprio
// authMiddleware/adminMiddleware normalmente por baixo disso.
//
// Fica beeem barato quando desligado (o caso 99.9% do tempo): só uma
// leitura síncrona do cache em memória (gameSettingCache.js), nunca
// bate no banco. Só quando ligado é que decodifica o token (se algum)
// e confere isAdmin — e mesmo assim só decodifica, nunca herda
// req.user do authMiddleware de verdade (que roda depois, por rota).
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/jwt");
const User = require("../models/User");
const gameSettingCache = require("../services/gameSettingCache");
const { MENSAGEM_PADRAO } = require("../services/adminMaintenanceService");

// Sem estes, ninguém conseguiria nem descobrir que o jogo está em
// manutenção (status), nem um admin conseguiria entrar pra desligar de
// novo (login/refresh/logout). Deliberadamente NÃO inclui registro/
// esqueci-senha — não faz sentido criar conta nova ou trocar senha
// enquanto só admin pode jogar.
const ROTAS_LIBERADAS = new Set([
  "/api/maintenance/status",
  "/api/users/login",
  "/api/users/google-login",
  "/api/users/refresh",
]);

async function ehAdminAutenticado(req) {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];
  if (!token) return false;

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return false;
  }
  if (decoded.proposito !== "session") return false;

  try {
    const usuario = await User.findByPk(decoded.id, { attributes: ["isAdmin"] });
    return Boolean(usuario?.isAdmin);
  } catch (error) {
    console.error("[maintenanceMiddleware] falha ao verificar isAdmin:", error);
    return false;
  }
}

async function maintenanceMiddleware(req, res, next) {
  if (!gameSettingCache.obter("maintenance.enabled", false)) return next();
  if (ROTAS_LIBERADAS.has(req.path)) return next();
  if (await ehAdminAutenticado(req)) return next();

  return res.status(503).json({
    maintenance: true,
    message: gameSettingCache.obter("maintenance.message", MENSAGEM_PADRAO),
  });
}

module.exports = maintenanceMiddleware;
