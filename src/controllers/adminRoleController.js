const adminRoleService = require("../services/adminRoleService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listarRoles = async (req, res) => {
  try {
    const roles = await adminRoleService.listRoles();
    res.status(200).json({ status: "success", data: { roles } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar roles.");
  }
};

exports.listarAdmins = async (req, res) => {
  try {
    const admins = await adminRoleService.listAdmins();
    res.status(200).json({ status: "success", data: { admins } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar administradores.");
  }
};

exports.concederRole = async (req, res) => {
  try {
    const { idUser, idRole } = req.body ?? {};
    const resultado = await adminRoleService.assignRole(idUser, idRole, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao conceder role.");
  }
};

exports.revogarRole = async (req, res) => {
  try {
    const { idUser, idRole } = req.body ?? {};
    const resultado = await adminRoleService.revokeRole(idUser, idRole, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao revogar role.");
  }
};
