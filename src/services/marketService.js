// Lógica transacional do Mercado Negro P2P, extraída de
// marketController.js (Loja do Aventureiro V2 §17: "Mercado Negro e
// Loja do Aventureiro chamam o mesmo service. O controller continua
// apenas validando request/response superficialmente.") — nenhuma
// regra mudou nesta extração, só mudou ONDE ela mora, pra a Loja do
// Aventureiro reaproveitar criar/comprar/cancelar anúncio sem duplicar
// nada (double-spend, refund, venda dupla de stack/instância já são
// riscos cobertos aqui uma única vez).
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Item = require("../models/Item");
const CharacterInventory = require("../models/CharacterInventory");
const CharacterEquipmentInstance = require("../models/CharacterEquipmentInstance");
const MarketListing = require("../models/MarketListing");
const MarketTransaction = require("../models/MarketTransaction");
const { addStack } = require("./inventoryService");
const equipmentInstanceService = require("./equipmentInstanceService");
const {
  TAXA_MERCADO,
  PRECO_MINIMO_UNITARIO,
  PRECO_MAXIMO_UNITARIO,
} = require("../config/marketConfig");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

function getConfig() {
  return { taxa_mercado: TAXA_MERCADO, preco_minimo_unitario: PRECO_MINIMO_UNITARIO, preco_maximo_unitario: PRECO_MAXIMO_UNITARIO };
}

async function createListing({ idPersonagem, idItem, quantidade, precoUnitario, idInstancia }) {
  const qtd = Number(quantidade);
  const preco = Number(precoUnitario);

  if (!idItem || !Number.isInteger(qtd) || qtd <= 0) {
    throw erro("id_item e quantidade (inteiro positivo) são obrigatórios.");
  }
  if (!Number.isInteger(preco) || preco < PRECO_MINIMO_UNITARIO || preco > PRECO_MAXIMO_UNITARIO) {
    throw erro(`Preço unitário deve estar entre ${PRECO_MINIMO_UNITARIO} e ${PRECO_MAXIMO_UNITARIO}.`);
  }

  return sequelize.transaction(async (transaction) => {
    const item = await Item.findByPk(idItem, { transaction });
    if (!item) {
      throw erro("Item não encontrado.", 404);
    }
    if (["QuestItem", "Currencia"].includes(item.tipo_item)) {
      throw erro(`Item do tipo "${item.tipo_item}" não pode ser anunciado.`);
    }
    if (!item.negociavel_mercado) {
      throw erro(`"${item.nome}" não pode ser anunciado no Mercado.`);
    }

    if (equipmentInstanceService.ehInstanciavel(item.tipo_item)) {
      if (qtd !== 1) {
        throw erro("Equipamento é anunciado um de cada vez (quantidade deve ser 1).");
      }
      if (!idInstancia) {
        throw erro("id_instancia é obrigatório pra anunciar equipamento.");
      }
      await equipmentInstanceService.reserveForMarket(idPersonagem, idInstancia, transaction);

      return MarketListing.create(
        {
          id_personagem_vendedor: idPersonagem,
          id_item: idItem,
          id_instancia: idInstancia,
          quantidade_total: 1,
          quantidade_restante: 1,
          preco_unitario: preco,
          status: "Ativo",
        },
        { transaction },
      );
    }

    const inventoryEntry = await CharacterInventory.findOne({
      where: { id_personagem: idPersonagem, id_item: idItem },
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
        id_personagem_vendedor: idPersonagem,
        id_item: idItem,
        quantidade_total: qtd,
        quantidade_restante: qtd,
        preco_unitario: preco,
        status: "Ativo",
      },
      { transaction },
    );
  });
}

async function buyListing({ idListing, idPersonagemComprador, quantidade }) {
  return sequelize.transaction(async (transaction) => {
    const listing = await MarketListing.findByPk(idListing, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!listing || listing.status !== "Ativo" || listing.quantidade_restante <= 0) {
      throw erro("Este anúncio não está mais disponível.", 404);
    }
    if (listing.id_personagem_vendedor === idPersonagemComprador) {
      throw erro("Você não pode comprar seu próprio anúncio.");
    }

    const quantidadeSolicitada = quantidade !== undefined ? Number(quantidade) : listing.quantidade_restante;

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
    // primeiro) — evita deadlock em compras concorrentes com papéis
    // invertidos entre os dois mesmos personagens.
    const vendedorId = listing.id_personagem_vendedor;
    const [primeiroId, segundoId] = [idPersonagemComprador, vendedorId].sort((a, b) => a - b);
    const primeiro = await Character.findByPk(primeiroId, { transaction, lock: transaction.LOCK.UPDATE });
    const segundo = await Character.findByPk(segundoId, { transaction, lock: transaction.LOCK.UPDATE });
    const comprador = primeiroId === idPersonagemComprador ? primeiro : segundo;
    const vendedor = primeiroId === vendedorId ? primeiro : segundo;

    if (!comprador) {
      throw erro("Personagem não encontrado.", 404);
    }
    if (!vendedor) {
      throw erro("Vendedor não encontrado.", 404);
    }

    // Preço total SEMPRE recalculado a partir do preco_unitario gravado
    // no anúncio e da quantidade validada acima — nunca a partir de um
    // total que o cliente mande.
    const precoTotal = listing.preco_unitario * quantidadeSolicitada;
    if (comprador.dinheiro < precoTotal) {
      throw erro("Moedas insuficientes para esta compra.");
    }

    const taxa = Math.floor(precoTotal * TAXA_MERCADO);
    const valorLiquidoVendedor = precoTotal - taxa;

    comprador.dinheiro -= precoTotal;
    // Ouro do mercado é transferência entre jogadores, não fonte nova —
    // nunca passa por goldService.concederOuro.
    vendedor.dinheiro += valorLiquidoVendedor;
    await comprador.save({ transaction });
    await vendedor.save({ transaction });

    if (listing.id_instancia) {
      await equipmentInstanceService.transfer(listing.id_instancia, idPersonagemComprador, transaction);
    } else {
      // Anúncio de equipamento sem id_instancia é lixo de antes da regra
      // atual — recusa alto e claro em vez de criar um stack preso que a
      // tela de equipamentos nunca lê.
      const itemAnunciado = await Item.findByPk(listing.id_item, { transaction });
      if (itemAnunciado && equipmentInstanceService.ehInstanciavel(itemAnunciado.tipo_item)) {
        throw erro(
          "Este anúncio está corrompido (equipamento sem instância vinculada) e não pode ser comprado. Avise um administrador.",
          409,
        );
      }
      await addStack(idPersonagemComprador, listing.id_item, quantidadeSolicitada, transaction);
    }

    listing.quantidade_restante -= quantidadeSolicitada;
    if (listing.quantidade_restante <= 0) {
      listing.status = "Vendido";
      listing.vendido_em = new Date();
    }
    // id_personagem_comprador no listing registra só o último comprador
    // — o histórico completo (múltiplos compradores parciais) vive em
    // MarketTransaction, nunca aqui.
    listing.id_personagem_comprador = idPersonagemComprador;
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
        id_personagem_comprador: idPersonagemComprador,
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
}

// Editar preço de um anúncio ativo (pedido do jogador na Loja do
// Aventureiro: "faltou editar o preço" — sem isso só dava pra cancelar
// e republicar, perdendo o histórico/posição do anúncio). Só mexe no
// preço, nunca em quantidade/item — isso continua exigindo cancelar e
// criar outro.
async function updateListingPrice({ idListing, idPersonagem, precoUnitario }) {
  const preco = Number(precoUnitario);
  if (!Number.isInteger(preco) || preco < PRECO_MINIMO_UNITARIO || preco > PRECO_MAXIMO_UNITARIO) {
    throw erro(`Preço unitário precisa ser um inteiro entre ${PRECO_MINIMO_UNITARIO} e ${PRECO_MAXIMO_UNITARIO}.`);
  }

  return sequelize.transaction(async (transaction) => {
    const listing = await MarketListing.findByPk(idListing, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!listing || listing.status !== "Ativo") {
      throw erro("Este anúncio não está mais ativo.", 404);
    }
    if (listing.id_personagem_vendedor !== idPersonagem) {
      throw erro("Este anúncio não é seu.", 403);
    }

    listing.preco_unitario = preco;
    await listing.save({ transaction });
    return listing;
  });
}

async function cancelListing({ idListing, idPersonagem }) {
  return sequelize.transaction(async (transaction) => {
    const listing = await MarketListing.findByPk(idListing, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!listing || listing.status !== "Ativo") {
      throw erro("Este anúncio não está mais ativo.", 404);
    }
    if (listing.id_personagem_vendedor !== idPersonagem) {
      throw erro("Este anúncio não é seu.", 403);
    }

    // Devolve só o que RESTOU anunciado — se já vendeu parte, essa parte
    // já foi entregue a outros compradores e não volta.
    if (listing.id_instancia) {
      await equipmentInstanceService.releaseFromMarket(listing.id_instancia, transaction);
    } else if (listing.quantidade_restante > 0) {
      await addStack(idPersonagem, listing.id_item, listing.quantidade_restante, transaction);
    }

    listing.status = "Cancelado";
    listing.cancelado_em = new Date();
    await listing.save({ transaction });
    return listing;
  });
}

module.exports = { getConfig, createListing, buyListing, cancelListing, updateListingPrice };
