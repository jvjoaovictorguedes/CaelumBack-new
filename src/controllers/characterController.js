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
const {
  buscarBonusDeAtributos,
  personagemComBonus,
} = require("../services/equipmentBonusService");
const {
  vidaMaximaDe,
  manaMaximaDe,
  comMultiplicadoresDeClasse,
} = require("../services/combatFormulas");
const { sortearNaturezaMagica } = require("../services/naturezaMagicaService");

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
  // Sem email aqui de propósito: esse include entra em toda leitura de
  // personagem (inclusive quando um jogador olha o personagem de outro,
  // ex.: alvo de PvP) — devolver email vazava o contato de qualquer
  // jogador pra qualquer outro.
  { model: User, attributes: ["id", "username"] },
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
    // Sempre o usuário autenticado — nunca o id_usuario que o corpo
    // mandar, senão qualquer um criava (ou "roubava" a criação de) um
    // personagem em nome de outra conta.
    const id_usuario = req.user.id;
    const { nome, genero, id_raca, id_classe } = req.body;
    if (!nome || !genero || !id_raca || !id_classe) {
      return res.status(400).json({
        message: "nome, genero, id_raca e id_classe são obrigatórios.",
      });
    }

    const jaTemPersonagem = await Character.findOne({ where: { id_usuario } });
    if (jaTemPersonagem) {
      return res.status(409).json({ message: "Sua conta já tem um personagem." });
    }

    const raca = await Race.findByPk(id_raca);
    if (!raca) {
      return res.status(400).json({ message: "Raça inválida." });
    }
    const classe = await Class.findByPk(id_classe);
    if (!classe) {
      return res.status(400).json({ message: "Classe inválida." });
    }

    // Nível, dinheiro, atributos e vida/mana NUNCA vêm do corpo da
    // requisição: são sempre os valores iniciais fixos do jogo (nível 1,
    // 15 de ouro) mais os bônus da raça escolhida — sem isso, um cliente
    // podia criar um personagem já rico, de nível alto ou com atributos
    // arbitrários só editando o payload.
    const forca = raca.bonus_forca ?? 0;
    const vitalidade = raca.bonus_vitalidade ?? 0;
    const agilidade = raca.bonus_agilidade ?? 0;
    const inteligencia = raca.bonus_inteligencia ?? 0;
    const velocidade = raca.bonus_velocidade ?? 0;

    const newCharacter = await Character.create({
      id_usuario,
      nome,
      genero,
      id_raca,
      id_classe,
      // Sempre sorteada aqui — nunca a partir do que o cliente mandar,
      // senão qualquer um garantia a natureza rara só mandando o valor
      // certo no corpo da requisição.
      natureza_magica: sortearNaturezaMagica(),
      nivel: 1,
      experiencia: 0,
      dinheiro: 15,
      pontos_distribuir: 0,
      forca,
      vitalidade,
      agilidade,
      inteligencia,
      velocidade,
      vida_atual: 30 + vitalidade * 6,
      mana_atual: 20 + inteligencia * 5,
    });

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

    // Sincroniza poderes de classe/raça toda vez que o personagem é
    // carregado — bulkCreate com ignoreDuplicates é seguro de chamar
    // repetidamente. Sem isso, um personagem criado antes de um poder
    // novo ser adicionado à classe (ex: Bola de Fogo pro Mago) nunca
    // aprendia esse poder, só quem criasse personagem depois.
    try {
      await concederPoderesIniciais(character);
    } catch (erroPoderes) {
      console.error("Erro ao sincronizar poderes iniciais:", erroPoderes);
    }

    const bonus_atributos = await buscarBonusDeAtributos(character.id);
    const personagemEfetivo = comMultiplicadoresDeClasse(
      personagemComBonus(character.toJSON(), bonus_atributos),
      character.Class,
    );
    res.status(200).json({
      status: "success",
      data: {
        character: {
          ...character.toJSON(),
          bonus_atributos,
          vida_maxima: vidaMaximaDe(personagemEfetivo),
          mana_maxima: manaMaximaDe(personagemEfetivo),
        },
      },
    });
  } catch (error) {
    console.error("Erro ao buscar personagem por ID:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar personagem." });
  }
};

// Único uso legítimo hoje é a troca de sexo (GenderToggleButton). Sem
// uma lista explícita, esse PATCH aceitava qualquer coluna do modelo —
// dinheiro, nivel, stats, id_usuario — vindo direto do corpo da
// requisição.
const CAMPOS_EDITAVEIS = ["genero"];

exports.updateCharacter = async (req, res) => {
  try {
    const dadosPermitidos = {};
    for (const campo of CAMPOS_EDITAVEIS) {
      if (req.body[campo] !== undefined) dadosPermitidos[campo] = req.body[campo];
    }
    if (Object.keys(dadosPermitidos).length === 0) {
      return res.status(400).json({ message: "Nenhum campo editável foi enviado." });
    }

    const [updatedRows] = await Character.update(dadosPermitidos, {
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
