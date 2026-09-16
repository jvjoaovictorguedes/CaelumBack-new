// src/controllers/characterController.js
const { Op } = require("sequelize");
const Character = require("../models/Character");
const User = require("../models/User");
const Race = require("../models/Race");
const Class = require("../models/Class");
const Item = require("../models/Item");
const CharacterEquipment = require("../models/CharacterEquipment");
const ClassAbilities = require("../models/ClassAbilities");
const RaceAbilities = require("../models/RaceAbilities");
const CharacterAbilities = require("../models/CharacterAbilities");

User.hasMany(Character, { foreignKey: "id_usuario" });
Character.belongsTo(User, { foreignKey: "id_usuario" });

Race.hasMany(Character, { foreignKey: "id_raca" });
Character.belongsTo(Race, { foreignKey: "id_raca" });

Class.hasMany(Character, { foreignKey: "id_classe" });
Character.belongsTo(Class, { foreignKey: "id_classe" });

Character.hasMany(CharacterEquipment, {
  foreignKey: "id_personagem",
  as: "equipamentos",
});
CharacterEquipment.belongsTo(Character, { foreignKey: "id_personagem" });
CharacterEquipment.belongsTo(Item, { foreignKey: "id_item", as: "item" });

const CHARACTER_INCLUDES = [
  { model: User, attributes: ["id", "username", "email"] },
  { model: Race },
  { model: Class },
  {
    model: CharacterEquipment,
    as: "equipamentos",
    include: [{ model: Item, as: "item" }],
  },
];

// Concede ao personagem os poderes de classe/raça já disponíveis no nível
// dele. Sem isso, personagem novo nascia sem nenhum poder aprendido —
// mesmo quando a classe/raça já tinha um poder configurado pra nível 1
// (ex: Mago aprende Cura Arcana, Celestial aprende Julgamento Divino) —
// e ficava restrito a ataque básico pra sempre, a menos que alguém
// chamasse POST /character-abilities manualmente.
async function concederPoderesIniciais(character) {
  const [poderesClasse, poderesRaca] = await Promise.all([
    ClassAbilities.findAll({
      where: {
        id_classe: character.id_classe,
        nivel_aprendizagem: { [Op.lte]: character.nivel },
      },
    }),
    RaceAbilities.findAll({
      where: {
        id_raca: character.id_raca,
        nivel_aprendizado: { [Op.lte]: character.nivel },
      },
    }),
  ]);

  const linhas = [
    ...poderesClasse.map((poder) => ({
      id_personagem: character.id,
      id_power: poder.id_poder,
      level_learned: poder.nivel_aprendizagem,
      is_active: true,
    })),
    ...poderesRaca.map((poder) => ({
      id_personagem: character.id,
      id_power: poder.id_power,
      level_learned: poder.nivel_aprendizado,
      is_active: true,
    })),
  ];

  if (linhas.length > 0) {
    await CharacterAbilities.bulkCreate(linhas, { ignoreDuplicates: true });
  }
}

exports.createCharacter = async (req, res) => {
  try {
    const newCharacter = await Character.create(req.body);

    try {
      await concederPoderesIniciais(newCharacter);
    } catch (erroPoderes) {
      // Não derruba a criação do personagem por causa disso — só loga.
      console.error(
        "Erro ao conceder poderes iniciais de classe/raça:",
        erroPoderes,
      );
    }

    res.status(201).json({
      status: "success",
      message: "Personagem criado com sucesso!",
      data: {
        character: newCharacter,
      },
    });
  } catch (error) {
    console.error("Erro ao criar personagem:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Já existe um personagem com este nome." });
    }
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao criar personagem." });
  }
};

exports.getAllCharacters = async (req, res) => {
  try {
    const characters = await Character.findAll({
      include: CHARACTER_INCLUDES,
    });
    res.status(200).json({
      status: "success",
      results: characters.length,
      data: {
        characters,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar personagens:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar personagens." });
  }
};

exports.getCharacterByUserId = async (req, res) => {
  try {
    const character = await Character.findOne({
      where: { id_usuario: req.params.userId },
      include: CHARACTER_INCLUDES,
    });
    if (!character) {
      return res
        .status(404)
        .json({ message: "Este usuário ainda não possui um personagem." });
    }
    res.status(200).json({
      status: "success",
      data: {
        character,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar personagem por usuário:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar personagem." });
  }
};

exports.getCharacterById = async (req, res) => {
  try {
    const character = await Character.findByPk(req.params.id, {
      include: CHARACTER_INCLUDES,
    });
    if (!character) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }
    res.status(200).json({
      status: "success",
      data: {
        character,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar personagem por ID:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar personagem." });
  }
};

exports.updateCharacter = async (req, res) => {
  try {
    const [updatedRows] = await Character.update(req.body, {
      where: { id: req.params.id },
    });

    if (updatedRows === 0) {
      return res.status(404).json({
        message: "Personagem não encontrado ou nenhum dado para atualizar.",
      });
    }

    const updatedCharacter = await Character.findByPk(req.params.id, {
      include: CHARACTER_INCLUDES,
    });
    res.status(200).json({
      status: "success",
      message: "Personagem atualizado com sucesso!",
      data: {
        character: updatedCharacter,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar personagem:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Já existe um personagem com este nome." });
    }
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao atualizar personagem." });
  }
};

exports.deleteCharacter = async (req, res) => {
  try {
    const deletedRows = await Character.destroy({
      where: { id: req.params.id },
    });

    if (deletedRows === 0) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }

    res.status(204).json({
      status: "success",
      message: "Personagem deletado com sucesso!",
      data: null,
    });
  } catch (error) {
    console.error("Erro ao deletar personagem:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao deletar personagem." });
  }
};
