// src/controllers/characterController.js
const Character = require("../models/Character");
const User = require("../models/User"); // Importe para incluir nas buscas
const Race = require("../models/Race"); // Importe para incluir nas buscas
const Class = require("../models/Class"); // Importe para incluir nas buscas
const Item = require("../models/Item"); // Importe para incluir nos slots de item

// Configura as associações para Sequelize (importante que essas linhas estejam em algum lugar ANTES de usar as relações)
// Idealmente, você configuraria isso em um arquivo separado, por exemplo, src/models/associations.js
// Mas para o propósito deste exemplo, colocamos aqui para que funcione.
// Certifique-se de que cada modelo (User, Race, Class, Item) também exporta seu módulo corretamente.
User.hasMany(Character, { foreignKey: "id_usuario" });
Character.belongsTo(User, { foreignKey: "id_usuario" });

Race.hasMany(Character, { foreignKey: "id_raca" });
Character.belongsTo(Race, { foreignKey: "id_raca" });

Class.hasMany(Character, { foreignKey: "id_classe" });
Character.belongsTo(Class, { foreignKey: "id_classe" });

// Associações para slots de itens (se você quiser carregar os detalhes do item equipado)
// Você precisará ter o modelo Item importado e definido corretamente
Character.belongsTo(Item, {
  as: "slotCabecaItem",
  foreignKey: "slot_cabeca_item_id",
});
Character.belongsTo(Item, {
  as: "slotTorsoItem",
  foreignKey: "slot_torso_item_id",
});
Character.belongsTo(Item, {
  as: "slotMaosItem",
  foreignKey: "slot_maos_item_id",
});
Character.belongsTo(Item, {
  as: "slotPesItem",
  foreignKey: "slot_pes_item_id",
});
Character.belongsTo(Item, {
  as: "slotArmaPrincipalItem",
  foreignKey: "slot_arma_principal_item_id",
});
Character.belongsTo(Item, {
  as: "slotArmaSecundariaItem",
  foreignKey: "slot_arma_secundaria_item_id",
});
Character.belongsTo(Item, {
  as: "slotAcessorio1Item",
  foreignKey: "slot_acessorio1_item_id",
});
Character.belongsTo(Item, {
  as: "slotAcessorio2Item",
  foreignKey: "slot_acessorio2_item_id",
});

// Criar um novo personagem
exports.createCharacter = async (req, res) => {
  try {
    const newCharacter = await Character.create(req.body);
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
    // Adicionar mais tratamentos de erro específicos aqui, se necessário
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao criar personagem." });
  }
};

// Obter todos os personagens (com dados de User, Race e Class)
exports.getAllCharacters = async (req, res) => {
  try {
    const characters = await Character.findAll({
      include: [
        { model: User, attributes: ["id", "username", "email"] }, // Inclui apenas id, username, email do usuário
        { model: Race },
        { model: Class },
        { model: Item, as: "slotCabecaItem" },
        { model: Item, as: "slotTorsoItem" },
        { model: Item, as: "slotMaosItem" },
        { model: Item, as: "slotPesItem" },
        { model: Item, as: "slotArmaPrincipalItem" },
        { model: Item, as: "slotArmaSecundariaItem" },
        { model: Item, as: "slotAcessorio1Item" },
        { model: Item, as: "slotAcessorio2Item" },
      ],
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

// Obter o personagem de um usuário (relação usuário -> personagem)
// Corrige o fluxo de login, que antes tentava usar o id do usuário
// diretamente como se fosse o id do personagem.
exports.getCharacterByUserId = async (req, res) => {
  try {
    const character = await Character.findOne({
      where: { id_usuario: req.params.userId },
      include: [
        { model: User, attributes: ["id", "username", "email"] },
        { model: Race },
        { model: Class },
        { model: Item, as: "slotCabecaItem" },
        { model: Item, as: "slotTorsoItem" },
        { model: Item, as: "slotMaosItem" },
        { model: Item, as: "slotPesItem" },
        { model: Item, as: "slotArmaPrincipalItem" },
        { model: Item, as: "slotArmaSecundariaItem" },
        { model: Item, as: "slotAcessorio1Item" },
        { model: Item, as: "slotAcessorio2Item" },
      ],
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

// Obter um personagem por ID (com dados de User, Race e Class)
exports.getCharacterById = async (req, res) => {
  try {
    const character = await Character.findByPk(req.params.id, {
      include: [
        { model: User, attributes: ["id", "username", "email"] },
        { model: Race },
        { model: Class },
        { model: Item, as: "slotCabecaItem" },
        { model: Item, as: "slotTorsoItem" },
        { model: Item, as: "slotMaosItem" },
        { model: Item, as: "slotPesItem" },
        { model: Item, as: "slotArmaPrincipalItem" },
        { model: Item, as: "slotArmaSecundariaItem" },
        { model: Item, as: "slotAcessorio1Item" },
        { model: Item, as: "slotAcessorio2Item" },
      ],
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

// Atualizar um personagem por ID
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
      include: [
        // Inclui os dados relacionados após a atualização
        { model: User, attributes: ["id", "username", "email"] },
        { model: Race },
        { model: Class },
        { model: Item, as: "slotCabecaItem" },
        { model: Item, as: "slotTorsoItem" },
        { model: Item, as: "slotMaosItem" },
        { model: Item, as: "slotPesItem" },
        { model: Item, as: "slotArmaPrincipalItem" },
        { model: Item, as: "slotArmaSecundariaItem" },
        { model: Item, as: "slotAcessorio1Item" },
        { model: Item, as: "slotAcessorio2Item" },
      ],
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

// Deletar um personagem por ID
exports.deleteCharacter = async (req, res) => {
  try {
    const deletedRows = await Character.destroy({
      where: { id: req.params.id },
    });

    if (deletedRows === 0) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }

    res.status(204).json({
      // 204 No Content para deleção bem-sucedida sem corpo de resposta
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
