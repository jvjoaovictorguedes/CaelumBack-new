// Marketplace P2P — venda de itens entre jogadores, separado da Loja
// (shopController.js, onde quem vende é o sistema). O item anunciado
// sai do inventário do vendedor na hora de criar o anúncio (evita
// vender/equipar o mesmo item enquanto ele está à venda) e só volta se
// o anúncio for cancelado.
//
// v2 (Especificação Mercado v2): stack pode ser vendido em partes —
// cada compra (total ou parcial) gera uma linha em MarketTransaction,
// nunca só um número solto em MarketListing. Equipamento continua
// sempre 1/1 (nunca compra parcial — uma instância não divide).
const { Op, fn, col } = require("sequelize");
const Item = require("../models/Item");
const WeaponProperties = require("../models/WeaponProperties");
const ArmorProperties = require("../models/ArmorProperties");
const ConsumableProperties = require("../models/ConsumableProperties");
const FishingRodProperties = require("../models/FishingRodProperties");
const CharacterEquipmentInstance = require("../models/CharacterEquipmentInstance");
const Character = require("../models/Character");
const MarketListing = require("../models/MarketListing");
const MarketTransaction = require("../models/MarketTransaction");
const { propriedadesEfetivasArma, propriedadesEfetivasArmadura } = require("../services/equipmentRefinementService");
const marketService = require("../services/marketService");
const {
  LIMITE_PAGINA_PADRAO,
  LIMITE_PAGINA_MAXIMO,
} = require("../config/marketConfig");

// Anexa propriedades_efetivas (já considerando o refinamento — spec
// §11: "não obrigar o comprador a abrir a Forja pra entender o item")
// direto na instância que veio no include do anúncio, sem precisar de
// outra chamada à API só pra isso.
function comEfetivoNaInstancia(listingPlano) {
  const instancia = listingPlano.instancia;
  if (!instancia) return listingPlano;
  const item = listingPlano.item;
  const weaponEfetivo = propriedadesEfetivasArma(item?.weaponProperties, instancia.refinamento);
  const armorEfetivo = propriedadesEfetivasArmadura(item?.armorProperties, instancia.refinamento);
  return {
    ...listingPlano,
    instancia: {
      ...instancia,
      propriedades_efetivas: weaponEfetivo ?? armorEfetivo ?? null,
    },
  };
}

const INCLUDE_ITEM_COM_PROPRIEDADES = {
  model: Item,
  as: "item",
  include: [
    { model: WeaponProperties, as: "weaponProperties" },
    { model: ArmorProperties, as: "armorProperties" },
    { model: ConsumableProperties, as: "consumableProperties" },
    { model: FishingRodProperties, as: "fishingRodProperties" },
  ],
};

// GET /api/market/config — taxa e limites do Mercado (spec §8/§15), pra
// o frontend mostrar ao vendedor, no momento de anunciar, quanto ele
// vai perder de taxa e quanto vai receber de fato. Nunca hardcoded no
// front: se TAXA_MERCADO mudar aqui, a tela de Vender já reflete.
exports.obterConfig = (req, res) => {
  return res.status(200).json({ status: "success", data: marketService.getConfig() });
};

exports.criarAnuncio = async (req, res) => {
  const id_personagem = req.personagemAtual.id;
  const { id_item, quantidade, preco_unitario, id_instancia } = req.body;

  try {
    const listing = await marketService.createListing({
      idPersonagem: id_personagem,
      idItem: id_item,
      quantidade,
      precoUnitario: preco_unitario,
      idInstancia: id_instancia,
    });

    return res.status(201).json({ status: "success", message: "Anúncio criado!", data: { listing } });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao criar anúncio no mercado:", error);
    return res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao criar anúncio." });
  }
};

const ORDENACOES = {
  price_asc: [["preco_unitario", "ASC"]],
  price_desc: [["preco_unitario", "DESC"]],
  date_desc: [["createdAt", "DESC"]],
  date_asc: [["createdAt", "ASC"]],
  // Ordenar pela coluna da instância associada precisa do alias da
  // tabela incluída — Sequelize aceita isso como um array de 3
  // elementos (associação, coluna, direção) no lugar de 2.
  refinement_desc: [[{ model: CharacterEquipmentInstance, as: "instancia" }, "refinamento", "DESC"]],
  refinement_asc: [[{ model: CharacterEquipmentInstance, as: "instancia" }, "refinamento", "ASC"]],
  // Tier I é numericamente 1 (mais forte) — "tier_asc" começa por ele
  // de propósito (spec de Tier §41/§47: "ordenação por Tier respeita I
  // como mais forte").
  tier_asc: [[{ model: Item, as: "item" }, "tier_equipamento", "ASC"]],
  tier_desc: [[{ model: Item, as: "item" }, "tier_equipamento", "DESC"]],
};

// GET /api/market/listings?tipo_item=&raridade=&nome=&preco_min=&preco_max=
//   &refinamento_min=&refinamento_exato=&tier=&tier_min=&tier_max=&sort=price_asc&page=1&limit=30
exports.listarAnuncios = async (req, res) => {
  try {
    const { tipo_item, raridade, nome, preco_min, preco_max, refinamento_min, refinamento_exato, tier, tier_min, tier_max, sort } = req.query;

    const whereItem = {};
    if (tipo_item) whereItem.tipo_item = tipo_item;
    if (raridade) whereItem.raridade = raridade;
    if (nome) whereItem.nome = { [Op.iLike]: `%${nome}%` };
    // Tier I é numericamente 1 (mais forte) e V é 5 (spec de Tier §41) —
    // tier_min/tier_max filtram pelo NÚMERO, não pela força; o cliente
    // decide a direção.
    if (tier !== undefined) {
      whereItem.tier_equipamento = Number(tier);
    } else if (tier_min !== undefined || tier_max !== undefined) {
      whereItem.tier_equipamento = {};
      if (tier_min !== undefined) whereItem.tier_equipamento[Op.gte] = Number(tier_min);
      if (tier_max !== undefined) whereItem.tier_equipamento[Op.lte] = Number(tier_max);
    }

    const whereListing = { status: "Ativo" };
    if (preco_min !== undefined || preco_max !== undefined) {
      whereListing.preco_unitario = {};
      if (preco_min !== undefined) whereListing.preco_unitario[Op.gte] = Number(preco_min);
      if (preco_max !== undefined) whereListing.preco_unitario[Op.lte] = Number(preco_max);
    }

    // Refinamento só faz sentido pra equipamento (tem instância) — os
    // dois filtros abrigam automaticamente a listagem a "id_instancia
    // não nulo" (stack nunca tem esses campos preenchidos, então nunca
    // aparece quando esse filtro está ativo).
    const whereInstancia = {};
    if (refinamento_exato !== undefined) {
      whereInstancia.refinamento = Number(refinamento_exato);
    } else if (refinamento_min !== undefined) {
      whereInstancia.refinamento = { [Op.gte]: Number(refinamento_min) };
    }
    const instanciaObrigatoria = Object.keys(whereInstancia).length > 0;

    // Paginação server-side (spec §10) — nunca devolve o Mercado inteiro
    // pro front filtrar localmente.
    const limit = Math.min(LIMITE_PAGINA_MAXIMO, Math.max(1, Number(req.query.limit) || LIMITE_PAGINA_PADRAO));
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;

    const order = ORDENACOES[sort] ?? ORDENACOES.price_asc;

    const { rows, count } = await MarketListing.findAndCountAll({
      where: whereListing,
      include: [
        // Bug real: este include nunca trazia weaponProperties/
        // armorProperties/etc — a tela de listagem (a que o comprador
        // realmente vê) mostrava descrição mas nenhum atributo, e
        // comEfetivoNaInstancia (abaixo) sempre calculava undefined a
        // partir de um item sem propriedades carregadas. INCLUDE_ITEM_
        // COM_PROPRIEDADES já existia e resolvia isso — só nunca tinha
        // sido usado aqui, só em meusAnuncios.
        { ...INCLUDE_ITEM_COM_PROPRIEDADES, where: Object.keys(whereItem).length ? whereItem : undefined },
        { model: Character, as: "vendedor", attributes: ["id", "nome"] },
        // Inventário v2 — só existe quando o anúncio é de equipamento;
        // é dali que vem o refinamento de verdade daquela cópia.
        {
          model: CharacterEquipmentInstance,
          as: "instancia",
          required: instanciaObrigatoria,
          where: instanciaObrigatoria ? whereInstancia : undefined,
        },
      ],
      order,
      limit,
      offset,
      // distinct: sem isso, o JOIN com a instância faz o COUNT do
      // findAndCountAll contar linhas erradas quando há include
      // required.
      distinct: true,
    });

    const listings = rows.map((linha) => comEfetivoNaInstancia(linha.toJSON()));

    return res.status(200).json({
      status: "success",
      results: listings.length,
      data: {
        listings,
        pagina: page,
        limite: limit,
        total: count,
        totalPaginas: Math.max(1, Math.ceil(count / limit)),
      },
    });
  } catch (error) {
    console.error("Erro ao listar anúncios do mercado:", error);
    return res.status(500).json({ message: "Erro interno do servidor ao listar anúncios." });
  }
};

// GET /api/market/listings/mine
exports.meusAnuncios = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const listings = await MarketListing.findAll({
      where: { id_personagem_vendedor: idPersonagem },
      include: [
        INCLUDE_ITEM_COM_PROPRIEDADES,
        { model: CharacterEquipmentInstance, as: "instancia", attributes: ["id", "refinamento"] },
      ],
      order: [["createdAt", "DESC"]],
      limit: 100,
    });

    // Receita líquida acumulada (spec §13) vem sempre de
    // MarketTransaction — nunca recalculada a partir de
    // quantidade_total/preco_unitario, que não sabe quantas vendas
    // parciais já aconteceram.
    const idsListings = listings.map((linha) => linha.id);
    const receitas = idsListings.length
      ? await MarketTransaction.findAll({
          where: { id_listing: { [Op.in]: idsListings } },
          attributes: ["id_listing", [fn("SUM", col("valor_liquido_vendedor")), "receita_liquida"]],
          group: ["id_listing"],
          raw: true,
        })
      : [];
    const receitaPorListing = new Map(receitas.map((r) => [r.id_listing, Number(r.receita_liquida) || 0]));

    const listingsComReceita = listings.map((linha) => {
      const plano = comEfetivoNaInstancia(linha.toJSON());
      const vendidoParcialmente = plano.status === "Ativo" && plano.quantidade_restante < plano.quantidade_total;
      return {
        ...plano,
        // Rótulo de exibição (spec §13: "Ativos, Vendidos parcialmente,
        // Vendidos e Cancelados") — status no banco continua só
        // Ativo/Vendido/Cancelado, isso aqui é derivado só pra tela.
        status_exibicao: vendidoParcialmente ? "VendidoParcialmente" : plano.status,
        receita_liquida_acumulada: receitaPorListing.get(plano.id) ?? 0,
      };
    });

    return res.status(200).json({ status: "success", results: listingsComReceita.length, data: { listings: listingsComReceita } });
  } catch (error) {
    console.error("Erro ao listar meus anúncios:", error);
    return res.status(500).json({ message: "Erro interno do servidor ao listar seus anúncios." });
  }
};

exports.comprarAnuncio = async (req, res) => {
  const id_personagem_comprador = req.personagemAtual.id;
  const { id } = req.params;

  try {
    // Sem quantidade no corpo, assume "o anúncio inteiro" — mantém
    // compatibilidade com quem já chamava essa rota sem o campo novo
    // (compra parcial de stack, spec v2 §6).
    const resultado = await marketService.buyListing({
      idListing: id,
      idPersonagemComprador: id_personagem_comprador,
      quantidade: req.body?.quantidade,
    });

    return res.status(200).json({ status: "success", message: "Compra realizada!", data: resultado });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao comprar no mercado:", error);
    return res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao comprar." });
  }
};

exports.editarPrecoAnuncio = async (req, res) => {
  const id_personagem = req.personagemAtual.id;
  const { id } = req.params;
  const { preco_unitario } = req.body ?? {};

  try {
    const listing = await marketService.updateListingPrice({
      idListing: id,
      idPersonagem: id_personagem,
      precoUnitario: preco_unitario,
    });
    return res.status(200).json({ status: "success", message: "Preço atualizado!", data: { listing } });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao editar preço do anúncio:", error);
    return res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao editar o preço." });
  }
};

exports.cancelarAnuncio = async (req, res) => {
  const id_personagem = req.personagemAtual.id;
  const { id } = req.params;

  try {
    await marketService.cancelListing({ idListing: id, idPersonagem: id_personagem });
    return res.status(200).json({ status: "success", message: "Anúncio cancelado, item devolvido ao inventário." });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao cancelar anúncio:", error);
    return res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao cancelar anúncio." });
  }
};

// GET /api/market/price-history/:idItem?refinamento=
// Histórico simples (spec §12): mediana/média recente por Item e, pra
// equipamento, segmentado por refinamento quando informado — sem
// gráfico, só uma caixa de referência de preço.
const TRANSACOES_HISTORICO_MAX = 50;

exports.historicoPreco = async (req, res) => {
  try {
    const idItem = Number(req.params.idItem);
    if (!Number.isInteger(idItem)) {
      return res.status(400).json({ message: "id do item inválido." });
    }
    const refinamento = req.query.refinamento !== undefined ? Number(req.query.refinamento) : undefined;

    const where = { id_item: idItem };
    if (refinamento !== undefined) {
      where.refinamento = refinamento;
    }

    const amostra = await MarketTransaction.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: TRANSACOES_HISTORICO_MAX,
      attributes: ["preco_unitario"],
      raw: true,
    });

    if (amostra.length === 0) {
      return res.status(200).json({
        status: "success",
        data: { amostras: 0, preco_medio: null, preco_mediano: null, preco_minimo: null, preco_maximo: null },
      });
    }

    const precos = amostra.map((t) => t.preco_unitario).sort((a, b) => a - b);
    const soma = precos.reduce((acc, p) => acc + p, 0);
    const meio = Math.floor(precos.length / 2);
    const mediana =
      precos.length % 2 === 0 ? Math.round((precos[meio - 1] + precos[meio]) / 2) : precos[meio];

    return res.status(200).json({
      status: "success",
      data: {
        amostras: precos.length,
        preco_medio: Math.round(soma / precos.length),
        preco_mediano: mediana,
        preco_minimo: precos[0],
        preco_maximo: precos[precos.length - 1],
      },
    });
  } catch (error) {
    console.error("Erro ao buscar histórico de preço:", error);
    return res.status(500).json({ message: "Erro interno do servidor ao buscar histórico de preço." });
  }
};
