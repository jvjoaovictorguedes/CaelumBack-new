// Painel Administrativo Fase 9 — controller fino dos três catálogos de
// missão (livres, Guilda dos Aventureiros, Guilda).
const adminMissionService = require("../services/adminMissionService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

// Missões livres
exports.listarMissoesLivres = async (req, res) => {
  try {
    const { tipo, categoria, ativa } = req.query;
    const missoes = await adminMissionService.listAdminMissions({ tipo, categoria, ativa });
    res.status(200).json({ status: "success", data: { missoes } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar missões.");
  }
};
exports.criarMissaoLivre = async (req, res) => {
  try {
    const missao = await adminMissionService.createAdminMission(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { missao } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar missão.");
  }
};
exports.atualizarMissaoLivre = async (req, res) => {
  try {
    const missao = await adminMissionService.updateAdminMission(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { missao } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar missão.");
  }
};
exports.duplicarMissaoLivre = async (req, res) => {
  try {
    const missao = await adminMissionService.duplicateAdminMission(req.params.id, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { missao } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao duplicar missão.");
  }
};

// Guilda dos Aventureiros
exports.listarMissoesGuildaAventureiros = async (req, res) => {
  try {
    const { rank, ativa, eh_provacao } = req.query;
    const missoes = await adminMissionService.listAdminAdventureGuildMissions({ rank, ativa, eh_provacao });
    res.status(200).json({ status: "success", data: { missoes } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar contratos.");
  }
};
exports.criarMissaoGuildaAventureiros = async (req, res) => {
  try {
    const missao = await adminMissionService.createAdminAdventureGuildMission(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { missao } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar contrato.");
  }
};
exports.atualizarMissaoGuildaAventureiros = async (req, res) => {
  try {
    const missao = await adminMissionService.updateAdminAdventureGuildMission(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { missao } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar contrato.");
  }
};
exports.duplicarMissaoGuildaAventureiros = async (req, res) => {
  try {
    const missao = await adminMissionService.duplicateAdminAdventureGuildMission(req.params.id, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { missao } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao duplicar contrato.");
  }
};
exports.adicionarRecompensaGuildaAventureiros = async (req, res) => {
  try {
    const recompensa = await adminMissionService.addAdventureGuildMissionReward(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { recompensa } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao adicionar recompensa.");
  }
};
exports.removerRecompensaGuildaAventureiros = async (req, res) => {
  try {
    const resultado = await adminMissionService.removeAdventureGuildMissionReward(req.params.idRecompensa, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao remover recompensa.");
  }
};

// Missões de Guilda
exports.listarMissoesGuilda = async (req, res) => {
  try {
    const { categoria, rank, ativa } = req.query;
    const missoes = await adminMissionService.listAdminGuildMissions({ categoria, rank, ativa });
    res.status(200).json({ status: "success", data: { missoes } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar missões de guilda.");
  }
};
exports.criarMissaoGuilda = async (req, res) => {
  try {
    const missao = await adminMissionService.createAdminGuildMission(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { missao } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar missão de guilda.");
  }
};
exports.atualizarMissaoGuilda = async (req, res) => {
  try {
    const missao = await adminMissionService.updateAdminGuildMission(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { missao } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar missão de guilda.");
  }
};
exports.duplicarMissaoGuilda = async (req, res) => {
  try {
    const missao = await adminMissionService.duplicateAdminGuildMission(req.params.id, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { missao } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao duplicar missão de guilda.");
  }
};

// Catálogos (enums/ranks) pro frontend montar selects sem hardcode.
exports.catalogos = async (req, res) => {
  res.status(200).json({
    status: "success",
    data: {
      tiposMissaoLivre: adminMissionService.TIPOS_MISSAO_LIVRE,
      categoriasMissaoLivre: adminMissionService.CATEGORIAS_MISSAO_LIVRE,
      tiposObjetivoGuildaAventureiros: adminMissionService.TIPOS_OBJETIVO_GUILDA_AVENTUREIROS,
      ranksAventureiros: adminMissionService.RANKS_AVENTUREIRO,
      tiposObjetivoMissaoGuilda: adminMissionService.TIPOS_OBJETIVO_MISSAO_GUILDA,
      categoriasMissaoGuilda: adminMissionService.CATEGORIAS_MISSAO_GUILDA,
      ranksGuilda: adminMissionService.RANKS_GUILDA,
    },
  });
};
