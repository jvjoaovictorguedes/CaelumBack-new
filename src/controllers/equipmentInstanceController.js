// Equipar/desequipar por INSTÂNCIA (Inventário v2 §8) — controller
// fino, delega tudo pro equipmentInstanceService. Rotas antigas
// (CharacterEquipmentController.js, por id_item) continuam funcionando
// como compatibilidade temporária (§8/§14).
const { sequelize } = require("../config/database");
const equipmentInstanceService = require("../services/equipmentInstanceService");
const Character = require("../models/Character");
const Class = require("../models/Class");
const {
  buscarBonusDeAtributos,
  personagemComBonus,
} = require("../services/equipmentBonusService");
const {
  vidaMaximaDe,
  manaMaximaDe,
  comMultiplicadoresDeClasse,
} = require("../services/combatFormulas");

// Mesmo clamp que já existia em CharacterEquipmentController.js — trocar
// de equipamento pode reduzir vida/mana MÁXIMA, e vida_atual não pode
// ficar acima do novo teto.
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

// POST /api/equipment/instances/:instanceId/equip
exports.equipar = async (req, res) => {
  const idPersonagem = req.personagemAtual.id;
  const idInstancia = Number(req.params.instanceId);
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const r = await equipmentInstanceService.equip(idPersonagem, idInstancia, transaction);
      const character = await Character.findByPk(idPersonagem, {
        include: [{ model: Class }],
        transaction,
        lock: { level: transaction.LOCK.UPDATE, of: Character },
      });
      await clamparVidaManaAoMaximo(character, transaction);
      return r;
    });
    res.status(200).json({ status: "success", message: "Item equipado com sucesso!", data: resultado });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao equipar instância:", error);
    res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor ao equipar item." });
  }
};

// POST /api/equipment/slots/:slot/unequip
exports.desequipar = async (req, res) => {
  const idPersonagem = req.personagemAtual.id;
  const { slot } = req.params;
  try {
    await sequelize.transaction(async (transaction) => {
      await equipmentInstanceService.unequip(idPersonagem, slot, transaction);
      const character = await Character.findByPk(idPersonagem, {
        include: [{ model: Class }],
        transaction,
        lock: { level: transaction.LOCK.UPDATE, of: Character },
      });
      await clamparVidaManaAoMaximo(character, transaction);
    });
    res.status(200).json({ status: "success", message: "Item desequipado com sucesso!" });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao desequipar slot:", error);
    res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor ao desequipar item." });
  }
};
