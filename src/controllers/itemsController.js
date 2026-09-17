// src/controllers/itemController.js
const Item = require("../models/Item");
const WeaponProperties = require("../models/WeaponProperties");
const ArmorProperties = require("../models/ArmorProperties");
const ConsumableProperties = require("../models/ConsumableProperties");

// As associações Item<->propriedades já são registradas em outros
// controllers (equipmentBonusService.js, consumablePropertiesController.js)
// que sempre são carregados no boot — Sequelize ignora um segundo
// hasOne/belongsTo idêntico entre o mesmo par de models, então repetir
// aqui é seguro e deixa este arquivo não depender de quem rodou primeiro.
Item.hasOne(WeaponProperties, { foreignKey: "id_item" });
WeaponProperties.belongsTo(Item, { foreignKey: "id_item" });
Item.hasOne(ArmorProperties, { foreignKey: "id_item" });
ArmorProperties.belongsTo(Item, { foreignKey: "id_item" });
Item.hasOne(ConsumableProperties, { foreignKey: "id_item" });
ConsumableProperties.belongsTo(Item, { foreignKey: "id_item" });

const INCLUDE_PROPRIEDADES = [
  { model: WeaponProperties },
  { model: ArmorProperties },
  { model: ConsumableProperties },
];

// Criar um novo item
exports.createItem = async (req, res) => {
  try {
    const newItem = await Item.create(req.body);
    res.status(201).json({
      status: "success",
      message: "Item criado com sucesso!",
      data: {
        item: newItem,
      },
    });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Já existe um item com este nome." });
    }
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        message: error.errors.map((validationError) => validationError.message),
      });
    }
    console.error("Erro ao criar item:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao criar item." });
  }
};

// Obter todos os itens
exports.getAllItems = async (req, res) => {
  try {
    // Inclui as propriedades específicas (dano de arma, defesa/atributos
    // de armadura, efeito de consumível) — sem isso o frontend só recebia
    // nome/preço/raridade e não tinha como mostrar os status do item.
    const items = await Item.findAll({ include: INCLUDE_PROPRIEDADES });
    res.status(200).json({
      status: "success",
      results: items.length,
      data: {
        items,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar itens:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar itens." });
  }
};

// Obter um item por ID
exports.getItemById = async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id, { include: INCLUDE_PROPRIEDADES });
    if (!item) {
      return res.status(404).json({ message: "Item não encontrado." });
    }
    res.status(200).json({
      status: "success",
      data: {
        item,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar item por ID:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar item." });
  }
};

// Atualizar um item por ID
exports.updateItem = async (req, res) => {
  try {
    const [updatedRows] = await Item.update(req.body, {
      where: { id: req.params.id },
    });

    if (updatedRows === 0) {
      return res
        .status(404)
        .json({
          message: "Item não encontrado ou nenhum dado para atualizar.",
        });
    }

    const updatedItem = await Item.findByPk(req.params.id); // Busca o item atualizado
    res.status(200).json({
      status: "success",
      message: "Item atualizado com sucesso!",
      data: {
        item: updatedItem,
      },
    });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Já existe um item com este nome." });
    }
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        message: error.errors.map((validationError) => validationError.message),
      });
    }
    console.error("Erro ao atualizar item:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao atualizar item." });
  }
};

// Deletar um item por ID
exports.deleteItem = async (req, res) => {
  try {
    const deletedRows = await Item.destroy({
      where: { id: req.params.id },
    });

    if (deletedRows === 0) {
      return res.status(404).json({ message: "Item não encontrado." });
    }

    res.status(204).json({
      // 204 No Content para deleção bem-sucedida sem corpo de resposta
      status: "success",
      message: "Item deletado com sucesso!",
      data: null,
    });
  } catch (error) {
    console.error("Erro ao deletar item:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao deletar item." });
  }
};
