// Painel Administrativo — Guilda. Controller fino, delega pra
// guildSettingsService (balanceamento) e adminGuildService (catálogos:
// Níveis/Boss/Missões), mesmo padrão de adminExpeditionController.
const guildSettingsService = require("../services/guildSettingsService");
const adminGuildService = require("../services/adminGuildService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

// -------------------------------------------------------- BALANCEAMENTO
exports.obterBalanceamento = async (req, res) => {
  try {
    const resultado = await guildSettingsService.getBalanceamentoCompleto();
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao carregar o balanceamento.");
  }
};

exports.atualizarBalanceamento = async (req, res) => {
  try {
    const resultado = await guildSettingsService.updateBalanceamento(req.params.group, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao salvar o balanceamento.");
  }
};

// ------------------------------------------------------------ NÍVEIS
exports.listarNiveis = async (req, res) => {
  try {
    const niveis = await adminGuildService.listarNiveis();
    res.status(200).json({ status: "success", data: niveis });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar níveis de guilda.");
  }
};

exports.upsertNivel = async (req, res) => {
  try {
    const nivel = await adminGuildService.upsertNivel(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: nivel });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao salvar nível de guilda.");
  }
};

// -------------------------------------------------------- BOSS DA GUILDA
exports.listarBosses = async (req, res) => {
  try {
    const bosses = await adminGuildService.listarBosses();
    res.status(200).json({ status: "success", data: bosses });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar bosses de guilda.");
  }
};

exports.criarBoss = async (req, res) => {
  try {
    const boss = await adminGuildService.criarBoss(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: boss });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar boss de guilda.");
  }
};

exports.atualizarBoss = async (req, res) => {
  try {
    const boss = await adminGuildService.atualizarBoss(Number(req.params.id), req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: boss });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar boss de guilda.");
  }
};

// ------------------------------------------------ HABILIDADES DO BOSS
exports.listarHabilidadesBoss = async (req, res) => {
  try {
    const habilidades = await adminGuildService.listarHabilidadesBoss(req.params.id ? Number(req.params.id) : undefined);
    res.status(200).json({ status: "success", data: habilidades });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar habilidades do boss de guilda.");
  }
};

exports.criarHabilidadeBoss = async (req, res) => {
  try {
    const habilidade = await adminGuildService.criarHabilidadeBoss(Number(req.params.id), req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(201).json({ status: "success", data: habilidade });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar habilidade do boss de guilda.");
  }
};

exports.atualizarHabilidadeBoss = async (req, res) => {
  try {
    const habilidade = await adminGuildService.atualizarHabilidadeBoss(Number(req.params.idHabilidade), req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: habilidade });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar habilidade do boss de guilda.");
  }
};

exports.excluirHabilidadeBoss = async (req, res) => {
  try {
    const resultado = await adminGuildService.excluirHabilidadeBoss(Number(req.params.idHabilidade), {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir habilidade do boss de guilda.");
  }
};
