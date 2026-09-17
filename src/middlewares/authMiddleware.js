const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/jwt");

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res
      .status(401)
      .json({ message: "Nenhum token fornecido. Acesso negado." });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ message: "Formato do token inválido. Acesso negado." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Sem isso, um ticket de socket (30s de validade, "proposito":
    // "socket", emitido por GET /users/socket-ticket) também passava
    // aqui como se fosse um JWT de sessão de verdade — jwt.verify só
    // confere a assinatura, não POR QUE o token foi emitido. Qualquer
    // token assinado com este segredo que não seja de sessão (hoje: o
    // ticket de socket) é rejeitado como se fosse inválido.
    if (decoded.proposito !== "session") {
      return res.status(401).json({
        message: "Token inválido. Faça login novamente.",
        sessionExpired: true,
      });
    }
    req.user = decoded;
    next();
  } catch (error) {
    // 401 (não 403) pra QUALQUER falha de autenticação — token ausente,
    // malformado ou expirado. Reserva 403 pra quando o usuário está
    // autenticado mas não tem permissão pra uma ação específica (ex.:
    // ownershipMiddleware, adminMiddleware). Essa distinção é o que
    // permite o frontend detectar "sua sessão expirou, faça login de
    // novo" (401) sem confundir com um 403 de "esse personagem/guilda/
    // item não é seu" no meio de uma sessão válida.
    const expirado = error.name === "TokenExpiredError";
    return res.status(401).json({
      message: expirado
        ? "Sua sessão expirou. Faça login novamente."
        : "Token inválido. Faça login novamente.",
      sessionExpired: true,
    });
  }
};

module.exports = authMiddleware;
