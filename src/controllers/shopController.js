// src/controllers/shopController.js
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Item = require("../models/Item");
const CharacterInventory = require("../models/CharacterInventory");

// POST /api/shop/purchase
// body: { id_personagem, id_item, quantidade }
exports.purchaseItem = async (req, res) => {
  // Quem compra é sempre o personagem do usuário autenticado — nunca o
  // id_personagem que o corpo mandar.
  const id_personagem = req.personagemAtual.id;
  const { id_item } = req.body;
  const quantidade =
    req.body.quantidade === undefined ? 1 : Number(req.body.quantidade);

  if (!id_item) {
    return res.status(400).json({
      message: "id_item é obrigatório.",
    });
  }

  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return res.status(400).json({ message: "Quantidade inválida." });
  }

  try {
    const result = await sequelize.transaction(async (transaction) => {
      // Trava a linha do personagem para evitar corrida entre compras simultâneas
      const character = await Character.findByPk(id_personagem, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!character) {
        const error = new Error("Personagem não encontrado.");
        error.statusCode = 404;
        throw error;
      }

      const item = await Item.findByPk(id_item, { transaction });

      if (!item) {
        const error = new Error("Item não encontrado.");
        error.statusCode = 404;
        throw error;
      }

      const precoTotal = item.valor_compra * quantidade;

      if (character.dinheiro < precoTotal) {
        const error = new Error("Moedas insuficientes para esta compra.");
        error.statusCode = 400;
        throw error;
      }

      // Debita o valor do personagem
      character.dinheiro -= precoTotal;
      await character.save({ transaction });

      // Credita o item no inventário (soma se já existir)
      let inventoryEntry = await CharacterInventory.findOne({
        where: { id_personagem, id_item },
        transaction,
      });

      if (inventoryEntry) {
        inventoryEntry.quantidade += quantidade;
        await inventoryEntry.save({ transaction });
      } else {
        inventoryEntry = await CharacterInventory.create(
          { id_personagem, id_item, quantidade },
          { transaction },
        );
      }

      return { character, inventoryEntry, item };
    });

    return res.status(200).json({
      status: "success",
      message: "Compra realizada com sucesso!",
      data: {
        character: { dinheiro: result.character.dinheiro },
        inventoryEntry: result.inventoryEntry,
        quantidadeComprada: quantidade,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) {
      console.error("Erro ao processar compra:", error);
    }
    return res.status(statusCode).json({
      message: error.statusCode
        ? error.message
        : "Erro interno do servidor ao processar a compra.",
    });
  }
};
