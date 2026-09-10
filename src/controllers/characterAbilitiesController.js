// src/controllers/characterAbilitiesController.js
const CharacterAbilities = require("../models/CharacterAbilities");
const Character = require("../models/Character"); // Importa Character para inclusão
const Power = require("../models/Power"); // Importa Power para inclusão

// Associações (se não estiverem em um arquivo separado, devem estar aqui ou em app.js)
// Character.hasMany(CharacterAbilities, { foreignKey: 'id_character' });
// CharacterAbilities.belongsTo(Character, { foreignKey: 'id_character' });

// Power.hasMany(CharacterAbilities, { foreignKey: 'id_power' }); // Um poder pode ser aprendido por muitos personagens
// CharacterAbilities.belongsTo(Power, { foreignKey: 'id_power' });

// Criar uma nova habilidade de personagem
exports.createCharacterAbility = async (req, res) => {
  try {
    const newCharacterAbility = await CharacterAbilities.create(req.body);
    res.status(201).json({
      status: "success",
      message: "Habilidade de personagem registrada com sucesso!",
      data: {
        characterAbility: newCharacterAbility,
      },
    });
  } catch (error) {
    console.error("Erro ao registrar habilidade de personagem:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Este personagem já possui este poder." });
    }
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao registrar habilidade." });
  }
};

// Obter todas as habilidades de personagem (com dados de Character e Power)
exports.getAllCharacterAbilities = async (req, res) => {
  try {
    // Permite filtrar as habilidades de um único personagem
    // (ex: ?characterId=3), do jeito que a tela de combate precisa.
    const { characterId } = req.query;
    const whereClause = characterId ? { id_character: characterId } : {};

    const characterAbilities = await CharacterAbilities.findAll({
      where: whereClause,
      include: [
        { model: Character, attributes: ["id", "nome", "nivel"] }, // Inclui id, nome e nível do personagem
        { model: Power }, // Inclui todos os dados do poder (dano, cura, custo de mana etc.)
      ],
    });
    res.status(200).json({
      status: "success",
      results: characterAbilities.length,
      data: {
        characterAbilities,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar habilidades de personagem:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar habilidades." });
  }
};

// Obter uma habilidade de personagem por ID
exports.getCharacterAbilityById = async (req, res) => {
  try {
    const characterAbility = await CharacterAbilities.findByPk(req.params.id, {
      include: [
        { model: Character, attributes: ["id", "nome", "nivel"] },
        { model: Power, attributes: ["id", "nome", "tipo_poder"] },
      ],
    });
    if (!characterAbility) {
      return res
        .status(404)
        .json({ message: "Habilidade de personagem não encontrada." });
    }
    res.status(200).json({
      status: "success",
      data: {
        characterAbility,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar habilidade de personagem por ID:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar habilidade." });
  }
};

// Atualizar uma habilidade de personagem por ID
exports.updateCharacterAbility = async (req, res) => {
  try {
    const [updatedRows] = await CharacterAbilities.update(req.body, {
      where: { id: req.params.id },
    });

    if (updatedRows === 0) {
      return res
        .status(404)
        .json({
          message:
            "Habilidade de personagem não encontrada ou nenhum dado para atualizar.",
        });
    }

    const updatedCharacterAbility = await CharacterAbilities.findByPk(
      req.params.id,
      {
        include: [
          { model: Character, attributes: ["id", "nome", "nivel"] },
          { model: Power, attributes: ["id", "nome", "tipo_poder"] },
        ],
      }
    );
    res.status(200).json({
      status: "success",
      message: "Habilidade de personagem atualizada com sucesso!",
      data: {
        characterAbility: updatedCharacterAbility,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar habilidade de personagem:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao atualizar habilidade." });
  }
};

// Deletar uma habilidade de personagem por ID
exports.deleteCharacterAbility = async (req, res) => {
  try {
    const deletedRows = await CharacterAbilities.destroy({
      where: { id: req.params.id },
    });

    if (deletedRows === 0) {
      return res
        .status(404)
        .json({ message: "Habilidade de personagem não encontrada." });
    }

    res.status(204).json({
      // 204 No Content para deleção bem-sucedida sem corpo de resposta
      status: "success",
      message: "Habilidade de personagem deletada com sucesso!",
      data: null,
    });
  } catch (error) {
    console.error("Erro ao deletar habilidade de personagem:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao deletar habilidade." });
  }
};
