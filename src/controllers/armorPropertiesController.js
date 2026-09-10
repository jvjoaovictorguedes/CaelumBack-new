// src/controllers/armorPropertiesController.js
const ArmorProperties = require("../models/ArmorProperties");
const Item = require("../models/Item"); // Importe para incluir nas buscas

// Associações (se não estiverem em um arquivo separado, devem estar aqui ou em app.js)
// Item.hasOne(ArmorProperties, { foreignKey: 'id_item', onDelete: 'CASCADE' }); // Um item pode ter 0 ou 1 propriedade de armadura
// ArmorProperties.belongsTo(Item, { foreignKey: 'id_item' }); // Uma propriedade de armadura pertence a um item

// Criar novas propriedades de armadura
// Nota: Como id_item é a PK e FK, esta rota geralmente é usada para um POST inicial
// ou PUT (substituição completa) se você permitir que as propriedades sejam "recriadas"
// para um item existente. PATCH é mais comum para updates.
exports.createArmorProperties = async (req, res) => {
  try {
    const newArmorProperties = await ArmorProperties.create(req.body);
    res.status(201).json({
      status: "success",
      message: "Propriedades de armadura criadas com sucesso!",
      data: {
        armorProperties: newArmorProperties,
      },
    });
  } catch (error) {
    console.error("Erro ao criar propriedades de armadura:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({
          message:
            "Já existem propriedades de armadura para este item (ID já em uso).",
        });
    }
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao criar propriedades de armadura.",
      });
  }
};

// Obter todas as propriedades de armadura (com dados do Item)
exports.getAllArmorProperties = async (req, res) => {
  try {
    const armorProperties = await ArmorProperties.findAll({
      include: [
        { model: Item, attributes: ["id", "nome", "tipo_item", "raridade"] }, // Inclui apenas id, nome, tipo e raridade do item
      ],
    });
    res.status(200).json({
      status: "success",
      results: armorProperties.length,
      data: {
        armorProperties,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar propriedades de armadura:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao buscar propriedades de armadura.",
      });
  }
};

// Obter propriedades de armadura por ID do Item
exports.getArmorPropertiesById = async (req, res) => {
  try {
    const armorProperties = await ArmorProperties.findByPk(req.params.id_item, {
      include: [
        { model: Item, attributes: ["id", "nome", "tipo_item", "raridade"] },
      ],
    });
    if (!armorProperties) {
      return res
        .status(404)
        .json({
          message: "Propriedades de armadura não encontradas para este item.",
        });
    }
    res.status(200).json({
      status: "success",
      data: {
        armorProperties,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar propriedades de armadura por ID:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao buscar propriedades de armadura.",
      });
  }
};

// Atualizar propriedades de armadura por ID do Item
exports.updateArmorProperties = async (req, res) => {
  try {
    const [updatedRows] = await ArmorProperties.update(req.body, {
      where: { id_item: req.params.id_item },
    });

    if (updatedRows === 0) {
      return res
        .status(404)
        .json({
          message:
            "Propriedades de armadura não encontradas para este item ou nenhum dado para atualizar.",
        });
    }

    const updatedArmorProperties = await ArmorProperties.findByPk(
      req.params.id_item,
      {
        include: [
          { model: Item, attributes: ["id", "nome", "tipo_item", "raridade"] },
        ],
      }
    );
    res.status(200).json({
      status: "success",
      message: "Propriedades de armadura atualizadas com sucesso!",
      data: {
        armorProperties: updatedArmorProperties,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar propriedades de armadura:", error);
    res
      .status(500)
      .json({
        message:
          "Erro interno do servidor ao atualizar propriedades de armadura.",
      });
  }
};

// Deletar propriedades de armadura por ID do Item
exports.deleteArmorProperties = async (req, res) => {
  try {
    const deletedRows = await ArmorProperties.destroy({
      where: { id_item: req.params.id_item },
    });

    if (deletedRows === 0) {
      return res
        .status(404)
        .json({
          message: "Propriedades de armadura não encontradas para este item.",
        });
    }

    res.status(204).json({
      // 204 No Content para deleção bem-sucedida sem corpo de resposta
      status: "success",
      message: "Propriedades de armadura deletadas com sucesso!",
      data: null,
    });
  } catch (error) {
    console.error("Erro ao deletar propriedades de armadura:", error);
    res
      .status(500)
      .json({
        message:
          "Erro interno do servidor ao deletar propriedades de armadura.",
      });
  }
};
