// Precisa rodar DEPOIS de authMiddleware (usa req.user.id, já
// verificado). Barra endpoints administrativos — dado de jogo (itens,
// classes, raças, poderes, propriedades) e concessão direta de
// inventário/habilidades — que antes eram só GET/POST abertos sem
// nenhuma checagem.
const User = require("../models/User");

const adminMiddleware = async (req, res, next) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: "Não autenticado." });
  }
  try {
    const usuario = await User.findByPk(req.user.id, { attributes: ["id", "isAdmin"] });
    if (!usuario?.isAdmin) {
      return res.status(403).json({ message: "Essa ação requer privilégios de administrador." });
    }
    next();
  } catch (error) {
    console.error("Erro ao verificar privilégio de administrador:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

module.exports = adminMiddleware;
