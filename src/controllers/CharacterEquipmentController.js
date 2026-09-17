const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
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
  // O personagem que está equipando é sempre o do usuário autenticado —
  // nunca o id_personagem que o corpo da requisição mandar.
  const id_personagem = req.personagemAtual.id;
  const { slot, id_item } = req.body;

  if (!slot || !id_item) {
    return res.status(400).json({
      message: "slot e id_item são obrigatórios.",
    });
  }

  if (!VALID_SLOTS.includes(slot)) {
    return res.status(400).json({
      message: `Slot inválido. Use um de: ${VALID_SLOTS.join(", ")}.`,
    });
  }

  try {
    const equipamento = await sequelize.transaction(async (transaction) => {
      const character = await Character.findByPk(id_personagem, { transaction });
      if (!character) {
        throw Object.assign(new Error("Personagem não encontrado."), { statusCode: 404 });
      }

      const item = await Item.findByPk(id_item, { transaction });
      if (!item) {
        throw Object.assign(new Error("Item não encontrado."), { statusCode: 404 });
      }

      // Trava a linha do inventário: sem isso, duas requisições de
      // equipar concorrentes (ex.: arma principal e secundária ao mesmo
      // tempo) podiam ler a mesma "1 unidade disponível" antes de
      // qualquer uma confirmar, e as duas passavam na checagem.
      const inventoryEntry = await CharacterInventory.findOne({
        where: { id_personagem, id_item },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!inventoryEntry || inventoryEntry.quantidade < 1) {
        throw Object.assign(
          new Error("Você não possui esse item no inventário."),
          { statusCode: 400 },
        );
      }

      // O inventário só guarda "quantas cópias eu tenho", não "quantas já
      // estão em uso" — sem isso dava pra equipar a mesma espada em
      // ArmaPrincipal e ArmaSecundaria ao mesmo tempo com só 1 no inventário.
      const jaEquipadoAlhures = await CharacterEquipment.count({
        where: { id_personagem, id_item, slot: { [Op.ne]: slot } },
        transaction,
      });
      if (inventoryEntry.quantidade <= jaEquipadoAlhures) {
        throw Object.assign(
          new Error(
            `Você só tem ${inventoryEntry.quantidade} unidade(s) de "${item.nome}" e já está usando ${jaEquipadoAlhures} em outro slot.`,
          ),
          { statusCode: 400 },
        );
      }

      const erroCompatibilidade = await validarCompatibilidade(slot, item);
      if (erroCompatibilidade) {
        throw Object.assign(new Error(erroCompatibilidade), { statusCode: 400 });
      }

      const [linha] = await CharacterEquipment.upsert(
        { id_personagem, slot, id_item },
        { returning: true, transaction },
      );
      return linha;
    });

    return res.status(200).json({
      status: "success",
      message: "Item equipado com sucesso!",
      data: { equipamento },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao equipar item:", error);
    return res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao equipar item." });
  }
};

exports.unequipItem = async (req, res) => {
  const id_personagem = req.personagemAtual.id;
  const { slot } = req.body;

  if (!slot) {
    return res.status(400).json({
      message: "slot é obrigatório.",
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
    // Só usado hoje pelo painel do próprio personagem (EquipmentPanel) —
    // sem essa checagem, qualquer usuário autenticado lia o equipamento
    // de qualquer personagem só trocando o :characterId na URL.
    const personagem = await Character.findByPk(req.params.characterId, {
      attributes: ["id", "id_usuario"],
    });
    if (!personagem) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }
    if (personagem.id_usuario !== req.user.id) {
      return res.status(403).json({ message: "Esse personagem não pertence a você." });
    }

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
