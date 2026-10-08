// Evento "O Coração da Máquina Celestial" — Fase 1. Controller fino,
// delega tudo pros services (eventDefinitionService/eventEditionService/
// puzzleBlueprintService) — nenhuma regra de lifecycle/versionamento
// aqui. Mesmo padrão de adminCombatTypingRoutes.js (handle() genérico).
const { sequelize } = require("../config/database");
const eventDefinitionService = require("../services/eventDefinitionService");
const eventEditionService = require("../services/eventEditionService");
const puzzleBlueprintService = require("../services/puzzleBlueprintService");
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
