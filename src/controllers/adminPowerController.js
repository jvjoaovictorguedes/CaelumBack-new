// Painel Administrativo Fases 5/6/7 — controller fino.
const adminPowerService = require("../services/adminPowerService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listar = async (req, res) => {
  try {
    const { nome, tipo_poder, escala_atributo } = req.query;
    const powers = await adminPowerService.listAdminPowers({ nome, tipo_poder, escala_atributo });
    res.status(200).json({ status: "success", data: { powers } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar habilidades.");
  }
};

exports.criar = async (req, res) => {
  try {
    const power = await adminPowerService.createAdminPower(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { power } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar habilidade.");
  }
};

exports.atualizar = async (req, res) => {
  try {
    const power = await adminPowerService.updateAdminPower(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { power } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar habilidade.");
  }
};

exports.jogadoresAfetados = async (req, res) => {
  try {
    const total = await adminPowerService.countPlayersAffectedByPower(req.params.id);
    res.status(200).json({ status: "success", data: { total } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao contar jogadores afetados.");
  }
};

exports.duplicar = async (req, res) => {
  try {
    const power = await adminPowerService.duplicateAdminPower(req.params.id, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { power } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao duplicar habilidade.");
  }
};

// Vínculos
exports.listarVinculos = async (req, res) => {
  try {
    const [classes, racas] = await Promise.all([
      adminPowerService.listAdminClassAbilities(req.params.id),
      adminPowerService.listAdminRaceAbilities(req.params.id),
    ]);
    res.status(200).json({ status: "success", data: { classes, racas } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar vínculos.");
  }
};

exports.vincularClasse = async (req, res) => {
  try {
    const vinculo = await adminPowerService.upsertAdminClassAbility(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { vinculo } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao vincular classe.");
  }
};

exports.desvincularClasse = async (req, res) => {
  try {
    const resultado = await adminPowerService.removeAdminClassAbility(req.params.id, req.params.idClasse, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao desvincular classe.");
  }
};

exports.vincularRaca = async (req, res) => {
  try {
    const vinculo = await adminPowerService.upsertAdminRaceAbility(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { vinculo } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao vincular raça.");
  }
};

exports.desvincularRaca = async (req, res) => {
  try {
    const resultado = await adminPowerService.removeAdminRaceAbility(req.params.id, req.params.idRaca, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao desvincular raça.");
  }
};

// Power status effects
exports.adicionarStatusEffect = async (req, res) => {
  try {
    const efeito = await adminPowerService.addAdminPowerStatusEffect(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { efeito } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao adicionar efeito.");
  }
};

exports.atualizarStatusEffect = async (req, res) => {
  try {
    const efeito = await adminPowerService.updateAdminPowerStatusEffect(req.params.idEfeito, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { efeito } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar efeito.");
  }
};

exports.removerStatusEffect = async (req, res) => {
  try {
    const resultado = await adminPowerService.removeAdminPowerStatusEffect(req.params.idEfeito, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao remover efeito.");
  }
};

// Weapon status effects (montado sob /admin/items/:idItem/weapon-status-effects)
exports.listarWeaponStatusEffects = async (req, res) => {
  try {
    const efeitos = await adminPowerService.listAdminWeaponStatusEffects(req.params.idItem);
    res.status(200).json({ status: "success", data: { efeitos } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar efeitos da arma.");
  }
};

exports.adicionarWeaponStatusEffect = async (req, res) => {
  try {
    const efeito = await adminPowerService.addAdminWeaponStatusEffect(req.params.idItem, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { efeito } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao adicionar efeito na arma.");
  }
};

exports.atualizarWeaponStatusEffect = async (req, res) => {
  try {
    const efeito = await adminPowerService.updateAdminWeaponStatusEffect(req.params.idEfeito, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { efeito } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar efeito da arma.");
  }
};

exports.removerWeaponStatusEffect = async (req, res) => {
  try {
    const resultado = await adminPowerService.removeAdminWeaponStatusEffect(req.params.idEfeito, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao remover efeito da arma.");
  }
};

// Catálogo + previews
exports.catalogoDeStatus = async (req, res) => {
  res.status(200).json({ status: "success", data: { catalogo: adminPowerService.statusCatalog() } });
};

exports.previewEvolucao = async (req, res) => {
  try {
    const preview = await adminPowerService.previewPowerEvolution(req.params.id);
    res.status(200).json({ status: "success", data: preview });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao simular evolução.");
  }
};

exports.previewStatus = async (req, res) => {
  try {
    const valor = Number(req.query.atributo ?? req.body?.atributo ?? 100);
    const preview = await adminPowerService.previewPowerStatus(req.params.id, valor);
    res.status(200).json({ status: "success", data: preview });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao simular status.");
  }
};
