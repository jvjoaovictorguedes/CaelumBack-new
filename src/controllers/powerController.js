// src/controllers/powerController.js
const Power = require("../models/Power");

// Criar um novo poder
exports.createPower = async (req, res) => {
  try {
    const newPower = await Power.create(req.body);
    res.status(201).json({
      status: "success",
      message: "Poder criado com sucesso!",
      data: {
        power: newPower,
      },
    });
  } catch (error) {
    console.error("Erro ao criar poder:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Já existe um poder com este nome." });
    }
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao criar poder." });
  }
};

// Obter todos os poderes
exports.getAllPowers = async (req, res) => {
  try {
    const powers = await Power.findAll();
    res.status(200).json({
      status: "success",
      results: powers.length,
      data: {
        powers,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar poderes:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar poderes." });
  }
};

// Obter um poder por ID
exports.getPowerById = async (req, res) => {
  try {
    const power = await Power.findByPk(req.params.id);
    if (!power) {
      return res.status(404).json({ message: "Poder não encontrado." });
    }
    res.status(200).json({
      status: "success",
      data: {
        power,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar poder por ID:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar poder." });
  }
};

// Atualizar um poder por ID
exports.updatePower = async (req, res) => {
  try {
    const [updatedRows] = await Power.update(req.body, {
      where: { id: req.params.id },
    });

    if (updatedRows === 0) {
      return res
        .status(404)
        .json({
          message: "Poder não encontrado ou nenhum dado para atualizar.",
        });
    }

    const updatedPower = await Power.findByPk(req.params.id); // Busca o poder atualizado
    res.status(200).json({
      status: "success",
      message: "Poder atualizado com sucesso!",
      data: {
        power: updatedPower,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar poder:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Já existe um poder com este nome." });
    }
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao atualizar poder." });
  }
};

// Deletar um poder por ID
exports.deletePower = async (req, res) => {
  try {
    const deletedRows = await Power.destroy({
      where: { id: req.params.id },
    });

    if (deletedRows === 0) {
      return res.status(404).json({ message: "Poder não encontrado." });
    }

    res.status(204).json({
      // 204 No Content para deleção bem-sucedida sem corpo de resposta
      status: "success",
      message: "Poder deletado com sucesso!",
      data: null,
    });
  } catch (error) {
    console.error("Erro ao deletar poder:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao deletar poder." });
  }
};
