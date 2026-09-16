const { Op } = require("sequelize");
const CharacterEquipment = require("../models/CharacterEquipment");
const CharacterInventory = require("../models/CharacterInventory");
const Character = require("../models/Character");
const Item = require("../models/Item");
const ArmorProperties = require("../models/ArmorProperties");

const VALID_SLOTS = [
  "Cabeca",
  "Torso",
  "Maos",
  "Pes",
  "ArmaPrincipal",
  "ArmaSecundaria",
  "Acessorio1",
  "Acessorio2",
];

const ARMOR_SLOTS = ["Cabeca", "Torso", "Maos", "Pes"];

async function validarCompatibilidade(slot, item) {
  if (ARMOR_SLOTS.includes(slot)) {
    if (!["Armadura", "Capacete", "Escudo"].includes(item.tipo_item)) {
      return `O item "${item.nome}" não é uma peça de armadura.`;
    }
    const propriedades = await ArmorProperties.findByPk(item.id);
    if (!propriedades) {
      return `O item "${item.nome}" não possui propriedades de armadura configuradas.`;
    }
    if (propriedades.slot_equipamento !== slot) {
      return `O item "${item.nome}" pertence ao slot ${propriedades.slot_equipamento}, não ${slot}.`;
    }
    return null;
  }

  if (slot === "ArmaPrincipal" || slot === "ArmaSecundaria") {
    if (item.tipo_item !== "Arma") {
      return `O item "${item.nome}" não é uma arma.`;
    }
    return null;
  }

  if (slot === "Acessorio1" || slot === "Acessorio2") {
    if (item.tipo_item !== slot) {
      return `O item "${item.nome}" não é compatível com o slot ${slot}.`;
    }
    return null;
  }

  return "Slot inválido.";
}

exports.equipItem = async (req, res) => {
  const { id_personagem, slot, id_item } = req.body;

  if (!id_personagem || !slot || !id_item) {
    return res.status(400).json({
      message: "id_personagem, slot e id_item são obrigatórios.",
    });
  }

  if (!VALID_SLOTS.includes(slot)) {
    return res.status(400).json({
      message: `Slot inválido. Use um de: ${VALID_SLOTS.join(", ")}.`,
    });
  }

  try {
    const character = await Character.findByPk(id_personagem);
    if (!character) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }

    const item = await Item.findByPk(id_item);
    if (!item) {
      return res.status(404).json({ message: "Item não encontrado." });
    }

    const inventoryEntry = await CharacterInventory.findOne({
      where: { id_personagem, id_item },
    });
    if (!inventoryEntry || inventoryEntry.quantidade < 1) {
      return res.status(400).json({
        message: "Você não possui esse item no inventário.",
      });
    }

    // O inventário só guarda "quantas cópias eu tenho", não "quantas já
    // estão em uso" — sem isso dava pra equipar a mesma espada em
    // ArmaPrincipal e ArmaSecundaria ao mesmo tempo com só 1 no inventário.
    const jaEquipadoAlhures = await CharacterEquipment.count({
      where: { id_personagem, id_item, slot: { [Op.ne]: slot } },
    });
    if (inventoryEntry.quantidade <= jaEquipadoAlhures) {
      return res.status(400).json({
        message: `Você só tem ${inventoryEntry.quantidade} unidade(s) de "${item.nome}" e já está usando ${jaEquipadoAlhures} em outro slot.`,
      });
    }

    const erroCompatibilidade = await validarCompatibilidade(slot, item);
    if (erroCompatibilidade) {
      return res.status(400).json({ message: erroCompatibilidade });
    }

    const [equipamento] = await CharacterEquipment.upsert(
      { id_personagem, slot, id_item },
      { returning: true },
    );

    return res.status(200).json({
      status: "success",
      message: "Item equipado com sucesso!",
      data: { equipamento },
    });
  } catch (error) {
    console.error("Erro ao equipar item:", error);
    return res
      .status(500)
      .json({ message: "Erro interno do servidor ao equipar item." });
  }
};

exports.unequipItem = async (req, res) => {
  const { id_personagem, slot } = req.body;

  if (!id_personagem || !slot) {
    return res.status(400).json({
      message: "id_personagem e slot são obrigatórios.",
    });
  }

  try {
    const deletedRows = await CharacterEquipment.destroy({
      where: { id_personagem, slot },
    });

    if (deletedRows === 0) {
      return res.status(404).json({
        message: "Esse slot já estava vazio.",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Item desequipado com sucesso!",
    });
  } catch (error) {
    console.error("Erro ao desequipar item:", error);
    return res
      .status(500)
      .json({ message: "Erro interno do servidor ao desequipar item." });
  }
};

exports.getEquipmentByCharacter = async (req, res) => {
  try {
    const equipamentos = await CharacterEquipment.findAll({
      where: { id_personagem: req.params.characterId },
      include: [{ model: Item, as: "item" }],
    });

    return res.status(200).json({
      status: "success",
      results: equipamentos.length,
      data: { equipamentos },
    });
  } catch (error) {
    console.error("Erro ao buscar equipamento:", error);
    return res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar equipamento." });
  }
};
