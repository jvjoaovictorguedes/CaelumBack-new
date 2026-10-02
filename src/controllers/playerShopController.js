// Loja do Aventureiro V2 — controller fino, delega pro playerShopService
// (mesmo padrão do resto do projeto).
const playerShopService = require("../services/playerShopService");
const marketService = require("../services/marketService");
const playerShopDemandService = require("../services/playerShopDemandService");
const playerShopCommissionService = require("../services/playerShopCommissionService");
const adminPlayerShopConfigService = require("../services/adminPlayerShopConfigService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

// GET /api/player-shops?busca=&profissao=&aceita_encomendas=&page=&limit=
exports.listarLojas = async (req, res) => {
  try {
    const { busca, profissao, aceita_encomendas, page, limit } = req.query;
    const resultado = await playerShopService.listarLojasPublicas({
      busca,
      profissao,
      aceitaEncomendas: aceita_encomendas !== undefined ? aceita_encomendas === "true" : undefined,
      page,
      limit,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar lojas.");
  }
};

// GET /api/player-shops/mine — vem ANTES de "/:characterId" no router.
exports.obterMinhaLoja = async (req, res) => {
  try {
    const loja = await playerShopService.obterMinhaLoja(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { loja } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao carregar sua loja.");
  }
};

// PUT /api/player-shops/mine
exports.atualizarMinhaLoja = async (req, res) => {
  try {
    const loja = await playerShopService.criarOuAtualizarLoja(req.personagemAtual.id, req.body ?? {});
    res.status(200).json({ status: "success", data: { loja } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao salvar sua loja.");
  }
};

// POST /api/player-shops/mine/listings — Loja §5: "Criar anúncio pela
// loja pode chamar o mesmo service extraído do marketController." Zero
// lógica de venda nova aqui — é o MESMO marketService.createListing do
// Mercado Negro, só exige que o personagem já tenha uma loja criada
// (senão "publicar pela loja" não faz sentido nenhum pro jogador).
exports.criarProdutoDaLoja = async (req, res) => {
  const idPersonagem = req.personagemAtual.id;
  const { id_item, quantidade, preco_unitario, id_instancia } = req.body;

  try {
    adminPlayerShopConfigService.verificarAtivo();

    const loja = await playerShopService.obterMinhaLoja(idPersonagem);
    if (!loja) {
      return res.status(400).json({ message: "Crie sua loja antes de publicar um produto nela." });
    }

    const listing = await marketService.createListing({
      idPersonagem,
      idItem: id_item,
      quantidade,
      precoUnitario: preco_unitario,
      idInstancia: id_instancia,
    });

    return res.status(201).json({ status: "success", message: "Produto publicado na sua loja!", data: { listing } });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao publicar produto na loja:", error);
    return res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao publicar produto." });
  }
};

// POST /api/player-shops/mine/demands
exports.criarDemanda = async (req, res) => {
  try {
    const demanda = await playerShopDemandService.criarDemanda(req.personagemAtual.id, req.body ?? {});
    res.status(201).json({ status: "success", message: "Demanda publicada!", data: { demanda } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao publicar demanda.");
  }
};

// GET /api/player-shops/mine/demands
exports.listarMinhasDemandas = async (req, res) => {
  try {
    const demandas = await playerShopDemandService.listarMinhasDemandas(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { demandas } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar suas demandas.");
  }
};

// POST /api/player-shops/demands/:idDemanda/cancel
exports.cancelarDemanda = async (req, res) => {
  try {
    const idDemanda = Number(req.params.idDemanda);
    const demanda = await playerShopDemandService.cancelarDemanda(idDemanda, req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { demanda } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao cancelar demanda.");
  }
};

// POST /api/player-shops/demands/:idDemanda/deliver
exports.entregarNaDemanda = async (req, res) => {
  try {
    const idDemanda = Number(req.params.idDemanda);
    const { quantidade } = req.body ?? {};
    const resultado = await playerShopDemandService.entregarItem(idDemanda, req.personagemAtual.id, quantidade);
    res.status(200).json({ status: "success", message: "Entrega registrada!", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao entregar na demanda.");
  }
};

// GET /api/player-shops/demands?id_item=&page=&limit=
exports.listarDemandasAbertas = async (req, res) => {
  try {
    const { id_item, page, limit } = req.query;
    const resultado = await playerShopDemandService.listarDemandasAbertas({ idItem: id_item, page, limit });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar demandas.");
  }
};

// POST /api/player-shops/:characterId/commissions — cliente abre uma
// encomenda direcionada ao lojista dono de :characterId.
exports.criarEncomenda = async (req, res) => {
  try {
    const idLojista = Number(req.params.characterId);
    const encomenda = await playerShopCommissionService.criarEncomenda(req.personagemAtual.id, idLojista, req.body ?? {});
    res.status(201).json({ status: "success", message: "Encomenda enviada!", data: { encomenda } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar encomenda.");
  }
};

// GET /api/player-shops/mine/commissions — minhas encomendas (enviadas + recebidas)
exports.listarMinhasEncomendas = async (req, res) => {
  try {
    const resultado = await playerShopCommissionService.listarMinhasEncomendas(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar suas encomendas.");
  }
};

// GET /api/player-shops/commissions/:idEncomenda
exports.obterEncomenda = async (req, res) => {
  try {
    const idEncomenda = Number(req.params.idEncomenda);
    const encomenda = await playerShopCommissionService.obterEncomenda(idEncomenda, req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { encomenda } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao carregar a encomenda.");
  }
};

// POST /api/player-shops/commissions/:idEncomenda/counter-offer
exports.contraProporEncomenda = async (req, res) => {
  try {
    const idEncomenda = Number(req.params.idEncomenda);
    const resultado = await playerShopCommissionService.contraPropor(idEncomenda, req.personagemAtual.id, req.body ?? {});
    res.status(200).json({ status: "success", message: "Contraproposta enviada!", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao enviar contraproposta.");
  }
};

// POST /api/player-shops/commissions/:idEncomenda/accept { proposal_version }
exports.aceitarEncomenda = async (req, res) => {
  try {
    const idEncomenda = Number(req.params.idEncomenda);
    const { proposal_version } = req.body ?? {};
    const encomenda = await playerShopCommissionService.aceitarOferta(idEncomenda, req.personagemAtual.id, proposal_version);
    res.status(200).json({ status: "success", message: "Encomenda aceita! Ouro reservado.", data: { encomenda } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao aceitar encomenda.");
  }
};

// POST /api/player-shops/commissions/:idEncomenda/decline
exports.recusarEncomenda = async (req, res) => {
  try {
    const idEncomenda = Number(req.params.idEncomenda);
    const encomenda = await playerShopCommissionService.recusar(idEncomenda, req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { encomenda } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao recusar encomenda.");
  }
};

// POST /api/player-shops/commissions/:idEncomenda/deliver { id_instancia? }
exports.entregarEncomenda = async (req, res) => {
  try {
    const idEncomenda = Number(req.params.idEncomenda);
    const encomenda = await playerShopCommissionService.entregarEncomenda(idEncomenda, req.personagemAtual.id, req.body ?? {});
    res.status(200).json({ status: "success", message: "Encomenda entregue!", data: { encomenda } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao entregar encomenda.");
  }
};

// POST /api/player-shops/commissions/:idEncomenda/cancel
exports.cancelarEncomenda = async (req, res) => {
  try {
    const idEncomenda = Number(req.params.idEncomenda);
    const encomenda = await playerShopCommissionService.cancelarAposAceite(idEncomenda, req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { encomenda } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao cancelar encomenda.");
  }
};

// GET /api/player-shops/:characterId
exports.obterLoja = async (req, res) => {
  try {
    const characterId = Number(req.params.characterId);
    if (!Number.isInteger(characterId)) {
      return res.status(400).json({ message: "characterId inválido." });
    }
    const perfil = await playerShopService.obterPerfilPublico(characterId);
    res.status(200).json({ status: "success", data: perfil });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao carregar a loja.");
  }
};
