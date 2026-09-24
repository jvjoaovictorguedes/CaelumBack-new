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
    const { pagina, porPagina, tipo_item, raridade, nome, apenasAtivos } = req.query;
    const resultado = await adminItemService.listAdminItems({
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      tipo_item,
      raridade,
      nome,
      apenasAtivos: apenasAtivos === undefined ? undefined : apenasAtivos === "true",
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar itens.");
  }
};

exports.criar = async (req, res) => {
  try {
    const { item, weapon, armor, consumable } = req.body ?? {};
    const criado = await adminItemService.createAdminItem(
      { ...item, weapon, armor, consumable },
      { idAdmin: req.user.id, req },
    );
    res.status(201).json({ status: "success", data: { item: criado } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar item.");
  }
};

exports.atualizar = async (req, res) => {
  try {
    const { item, weapon, armor, consumable } = req.body ?? {};
    const atualizado = await adminItemService.updateAdminItem(
      req.params.id,
      { ...item, weapon, armor, consumable },
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
