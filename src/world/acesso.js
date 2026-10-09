const Estado = require("../models/CharacterWorldState");
const Character = require("../models/Character");
const { sequelize } = require("../config/database");
const { registrarAcao } = require("../services/adminAuditService");

async function obterAcesso(idPersonagem) {
  const estado = await Estado.findByPk(idPersonagem);
  return { habilitado: estado?.mundo_habilitado === true, estado };
}
async function exigirAcesso(req, res, next) {
  try {
    const acesso = await obterAcesso(req.personagemAtual.id);
    if (!acesso.habilitado) return res.status(403).json({ code: "WORLD_NOT_ENABLED", message: "O mundo explorável ainda não está liberado para seu personagem." });
    req.estadoMundo = acesso.estado;
    next();
  } catch (erro) { next(erro); }
}
async function definirAcesso(idPersonagem, habilitado, req) {
  if (!Number.isSafeInteger(idPersonagem) || idPersonagem <= 0 || typeof habilitado !== "boolean") {
    throw Object.assign(new Error("Informe um personagem válido e habilitado booleano."), { statusCode: 400 });
  }
  return sequelize.transaction(async transaction => {
    // Lock do personagem serializa inclusive a primeira habilitação, quando
    // a linha de estado ainda não existe. Flag e auditoria são atômicas.
    const personagem = await Character.findByPk(idPersonagem, { transaction, lock: transaction.LOCK.UPDATE });
    if (!personagem) throw Object.assign(new Error("Personagem não encontrado."), { statusCode: 404 });
    const [estado] = await Estado.findOrCreate({ where: { id_personagem: idPersonagem }, transaction });
    const antes = { habilitado: estado.mundo_habilitado };
    await estado.update({ mundo_habilitado: habilitado }, { transaction });
    await registrarAcao({ idAdmin: req.user.id, acao: "UPDATE_WORLD_ACCESS", entidade: "CharacterWorldState", idEntidade: idPersonagem, dadosAntes: antes, dadosDepois: { habilitado }, req, transaction });
    return { id_personagem: idPersonagem, nome: personagem.nome, habilitado };
  });
}
module.exports = { obterAcesso, exigirAcesso, definirAcesso };
