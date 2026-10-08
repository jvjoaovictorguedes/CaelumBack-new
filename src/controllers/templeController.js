const { sequelize } = require("../config/database");
const templeStatusService = require("../services/templeStatusService");
const templeObjectiveService = require("../services/templeObjectiveService");
const templeRelicaryService = require("../services/templeRelicaryService");

// GET /api/temple/status — §13.1/§13.2. Sempre autenticado (nunca
// público como worldboss/status): "meus_sigilos" é por personagem, não
// faz sentido devolver o mesmo payload pra todo mundo.
exports.obterStatus = async (req, res) => {
  try {
    const status = await templeStatusService.obterStatusPublico(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: status });
  } catch (error) {
    console.error("Erro ao obter status do Templo:", error);
    res.status(500).json({ status: "error", message: "Não foi possível obter o status do Templo." });
  }
};

// GET /api/temple/missions — §13.2.
exports.listarMissoes = async (req, res) => {
  try {
    const missoes = await templeObjectiveService.listarMissoes(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: missoes });
  } catch (error) {
    console.error("Erro ao listar Provações do Templo:", error);
    res.status(500).json({ status: "error", message: "Não foi possível listar as Provações do Templo." });
  }
};

// POST /api/temple/missions/:key/deliver — §4.3, única rota que remove
// inventário (nunca passivo).
exports.entregarItem = async (req, res) => {
  try {
    await sequelize.transaction((transaction) =>
      templeObjectiveService.entregarItem(req.personagemAtual.id, req.params.key, transaction),
    );
    res.status(200).json({ status: "success", data: await templeObjectiveService.listarMissoes(req.personagemAtual.id) });
  } catch (error) {
    const statusCode = error.statusCode ?? 500;
    if (statusCode === 500) console.error("Erro ao entregar item no Templo:", error);
    res.status(statusCode).json({ status: "error", message: error.message || "Não foi possível entregar o item." });
  }
};

// POST /api/temple/missions/:key/claim — §5.2/§11.2.
exports.reclamarRecompensa = async (req, res) => {
  try {
    const resultado = await sequelize.transaction((transaction) =>
      templeObjectiveService.reclamarRecompensa(req.personagemAtual.id, req.params.key, transaction),
    );
    res.status(200).json({ status: "success", data: { sigilos_ganhos: resultado.sigilosGanhos } });
  } catch (error) {
    const statusCode = error.statusCode ?? 500;
    if (statusCode === 500) console.error("Erro ao reclamar recompensa do Templo:", error);
    res.status(statusCode).json({ status: "error", message: error.message || "Não foi possível reclamar a recompensa." });
  }
};

// GET /api/temple/relicary — §13.4.
exports.obterRelicario = async (req, res) => {
  try {
    const dados = await templeRelicaryService.obterRelicario(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    console.error("Erro ao obter o Relicário do Templo:", error);
    res.status(500).json({ status: "error", message: "Não foi possível obter o Relicário." });
  }
};

// POST /api/temple/relicary/draw — §6.1/§14.1. count (1|10) e
// client_request_id vêm do corpo; nunca aceitar um RNG ou resultado
// pré-calculado do cliente.
exports.sortearRelicario = async (req, res) => {
  try {
    const { count, client_request_id } = req.body;
    const resultado = await sequelize.transaction((transaction) =>
      templeRelicaryService.sortear(
        req.personagemAtual.id,
        { count: Number(count), clientRequestId: client_request_id },
        transaction,
      ),
    );
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    const statusCode = error.statusCode ?? 500;
    if (statusCode === 500) console.error("Erro ao sortear no Relicário do Templo:", error);
    res.status(statusCode).json({ status: "error", message: error.message || "Não foi possível sortear no Relicário." });
  }
};

// GET /api/temple/relicary/history — §13.4.
exports.listarHistoricoRelicario = async (req, res) => {
  try {
    const historico = await templeRelicaryService.listarHistorico(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { draws: historico } });
  } catch (error) {
    console.error("Erro ao listar histórico do Relicário:", error);
    res.status(500).json({ status: "error", message: "Não foi possível listar o histórico do Relicário." });
  }
};
