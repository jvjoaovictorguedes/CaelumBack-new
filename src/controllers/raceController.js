// src/controllers/raceController.js
const Race = require("../models/Race");

exports.createRace = async (req, res) => {
  try {
    const newRace = await Race.create(req.body);
    res.status(201).json({
      status: "success",
      message: "Raça criada com sucesso!",
      data: {
        race: newRace,
      },
    });
  } catch (error) {
    console.error("Erro ao criar raça:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Já existe uma raça com este nome." });
    }
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao criar raça." });
  }
};

exports.getAllRaces = async (req, res) => {
  try {
    const races = await Race.findAll();
    res.status(200).json({
      status: "success",
      results: races.length,
      data: {
        races,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar raças:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar raças." });
  }
};

exports.getRaceById = async (req, res) => {
  try {
    const race = await Race.findByPk(req.params.id);
    if (!race) {
      return res.status(404).json({ message: "Raça não encontrada." });
    }
    res.status(200).json({
      status: "success",
      data: {
        race,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar raça por ID:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar raça." });
  }
};

exports.updateRace = async (req, res) => {
  try {
    const [updatedRows] = await Race.update(req.body, {
      where: { id: req.params.id },
    });

    if (updatedRows === 0) {
      return res.status(404).json({
        message: "Raça não encontrada ou nenhum dado para atualizar.",
      });
    }

    const updatedRace = await Race.findByPk(req.params.id);
    res.status(200).json({
      status: "success",
      message: "Raça atualizada com sucesso!",
      data: {
        race: updatedRace,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar raça:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Já existe uma raça com este nome." });
    }
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao atualizar raça." });
  }
};

exports.deleteRace = async (req, res) => {
  try {
    const deletedRows = await Race.destroy({
      where: { id: req.params.id },
    });

    if (deletedRows === 0) {
      return res.status(404).json({ message: "Raça não encontrada." });
    }

    res.status(204).json({
      status: "success",
      message: "Raça deletada com sucesso!",
      data: null,
    });
  } catch (error) {
    console.error("Erro ao deletar raça:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao deletar raça." });
  }
};
