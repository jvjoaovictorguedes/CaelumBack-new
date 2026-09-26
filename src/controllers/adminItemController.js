// Painel Administrativo §10-13 — controller fino: valida input HTTP e
// delega a regra pra adminItemService. Nunca passa req.body inteiro pro
// service; o próprio service já faz allowlist, mas o controller decide
// o shape aceito no payload (item/weapon/armor/consumable).
const adminItemService = require("../services/adminItemService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listar = async (req, res) => {
  try {
    const { pagina, porPagina, tipo_item, raridade, nome, apenasAtivos, disponivelLoja } = req.query;
    const resultado = await adminItemService.listAdminItems({
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      tipo_item,
      raridade,
      nome,
      apenasAtivos: apenasAtivos === undefined ? undefined : apenasAtivos === "true",
      disponivelLoja: disponivelLoja === undefined ? undefined : disponivelLoja === "true",
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar itens.");
  }
};

// Endpoint dedicado a pickers de item (ItemSelect no frontend) — nunca
// usado pela tabela paginada do CRUD de Itens. Ver comentário de
// listAllItemsForSelection: devolve o catálogo INTEIRO (até um teto de
// segurança bem acima de qualquer conteúdo real), leve, sem os JOINs de
// propriedades.
exports.listarParaSelecao = async (req, res) => {
  try {
    const { apenasAtivos, tipo_item } = req.query;
    const resultado = await adminItemService.listAllItemsForSelection({
      apenasAtivos: apenasAtivos === undefined ? undefined : apenasAtivos === "true",
      tipo_item,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar itens para seleção.");
  }
};

exports.criar = async (req, res) => {
  try {
    const { item, weapon, armor, consumable, fishingRod } = req.body ?? {};
    const criado = await adminItemService.createAdminItem(
      { ...item, weapon, armor, consumable, fishingRod },
      { idAdmin: req.user.id, req },
    );
    res.status(201).json({ status: "success", data: { item: criado } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar item.");
  }
};

exports.atualizar = async (req, res) => {
  try {
    const { item, weapon, armor, consumable, fishingRod } = req.body ?? {};
    const atualizado = await adminItemService.updateAdminItem(
      req.params.id,
      { ...item, weapon, armor, consumable, fishingRod },
      { idAdmin: req.user.id, req },
    );
    res.status(200).json({ status: "success", data: { item: atualizado } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar item.");
  }
};

exports.desativar = async (req, res) => {
  try {
    const { motivo } = req.body ?? {};
    const desativado = await adminItemService.deactivateAdminItem(req.params.id, {
      idAdmin: req.user.id,
      motivo,
      req,
    });
    res.status(200).json({ status: "success", data: { item: desativado } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao desativar item.");
  }
};

exports.reativar = async (req, res) => {
  try {
    const reativado = await adminItemService.reactivateAdminItem(req.params.id, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { item: reativado } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao reativar item.");
  }
};

exports.duplicar = async (req, res) => {
  try {
    const copia = await adminItemService.duplicateAdminItem(req.params.id, {
      idAdmin: req.user.id,
      req,
    });
    res.status(201).json({ status: "success", data: { item: copia } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao duplicar item.");
  }
};
