// src/controllers/characterInventoryController.js
const CharacterInventory = require("../models/CharacterInventory");
const Character = require("../models/Character"); // Importa Character para inclusão
const Item = require("../models/Item"); // Importa Item para inclusão

// Associações (se não estiverem em um arquivo separado, devem estar aqui ou em app.js)
// Character.hasMany(CharacterInventory, { foreignKey: 'id_personagem' });
// CharacterInventory.belongsTo(Character, { foreignKey: 'id_personagem' });

// Item.hasMany(CharacterInventory, { foreignKey: 'id_item' }); // Um item pode estar em muitos inventários
// CharacterInventory.belongsTo(Item, { foreignKey: 'id_item' });

// Criar uma nova entrada no inventário
exports.createCharacterInventory = async (req, res) => {
  try {
    const { id_personagem, id_item, quantidade, equipado } = req.body;

    // Opcional: Verifica se já existe o item no inventário para o personagem
    // Se sim, você pode querer apenas atualizar a quantidade em vez de criar uma nova entrada
    let existingEntry = await CharacterInventory.findOne({
      where: { id_personagem, id_item },
    });

    if (existingEntry) {
      // Se a entrada já existe, atualiza a quantidade
      existingEntry.quantidade += quantidade || 1; // Adiciona 1 se quantidade não for fornecida
      await existingEntry.save();
      return res.status(200).json({
        status: "success",
        message: "Quantidade do item no inventário atualizada!",
        data: {
          inventoryEntry: existingEntry,
        },
      });
    }

    // Se não existe, cria uma nova entrada
    const newInventoryEntry = await CharacterInventory.create(req.body);
    res.status(201).json({
      status: "success",
      message: "Item adicionado ao inventário com sucesso!",
      data: {
        inventoryEntry: newInventoryEntry,
      },
    });
  } catch (error) {
    console.error("Erro ao adicionar item ao inventário:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao adicionar item ao inventário.",
      });
  }
};

// Obter todas as entradas do inventário (opcionalmente filtrado por personagem)
exports.getAllCharacterInventory = async (req, res) => {
  try {
    const { characterId } = req.query; // Permite buscar por ID do personagem
    const whereClause = characterId ? { id_personagem: characterId } : {};

    const inventory = await CharacterInventory.findAll({
      where: whereClause,
      include: [
        { model: Character, attributes: ["id", "nome", "nivel"] }, // Inclui id, nome e nível do personagem
        {
          model: Item,
          attributes: ["id", "nome", "tipo_item", "raridade", "peso"],
        }, // Inclui id, nome, tipo, raridade e peso do item
      ],
    });
    res.status(200).json({
      status: "success",
      results: inventory.length,
      data: {
        inventory,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar inventário:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar inventário." });
  }
};

// Obter uma entrada de inventário por ID (id_personagem_inventario)
exports.getCharacterInventoryById = async (req, res) => {
  try {
    const inventoryEntry = await CharacterInventory.findByPk(req.params.id, {
      include: [
        { model: Character, attributes: ["id", "nome", "nivel"] },
        {
          model: Item,
          attributes: ["id", "nome", "tipo_item", "raridade", "peso"],
        },
      ],
    });
    if (!inventoryEntry) {
      return res
        .status(404)
        .json({ message: "Entrada de inventário não encontrada." });
    }
    res.status(200).json({
      status: "success",
      data: {
        inventoryEntry,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar entrada de inventário por ID:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao buscar entrada de inventário.",
      });
  }
};

// Atualizar uma entrada de inventário por ID (id_personagem_inventario)
exports.updateCharacterInventory = async (req, res) => {
  try {
    const [updatedRows] = await CharacterInventory.update(req.body, {
      where: { id_personagem_inventario: req.params.id }, // Usa id_personagem_inventario para o WHERE
    });

    if (updatedRows === 0) {
      return res
        .status(404)
        .json({
          message:
            "Entrada de inventário não encontrada ou nenhum dado para atualizar.",
        });
    }

    const updatedInventoryEntry = await CharacterInventory.findByPk(
      req.params.id,
      {
        include: [
          { model: Character, attributes: ["id", "nome", "nivel"] },
          {
            model: Item,
            attributes: ["id", "nome", "tipo_item", "raridade", "peso"],
          },
        ],
      }
    );
    res.status(200).json({
      status: "success",
      message: "Entrada de inventário atualizada com sucesso!",
      data: {
        inventoryEntry: updatedInventoryEntry,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar entrada de inventário:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao atualizar entrada de inventário.",
      });
  }
};

// Deletar uma entrada de inventário por ID (id_personagem_inventario)
exports.deleteCharacterInventory = async (req, res) => {
  try {
    const deletedRows = await CharacterInventory.destroy({
      where: { id_personagem_inventario: req.params.id }, // Usa id_personagem_inventario para o WHERE
    });

    if (deletedRows === 0) {
      return res
        .status(404)
        .json({ message: "Entrada de inventário não encontrada." });
    }

    res.status(204).json({
      // 204 No Content para deleção bem-sucedida sem corpo de resposta
      status: "success",
      message: "Entrada de inventário deletada com sucesso!",
      data: null,
    });
  } catch (error) {
    console.error("Erro ao deletar entrada de inventário:", error);
    res
      .status(500)
      .json({
        message: "Erro interno do servidor ao deletar entrada de inventário.",
      });
  }
};
