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
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Item = require("../models/Item");
const WeaponProperties = require("../models/WeaponProperties");
const ArmorProperties = require("../models/ArmorProperties");
const CharacterInventory = require("../models/CharacterInventory");
const CharacterEquipmentInstance = require("../models/CharacterEquipmentInstance");
const MarketListing = require("../models/MarketListing");
const MarketTransaction = require("../models/MarketTransaction");
const { addStack } = require("../services/inventoryService");
const equipmentInstanceService = require("../services/equipmentInstanceService");
const { propriedadesEfetivasArma, propriedadesEfetivasArmadura } = require("../services/equipmentRefinementService");
const {
  TAXA_MERCADO,
  PRECO_MINIMO_UNITARIO,
  PRECO_MAXIMO_UNITARIO,
  LIMITE_PAGINA_PADRAO,
  LIMITE_PAGINA_MAXIMO,
} = require("../config/marketConfig");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

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
  ],
};

exports.criarAnuncio = async (req, res) => {
  const id_personagem = req.personagemAtual.id;
  const { id_item, quantidade, preco_unitario, id_instancia } = req.body;

  const qtd = Number(quantidade);
  const preco = Number(preco_unitario);

  if (!id_item || !Number.isInteger(qtd) || qtd <= 0) {
    return res.status(400).json({ message: "id_item e quantidade (inteiro positivo) são obrigatórios." });
  }
  if (!Number.isInteger(preco) || preco < PRECO_MINIMO_UNITARIO || preco > PRECO_MAXIMO_UNITARIO) {
    return res.status(400).json({ message: `Preço unitário deve estar entre ${PRECO_MINIMO_UNITARIO} e ${PRECO_MAXIMO_UNITARIO}.` });
  }

  try {
    const listing = await sequelize.transaction(async (transaction) => {
      const item = await Item.findByPk(id_item, { transaction });
      if (!item) {
        throw erro("Item não encontrado.", 404);
      }
      if (["QuestItem", "Currencia"].includes(item.tipo_item)) {
        throw erro(`Item do tipo "${item.tipo_item}" não pode ser anunciado.`);
      }

      // Inventário v2 (§4/§11/§12) — equipamento não é mais empilhável:
      // anuncia UMA instância específica (cada uma pode ter refinamento
      // diferente), nunca uma "quantidade" solta de id_item.
      if (equipmentInstanceService.ehEquipavel(item.tipo_item)) {
        if (qtd !== 1) {
          throw erro("Equipamento é anunciado um de cada vez (quantidade deve ser 1).");
        }
        if (!id_instancia) {
          throw erro("id_instancia é obrigatório pra anunciar equipamento.");
        }
        await equipmentInstanceService.reserveForMarket(id_personagem, id_instancia, transaction);

        return MarketListing.create(
          {
            id_personagem_vendedor: id_personagem,
            id_item,
            id_instancia,
            quantidade_total: 1,
            quantidade_restante: 1,
            preco_unitario: preco,
            status: "Ativo",
          },
          { transaction },
        );
      }

      const inventoryEntry = await CharacterInventory.findOne({
        where: { id_personagem, id_item },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!inventoryEntry || inventoryEntry.quantidade < qtd) {
        throw erro(`Você não tem ${qtd} unidade(s) de "${item.nome}" disponível(is) no inventário.`);
      }

      inventoryEntry.quantidade -= qtd;
      if (inventoryEntry.quantidade <= 0) {
        await inventoryEntry.destroy({ transaction });
      } else {
        await inventoryEntry.save({ transaction });
      }

      return MarketListing.create(
        {
          id_personagem_vendedor: id_personagem,
          id_item,
          quantidade_total: qtd,
          quantidade_restante: qtd,
          preco_unitario: preco,
          status: "Ativo",
        },
        { transaction },
      );
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
};

// GET /api/market/listings?tipo_item=&raridade=&nome=&preco_min=&preco_max=
//   &refinamento_min=&refinamento_exato=&sort=price_asc&page=1&limit=30
exports.listarAnuncios = async (req, res) => {
  try {
    const { tipo_item, raridade, nome, preco_min, preco_max, refinamento_min, refinamento_exato, sort } = req.query;

    const whereItem = {};
    if (tipo_item) whereItem.tipo_item = tipo_item;
    if (raridade) whereItem.raridade = raridade;
    if (nome) whereItem.nome = { [Op.iLike]: `%${nome}%` };

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
        { model: Item, as: "item", where: Object.keys(whereItem).length ? whereItem : undefined },
        { model: Character, as: "vendedor", attributes: ["id", "nome"] },
        // Inventário v2 — só existe quando o anúncio é de equipamento;
        // é dali que vem o refinamento de verdade daquela cópia. Traz o
        // Item completo (com propriedades) pra calcular o efetivo sem
        // outra query.
        {
          model: CharacterEquipmentInstance,
          as: "instancia",
          required: instanciaObrigatoria,
          where: instanciaObrigatoria ? whereInstancia : undefined,
          include: [INCLUDE_ITEM_COM_PROPRIEDADES],
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
    const resultado = await sequelize.transaction(async (transaction) => {
      const listing = await MarketListing.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!listing || listing.status !== "Ativo" || listing.quantidade_restante <= 0) {
        throw erro("Este anúncio não está mais disponível.", 404);
      }
      if (listing.id_personagem_vendedor === id_personagem_comprador) {
        throw erro("Você não pode comprar seu próprio anúncio.");
      }

      // Compra parcial de stack (spec §6) — equipamento é sempre
      // exatamente 1 (a instância inteira, nunca "pedaço" dela). Sem
      // quantidade no corpo, assume "o anúncio inteiro" — mantém
      // compatibilidade com quem já chamava essa rota sem o campo novo.
      const quantidadeSolicitada =
        req.body?.quantidade !== undefined ? Number(req.body.quantidade) : listing.quantidade_restante;

      if (!Number.isInteger(quantidadeSolicitada) || quantidadeSolicitada <= 0) {
        throw erro("Quantidade inválida.");
      }
      if (listing.id_instancia && quantidadeSolicitada !== 1) {
        throw erro("Equipamento é comprado sempre 1 de cada vez.");
      }
      if (quantidadeSolicitada > listing.quantidade_restante) {
        throw erro(`Só restam ${listing.quantidade_restante} unidade(s) neste anúncio.`);
      }

      // Trava comprador e vendedor sempre na mesma ordem (id menor
      // primeiro) — sem isso, duas compras concorrentes envolvendo os
      // mesmos dois personagens em papéis invertidos (A compra de B ao
      // mesmo tempo que B compra de A) podiam travar em deadlock.
      const vendedorId = listing.id_personagem_vendedor;
      const [primeiroId, segundoId] = [id_personagem_comprador, vendedorId].sort((a, b) => a - b);
      const primeiro = await Character.findByPk(primeiroId, { transaction, lock: transaction.LOCK.UPDATE });
      const segundo = await Character.findByPk(segundoId, { transaction, lock: transaction.LOCK.UPDATE });
      const comprador = primeiroId === id_personagem_comprador ? primeiro : segundo;
      const vendedor = primeiroId === vendedorId ? primeiro : segundo;

      if (!comprador) {
        throw erro("Personagem não encontrado.", 404);
      }
      if (!vendedor) {
        throw erro("Vendedor não encontrado.", 404);
      }

      // Preço total SEMPRE recalculado aqui a partir do preco_unitario
      // gravado no anúncio e da quantidade validada acima — nunca a
      // partir de um total que o cliente mande (spec §15).
      const precoTotal = listing.preco_unitario * quantidadeSolicitada;
      if (comprador.dinheiro < precoTotal) {
        throw erro("Moedas insuficientes para esta compra.");
      }

      const taxa = Math.floor(precoTotal * TAXA_MERCADO);
      const valorLiquidoVendedor = precoTotal - taxa;

      comprador.dinheiro -= precoTotal;
      // Ouro do mercado é transferência entre jogadores, não fonte nova
      // — nunca passa por goldService.concederOuro (ver comentário lá).
      vendedor.dinheiro += valorLiquidoVendedor;
      await comprador.save({ transaction });
      await vendedor.save({ transaction });

      // Inventário v2 — anúncio de equipamento transfere a INSTÂNCIA
      // (mantém o refinamento dela); anúncio de stack credita a
      // quantidade comprada (pode ser parte do total anunciado).
      if (listing.id_instancia) {
        await equipmentInstanceService.transfer(listing.id_instancia, id_personagem_comprador, transaction);
      } else {
        await addStack(id_personagem_comprador, listing.id_item, quantidadeSolicitada, transaction);
      }

      listing.quantidade_restante -= quantidadeSolicitada;
      if (listing.quantidade_restante <= 0) {
        listing.status = "Vendido";
        listing.vendido_em = new Date();
      }
      // id_personagem_comprador no listing registra só o último
      // comprador — o histórico completo (múltiplos compradores parciais)
      // vive em MarketTransaction, nunca aqui.
      listing.id_personagem_comprador = id_personagem_comprador;
      await listing.save({ transaction });

      let refinamentoNaVenda = null;
      if (listing.id_instancia) {
        const instancia = await CharacterEquipmentInstance.findByPk(listing.id_instancia, { transaction });
        refinamentoNaVenda = instancia?.refinamento ?? null;
      }

      const transacao = await MarketTransaction.create(
        {
          id_listing: listing.id,
          id_personagem_vendedor: vendedorId,
          id_personagem_comprador,
          id_item: listing.id_item,
          id_instancia: listing.id_instancia,
          refinamento: refinamentoNaVenda,
          quantidade: quantidadeSolicitada,
          preco_unitario: listing.preco_unitario,
          preco_total: precoTotal,
          taxa,
          valor_liquido_vendedor: valorLiquidoVendedor,
        },
        { transaction },
      );

      return { listing, transacao, precoTotal, valorLiquidoVendedor };
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

exports.cancelarAnuncio = async (req, res) => {
  const id_personagem = req.personagemAtual.id;
  const { id } = req.params;

  try {
    await sequelize.transaction(async (transaction) => {
      const listing = await MarketListing.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!listing || listing.status !== "Ativo") {
        throw erro("Este anúncio não está mais ativo.", 404);
      }
      if (listing.id_personagem_vendedor !== id_personagem) {
        throw erro("Este anúncio não é seu.", 403);
      }

      // Devolve só o que RESTOU anunciado — se já vendeu parte, essa
      // parte já foi entregue a outros compradores e não volta.
      if (listing.id_instancia) {
        await equipmentInstanceService.releaseFromMarket(listing.id_instancia, transaction);
      } else if (listing.quantidade_restante > 0) {
        await addStack(id_personagem, listing.id_item, listing.quantidade_restante, transaction);
      }

      listing.status = "Cancelado";
      listing.cancelado_em = new Date();
      await listing.save({ transaction });
    });

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
