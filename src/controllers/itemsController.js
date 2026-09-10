// src/controllers/itemController.js
const Item = require("../models/Item");

// Criar um novo item
exports.createItem = async (req, res) => {
  try {
    const newItem = await Item.create(req.body);
    res.status(201).json({
      status: "success",
      message: "Item criado com sucesso!",
      data: {
        item: newItem,
      },
    });
  } catch (error) {
    console.error("Erro ao criar item:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Já existe um item com este nome." });
    }
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao criar item." });
  }
};

// Obter todos os itens
exports.getAllItems = async (req, res) => {
  try {
    const items = await Item.findAll();
    res.status(200).json({
      status: "success",
      results: items.length,
      data: {
        items,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar itens:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar itens." });
  }
};

// Obter um item por ID
exports.getItemById = async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) {
      return res.status(404).json({ message: "Item não encontrado." });
    }
    res.status(200).json({
      status: "success",
      data: {
        item,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar item por ID:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar item." });
  }
};

// Atualizar um item por ID
exports.updateItem = async (req, res) => {
  try {
    const [updatedRows] = await Item.update(req.body, {
      where: { id: req.params.id },
    });

    if (updatedRows === 0) {
      return res
        .status(404)
        .json({
          message: "Item não encontrado ou nenhum dado para atualizar.",
        });
    }

    const updatedItem = await Item.findByPk(req.params.id); // Busca o item atualizado
    res.status(200).json({
      status: "success",
      message: "Item atualizado com sucesso!",
      data: {
        item: updatedItem,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar item:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Já existe um item com este nome." });
    }
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao atualizar item." });
  }
};

// Deletar um item por ID
exports.deleteItem = async (req, res) => {
  try {
    const deletedRows = await Item.destroy({
      where: { id: req.params.id },
    });

    if (deletedRows === 0) {
      return res.status(404).json({ message: "Item não encontrado." });
    }

    res.status(204).json({
      // 204 No Content para deleção bem-sucedida sem corpo de resposta
      status: "success",
      message: "Item deletado com sucesso!",
      data: null,
    });
  } catch (error) {
    console.error("Erro ao deletar item:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao deletar item." });
  }
};
