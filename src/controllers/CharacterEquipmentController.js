const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const CharacterEquipment = require("../models/CharacterEquipment");
const CharacterInventory = require("../models/CharacterInventory");
const Character = require("../models/Character");
const Class = require("../models/Class");
const Item = require("../models/Item");
const ArmorProperties = require("../models/ArmorProperties");
const WeaponProperties = require("../models/WeaponProperties");
const {
  buscarBonusDeAtributos,
  personagemComBonus,
} = require("../services/equipmentBonusService");
const {
  vidaMaximaDe,
  manaMaximaDe,
  comMultiplicadoresDeClasse,
} = require("../services/combatFormulas");

const VALID_SLOTS = [
  "Cabeca",
  "Torso",
  "Pes",
  "ArmaPrincipal",
  "ArmaSecundaria",
  "Acessorio1",
  "Acessorio2",
];

// "Maos" removido de propósito (pedido do jogador) — uma mão já
// segura a arma, a outra o escudo, não sobra mão livre pra uma peça de
// armadura separada. Os itens de Manopla/Luva que existiam foram
// descontinuados (ver migration 20261019010000-remove-manoplas-luvas).
// Escudo continua vivendo inteiramente em ArmaSecundaria, nunca aqui.
const ARMOR_SLOTS = ["Cabeca", "Torso", "Pes"];

// Equipamento que aumenta vitalidade/inteligência também aumenta vida/
// mana MÁXIMA — sem reclampar depois de trocar, vida_atual podia ficar
// maior que o novo máximo (curar até 160 com armadura equipada, depois
// desequipar e continuar com 160/100). Precisa rodar dentro da MESMA
// transação que gravou a mudança de equipamento — chamar
// buscarBonusDeAtributos SEM passar `transaction` leria de uma conexão
// separada e não veria o equip/unequip ainda não commitado. Só reduz
// (Math.min): equipar algo que aumenta o máximo nunca cura de graça,
// só amplia o teto.
async function clamparVidaManaAoMaximo(character, transaction) {
  const bonus = await buscarBonusDeAtributos(character.id, transaction);
  const efetivo = comMultiplicadoresDeClasse(
    personagemComBonus(character.toJSON(), bonus),
    character.Class,
  );
  const vidaMaxima = vidaMaximaDe(efetivo);
  const manaMaxima = manaMaximaDe(efetivo);

  const novaVida = Math.min(character.vida_atual, vidaMaxima);
  const novaMana = Math.min(character.mana_atual, manaMaxima);

  if (novaVida !== character.vida_atual || novaMana !== character.mana_atual) {
    character.vida_atual = novaVida;
    character.mana_atual = novaMana;
    await character.save({ transaction });
  }
}

async function validarCompatibilidade(slot, item) {
  if (ARMOR_SLOTS.includes(slot)) {
    if (!["Armadura", "Capacete"].includes(item.tipo_item)) {
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

  if (slot === "ArmaPrincipal") {
    if (item.tipo_item !== "Arma") {
      return `O item "${item.nome}" não é uma arma.`;
    }
    return null;
  }

  if (slot === "ArmaSecundaria") {
    // A "mão secundária" aceita uma segunda arma (dual-wield) OU um
    // escudo — nunca os dois ao mesmo tempo, e isso já sai de graça por
    // ser o MESMO slot do banco (upsert por id_personagem+slot: só cabe
    // um item aqui). Escudo nunca passa pelo ARMOR_SLOTS acima — só as
    // duas mãos existem (arma + arma/escudo), não sobra uma terceira
    // pra uma peça de armadura separada.
    if (item.tipo_item !== "Arma" && item.tipo_item !== "Escudo") {
      return `O item "${item.nome}" não é uma arma nem um escudo.`;
    }
    if (item.tipo_item === "Escudo") {
      const propriedades = await ArmorProperties.findByPk(item.id);
      if (!propriedades) {
        return `O item "${item.nome}" não possui propriedades de escudo configuradas.`;
      }
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
      // "FOR UPDATE" não pode se aplicar ao lado nullable de um LEFT
      // OUTER JOIN (é o que o include de Class gera) — escopa o lock só
      // pra tabela Character (mesmo padrão de combatController.js).
      const character = await Character.findByPk(id_personagem, {
        include: [{ model: Class }],
        transaction,
        lock: { level: transaction.LOCK.UPDATE, of: Character },
      });
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

      await clamparVidaManaAoMaximo(character, transaction);

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
    const houveMudanca = await sequelize.transaction(async (transaction) => {
      const character = await Character.findByPk(id_personagem, {
        include: [{ model: Class }],
        transaction,
        lock: { level: transaction.LOCK.UPDATE, of: Character },
      });
      if (!character) {
        throw Object.assign(new Error("Personagem não encontrado."), { statusCode: 404 });
      }

      const deletedRows = await CharacterEquipment.destroy({
        where: { id_personagem, slot },
        transaction,
      });
      if (deletedRows === 0) {
        return false;
      }

      await clamparVidaManaAoMaximo(character, transaction);
      return true;
    });

    if (!houveMudanca) {
      return res.status(404).json({
        message: "Esse slot já estava vazio.",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Item desequipado com sucesso!",
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao desequipar item:", error);
    return res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao desequipar item." });
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
      include: [
        {
          model: Item,
          as: "item",
          // Bônus/defesa/dano vêm junto pro EquipmentPanel mostrar um
          // tooltip com os atributos ao passar o mouse no item equipado.
          include: [
            { model: ArmorProperties, as: "armorProperties" },
            { model: WeaponProperties, as: "weaponProperties" },
          ],
        },
      ],
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
