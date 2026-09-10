// src/controllers/classAbilitiesController.js
const ClassAbilities = require("../models/ClassAbilities");
const Class = require("../models/Class"); // Importa Class para inclusão
const Power = require("../models/Power"); // Importa Power para inclusão

// Associações (se não estiverem em um arquivo separado, devem estar aqui ou em app.js)
// Class.hasMany(ClassAbilities, { foreignKey: 'id_classe' });
// ClassAbilities.belongsTo(Class, { foreignKey: 'id_classe' });

// Power.hasMany(ClassAbilities, { foreignKey: 'id_poder' });
// ClassAbilities.belongsTo(Power, { foreignKey: 'id_poder' });

// Registrar uma nova habilidade de classe
exports.createClassAbility = async (req, res) => {
  try {
    const newClassAbility = await ClassAbilities.create(req.body);
    res.status(201).json({
      status: "success",
      message: "Habilidade de classe registrada com sucesso!",
      data: {
        classAbility: newClassAbility,
      },
    });
  } catch (error) {
    console.error("Erro ao registrar habilidade de classe:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Esta classe já pode aprender este poder." });
    }
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao registrar habilidade de classe.",
      });
  }
};

// Obter todas as habilidades de classe (com dados de Class e Power)
exports.getAllClassAbilities = async (req, res) => {
  try {
    const classAbilities = await ClassAbilities.findAll({
      include: [
        { model: Class, attributes: ["id", "nome", "descricao"] }, // Inclui id, nome, descricao da classe
        { model: Power, attributes: ["id", "nome", "tipo_poder"] }, // Inclui id, nome e tipo do poder
      ],
    });
    res.status(200).json({
      status: "success",
      results: classAbilities.length,
      data: {
        classAbilities,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar habilidades de classe:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao buscar habilidades de classe.",
      });
  }
};

// Obter uma habilidade de classe por ID_Classe e ID_Poder
exports.getClassAbilityByClassAndPowerId = async (req, res) => {
  try {
    const { id_classe, id_poder } = req.params;
    const classAbility = await ClassAbilities.findOne({
      where: { id_classe, id_poder },
      include: [
        { model: Class, attributes: ["id", "nome", "descricao"] },
        { model: Power, attributes: ["id", "nome", "tipo_poder"] },
      ],
    });
    if (!classAbility) {
      return res
        .status(404)
        .json({
          message:
            "Habilidade de classe não encontrada para esta combinação de classe e poder.",
        });
    }
    res.status(200).json({
      status: "success",
      data: {
        classAbility,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar habilidade de classe por IDs:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao buscar habilidade de classe.",
      });
  }
};

// Atualizar uma habilidade de classe por ID_Classe e ID_Poder
exports.updateClassAbility = async (req, res) => {
  try {
    const { id_classe, id_poder } = req.params;
    const [updatedRows] = await ClassAbilities.update(req.body, {
      where: { id_classe, id_poder },
    });

    if (updatedRows === 0) {
      return res
        .status(404)
        .json({
          message:
            "Habilidade de classe não encontrada para esta combinação ou nenhum dado para atualizar.",
        });
    }

    const updatedClassAbility = await ClassAbilities.findOne({
      where: { id_classe, id_poder }, // Buscar pelo PK composta
      include: [
        { model: Class, attributes: ["id", "nome", "descricao"] },
        { model: Power, attributes: ["id", "nome", "tipo_poder"] },
      ],
    });
    res.status(200).json({
      status: "success",
      message: "Habilidade de classe atualizada com sucesso!",
      data: {
        classAbility: updatedClassAbility,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar habilidade de classe:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao atualizar habilidade de classe.",
      });
  }
};

// Deletar uma habilidade de classe por ID_Classe e ID_Poder
exports.deleteClassAbility = async (req, res) => {
  try {
    const { id_classe, id_poder } = req.params;
    const deletedRows = await ClassAbilities.destroy({
      where: { id_classe, id_poder },
    });

    if (deletedRows === 0) {
      return res
        .status(404)
        .json({
          message: "Habilidade de classe não encontrada para esta combinação.",
        });
    }

    res.status(204).json({
      // 204 No Content para deleção bem-sucedida sem corpo de resposta
      status: "success",
      message: "Habilidade de classe deletada com sucesso!",
      data: null,
    });
  } catch (error) {
    console.error("Erro ao deletar habilidade de classe:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao deletar habilidade de classe.",
      });
  }
};
