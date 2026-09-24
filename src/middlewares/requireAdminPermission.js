// Painel Administrativo §8 — authMiddleware -> adminMiddleware ->
// requireAdminPermission("chave") -> controller. Nunca confia em
// role/permissão enviada pelo frontend; sempre relê do banco a cada
// request. Precisa rodar DEPOIS de adminMiddleware (usa req.user.id, já
// validado como isAdmin=true) — isAdmin continua a porta de entrada,
// isto só refina o que aquele admin específico pode fazer.
const { sequelize } = require("../config/database");

function requireAdminPermission(chave) {
  return async (req, res, next) => {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Não autenticado." });
    }
    try {
      const [linhas] = await sequelize.query(
        `SELECT 1
           FROM user_admin_roles uar
           JOIN admin_role_permissions arp ON arp.id_role = uar.id_role
           JOIN admin_permissions ap ON ap.id = arp.id_permission
          WHERE uar.id_user = :idUser AND ap.chave = :chave
          LIMIT 1;`,
        { replacements: { idUser: req.user.id, chave } },
      );
      if (linhas.length === 0) {
        return res.status(403).json({ message: `Essa ação requer a permissão "${chave}".` });
      }
      next();
    } catch (error) {
      console.error(`Erro ao verificar permissão administrativa "${chave}":`, error);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  };
}

module.exports = requireAdminPermission;
