// Códigos de resgate — devs cadastram (painel admin, permissão
// "codes.manage"), jogador resgata em Meu Personagem > Informações.
// Um resgate por personagem pra sempre (RedemptionCodeUse com
// constraint UNIQUE), nunca resgata depois de expirado ou desativado.
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const RedemptionCode = require("../models/RedemptionCode");
const RedemptionCodeUse = require("../models/RedemptionCodeUse");
const { validarRaridade } = require("./equipmentRarityService");
const { aplicarPacoteDeRecompensa } = require("./rewardPayoutService");
const { registrarAcao } = require("./adminAuditService");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

function normalizarCodigo(codigo) {
  return String(codigo ?? "").trim().toUpperCase();
}

function validarRecompensa(recompensa) {
  if (!recompensa || typeof recompensa !== "object") throw erro("Recompensa inválida.");
  const { ouro, xp, itens } = recompensa;
  if (ouro == null && xp == null && (!itens || itens.length === 0)) {
    throw erro("A recompensa precisa ter ao menos ouro, xp ou um item.");
  }
  if (ouro != null && (!Number.isInteger(ouro) || ouro <= 0)) throw erro("ouro precisa ser um inteiro positivo.");
  if (xp != null && (!Number.isInteger(xp) || xp <= 0)) throw erro("xp precisa ser um inteiro positivo.");
  for (const linha of itens ?? []) {
    if (!linha.id_item || !Number.isInteger(linha.quantidade) || linha.quantidade <= 0) {
      throw erro("Cada item precisa de id_item e quantidade (inteiro positivo).");
    }
    if (linha.raridade !== undefined) validarRaridade(linha.raridade);
  }
}

// §Painel admin — cria um código novo. Guarda em maiúsculas pra
// resgate não ser sensível a caixa ("promo2026" e "PROMO2026" são o
// mesmo código).
async function criarCodigo({ codigo, recompensa, expira_em, idAdmin, req }) {
  const codigoNormalizado = normalizarCodigo(codigo);
  if (!codigoNormalizado || codigoNormalizado.length < 3) {
    throw erro("Código precisa ter ao menos 3 caracteres.");
  }
  if (!expira_em || Number.isNaN(new Date(expira_em).getTime())) {
    throw erro("Data de expiração inválida.");
  }
  if (new Date(expira_em).getTime() <= Date.now()) {
    throw erro("Data de expiração precisa ser no futuro.");
  }
  validarRecompensa(recompensa);

  return sequelize.transaction(async (transaction) => {
    const existente = await RedemptionCode.findOne({ where: { codigo: codigoNormalizado }, transaction });
    if (existente) throw erro("Já existe um código com esse texto.", 409);

    const criado = await RedemptionCode.create(
      { codigo: codigoNormalizado, recompensa, expira_em, id_admin_criador: idAdmin },
      { transaction },
    );

    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "RedemptionCode",
      idEntidade: criado.id,
      dadosDepois: criado.toJSON(),
      motivo: `Criação do código ${codigoNormalizado}`,
      req,
      transaction,
    });

    return criado;
  });
}

async function listarCodigosAdmin() {
  const codigos = await RedemptionCode.findAll({ order: [["createdAt", "DESC"]] });
  const contagens = await RedemptionCodeUse.findAll({
    attributes: ["id_redemption_code", [sequelize.fn("COUNT", sequelize.col("id")), "total"]],
    group: ["id_redemption_code"],
    raw: true,
  });
  const totalPorCodigo = Object.fromEntries(contagens.map((c) => [c.id_redemption_code, Number(c.total)]));
  return codigos.map((c) => ({ ...c.toJSON(), total_resgates: totalPorCodigo[c.id] ?? 0 }));
}

// §Painel admin — só permite desativar/reativar e trocar a expiração;
// nunca deixa editar a recompensa de um código que já foi resgatado
// por alguém, pra não mudar debaixo do pé o que já foi prometido/
// concedido a jogadores anteriores.
async function atualizarCodigo(id, { ativo, expira_em, recompensa }, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const codigo = await RedemptionCode.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!codigo) throw erro("Código não encontrado.", 404);

    const dadosAntes = codigo.toJSON();

    if (recompensa !== undefined) {
      const jaResgatado = await RedemptionCodeUse.count({ where: { id_redemption_code: id }, transaction });
      if (jaResgatado > 0) throw erro("Este código já foi resgatado por alguém — não dá pra mudar a recompensa agora.");
      validarRecompensa(recompensa);
      codigo.recompensa = recompensa;
    }
    if (expira_em !== undefined) {
      if (Number.isNaN(new Date(expira_em).getTime())) throw erro("Data de expiração inválida.");
      codigo.expira_em = expira_em;
    }
    if (ativo !== undefined) codigo.ativo = Boolean(ativo);

    await codigo.save({ transaction });

    await registrarAcao({
      idAdmin,
      acao: "atualizar",
      entidade: "RedemptionCode",
      idEntidade: codigo.id,
      dadosAntes,
      dadosDepois: codigo.toJSON(),
      motivo: `Edição do código ${codigo.codigo}`,
      req,
      transaction,
    });

    return codigo;
  });
}

// §Jogador — resgate em si. Tudo dentro de UMA transação: trava o
// código (evita duas edições concorrentes o desativarem/reativarem no
// meio do resgate), confirma que ainda vale, cria a linha de uso
// (constraint UNIQUE é quem garante "só uma vez" sob concorrência de
// verdade, não a checagem abaixo sozinha) e só then aplica a
// recompensa.
async function resgatarCodigo(idPersonagem, codigoTexto) {
  const codigoNormalizado = normalizarCodigo(codigoTexto);
  if (!codigoNormalizado) throw erro("Digite um código.");

  return sequelize.transaction(async (transaction) => {
    const codigo = await RedemptionCode.findOne({
      where: { codigo: codigoNormalizado },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!codigo) throw erro("Código inválido.", 404);
    if (!codigo.ativo) throw erro("Este código não está mais disponível.");
    if (new Date(codigo.expira_em).getTime() <= Date.now()) throw erro("Este código expirou.");

    const jaResgatou = await RedemptionCodeUse.findOne({
      where: { id_redemption_code: codigo.id, id_personagem: idPersonagem },
      transaction,
    });
    if (jaResgatou) throw erro("Você já resgatou este código.", 409);

    let usoRegistrado;
    try {
      usoRegistrado = await RedemptionCodeUse.create(
        { id_redemption_code: codigo.id, id_personagem: idPersonagem },
        { transaction },
      );
    } catch (error) {
      if (error.name === "SequelizeUniqueConstraintError") throw erro("Você já resgatou este código.", 409);
      throw error;
    }
    void usoRegistrado;

    const { concedido } = await aplicarPacoteDeRecompensa(idPersonagem, codigo.recompensa, transaction);

    return concedido;
  });
}

module.exports = {
  criarCodigo,
  listarCodigosAdmin,
  atualizarCodigo,
  resgatarCodigo,
};
