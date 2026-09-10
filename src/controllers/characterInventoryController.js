// src/controllers/characterInventoryController.js

const { sequelize } = require("../config/database");
const CharacterInventory = require("../models/CharacterInventory");
const Character = require("../models/Character");
const Item = require("../models/Item");
const ConsumableProperties = require("../models/ConsumableProperties");

// POST /api/character-items/use
// body: { id_personagem, id_item, quantidade }
exports.useItem = async (req, res) => {
  const { id_personagem, id_item } = req.body;
  const quantidade =
    req.body.quantidade === undefined ? 1 : Number(req.body.quantidade);

  if (!id_personagem || !id_item) {
    return res.status(400).json({
      message: "id_personagem e id_item são obrigatórios.",
    });
  }

  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return res.status(400).json({ message: "Quantidade inválida." });
  }

  try {
    const result = await sequelize.transaction(async (transaction) => {
      const inventoryEntry = await CharacterInventory.findOne({
        where: { id_personagem, id_item },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!inventoryEntry || inventoryEntry.quantidade < quantidade) {
        const error = new Error(
          "Você não possui esse item (ou quantidade insuficiente) no inventário.",
        );
        error.statusCode = 400;
        throw error;
      }

      const item = await Item.findByPk(id_item, { transaction });
      if (!item) {
        const error = new Error("Item não encontrado.");
        error.statusCode = 404;
        throw error;
      }

      if (item.tipo_item !== "Consumivel") {
        const error = new Error("Este item não pode ser usado diretamente.");
        error.statusCode = 400;
        throw error;
      }

      const efeito = await ConsumableProperties.findByPk(id_item, {
        transaction,
      });
      if (!efeito) {
        const error = new Error(
          "Este item não possui efeito configurado (ConsumableProperties).",
        );
        error.statusCode = 400;
        throw error;
      }

      const character = await Character.findByPk(id_personagem, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!character) {
        const error = new Error("Personagem não encontrado.");
        error.statusCode = 404;
        throw error;
      }

      const vidaMaxima = 30 + (character.vitalidade || 0) * 6;

      if (efeito.efeito_vida) {
        character.vida_atual = Math.min(
          vidaMaxima,
          character.vida_atual + efeito.efeito_vida * quantidade,
        );
      }

      if (efeito.efeito_mana) {
        character.mana_atual =
          character.mana_atual + efeito.efeito_mana * quantidade;
      }

      await character.save({ transaction });

      inventoryEntry.quantidade -= quantidade;
      if (inventoryEntry.quantidade <= 0) {
        await inventoryEntry.destroy({ transaction });
      } else {
        await inventoryEntry.save({ transaction });
      }

      return {
        character,
        inventoryEntry,
        ficouZerado: inventoryEntry.quantidade <= 0,
      };
    });

    return res.status(200).json({
      status: "success",
      message: "Item usado com sucesso!",
      data: {
        character: {
          vida_atual: result.character.vida_atual,
          mana_atual: result.character.mana_atual,
        },
        quantidadeRestante: result.ficouZerado
          ? 0
          : result.inventoryEntry.quantidade,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) {
      console.error("Erro ao usar item:", error);
    }
    return res.status(statusCode).json({
      message: error.statusCode
        ? error.message
        : "Erro interno do servidor ao usar o item.",
    });
  }
};

// Criar uma nova entrada no inventário
exports.createCharacterInventory = async (req, res) => {
  try {
    const { id_personagem, id_item, quantidade } = req.body;

    let existingEntry = await CharacterInventory.findOne({
      where: { id_personagem, id_item },
    });

    if (existingEntry) {
      existingEntry.quantidade += quantidade || 1;
      await existingEntry.save();
      return res.status(200).json({
        status: "success",
        message: "Quantidade do item no inventário atualizada!",
        data: {
          inventoryEntry: existingEntry,
        },
      });
    }

    const newInventoryEntry = await CharacterInventory.create(req.body);
    res.status(201).json({
      status: "success",
      message: "Item adicionado ao inventário com sucesso!",
      data: {
        inventoryEntry: newInventoryEntry,
      },
    });
  } catch (error) {
    console.error("Erro ao adicionar item ao inventário:", error);
    res.status(500).json({
      message: "Erro interno do servidor ao adicionar item ao inventário.",
    });
  }
};

// Obter todas as entradas do inventário
exports.getAllCharacterInventory = async (req, res) => {
  try {
    const { characterId } = req.query;
    const whereClause = characterId ? { id_personagem: characterId } : {};

    const inventory = await CharacterInventory.findAll({
      where: whereClause,
      include: [
        { model: Character, attributes: ["id", "nome", "nivel"] },
        {
          model: Item,
          attributes: ["id", "nome", "tipo_item", "raridade", "peso"],
        },
      ],
    });
    res.status(200).json({
      status: "success",
      results: inventory.length,
      data: {
        inventory,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar inventário:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar inventário." });
  }
};

// Obter uma entrada de inventário por ID
exports.getCharacterInventoryById = async (req, res) => {
  try {
    const inventoryEntry = await CharacterInventory.findByPk(req.params.id, {
      include: [
        { model: Character, attributes: ["id", "nome", "nivel"] },
        {
          model: Item,
          attributes: ["id", "nome", "tipo_item", "raridade", "peso"],
        },
      ],
    });
    if (!inventoryEntry) {
      return res
        .status(404)
        .json({ message: "Entrada de inventário não encontrada." });
    }
    res.status(200).json({
      status: "success",
      data: {
        inventoryEntry,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar entrada de inventário por ID:", error);
    res.status(500).json({
      message: "Erro interno do servidor ao buscar entrada de inventário.",
    });
  }
};

// Atualizar uma entrada de inventário por ID
exports.updateCharacterInventory = async (req, res) => {
  try {
    const [updatedRows] = await CharacterInventory.update(req.body, {
      where: { id_personagem_inventario: req.params.id },
    });

    if (updatedRows === 0) {
      return res.status(404).json({
        message:
          "Entrada de inventário não encontrada ou nenhum dado para atualizar.",
      });
    }

    const updatedInventoryEntry = await CharacterInventory.findByPk(
      req.params.id,
      {
        include: [
          { model: Character, attributes: ["id", "nome", "nivel"] },
          {
            model: Item,
            attributes: ["id", "nome", "tipo_item", "raridade", "peso"],
          },
        ],
      },
    );
    res.status(200).json({
      status: "success",
      message: "Entrada de inventário atualizada com sucesso!",
      data: {
        inventoryEntry: updatedInventoryEntry,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar entrada de inventário:", error);
    res.status(500).json({
      message: "Erro interno do servidor ao atualizar entrada de inventário.",
    });
  }
};

// Deletar uma entrada de inventário por ID
exports.deleteCharacterInventory = async (req, res) => {
  try {
    const deletedRows = await CharacterInventory.destroy({
      where: { id_personagem_inventario: req.params.id },
    });

    if (deletedRows === 0) {
      return res
        .status(404)
        .json({ message: "Entrada de inventário não encontrada." });
    }

    res.status(204).json({
      status: "success",
      message: "Entrada de inventário deletada com sucesso!",
      data: null,
    });
  } catch (error) {
    console.error("Erro ao deletar entrada de inventário:", error);
    res.status(500).json({
      message: "Erro interno do servidor ao deletar entrada de inventário.",
    });
  }
};
