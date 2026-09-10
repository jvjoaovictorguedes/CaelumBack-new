// src/controllers/weaponPropertiesController.js
const WeaponProperties = require("../models/WeaponProperties");
const Item = require("../models/Item"); // Importe para incluir nas buscas

// Associações (se não estiverem em um arquivo separado, devem estar aqui ou em app.js)
// Item.hasOne(WeaponProperties, { foreignKey: 'id_item', onDelete: 'CASCADE' });
// WeaponProperties.belongsTo(Item, { foreignKey: 'id_item' });

// Criar novas propriedades de arma
exports.createWeaponProperties = async (req, res) => {
  try {
    const newWeaponProperties = await WeaponProperties.create(req.body);
    res.status(201).json({
      status: "success",
      message: "Propriedades de arma criadas com sucesso!",
      data: {
        weaponProperties: newWeaponProperties,
      },
    });
  } catch (error) {
    console.error("Erro ao criar propriedades de arma:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({
          message:
            "Já existem propriedades de arma para este item (ID já em uso).",
        });
    }
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao criar propriedades de arma.",
      });
  }
};

// Obter todas as propriedades de arma (com dados do Item)
exports.getAllWeaponProperties = async (req, res) => {
  try {
    const weaponProperties = await WeaponProperties.findAll({
      include: [
        {
          model: Item,
          attributes: ["id", "nome", "tipo_item", "raridade", "peso"],
        },
      ],
    });
    res.status(200).json({
      status: "success",
      results: weaponProperties.length,
      data: {
        weaponProperties,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar propriedades de arma:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao buscar propriedades de arma.",
      });
  }
};

// Obter propriedades de arma por ID do Item
exports.getWeaponPropertiesById = async (req, res) => {
  try {
    const weaponProperties = await WeaponProperties.findByPk(
      req.params.id_item,
      {
        include: [
          {
            model: Item,
            attributes: ["id", "nome", "tipo_item", "raridade", "peso"],
          },
        ],
      }
    );
    if (!weaponProperties) {
      return res
        .status(404)
        .json({
          message: "Propriedades de arma não encontradas para este item.",
        });
    }
    res.status(200).json({
      status: "success",
      data: {
        weaponProperties,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar propriedades de arma por ID:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao buscar propriedades de arma.",
      });
  }
};

// Atualizar propriedades de arma por ID do Item
exports.updateWeaponProperties = async (req, res) => {
  try {
    const [updatedRows] = await WeaponProperties.update(req.body, {
      where: { id_item: req.params.id_item },
    });

    if (updatedRows === 0) {
      return res
        .status(404)
        .json({
          message:
            "Propriedades de arma não encontradas para este item ou nenhum dado para atualizar.",
        });
    }

    const updatedWeaponProperties = await WeaponProperties.findByPk(
      req.params.id_item,
      {
        include: [
          {
            model: Item,
            attributes: ["id", "nome", "tipo_item", "raridade", "peso"],
          },
        ],
      }
    );
    res.status(200).json({
      status: "success",
      message: "Propriedades de arma atualizadas com sucesso!",
      data: {
        weaponProperties: updatedWeaponProperties,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar propriedades de arma:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao atualizar propriedades de arma.",
      });
  }
};

// Deletar propriedades de arma por ID do Item
exports.deleteWeaponProperties = async (req, res) => {
  try {
    const deletedRows = await WeaponProperties.destroy({
      where: { id_item: req.params.id_item },
    });

    if (deletedRows === 0) {
      return res
        .status(404)
        .json({
          message: "Propriedades de arma não encontradas para este item.",
        });
    }

    res.status(204).json({
      // 204 No Content para deleção bem-sucedida sem corpo de resposta
      status: "success",
      message: "Propriedades de arma deletadas com sucesso!",
      data: null,
    });
  } catch (error) {
    console.error("Erro ao deletar propriedades de arma:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao deletar propriedades de arma.",
      });
  }
};
