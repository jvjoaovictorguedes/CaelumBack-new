// src/controllers/raceAbilitiesController.js
const RaceAbilities = require("../models/RaceAbilities");
const Race = require("../models/Race"); // Importa Race para inclusão
const Power = require("../models/Power"); // Importa Power para inclusão

// Associações (se não estiverem em um arquivo separado, devem estar aqui ou em app.js)
// Race.hasMany(RaceAbilities, { foreignKey: 'id_race' });
// RaceAbilities.belongsTo(Race, { foreignKey: 'id_race' });

// Power.hasMany(RaceAbilities, { foreignKey: 'id_power' });
// RaceAbilities.belongsTo(Power, { foreignKey: 'id_power' });

// Registrar uma nova habilidade de raça
exports.createRaceAbility = async (req, res) => {
  try {
    const newRaceAbility = await RaceAbilities.create(req.body);
    res.status(201).json({
      status: "success",
      message: "Habilidade de raça registrada com sucesso!",
      data: {
        raceAbility: newRaceAbility,
      },
    });
  } catch (error) {
    console.error("Erro ao registrar habilidade de raça:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Esta raça já possui este poder." });
    }
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao registrar habilidade de raça.",
      });
  }
};

// Obter todas as habilidades de raça (com dados de Race e Power)
exports.getAllRaceAbilities = async (req, res) => {
  try {
    const raceAbilities = await RaceAbilities.findAll({
      include: [
        { model: Race, attributes: ["id", "nome", "descricao"] }, // Inclui id, nome, descricao da raça
        { model: Power, attributes: ["id", "nome", "tipo_poder"] }, // Inclui id, nome e tipo do poder
      ],
    });
    res.status(200).json({
      status: "success",
      results: raceAbilities.length,
      data: {
        raceAbilities,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar habilidades de raça:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao buscar habilidades de raça.",
      });
  }
};

// Obter uma habilidade de raça por ID_Race e ID_Power
exports.getRaceAbilityByRaceAndPowerId = async (req, res) => {
  try {
    const { id_race, id_power } = req.params;
    const raceAbility = await RaceAbilities.findOne({
      where: { id_race, id_power },
      include: [
        { model: Race, attributes: ["id", "nome", "descricao"] },
        { model: Power, attributes: ["id", "nome", "tipo_poder"] },
      ],
    });
    if (!raceAbility) {
      return res
        .status(404)
        .json({
          message:
            "Habilidade de raça não encontrada para esta combinação de raça e poder.",
        });
    }
    res.status(200).json({
      status: "success",
      data: {
        raceAbility,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar habilidade de raça por IDs:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao buscar habilidade de raça.",
      });
  }
};

// Atualizar uma habilidade de raça por ID_Race e ID_Power
exports.updateRaceAbility = async (req, res) => {
  try {
    const { id_race, id_power } = req.params;
    const [updatedRows] = await RaceAbilities.update(req.body, {
      where: { id_race, id_power },
    });

    if (updatedRows === 0) {
      return res
        .status(404)
        .json({
          message:
            "Habilidade de raça não encontrada para esta combinação ou nenhum dado para atualizar.",
        });
    }

    const updatedRaceAbility = await RaceAbilities.findOne({
      where: { id_race, id_power }, // Buscar pelo PK composta
      include: [
        { model: Race, attributes: ["id", "nome", "descricao"] },
        { model: Power, attributes: ["id", "nome", "tipo_poder"] },
      ],
    });
    res.status(200).json({
      status: "success",
      message: "Habilidade de raça atualizada com sucesso!",
      data: {
        raceAbility: updatedRaceAbility,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar habilidade de raça:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao atualizar habilidade de raça.",
      });
  }
};

// Deletar uma habilidade de raça por ID_Race e ID_Power
exports.deleteRaceAbility = async (req, res) => {
  try {
    const { id_race, id_power } = req.params;
    const deletedRows = await RaceAbilities.destroy({
      where: { id_race, id_power },
    });

    if (deletedRows === 0) {
      return res
        .status(404)
        .json({
          message: "Habilidade de raça não encontrada para esta combinação.",
        });
    }

    res.status(204).json({
      // 204 No Content para deleção bem-sucedida sem corpo de resposta
      status: "success",
      message: "Habilidade de raça deletada com sucesso!",
      data: null,
    });
  } catch (error) {
    console.error("Erro ao deletar habilidade de raça:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao deletar habilidade de raça.",
      });
  }
};
