// Profissão de Ferreiro §10 — resolve os bônus EFETIVOS da Ferraria pra
// cada área (Fundição/Fabricação/Refinamento). Único ponto que lê
// ForgeToolEffect; smelting/crafting/refinement nunca leem a tabela
// direto — sempre passam pelo mesmo cálculo aqui, pra Admin/Simulador
// (forgeChancePreviewService) nunca divergir do gameplay real.
const CharacterForgeToolLoadout = require("../models/CharacterForgeToolLoadout");
const CharacterEquipmentInstance = require("../models/CharacterEquipmentInstance");
const ForgeToolEffect = require("../models/ForgeToolEffect");

const SLOT_POR_EFFECT_KEY = {
  SMELTING_BONUS_BAR_PPM: "Fole",
  CRAFTING_QUALITY_BONUS_PPM: "Martelo",
  REFINEMENT_SUCCESS_BONUS_PPM: "Tenaz",
};

async function idInstanciaEquipadaNoSlot(characterId, slot, transaction) {
  const loadout = await CharacterForgeToolLoadout.findOne({ where: { id_personagem: characterId }, transaction });
  if (!loadout) return null;
  if (slot === "Fole") return loadout.id_instancia_fole;
  if (slot === "Martelo") return loadout.id_instancia_martelo;
  if (slot === "Tenaz") return loadout.id_instancia_tenaz;
  return null;
}

// Bônus em PPM de uma effect key específica, vindo só da ferramenta
// equipada no slot correspondente (0 se nenhuma ferramenta equipada, ou
// se a ferramenta equipada não tiver esse efeito).
async function bonusFerramentaPpm(characterId, effectKey, transaction) {
  const slot = SLOT_POR_EFFECT_KEY[effectKey];
  const idInstancia = await idInstanciaEquipadaNoSlot(characterId, slot, transaction);
  if (!idInstancia) return 0;

  const instancia = await CharacterEquipmentInstance.findOne({
    where: { id: idInstancia, id_personagem: characterId },
    transaction,
  });
  if (!instancia) return 0;

  const efeitos = await ForgeToolEffect.findAll({
    where: { id_item: instancia.id_item, effect_key: effectKey },
    transaction,
  });
  return efeitos.reduce((soma, e) => soma + e.valor_ppm, 0);
}

const bonusFundicaoPpm = (characterId, transaction) => bonusFerramentaPpm(characterId, "SMELTING_BONUS_BAR_PPM", transaction);
const bonusFabricacaoPpm = (characterId, transaction) => bonusFerramentaPpm(characterId, "CRAFTING_QUALITY_BONUS_PPM", transaction);
const bonusRefinamentoPpm = (characterId, transaction) => bonusFerramentaPpm(characterId, "REFINEMENT_SUCCESS_BONUS_PPM", transaction);

module.exports = {
  bonusFundicaoPpm,
  bonusFabricacaoPpm,
  bonusRefinamentoPpm,
};
