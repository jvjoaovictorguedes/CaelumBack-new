// Marketplace P2P — venda de itens entre jogadores, separado da Loja
// (shopController.js, onde quem vende é o sistema). O item anunciado
// sai do inventário do vendedor na hora de criar o anúncio (evita
// vender/equipar o mesmo item enquanto ele está à venda) e só volta se
// o anúncio for cancelado.
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Item = require("../models/Item");
const CharacterInventory = require("../models/CharacterInventory");
const MarketListing = require("../models/MarketListing");

// 8% fica pelo caminho a cada venda — dreno de ouro padrão de MMO pra
// segurar a inflação de uma economia onde jogador também gera ouro
// puro (drop, missão). O vendedor recebe o resto; ninguém "recebe" a
// taxa, ela só desaparece da economia.
const TAXA_MERCADO = 0.08;

const PRECO_MAXIMO_UNITARIO = 1_000_000;

exports.criarAnuncio = async (req, res) => {
  const id_personagem = req.personagemAtual.id;
  const { id_item, quantidade, preco_unitario } = req.body;

  const qtd = Number(quantidade);
  const preco = Number(preco_unitario);

  if (!id_item || !Number.isInteger(qtd) || qtd <= 0) {
    return res.status(400).json({ message: "id_item e quantidade (inteiro positivo) são obrigatórios." });
  }
  if (!Number.isInteger(preco) || preco <= 0 || preco > PRECO_MAXIMO_UNITARIO) {
    return res.status(400).json({ message: "Preço unitário inválido." });
  }

  try {
    const listing = await sequelize.transaction(async (transaction) => {
      const item = await Item.findByPk(id_item, { transaction });
      if (!item) {
        throw Object.assign(new Error("Item não encontrado."), { statusCode: 404 });
      }
      if (["QuestItem", "Currencia"].includes(item.tipo_item)) {
        throw Object.assign(new Error(`Item do tipo "${item.tipo_item}" não pode ser anunciado.`), {
          statusCode: 400,
        });
      }

      const inventoryEntry = await CharacterInventory.findOne({
        where: { id_personagem, id_item },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!inventoryEntry || inventoryEntry.quantidade < qtd) {
        throw Object.assign(
          new Error(`Você não tem ${qtd} unidade(s) de "${item.nome}" disponível(is) no inventário.`),
          { statusCode: 400 },
        );
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
          quantidade: qtd,
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

// GET /api/market/listings?tipo_item=&raridade=&nome=
exports.listarAnuncios = async (req, res) => {
  try {
    const { tipo_item, raridade, nome } = req.query;
    const whereItem = {};
    if (tipo_item) whereItem.tipo_item = tipo_item;
    if (raridade) whereItem.raridade = raridade;
    if (nome) whereItem.nome = { [Op.iLike]: `%${nome}%` };

    const listings = await MarketListing.findAll({
      where: { status: "Ativo" },
      include: [
        { model: Item, as: "item", where: Object.keys(whereItem).length ? whereItem : undefined },
        { model: Character, as: "vendedor", attributes: ["id", "nome"] },
      ],
      order: [["preco_unitario", "ASC"]],
      limit: 100,
    });

    return res.status(200).json({ status: "success", results: listings.length, data: { listings } });
  } catch (error) {
    console.error("Erro ao listar anúncios do mercado:", error);
    return res.status(500).json({ message: "Erro interno do servidor ao listar anúncios." });
  }
};

// GET /api/market/listings/mine
exports.meusAnuncios = async (req, res) => {
  try {
    const listings = await MarketListing.findAll({
      where: { id_personagem_vendedor: req.personagemAtual.id },
      include: [{ model: Item, as: "item" }],
      order: [["createdAt", "DESC"]],
      limit: 100,
    });
    return res.status(200).json({ status: "success", results: listings.length, data: { listings } });
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
      if (!listing || listing.status !== "Ativo") {
        throw Object.assign(new Error("Este anúncio não está mais disponível."), { statusCode: 404 });
      }
      if (listing.id_personagem_vendedor === id_personagem_comprador) {
        throw Object.assign(new Error("Você não pode comprar seu próprio anúncio."), { statusCode: 400 });
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
        throw Object.assign(new Error("Personagem não encontrado."), { statusCode: 404 });
      }
      if (!vendedor) {
        throw Object.assign(new Error("Vendedor não encontrado."), { statusCode: 404 });
      }

      const precoTotal = listing.preco_unitario * listing.quantidade;
      if (comprador.dinheiro < precoTotal) {
        throw Object.assign(new Error("Moedas insuficientes para esta compra."), { statusCode: 400 });
      }

      const valorLiquidoVendedor = Math.floor(precoTotal * (1 - TAXA_MERCADO));

      comprador.dinheiro -= precoTotal;
      vendedor.dinheiro += valorLiquidoVendedor;
      await comprador.save({ transaction });
      await vendedor.save({ transaction });

      let entrada = await CharacterInventory.findOne({
        where: { id_personagem: id_personagem_comprador, id_item: listing.id_item },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (entrada) {
        entrada.quantidade += listing.quantidade;
        await entrada.save({ transaction });
      } else {
        entrada = await CharacterInventory.create(
          { id_personagem: id_personagem_comprador, id_item: listing.id_item, quantidade: listing.quantidade },
          { transaction },
        );
      }

      listing.status = "Vendido";
      listing.id_personagem_comprador = id_personagem_comprador;
      listing.vendido_em = new Date();
      await listing.save({ transaction });

      return { listing, precoTotal, valorLiquidoVendedor };
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
        throw Object.assign(new Error("Este anúncio não está mais ativo."), { statusCode: 404 });
      }
      if (listing.id_personagem_vendedor !== id_personagem) {
        throw Object.assign(new Error("Este anúncio não é seu."), { statusCode: 403 });
      }

      let entrada = await CharacterInventory.findOne({
        where: { id_personagem, id_item: listing.id_item },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (entrada) {
        entrada.quantidade += listing.quantidade;
        await entrada.save({ transaction });
      } else {
        entrada = await CharacterInventory.create(
          { id_personagem, id_item: listing.id_item, quantidade: listing.quantidade },
          { transaction },
        );
      }

      listing.status = "Cancelado";
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
