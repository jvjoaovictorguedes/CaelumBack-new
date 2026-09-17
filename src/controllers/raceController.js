// src/controllers/raceController.js
const Race = require("../models/Race");
const {
  PROPOSITO_RACA,
  sortearRacaRaraGanhou,
  emitirTicket,
} = require("../services/raridadeRolagemService");

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

// POST /api/races/sortear-raro
// O servidor sorteia (nunca o cliente) se o usuário ganhou acesso a uma
// raça rara nesta tentativa de criação de personagem. Diferente da
// classe rara, aqui quem ganha não recebe uma raça já escolhida pelo
// servidor: recebe a LISTA de todas as raças raras (Celestial,
// Primordial, e qualquer outra que exista) pra escolher livremente —
// cada uma com seu próprio ticket, já que o ticket é amarrado a uma
// raça específica (id da opção). O front manda de volta só o ticket da
// que o jogador escolheu; createCharacter valida esse ticket contra o
// id_raca enviado.
exports.sortearRacaRara = async (req, res) => {
  try {
    if (!sortearRacaRaraGanhou()) {
      return res.status(200).json({ status: "success", data: { raro: false } });
    }

    const racasRaras = await Race.findAll({ where: { raro: true } });
    if (racasRaras.length === 0) {
      return res.status(200).json({ status: "success", data: { raro: false } });
    }

    const opcoes = racasRaras.map((raca) => ({
      raca,
      ticket: emitirTicket(PROPOSITO_RACA, req.user.id, raca.id),
    }));

    return res.status(200).json({
      status: "success",
      data: { raro: true, opcoes },
    });
  } catch (error) {
    console.error("Erro ao sortear raça rara:", error);
    res.status(500).json({ message: "Erro interno do servidor ao sortear raça." });
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
