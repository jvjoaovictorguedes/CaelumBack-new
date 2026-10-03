// Painel Administrativo — Guilda. Controller fino, delega pra
// guildSettingsService (balanceamento) e adminGuildService (catálogos:
// Níveis/Boss/Missões), mesmo padrão de adminExpeditionController.
const guildSettingsService = require("../services/guildSettingsService");
const adminGuildService = require("../services/adminGuildService");
const monsterAbilityService = require("../services/monsterAbilityService");

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

// IA de Combate PvE & Habilidades de Monstros V1 (§7/§8.3) — mesmo
// padrão de PUT substitui a lista inteira já usado em adminAdventureController.
exports.listarAbilitiesDoBoss = async (req, res) => {
  try {
    const abilities = await monsterAbilityService.listarAbilitiesDoGuildBoss(Number(req.params.id));
    res.status(200).json({ status: "success", data: { abilities } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar as habilidades do Boss da Guilda.");
  }
};

exports.sincronizarAbilitiesDoBoss = async (req, res) => {
  try {
    const abilities = await monsterAbilityService.sincronizarAbilitiesGuildBoss(
      Number(req.params.id),
      req.body?.abilities ?? [],
      { idAdmin: req.user.id, req },
    );
    res.status(200).json({ status: "success", data: { abilities } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao sincronizar as habilidades do Boss da Guilda.");
  }
};
