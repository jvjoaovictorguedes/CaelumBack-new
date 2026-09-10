const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "sua_super_chave_secreta_aqui";

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
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Erro na verificação do token:", error);
    return res.status(403).json({ message: "Token inválido ou expirado." });
  }
};

module.exports = authMiddleware;
