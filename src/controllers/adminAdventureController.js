// Painel Administrativo Fase 8 (§19) — controller fino, delega pro
// adminAdventureService.
const adminAdventureService = require("../services/adminAdventureService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

// Zonas
exports.listarZonas = async (req, res) => {
  try {
    const zonas = await adminAdventureService.listAdminZones();
    res.status(200).json({ status: "success", data: { zonas } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar zonas.");
  }
};

exports.criarZona = async (req, res) => {
  try {
    const zona = await adminAdventureService.createAdminZone(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { zona } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar zona.");
  }
};

exports.atualizarZona = async (req, res) => {
  try {
    const zona = await adminAdventureService.updateAdminZone(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { zona } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar zona.");
  }
};

// Monstros
exports.listarMonstros = async (req, res) => {
  try {
    const monstros = await adminAdventureService.listAdminMonsters();
    res.status(200).json({ status: "success", data: { monstros } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar monstros.");
  }
};

exports.criarMonstro = async (req, res) => {
  try {
    const monstro = await adminAdventureService.createAdminMonster(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { monstro } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar monstro.");
  }
};

exports.atualizarMonstro = async (req, res) => {
  try {
    const { balanceContext, ...payload } = req.body ?? {};
    const monstro = await adminAdventureService.updateAdminMonster(req.params.id, payload, {
      idAdmin: req.user.id,
      req,
      balanceContext: balanceContext ?? null,
    });
    res.status(200).json({ status: "success", data: { monstro } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar monstro.");
  }
};

// Editor de Balanceamento de Monstros por Resultado (§9/§10) — preview
// e simulação NUNCA alteram o AdventureMonster; só a rota de update
// acima (reaproveitada) persiste.
exports.previewBalanceamento = async (req, res) => {
  try {
    const preview = await adminAdventureService.previewMonsterBalance(req.params.id, req.body ?? {});
    res.status(200).json({ status: "success", data: preview });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao calcular preview de balanceamento.");
  }
};

exports.simularBalanceamento = async (req, res) => {
  try {
    const simulacao = await adminAdventureService.simulateMonsterBalance(req.params.id, req.body ?? {});
    res.status(200).json({ status: "success", data: simulacao });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao simular combates.");
  }
};

exports.listarPresetsBalanceamento = async (req, res) => {
  try {
    const presets = adminAdventureService.listarPresetsDeBalanceamento();
    const perfis = adminAdventureService.listarPerfisSinteticos();
    res.status(200).json({ status: "success", data: { presets, perfis } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar presets.");
  }
};

exports.duplicarMonstro = async (req, res) => {
  try {
    const monstro = await adminAdventureService.duplicateAdminMonster(req.params.id, {
      idAdmin: req.user.id,
      req,
    });
    res.status(201).json({ status: "success", data: { monstro } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao duplicar monstro.");
  }
};

// Aparições (zona <-> monstro)
exports.listarAparicoes = async (req, res) => {
  try {
    const { idArea } = req.query;
    const aparicoes = await adminAdventureService.listAdminZoneMonsters({
      idArea: idArea ? Number(idArea) : undefined,
    });
    res.status(200).json({ status: "success", data: { aparicoes } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar aparições.");
  }
};

exports.criarAparicao = async (req, res) => {
  try {
    const aparicao = await adminAdventureService.createAdminZoneMonster(req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(201).json({ status: "success", data: { aparicao } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar aparição.");
  }
};

exports.atualizarAparicao = async (req, res) => {
  try {
    const aparicao = await adminAdventureService.updateAdminZoneMonster(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { aparicao } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar aparição.");
  }
};

// Drops (loot por monstro)
exports.listarLoot = async (req, res) => {
  try {
    const { idMonstro } = req.query;
    const loot = await adminAdventureService.listAdminMonsterLoot({
      idMonstro: idMonstro ? Number(idMonstro) : undefined,
    });
    res.status(200).json({ status: "success", data: { loot } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar drops.");
  }
};

exports.criarLoot = async (req, res) => {
  try {
    const loot = await adminAdventureService.createAdminMonsterLoot(req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(201).json({ status: "success", data: { loot } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar drop.");
  }
};

exports.atualizarLoot = async (req, res) => {
  try {
    const loot = await adminAdventureService.updateAdminMonsterLoot(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { loot } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar drop.");
  }
};
