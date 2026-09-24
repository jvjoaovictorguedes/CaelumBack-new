// Painel Administrativo §7/§59 (módulo Administradores) — gestão de
// roles/permissões. Nunca deleta um AdminRole em uso; só concede/revoga
// a associação User<->AdminRole. User.isAdmin continua a porta de
// entrada (não é gerenciado aqui) — isto só refina o que cada admin faz
// depois de já ter isAdmin=true.
const { sequelize } = require("../config/database");
const User = require("../models/User");
const AdminRole = require("../models/AdminRole");
const AdminPermission = require("../models/AdminPermission");
const UserAdminRole = require("../models/UserAdminRole");
const { registrarAcao } = require("./adminAuditService");
require("../models/associations");

async function listRoles() {
  return AdminRole.findAll({
    include: [{ model: AdminPermission, as: "permissoes", through: { attributes: [] } }],
    order: [["nome", "ASC"]],
  });
}

async function listAdmins() {
  return User.findAll({
    where: { isAdmin: true },
    attributes: ["id", "username", "email"],
    include: [{ model: AdminRole, as: "adminRoles", through: { attributes: [] } }],
    order: [["username", "ASC"]],
  });
}

async function assignRole(idUser, idRole, { idAdmin, req } = {}) {
  return sequelize.transaction(async (transaction) => {
    const usuario = await User.findByPk(idUser, { transaction });
    if (!usuario) {
      const erro = new Error("Usuário não encontrado.");
      erro.statusCode = 404;
      throw erro;
    }
    if (!usuario.isAdmin) {
      const erro = new Error("Só é possível atribuir role administrativa a um usuário com isAdmin=true.");
      erro.statusCode = 400;
      throw erro;
    }
    const role = await AdminRole.findByPk(idRole, { transaction });
    if (!role) {
      const erro = new Error("Role não encontrada.");
      erro.statusCode = 404;
      throw erro;
    }

    const [, criado] = await UserAdminRole.findOrCreate({
      where: { id_user: idUser, id_role: idRole },
      defaults: { id_user: idUser, id_role: idRole },
      transaction,
    });

    if (criado) {
      await registrarAcao({
        idAdmin,
        acao: "conceder-role",
        entidade: "UserAdminRole",
        idEntidade: idUser,
        dadosDepois: { id_user: idUser, id_role: idRole, role: role.nome },
        req,
        transaction,
      });
    }
    return { id_user: idUser, id_role: idRole };
  });
}

async function revokeRole(idUser, idRole, { idAdmin, req } = {}) {
  return sequelize.transaction(async (transaction) => {
    const linha = await UserAdminRole.findOne({ where: { id_user: idUser, id_role: idRole }, transaction });
    if (!linha) return { removido: false };

    await linha.destroy({ transaction });
    await registrarAcao({
      idAdmin,
      acao: "revogar-role",
      entidade: "UserAdminRole",
      idEntidade: idUser,
      dadosAntes: { id_user: idUser, id_role: idRole },
      req,
      transaction,
    });
    return { removido: true };
  });
}

module.exports = { listRoles, listAdmins, assignRole, revokeRole };
