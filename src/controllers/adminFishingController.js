// Painel Administrativo — controller fino, delega pro adminFishingService.
const adminFishingService = require("../services/adminFishingService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

// Zonas
exports.listarZonas = async (req, res) => {
  try {
    const zonas = await adminFishingService.listAdminFishingZones();
    res.status(200).json({ status: "success", data: { zonas } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar zonas de pesca.");
  }
};

exports.criarZona = async (req, res) => {
  try {
    const zona = await adminFishingService.createAdminFishingZone(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { zona } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar zona de pesca.");
  }
};

exports.atualizarZona = async (req, res) => {
  try {
    const zona = await adminFishingService.updateAdminFishingZone(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { zona } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar zona de pesca.");
  }
};

// Espécies
exports.listarEspecies = async (req, res) => {
  try {
    const especies = await adminFishingService.listAdminFishingSpecies();
    res.status(200).json({ status: "success", data: { especies } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar espécies.");
  }
};

exports.criarEspecie = async (req, res) => {
  try {
    const especie = await adminFishingService.createAdminFishingSpecies(req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(201).json({ status: "success", data: { especie } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar espécie.");
  }
};

exports.atualizarEspecie = async (req, res) => {
  try {
    const especie = await adminFishingService.updateAdminFishingSpecies(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { especie } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar espécie.");
  }
};

// Pool (zona <-> espécie)
exports.listarPool = async (req, res) => {
  try {
    const { idZone } = req.query;
    const pool = await adminFishingService.listAdminFishingPool({ idZone: idZone ? Number(idZone) : undefined });
    res.status(200).json({ status: "success", data: { pool } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar o pool de pesca.");
  }
};

exports.criarPool = async (req, res) => {
  try {
    const item = await adminFishingService.createAdminFishingPool(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { item } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar vínculo no pool.");
  }
};

exports.atualizarPool = async (req, res) => {
  try {
    const item = await adminFishingService.updateAdminFishingPool(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { item } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar vínculo no pool.");
  }
};

// Portos
exports.listarPortos = async (req, res) => {
  try {
    const portos = await adminFishingService.listAdminFishingPorts();
    res.status(200).json({ status: "success", data: { portos } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar portos.");
  }
};

exports.criarPorto = async (req, res) => {
  try {
    const porto = await adminFishingService.createAdminFishingPort(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { porto } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar porto.");
  }
};

exports.atualizarPorto = async (req, res) => {
  try {
    const porto = await adminFishingService.updateAdminFishingPort(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { porto } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar porto.");
  }
};

// Iscas
exports.listarIscas = async (req, res) => {
  try {
    const iscas = await adminFishingService.listAdminFishingBaits();
    res.status(200).json({ status: "success", data: { iscas } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar iscas.");
  }
};

exports.criarIsca = async (req, res) => {
  try {
    const isca = await adminFishingService.createAdminFishingBait(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { isca } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar isca.");
  }
};

exports.atualizarIsca = async (req, res) => {
  try {
    const isca = await adminFishingService.updateAdminFishingBait(req.params.idItem, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { isca } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar isca.");
  }
};

// Afinidades (isca <-> espécie)
exports.listarAfinidades = async (req, res) => {
  try {
    const { idBaitItem } = req.query;
    const afinidades = await adminFishingService.listAdminFishingAffinities({
      idBaitItem: idBaitItem ? Number(idBaitItem) : undefined,
    });
    res.status(200).json({ status: "success", data: { afinidades } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar afinidades.");
  }
};

exports.criarAfinidade = async (req, res) => {
  try {
    const afinidade = await adminFishingService.createAdminFishingAffinity(req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(201).json({ status: "success", data: { afinidade } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar afinidade.");
  }
};

exports.atualizarAfinidade = async (req, res) => {
  try {
    const afinidade = await adminFishingService.updateAdminFishingAffinity(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { afinidade } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar afinidade.");
  }
};

// Embarcações
exports.listarVessels = async (req, res) => {
  try {
    const vessels = await adminFishingService.listAdminVessels();
    res.status(200).json({ status: "success", data: { vessels } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar embarcações.");
  }
};

exports.criarVessel = async (req, res) => {
  try {
    const vessel = await adminFishingService.createAdminVessel(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { vessel } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar embarcação.");
  }
};

exports.atualizarVessel = async (req, res) => {
  try {
    const vessel = await adminFishingService.updateAdminVessel(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { vessel } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar embarcação.");
  }
};

// Rotas marítimas
exports.listarRotas = async (req, res) => {
  try {
    const rotas = await adminFishingService.listAdminMarineRoutes();
    res.status(200).json({ status: "success", data: { rotas } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar rotas marítimas.");
  }
};

exports.criarRota = async (req, res) => {
  try {
    const rota = await adminFishingService.createAdminMarineRoute(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { rota } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar rota marítima.");
  }
};

exports.atualizarRota = async (req, res) => {
  try {
    const rota = await adminFishingService.updateAdminMarineRoute(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { rota } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar rota marítima.");
  }
};

// Torneios
exports.listarTorneios = async (req, res) => {
  try {
    const torneios = await adminFishingService.listAdminFishingTournaments();
    res.status(200).json({ status: "success", data: { torneios } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar torneios.");
  }
};

exports.criarTorneio = async (req, res) => {
  try {
    const torneio = await adminFishingService.createAdminFishingTournament(req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(201).json({ status: "success", data: { torneio } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar torneio.");
  }
};

exports.atualizarTorneio = async (req, res) => {
  try {
    const torneio = await adminFishingService.updateAdminFishingTournament(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { torneio } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar torneio.");
  }
};
