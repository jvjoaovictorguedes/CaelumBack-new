const worldBossCombatService = require("../services/worldBossCombatService");

function responderErro(res, error) {
  const statusCode = error.statusCode ?? 500;
  if (statusCode >= 500) console.error("Erro no combate contra a Ameaça Mundial:", error);
  res.status(statusCode).json({ status: "error", message: error.message ?? "Não foi possível processar a ação." });
}

exports.entrar = async (req, res) => {
  try {
    const resultado = await worldBossCombatService.entrar(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    responderErro(res, error);
  }
};

exports.sair = async (req, res) => {
  try {
    const resultado = await worldBossCombatService.sair(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    responderErro(res, error);
  }
};

exports.acao = async (req, res) => {
  try {
    const { tipo, idPoder } = req.body ?? {};
    const resultado = await worldBossCombatService.executarAcao(req.personagemAtual.id, { tipo, idPoder });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    responderErro(res, error);
  }
};
