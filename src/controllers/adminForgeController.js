// Painel Administrativo da Forja — controller fino, delega tudo pro
// adminForgeService.
const adminForgeService = require("../services/adminForgeService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

// Blueprints
exports.listarBlueprints = async (req, res) => {
  try {
    const { pagina, porPagina, nome, categoria, tier, nivelMinimo, ativo, incompletos, ingredienteNaoResolvivel } = req.query;
    const resultado = await adminForgeService.listarBlueprintsAdmin({
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      nome,
      categoria,
      tier,
      nivelMinimo,
      ativo,
      incompletos,
      ingredienteNaoResolvivel,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar blueprints.");
  }
};

exports.obterBlueprint = async (req, res) => {
  try {
    const resultado = await adminForgeService.obterBlueprintAdmin(req.params.id);
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao carregar o blueprint.");
  }
};

exports.criarBlueprint = async (req, res) => {
  try {
    const blueprint = await adminForgeService.criarBlueprintAdmin(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { blueprint } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar o blueprint.");
  }
};

exports.atualizarBlueprint = async (req, res) => {
  try {
    const blueprint = await adminForgeService.atualizarBlueprintAdmin(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { blueprint } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar o blueprint.");
  }
};

exports.salvarOverrideRaridade = async (req, res) => {
  try {
    const override = await adminForgeService.salvarOverrideRaridadeAdmin(
      req.params.id,
      req.params.qualidade,
      req.body?.atributos ?? {},
      { idAdmin: req.user.id, req },
    );
    res.status(200).json({ status: "success", data: { override } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao salvar o override de raridade.");
  }
};

exports.removerOverrideRaridade = async (req, res) => {
  try {
    const resultado = await adminForgeService.removerOverrideRaridadeAdmin(req.params.id, req.params.qualidade, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao remover o override de raridade.");
  }
};

exports.duplicarBlueprint = async (req, res) => {
  try {
    const blueprint = await adminForgeService.duplicarBlueprintAdmin(req.params.id, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { blueprint } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao duplicar o blueprint.");
  }
};

exports.excluirBlueprint = async (req, res) => {
  try {
    const resultado = await adminForgeService.excluirBlueprintAdmin(req.params.id, { idAdmin: req.user.id, req, motivo: req.body?.motivo });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir o blueprint.");
  }
};

// Bug reportado: "FORJA - CORREÇÃO EXCLUA TODOS OS BLUEPRINTS
// EXISTENTES NA FORJA, ATIVOS OU INATIVOS".
exports.excluirTodosBlueprints = async (req, res) => {
  try {
    const resultado = await adminForgeService.excluirTodosBlueprintsAdmin({ idAdmin: req.user.id, req, motivo: req.body?.motivo });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir todos os blueprints.");
  }
};

exports.validarBlueprint = async (req, res) => {
  try {
    const resultado = await adminForgeService.validarBlueprintAdmin(req.params.id);
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao validar o blueprint.");
  }
};

exports.ativarBlueprint = async (req, res) => {
  try {
    const blueprint = await adminForgeService.setAtivoBlueprintAdmin(req.params.id, true, { idAdmin: req.user.id, req, motivo: req.body?.motivo });
    res.status(200).json({ status: "success", data: { blueprint } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao ativar o blueprint.");
  }
};

exports.desativarBlueprint = async (req, res) => {
  try {
    const blueprint = await adminForgeService.setAtivoBlueprintAdmin(req.params.id, false, { idAdmin: req.user.id, req, motivo: req.body?.motivo });
    res.status(200).json({ status: "success", data: { blueprint } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao desativar o blueprint.");
  }
};

exports.previewBlueprint = async (req, res) => {
  try {
    const { nivelForja, qualidadeBase } = req.query;
    const resultado = await adminForgeService.previewBlueprintAdmin(req.params.id, {
      nivelForja: nivelForja ? Number(nivelForja) : undefined,
      qualidadeBase,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao montar o preview.");
  }
};

// Barras
exports.listarBarras = async (req, res) => {
  try {
    const resultado = await adminForgeService.listarBarrasAdmin();
    res.status(200).json({ status: "success", data: { recursos: resultado } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar barras.");
  }
};

exports.upsertBarra = async (req, res) => {
  try {
    const resultado = await adminForgeService.upsertBarraAdmin(
      Number(req.params.resourceId),
      req.params.quality,
      req.body?.id_item,
      { idAdmin: req.user.id, req },
    );
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao salvar o mapeamento de barra.");
  }
};

exports.removerBarra = async (req, res) => {
  try {
    const resultado = await adminForgeService.removerBarraAdmin(Number(req.params.resourceId), req.params.quality, {
      idAdmin: req.user.id,
      req,
      confirmar: req.body?.confirmar,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao remover o mapeamento de barra.");
  }
};

// Pergaminhos
exports.listarScrolls = async (req, res) => {
  try {
    const resultado = await adminForgeService.listarScrollsAdmin({ ativo: req.query.ativo });
    res.status(200).json({ status: "success", data: { itens: resultado } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar pergaminhos.");
  }
};

exports.criarScroll = async (req, res) => {
  try {
    const scroll = await adminForgeService.criarScrollAdmin(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { scroll } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar o pergaminho.");
  }
};

exports.atualizarScroll = async (req, res) => {
  try {
    const scroll = await adminForgeService.atualizarScrollAdmin(Number(req.params.itemId), req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { scroll } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar o pergaminho.");
  }
};

exports.duplicarScroll = async (req, res) => {
  try {
    const scroll = await adminForgeService.duplicarScrollAdmin(Number(req.params.itemId), req.body?.novo_id_item, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { scroll } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao duplicar o pergaminho.");
  }
};

exports.desativarScroll = async (req, res) => {
  try {
    const scroll = await adminForgeService.setAtivoScrollAdmin(Number(req.params.itemId), false, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { scroll } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao desativar o pergaminho.");
  }
};

exports.reativarScroll = async (req, res) => {
  try {
    const scroll = await adminForgeService.setAtivoScrollAdmin(Number(req.params.itemId), true, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { scroll } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao reativar o pergaminho.");
  }
};

// Recursos (auxiliar de seleção)
exports.listarRecursos = async (req, res) => {
  try {
    const resultado = await adminForgeService.listarRecursosAdmin({ profissao: req.query.profissao });
    res.status(200).json({ status: "success", data: { recursos: resultado } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar recursos.");
  }
};

// Balanceamento
exports.obterBalanceamento = async (req, res) => {
  try {
    const resultado = await adminForgeService.getBalanceamentoAdmin();
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao carregar o balanceamento.");
  }
};

exports.atualizarBalanceamento = async (req, res) => {
  try {
    const resultado = await adminForgeService.updateBalanceamentoAdmin(req.params.group, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao salvar o balanceamento.");
  }
};

exports.previewRefinamento = async (req, res) => {
  try {
    const resultado = await adminForgeService.previewRefinamentoAdmin(req.body ?? {});
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao simular o refinamento.");
  }
};

exports.previewImpactoProgressao = async (req, res) => {
  try {
    const resultado = await adminForgeService.previewImpactoProgressaoAdmin(req.body?.XP_NECESSARIO_POR_ETAPA ?? {});
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao simular o impacto da curva de XP.");
  }
};

exports.obterMetricas = async (req, res) => {
  try {
    const resultado = await adminForgeService.getMetricasAdmin();
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao carregar as métricas.");
  }
};
