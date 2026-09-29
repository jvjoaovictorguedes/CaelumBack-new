// Painel Administrativo — Boss Global (catálogo) — controller fino,
// delega tudo pro adminWorldBossService.
const adminWorldBossService = require("../services/adminWorldBossService");
const worldBossBalanceSimulationService = require("../services/worldBossBalanceSimulationService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listar = async (req, res) => {
  try {
    const { pagina, porPagina, ativo, nome } = req.query;
    const resultado = await adminWorldBossService.listAdminWorldBossConfigs({
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      ativo,
      nome,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar catálogo de Ameaças Mundiais.");
  }
};

exports.obter = async (req, res) => {
  try {
    const config = await adminWorldBossService.getAdminWorldBossConfig(req.params.id);
    res.status(200).json({ status: "success", data: { config } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao obter a Ameaça Mundial.");
  }
};

exports.criar = async (req, res) => {
  try {
    const config = await adminWorldBossService.createAdminWorldBossConfig(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { config } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar Ameaça Mundial.");
  }
};

exports.atualizar = async (req, res) => {
  try {
    const config = await adminWorldBossService.updateAdminWorldBossConfig(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { config } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar Ameaça Mundial.");
  }
};

exports.duplicar = async (req, res) => {
  try {
    const config = await adminWorldBossService.duplicateAdminWorldBossConfig(req.params.id, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { config } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao duplicar Ameaça Mundial.");
  }
};

exports.desativar = async (req, res) => {
  try {
    const config = await adminWorldBossService.setAtivoAdminWorldBossConfig(req.params.id, false, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { config } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao desativar Ameaça Mundial.");
  }
};

exports.reativar = async (req, res) => {
  try {
    const config = await adminWorldBossService.setAtivoAdminWorldBossConfig(req.params.id, true, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { config } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao reativar Ameaça Mundial.");
  }
};

exports.obterConfiguracoes = async (req, res) => {
  try {
    const settings = await adminWorldBossService.getAdminWorldBossSettings();
    res.status(200).json({ status: "success", data: { settings } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao obter configurações.");
  }
};

exports.atualizarConfiguracoes = async (req, res) => {
  try {
    const settings = await adminWorldBossService.updateAdminWorldBossSettings(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { settings } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar configurações.");
  }
};

exports.metricas = async (req, res) => {
  try {
    const metricas = await adminWorldBossService.getAdminWorldBossMetrics();
    res.status(200).json({ status: "success", data: metricas });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao obter métricas.");
  }
};

// Ameaça Mundial V2 — Etapa 11 (§13.2/§13.5): Habilidades.
exports.listarHabilidades = async (req, res) => {
  try {
    const habilidades = await adminWorldBossService.listAdminWorldBossAbilities(req.params.id);
    res.status(200).json({ status: "success", data: { habilidades } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar habilidades.");
  }
};

exports.criarHabilidade = async (req, res) => {
  try {
    const habilidade = await adminWorldBossService.createAdminWorldBossAbility(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { habilidade } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar habilidade.");
  }
};

exports.atualizarHabilidade = async (req, res) => {
  try {
    const habilidade = await adminWorldBossService.updateAdminWorldBossAbility(req.params.id, req.params.idHabilidade, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { habilidade } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar habilidade.");
  }
};

exports.excluirHabilidade = async (req, res) => {
  try {
    await adminWorldBossService.deleteAdminWorldBossAbility(req.params.id, req.params.idHabilidade, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success" });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir habilidade.");
  }
};

// Resistências (§7.1/§13.2).
exports.listarResistencias = async (req, res) => {
  try {
    const resistencias = await adminWorldBossService.listAdminWorldBossResistances(req.params.id);
    res.status(200).json({ status: "success", data: { resistencias } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar resistências.");
  }
};

exports.criarResistencia = async (req, res) => {
  try {
    const resistencia = await adminWorldBossService.createAdminWorldBossResistance(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { resistencia } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar resistência.");
  }
};

exports.atualizarResistencia = async (req, res) => {
  try {
    const resistencia = await adminWorldBossService.updateAdminWorldBossResistance(req.params.id, req.params.idResistencia, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { resistencia } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar resistência.");
  }
};

exports.excluirResistencia = async (req, res) => {
  try {
    await adminWorldBossService.deleteAdminWorldBossResistance(req.params.id, req.params.idResistencia, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success" });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir resistência.");
  }
};

// Recompensas de ranking (§11.3/§13.6).
exports.listarRecompensasRanking = async (req, res) => {
  try {
    const recompensas = await adminWorldBossService.listAdminWorldBossRankingRewards(req.params.id);
    res.status(200).json({ status: "success", data: { recompensas } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar recompensas de ranking.");
  }
};

exports.criarRecompensaRanking = async (req, res) => {
  try {
    const recompensa = await adminWorldBossService.createAdminWorldBossRankingReward(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { recompensa } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar recompensa de ranking.");
  }
};

exports.atualizarRecompensaRanking = async (req, res) => {
  try {
    const recompensa = await adminWorldBossService.updateAdminWorldBossRankingReward(req.params.id, req.params.idRecompensa, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { recompensa } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar recompensa de ranking.");
  }
};

exports.excluirRecompensaRanking = async (req, res) => {
  try {
    await adminWorldBossService.deleteAdminWorldBossRankingReward(req.params.id, req.params.idRecompensa, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success" });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir recompensa de ranking.");
  }
};

// Preview de dano server-side (§13.4).
exports.previewDano = async (req, res) => {
  try {
    const { faseOrdem, acoes } = req.body ?? {};
    const preview = await adminWorldBossService.previewDanoAdminWorldBoss(req.params.id, { faseOrdem, acoes });
    res.status(200).json({ status: "success", data: preview });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao calcular preview de dano.");
  }
};

// Preview de dano/cura de uma habilidade específica (§13.5).
exports.previewHabilidade = async (req, res) => {
  try {
    const { idAbility, faseOrdem, acoes } = req.body ?? {};
    const preview = await adminWorldBossService.previewHabilidadeAdminWorldBoss(req.params.id, { idAbility, faseOrdem, acoes });
    res.status(200).json({ status: "success", data: preview });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao calcular preview de habilidade.");
  }
};

// Simulador de balanceamento (§14.2).
exports.simularBalanceamento = async (req, res) => {
  try {
    const resultado = await worldBossBalanceSimulationService.simularBalanceamentoWorldBossAdmin(req.params.id, req.body ?? {});
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao simular o balanceamento.");
  }
};
