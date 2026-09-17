// src/controllers/evolutionController.js
// CRUD administrativo de evoluções (o "onde o mago pode chegar" de cada
// natureza mágica) — quem compra pra um personagem é
// characterController.comprarEvolucao, não este arquivo.
const Evolution = require("../models/Evolution");

exports.createEvolution = async (req, res) => {
  try {
    const newEvolution = await Evolution.create(req.body);
    res.status(201).json({
      status: "success",
      message: "Evolução criada com sucesso!",
      data: { evolution: newEvolution },
    });
  } catch (error) {
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        message: error.errors.map((validationError) => validationError.message),
      });
    }
    console.error("Erro ao criar evolução:", error);
    res.status(500).json({ message: "Erro interno do servidor ao criar evolução." });
  }
};

exports.getAllEvolutions = async (req, res) => {
  try {
    const where = {};
    if (req.query.id_classe) where.id_classe = req.query.id_classe;
    if (req.query.natureza_magica) where.natureza_magica = req.query.natureza_magica;

    const evolutions = await Evolution.findAll({ where, order: [["ordem", "ASC"]] });
    res.status(200).json({
      status: "success",
      results: evolutions.length,
      data: { evolutions },
    });
  } catch (error) {
    console.error("Erro ao buscar evoluções:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar evoluções." });
  }
};

exports.getEvolutionById = async (req, res) => {
  try {
    const evolution = await Evolution.findByPk(req.params.id);
    if (!evolution) {
      return res.status(404).json({ message: "Evolução não encontrada." });
    }
    res.status(200).json({ status: "success", data: { evolution } });
  } catch (error) {
    console.error("Erro ao buscar evolução por ID:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar evolução." });
  }
};

exports.updateEvolution = async (req, res) => {
  try {
    const [updatedRows] = await Evolution.update(req.body, {
      where: { id: req.params.id },
    });
    if (updatedRows === 0) {
      return res.status(404).json({
        message: "Evolução não encontrada ou nenhum dado para atualizar.",
      });
    }
    const updatedEvolution = await Evolution.findByPk(req.params.id);
    res.status(200).json({
      status: "success",
      message: "Evolução atualizada com sucesso!",
      data: { evolution: updatedEvolution },
    });
  } catch (error) {
    console.error("Erro ao atualizar evolução:", error);
    res.status(500).json({ message: "Erro interno do servidor ao atualizar evolução." });
  }
};

exports.deleteEvolution = async (req, res) => {
  try {
    const deletedRows = await Evolution.destroy({ where: { id: req.params.id } });
    if (deletedRows === 0) {
      return res.status(404).json({ message: "Evolução não encontrada." });
    }
    res.status(204).json({
      status: "success",
      message: "Evolução deletada com sucesso!",
      data: null,
    });
  } catch (error) {
    console.error("Erro ao deletar evolução:", error);
    res.status(500).json({ message: "Erro interno do servidor ao deletar evolução." });
  }
};
