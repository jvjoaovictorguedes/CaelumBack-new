// Tesouro da Guilda V2 (spec "Tesouro da Guilda V2 + Contribuição V2"
// §12 "API sugerida") — camada HTTP fina; toda regra de negócio
// (slots, posse, permissão, políticas de tipo) já vive em
// guildTreasuryService.js, nunca duplicada aqui.
const treasuryService = require("../services/guildTreasuryService");

function tratarErro(res, error, mensagemLog) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemLog, error);
  return res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
}

exports.resumo = async (req, res) => {
  try {
    const resumo = await treasuryService.resumoArmazem(req.params.id, req.personagemAtual.id);
    return res.status(200).json({ status: "success", data: resumo });
  } catch (error) {
    tratarErro(res, error, "Erro ao buscar resumo do Tesouro:");
  }
};

exports.depositarItem = async (req, res) => {
  try {
    const { idItem, quantidade } = req.body;
    const resultado = await treasuryService.depositarItemStackavel(
      req.params.id,
      req.personagemAtual.id,
      idItem,
      quantidade,
    );
    return res.status(201).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro ao depositar item no Tesouro:");
  }
};

exports.retirarItem = async (req, res) => {
  try {
    const { idItem, quantidade } = req.body;
    const resultado = await treasuryService.retirarItemStackavel(
      req.params.id,
      req.personagemAtual.id,
      idItem,
      quantidade,
    );
    return res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro ao retirar item do Tesouro:");
  }
};

exports.depositarEquipamento = async (req, res) => {
  try {
    const { idInstancia } = req.body;
    const resultado = await treasuryService.depositarEquipamento(req.params.id, req.personagemAtual.id, idInstancia);
    return res.status(201).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro ao depositar equipamento no Tesouro:");
  }
};

exports.retirarEquipamento = async (req, res) => {
  try {
    const resultado = await treasuryService.retirarEquipamento(
      req.params.id,
      req.personagemAtual.id,
      req.params.instanceId,
    );
    return res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro ao retirar equipamento do Tesouro:");
  }
};

exports.historico = async (req, res) => {
  try {
    const { operation, idPersonagem, idItem, page, limit } = req.query;
    const resultado = await treasuryService.historicoMovimentacoes(req.params.id, {
      operation,
      idPersonagem,
      idItem,
      page,
      limit,
    });
    return res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro ao buscar histórico do Tesouro:");
  }
};
