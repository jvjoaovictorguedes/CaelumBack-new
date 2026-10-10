// Evento "O Coração da Máquina Celestial" — Fase 1. Controller fino,
// delega tudo pros services (eventDefinitionService/eventEditionService/
// puzzleBlueprintService) — nenhuma regra de lifecycle/versionamento
// aqui. Mesmo padrão de adminCombatTypingRoutes.js (handle() genérico).
const { sequelize } = require("../config/database");
const eventDefinitionService = require("../services/eventDefinitionService");
const eventEditionService = require("../services/eventEditionService");
const puzzleBlueprintService = require("../services/puzzleBlueprintService");
const puzzleClueService = require("../services/puzzleClueService");
const puzzlePioneerService = require("../services/puzzlePioneerService");
const puzzleRewardService = require("../services/puzzleRewardService");
const eventPuzzleBossAdminService = require("../services/eventPuzzleBossAdminService");
const { registrarAcao } = require("../services/adminAuditService");

function tratarErro(res, error, mensagemLog) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemLog, error);
  return res.status(statusCode).json({
    message: error.statusCode ? error.message : "Erro interno do servidor.",
    ...(error.code ? { code: error.code } : {}),
  });
}

// ------------------------------------------------------ EventDefinition
exports.listarDefinicoes = async (req, res) => {
  try {
    const definicoes = await eventDefinitionService.listar();
    return res.json({ status: "success", data: definicoes.map(eventDefinitionService.dtoAdmin) });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar EventDefinitions:");
  }
};

exports.criarDefinicao = async (req, res) => {
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const definicao = await eventDefinitionService.criar(req.body, transaction);
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "criar",
        entidade: "EventDefinition",
        idEntidade: definicao.id,
        dadosDepois: definicao.toJSON(),
        req,
        transaction,
      });
      return definicao;
    });
    return res.status(201).json({ status: "success", data: eventDefinitionService.dtoAdmin(resultado) });
  } catch (error) {
    tratarErro(res, error, "Erro ao criar EventDefinition:");
  }
};

exports.transicionarDefinicao = async (req, res) => {
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const dadosAntes = (await eventDefinitionService.obterPorId(req.params.id, transaction)).toJSON();
      const definicao = await eventDefinitionService.transicionar(req.params.id, req.body.status, transaction);
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "transicionar",
        entidade: "EventDefinition",
        idEntidade: definicao.id,
        dadosAntes,
        dadosDepois: definicao.toJSON(),
        req,
        transaction,
      });
      return definicao;
    });
    return res.json({ status: "success", data: eventDefinitionService.dtoAdmin(resultado) });
  } catch (error) {
    tratarErro(res, error, "Erro ao transicionar EventDefinition:");
  }
};

// ---------------------------------------------------------- EventEdition
exports.listarEdicoes = async (req, res) => {
  try {
    const edicoes = await eventEditionService.listarPorDefinicao(req.params.id);
    return res.json({ status: "success", data: edicoes.map(eventEditionService.dtoAdmin) });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar EventEditions:");
  }
};

exports.criarEdicao = async (req, res) => {
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const edicao = await eventEditionService.criar(req.params.id, req.body, transaction);
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "criar",
        entidade: "EventEdition",
        idEntidade: edicao.id,
        dadosDepois: edicao.toJSON(),
        req,
        transaction,
      });
      return edicao;
    });
    return res.status(201).json({ status: "success", data: eventEditionService.dtoAdmin(resultado) });
  } catch (error) {
    tratarErro(res, error, "Erro ao criar EventEdition:");
  }
};

exports.transicionarEdicao = async (req, res) => {
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const dadosAntes = (await eventEditionService.obterPorId(req.params.id, transaction)).toJSON();
      const edicao = await eventEditionService.transicionar(req.params.id, req.body.status, transaction);
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "transicionar",
        entidade: "EventEdition",
        idEntidade: edicao.id,
        dadosAntes,
        dadosDepois: edicao.toJSON(),
        req,
        transaction,
      });
      return edicao;
    });
    return res.json({ status: "success", data: eventEditionService.dtoAdmin(resultado) });
  } catch (error) {
    tratarErro(res, error, "Erro ao transicionar EventEdition:");
  }
};

// ------------------------------------------------------- PuzzleBlueprint
exports.listarBlueprints = async (req, res) => {
  try {
    const blueprints = await puzzleBlueprintService.listarPorEventDefinition(req.params.id);
    return res.json({ status: "success", data: blueprints });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar PuzzleBlueprints:");
  }
};

exports.criarBlueprint = async (req, res) => {
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const { blueprint, versao } = await puzzleBlueprintService.criarBlueprint(req.params.id, req.body, transaction);
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "criar",
        entidade: "PuzzleBlueprint",
        idEntidade: blueprint.id,
        dadosDepois: blueprint.toJSON(),
        req,
        transaction,
      });
      return { blueprint, versao };
    });
    return res.status(201).json({
      status: "success",
      data: { blueprint: resultado.blueprint, versao: puzzleBlueprintService.dtoAdminVersao(resultado.versao) },
    });
  } catch (error) {
    tratarErro(res, error, "Erro ao criar PuzzleBlueprint:");
  }
};

exports.listarVersoes = async (req, res) => {
  try {
    const versoes = await puzzleBlueprintService.listarVersoes(req.params.id);
    return res.json({ status: "success", data: versoes.map(puzzleBlueprintService.dtoAdminVersao) });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar PuzzleBlueprintVersions:");
  }
};

exports.criarVersao = async (req, res) => {
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const versao = await puzzleBlueprintService.criarNovaVersao(req.params.id, req.body, transaction);
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "criar",
        entidade: "PuzzleBlueprintVersion",
        idEntidade: versao.id,
        dadosDepois: versao.toJSON(),
        req,
        transaction,
      });
      return versao;
    });
    return res.status(201).json({ status: "success", data: puzzleBlueprintService.dtoAdminVersao(resultado) });
  } catch (error) {
    tratarErro(res, error, "Erro ao criar PuzzleBlueprintVersion:");
  }
};

exports.atualizarVersao = async (req, res) => {
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const dadosAntes = (await puzzleBlueprintService.obterVersaoPorId(req.params.versionId, transaction)).toJSON();
      const versao = await puzzleBlueprintService.atualizarDraft(req.params.versionId, req.body, transaction);
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "editar",
        entidade: "PuzzleBlueprintVersion",
        idEntidade: versao.id,
        dadosAntes,
        dadosDepois: versao.toJSON(),
        req,
        transaction,
      });
      return versao;
    });
    return res.json({ status: "success", data: puzzleBlueprintService.dtoAdminVersao(resultado) });
  } catch (error) {
    tratarErro(res, error, "Erro ao editar PuzzleBlueprintVersion:");
  }
};

// --------------------------------------------- PuzzleClueDefinition (Fase 9)
exports.listarPistas = async (req, res) => {
  try {
    const pistas = await puzzleClueService.listarDefinicoesAdmin(req.params.id);
    return res.json({ status: "success", data: pistas.map(puzzleClueService.dtoAdmin) });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar pistas:");
  }
};

exports.criarPista = async (req, res) => {
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const pista = await puzzleClueService.criarDefinicao(req.params.id, req.body, transaction);
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "criar",
        entidade: "PuzzleClueDefinition",
        idEntidade: pista.id,
        dadosDepois: pista.toJSON(),
        req,
        transaction,
      });
      return pista;
    });
    return res.status(201).json({ status: "success", data: puzzleClueService.dtoAdmin(resultado) });
  } catch (error) {
    tratarErro(res, error, "Erro ao criar pista:");
  }
};

// ------------------------------------------- PuzzlePioneerMilestone (Fase 10)
exports.listarMarcos = async (req, res) => {
  try {
    const marcos = await puzzlePioneerService.listarMilestonesAdmin(req.params.id);
    return res.json({ status: "success", data: marcos.map(puzzlePioneerService.dtoAdmin) });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar marcos Pioneer:");
  }
};

exports.criarMarco = async (req, res) => {
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const marco = await puzzlePioneerService.criarMilestone(req.params.id, req.body, transaction);
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "criar",
        entidade: "PuzzlePioneerMilestone",
        idEntidade: marco.id,
        dadosDepois: marco.toJSON(),
        req,
        transaction,
      });
      return marco;
    });
    return res.status(201).json({ status: "success", data: puzzlePioneerService.dtoAdmin(resultado) });
  } catch (error) {
    tratarErro(res, error, "Erro ao criar marco Pioneer:");
  }
};

// Fase 15 — editar nome/descrição/ordem/pré-requisito da identidade do
// Blueprint (nunca o config, que é por Version — ver atualizarVersao).
exports.atualizarBlueprint = async (req, res) => {
  try {
    const { PuzzleBlueprint } = require("../models/eventPuzzleModels");
    const resultado = await sequelize.transaction(async (transaction) => {
      const antes = await PuzzleBlueprint.findByPk(req.params.id, { transaction });
      if (!antes) throw Object.assign(new Error("Blueprint não encontrado."), { statusCode: 404 });
      const dadosAntes = antes.toJSON();
      const blueprint = await puzzleBlueprintService.atualizarBlueprint(req.params.id, req.body, transaction);
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "editar",
        entidade: "PuzzleBlueprint",
        idEntidade: blueprint.id,
        dadosAntes,
        dadosDepois: blueprint.toJSON(),
        req,
        transaction,
      });
      return blueprint;
    });
    return res.json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro ao editar PuzzleBlueprint:");
  }
};

exports.transicionarVersao = async (req, res) => {
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const dadosAntes = (await puzzleBlueprintService.obterVersaoPorId(req.params.versionId, transaction)).toJSON();
      const versao = await puzzleBlueprintService.transicionar(
        req.params.versionId,
        req.body.status,
        { idAdmin: req.user.id },
        transaction,
      );
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "transicionar",
        entidade: "PuzzleBlueprintVersion",
        idEntidade: versao.id,
        dadosAntes,
        dadosDepois: versao.toJSON(),
        req,
        transaction,
      });
      return versao;
    });
    return res.json({ status: "success", data: puzzleBlueprintService.dtoAdminVersao(resultado) });
  } catch (error) {
    tratarErro(res, error, "Erro ao transicionar PuzzleBlueprintVersion:");
  }
};

// Fase 15 — dry-run de solvabilidade. Nunca um solver automático: o
// Admin submete `{ acoes: [...] }` (a golden solution candidata) e a
// função simula exatamente o que o jogador faria, passo a passo,
// reportando o ponto exato de falha ou confirmando que resolve.
exports.validarSolvabilidade = async (req, res) => {
  try {
    const resultado = await puzzleBlueprintService.validarSolvabilidade(req.params.versionId, req.body);
    await registrarAcao({
      idAdmin: req.user.id,
      acao: "validar_solvabilidade",
      entidade: "PuzzleBlueprintVersion",
      idEntidade: Number(req.params.versionId),
      dadosDepois: { valido: resultado.valido, etapa: resultado.etapa ?? null },
      req,
    });
    return res.json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro ao validar solvabilidade:");
  }
};

// ----------------------------------------- PuzzleClueDefinition (edição/exclusão)
exports.atualizarPista = async (req, res) => {
  try {
    const { PuzzleClueDefinition } = require("../models/eventPuzzleModels");
    const resultado = await sequelize.transaction(async (transaction) => {
      const antes = await PuzzleClueDefinition.findByPk(req.params.id, { transaction });
      if (!antes) throw Object.assign(new Error("Pista não encontrada."), { statusCode: 404 });
      const dadosAntes = antes.toJSON();
      const pista = await puzzleClueService.atualizarDefinicao(req.params.id, req.body, transaction);
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "editar",
        entidade: "PuzzleClueDefinition",
        idEntidade: pista.id,
        dadosAntes,
        dadosDepois: pista.toJSON(),
        req,
        transaction,
      });
      return pista;
    });
    return res.json({ status: "success", data: puzzleClueService.dtoAdmin(resultado) });
  } catch (error) {
    tratarErro(res, error, "Erro ao editar pista:");
  }
};

exports.excluirPista = async (req, res) => {
  try {
    await sequelize.transaction(async (transaction) => {
      const { PuzzleClueDefinition } = require("../models/eventPuzzleModels");
      const antes = await PuzzleClueDefinition.findByPk(req.params.id, { transaction });
      await puzzleClueService.excluirDefinicao(req.params.id, transaction);
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "excluir",
        entidade: "PuzzleClueDefinition",
        idEntidade: Number(req.params.id),
        dadosAntes: antes ? antes.toJSON() : null,
        req,
        transaction,
      });
    });
    return res.json({ status: "success", data: { excluida: true } });
  } catch (error) {
    tratarErro(res, error, "Erro ao excluir pista:");
  }
};

// ------------------------------------- PuzzlePioneerMilestone (edição/exclusão)
exports.atualizarMarco = async (req, res) => {
  try {
    const { PuzzlePioneerMilestone } = require("../models/eventPuzzleModels");
    const resultado = await sequelize.transaction(async (transaction) => {
      const antes = await PuzzlePioneerMilestone.findByPk(req.params.id, { transaction });
      if (!antes) throw Object.assign(new Error("Marco não encontrado."), { statusCode: 404 });
      const dadosAntes = antes.toJSON();
      const marco = await puzzlePioneerService.atualizarMilestone(req.params.id, req.body, transaction);
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "editar",
        entidade: "PuzzlePioneerMilestone",
        idEntidade: marco.id,
        dadosAntes,
        dadosDepois: marco.toJSON(),
        req,
        transaction,
      });
      return marco;
    });
    return res.json({ status: "success", data: puzzlePioneerService.dtoAdmin(resultado) });
  } catch (error) {
    tratarErro(res, error, "Erro ao editar marco Pioneer:");
  }
};

exports.excluirMarco = async (req, res) => {
  try {
    const { PuzzlePioneerMilestone } = require("../models/eventPuzzleModels");
    await sequelize.transaction(async (transaction) => {
      const antes = await PuzzlePioneerMilestone.findByPk(req.params.id, { transaction });
      await puzzlePioneerService.excluirMilestone(req.params.id, transaction);
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "excluir",
        entidade: "PuzzlePioneerMilestone",
        idEntidade: Number(req.params.id),
        dadosAntes: antes ? antes.toJSON() : null,
        req,
        transaction,
      });
    });
    return res.json({ status: "success", data: { excluida: true } });
  } catch (error) {
    tratarErro(res, error, "Erro ao excluir marco Pioneer:");
  }
};

// ------------------------------------------- PuzzleRewardDefinition (Fase 14)
exports.listarRecompensas = async (req, res) => {
  try {
    const recompensas = await puzzleRewardService.listarDefinicoesAdmin(req.params.id);
    return res.json({ status: "success", data: recompensas.map(puzzleRewardService.dtoAdmin) });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar recompensas:");
  }
};

exports.criarRecompensa = async (req, res) => {
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const recompensa = await puzzleRewardService.criarDefinicao(req.params.id, req.body, transaction);
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "criar",
        entidade: "PuzzleRewardDefinition",
        idEntidade: recompensa.id,
        dadosDepois: recompensa.toJSON(),
        req,
        transaction,
      });
      return recompensa;
    });
    return res.status(201).json({ status: "success", data: puzzleRewardService.dtoAdmin(resultado) });
  } catch (error) {
    tratarErro(res, error, "Erro ao criar recompensa:");
  }
};

exports.atualizarRecompensa = async (req, res) => {
  try {
    const { PuzzleRewardDefinition } = require("../models/eventPuzzleRewardModels");
    const resultado = await sequelize.transaction(async (transaction) => {
      const antes = await PuzzleRewardDefinition.findByPk(req.params.id, { transaction });
      if (!antes) throw Object.assign(new Error("Recompensa não encontrada."), { statusCode: 404 });
      const dadosAntes = antes.toJSON();
      const recompensa = await puzzleRewardService.atualizarDefinicao(req.params.id, req.body, transaction);
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "editar",
        entidade: "PuzzleRewardDefinition",
        idEntidade: recompensa.id,
        dadosAntes,
        dadosDepois: recompensa.toJSON(),
        req,
        transaction,
      });
      return recompensa;
    });
    return res.json({ status: "success", data: puzzleRewardService.dtoAdmin(resultado) });
  } catch (error) {
    tratarErro(res, error, "Erro ao editar recompensa:");
  }
};

exports.excluirRecompensa = async (req, res) => {
  try {
    const { PuzzleRewardDefinition } = require("../models/eventPuzzleRewardModels");
    await sequelize.transaction(async (transaction) => {
      const antes = await PuzzleRewardDefinition.findByPk(req.params.id, { transaction });
      await puzzleRewardService.excluirDefinicao(req.params.id, transaction);
      await registrarAcao({
        idAdmin: req.user.id,
        acao: "excluir",
        entidade: "PuzzleRewardDefinition",
        idEntidade: Number(req.params.id),
        dadosAntes: antes ? antes.toJSON() : null,
        req,
        transaction,
      });
    });
    return res.json({ status: "success", data: { excluida: true } });
  } catch (error) {
    tratarErro(res, error, "Erro ao excluir recompensa:");
  }
};

// ---------------------------------------------- EventPuzzleBossConfig (Fase 13)
exports.obterBoss = async (req, res) => {
  try {
    const { config, fases, resistencias } = await eventPuzzleBossAdminService.obterConfigAdmin(req.params.id);
    return res.json({ status: "success", data: { config, fases, resistencias } });
  } catch (error) {
    tratarErro(res, error, "Erro ao obter Custódio do Meridiano:");
  }
};

exports.salvarBossConfig = async (req, res) => {
  try {
    const config = await eventPuzzleBossAdminService.salvarConfig(req.params.id, req.body, { idAdmin: req.user.id, req });
    return res.json({ status: "success", data: config });
  } catch (error) {
    tratarErro(res, error, "Erro ao salvar config do Custódio do Meridiano:");
  }
};

exports.criarBossFase = async (req, res) => {
  try {
    const fase = await eventPuzzleBossAdminService.criarFase(req.params.id, req.body, { idAdmin: req.user.id, req });
    return res.status(201).json({ status: "success", data: fase });
  } catch (error) {
    tratarErro(res, error, "Erro ao criar fase do Custódio:");
  }
};

exports.atualizarBossFase = async (req, res) => {
  try {
    const fase = await eventPuzzleBossAdminService.atualizarFase(req.params.id, req.params.idFase, req.body, { idAdmin: req.user.id, req });
    return res.json({ status: "success", data: fase });
  } catch (error) {
    tratarErro(res, error, "Erro ao editar fase do Custódio:");
  }
};

exports.excluirBossFase = async (req, res) => {
  try {
    const resultado = await eventPuzzleBossAdminService.excluirFase(req.params.id, req.params.idFase, { idAdmin: req.user.id, req });
    return res.json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro ao excluir fase do Custódio:");
  }
};

exports.criarBossResistencia = async (req, res) => {
  try {
    const resistencia = await eventPuzzleBossAdminService.criarResistencia(req.params.id, req.body, { idAdmin: req.user.id, req });
    return res.status(201).json({ status: "success", data: resistencia });
  } catch (error) {
    tratarErro(res, error, "Erro ao criar resistência do Custódio:");
  }
};

exports.atualizarBossResistencia = async (req, res) => {
  try {
    const resistencia = await eventPuzzleBossAdminService.atualizarResistencia(req.params.id, req.params.idResistencia, req.body, { idAdmin: req.user.id, req });
    return res.json({ status: "success", data: resistencia });
  } catch (error) {
    tratarErro(res, error, "Erro ao editar resistência do Custódio:");
  }
};

exports.excluirBossResistencia = async (req, res) => {
  try {
    const resultado = await eventPuzzleBossAdminService.excluirResistencia(req.params.id, req.params.idResistencia, { idAdmin: req.user.id, req });
    return res.json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro ao excluir resistência do Custódio:");
  }
};
