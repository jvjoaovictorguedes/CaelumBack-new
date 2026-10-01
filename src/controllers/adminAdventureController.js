// Painel Administrativo Fase 8 (§19) — controller fino, delega pro
// adminAdventureService.
const adminAdventureService = require("../services/adminAdventureService");
const adventureBalanceSimulationService = require("../services/adventureBalanceSimulationService");

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
    const monstro = await adminAdventureService.updateAdminMonster(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { monstro } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar monstro.");
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

exports.excluirMonstro = async (req, res) => {
  try {
    const resultado = await adminAdventureService.deleteAdminMonster(req.params.id, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir monstro.");
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
    const { idMonstro, idItem } = req.query;
    const loot = await adminAdventureService.listAdminMonsterLoot({
      idMonstro: idMonstro ? Number(idMonstro) : undefined,
      idItem: idItem ? Number(idItem) : undefined,
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

exports.excluirLoot = async (req, res) => {
  try {
    const resultado = await adminAdventureService.deleteAdminMonsterLoot(req.params.id, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir drop.");
  }
};

// Endpoints agregados (Especificação "Admin de Aventura + Defesa/Poder
// de Monstros" v3 §2.4/§4.2/§7.3) — ZoneEditor/MonsterEditor usam
// estes em vez de um PATCH por linha.
exports.sincronizarRosterZona = async (req, res) => {
  try {
    const roster = await adminAdventureService.sincronizarRosterZona(req.params.id, req.body?.monsters ?? [], {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { roster } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao sincronizar o elenco da zona.");
  }
};

exports.sincronizarLootMonstro = async (req, res) => {
  try {
    const loot = await adminAdventureService.sincronizarLootMonstro(req.params.id, req.body?.loot ?? [], {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { loot } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao sincronizar os drops do monstro.");
  }
};

exports.sincronizarStatusEffectsMonstro = async (req, res) => {
  try {
    const efeitos = await adminAdventureService.sincronizarStatusEffectsMonstro(
      req.params.id,
      req.body?.efeitos ?? [],
      { idAdmin: req.user.id, req },
    );
    res.status(200).json({ status: "success", data: { efeitos } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao sincronizar os efeitos de status do monstro.");
  }
};

exports.detalheMonstro = async (req, res) => {
  try {
    const detalhe = await adminAdventureService.getAdminMonsterDetail(req.params.id);
    res.status(200).json({ status: "success", data: detalhe });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao buscar detalhe do monstro.");
  }
};

// Simulador de Balanceamento — ver adventureBalanceSimulationService.js.
// modo "zona" (default, retrocompatível) | "expedicao" | "grupo".
exports.simularBalanceamento = async (req, res) => {
  try {
    const { modo, id_personagem, id_monstro, id_regiao_expedicao, tamanho_grupo, quantidade } = req.body ?? {};
    const resultado = await adventureBalanceSimulationService.simularBalanceamento({
      modo,
      idPersonagem: id_personagem,
      idMonstro: id_monstro,
      idRegiaoExpedicao: id_regiao_expedicao,
      tamanhoGrupo: tamanho_grupo,
      quantidade,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao simular combates.");
  }
};

// Dropdown de região pro modo "expedicao" do simulador — mesmo catálogo
// que o jogador vê em GET /expeditions/regions, só que sem depender de
// nível/profissão de nenhum personagem específico.
exports.listarRegioesExpedicao = async (req, res) => {
  try {
    const regioes = await adminAdventureService.listExpeditionRegions();
    res.status(200).json({ status: "success", data: { regioes } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar regiões de expedição.");
  }
};
