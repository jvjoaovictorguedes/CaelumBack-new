// src/controllers/consumablePropertiesController.js
const ConsumableProperties = require("../models/ConsumableProperties");
const Item = require("../models/Item"); // Importe para incluir nas buscas

// Associações (se não estiverem em um arquivo separado, devem estar aqui ou em app.js)
// Item.hasOne(ConsumableProperties, { foreignKey: 'id_item', onDelete: 'CASCADE' });
// ConsumableProperties.belongsTo(Item, { foreignKey: 'id_item' });

// Criar novas propriedades de consumível
exports.createConsumableProperties = async (req, res) => {
  try {
    const newConsumableProperties = await ConsumableProperties.create(req.body);
    res.status(201).json({
      status: "success",
      message: "Propriedades de consumível criadas com sucesso!",
      data: {
        consumableProperties: newConsumableProperties,
      },
    });
  } catch (error) {
    console.error("Erro ao criar propriedades de consumível:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({
          message:
            "Já existem propriedades de consumível para este item (ID já em uso).",
        });
    }
    res
      .status(500)
      .json({
        message:
          "Erro interno do servidor ao criar propriedades de consumível.",
      });
  }
};

// Obter todas as propriedades de consumível (com dados do Item)
exports.getAllConsumableProperties = async (req, res) => {
  try {
    const consumableProperties = await ConsumableProperties.findAll({
      include: [
        { model: Item, attributes: ["id", "nome", "tipo_item", "raridade"] },
      ],
    });
    res.status(200).json({
      status: "success",
      results: consumableProperties.length,
      data: {
        consumableProperties,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar propriedades de consumível:", error);
    res
      .status(500)
      .json({
        message:
          "Erro interno do servidor ao buscar propriedades de consumível.",
      });
  }
};

// Obter propriedades de consumível por ID do Item
exports.getConsumablePropertiesById = async (req, res) => {
  try {
    const consumableProperties = await ConsumableProperties.findByPk(
      req.params.id_item,
      {
        include: [
          { model: Item, attributes: ["id", "nome", "tipo_item", "raridade"] },
        ],
      }
    );
    if (!consumableProperties) {
      return res
        .status(404)
        .json({
          message: "Propriedades de consumível não encontradas para este item.",
        });
    }
    res.status(200).json({
      status: "success",
      data: {
        consumableProperties,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar propriedades de consumível por ID:", error);
    res
      .status(500)
      .json({
        message:
          "Erro interno do servidor ao buscar propriedades de consumível.",
      });
  }
};

// Atualizar propriedades de consumível por ID do Item
exports.updateConsumableProperties = async (req, res) => {
  try {
    const [updatedRows] = await ConsumableProperties.update(req.body, {
      where: { id_item: req.params.id_item },
    });

    if (updatedRows === 0) {
      return res
        .status(404)
        .json({
          message:
            "Propriedades de consumível não encontradas para este item ou nenhum dado para atualizar.",
        });
    }

    const updatedConsumableProperties = await ConsumableProperties.findByPk(
      req.params.id_item,
      {
        include: [
          { model: Item, attributes: ["id", "nome", "tipo_item", "raridade"] },
        ],
      }
    );
    res.status(200).json({
      status: "success",
      message: "Propriedades de consumível atualizadas com sucesso!",
      data: {
        consumableProperties: updatedConsumableProperties,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar propriedades de consumível:", error);
    res
      .status(500)
      .json({
        message:
          "Erro interno do servidor ao atualizar propriedades de consumível.",
      });
  }
};

// Deletar propriedades de consumível por ID do Item
exports.deleteConsumableProperties = async (req, res) => {
  try {
    const deletedRows = await ConsumableProperties.destroy({
      where: { id_item: req.params.id_item },
    });

    if (deletedRows === 0) {
      return res
        .status(404)
        .json({
          message: "Propriedades de consumível não encontradas para este item.",
        });
    }

    res.status(204).json({
      // 204 No Content para deleção bem-sucedida sem corpo de resposta
      status: "success",
      message: "Propriedades de consumível deletadas com sucesso!",
      data: null,
    });
  } catch (error) {
    console.error("Erro ao deletar propriedades de consumível:", error);
    res
      .status(500)
      .json({
        message:
          "Erro interno do servidor ao deletar propriedades de consumível.",
      });
  }
};
