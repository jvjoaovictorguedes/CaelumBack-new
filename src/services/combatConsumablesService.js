// src/services/combatConsumablesService.js
//
// Consumíveis "equipados" no loadout de combate de um personagem
// (Character.slots_consumiveis_combate, definido fora de combate via
// PATCH /characters/:id/combat-loadout/items), já com a quantidade
// atual no inventário e o efeito (cura de vida/mana) — usado tanto pelo
// combate PvE/Portal de Ranque (pra mostrar ao lado dos Poderes) quanto
// pelo duelo PvP ao vivo, pra montar a mesma lista de botões nos dois
// lugares sem duplicar a query.
const Character = require("../models/Character");
const CharacterInventory = require("../models/CharacterInventory");
const Item = require("../models/Item");
const ConsumableProperties = require("../models/ConsumableProperties");
const ConsumableEffect = require("../models/ConsumableEffect");

async function listarConsumiveisDeCombate(characterId, transaction) {
  const character = await Character.findByPk(characterId, {
    attributes: ["id", "slots_consumiveis_combate"],
    transaction,
  });
  const slots = Array.isArray(character?.slots_consumiveis_combate)
    ? character.slots_consumiveis_combate
    : [];
  const idsUnicos = Array.from(new Set(slots.filter((id) => typeof id === "number")));
  if (idsUnicos.length === 0) return [];

  const [inventario, itens, efeitosModernos] = await Promise.all([
    CharacterInventory.findAll({
      where: { id_personagem: characterId, id_item: idsUnicos },
      transaction,
    }),
    Item.findAll({
      where: { id: idsUnicos },
      include: [{ model: ConsumableProperties, as: "consumableProperties" }],
      transaction,
    }),
    // ConsumableEffect (spec Caldeirão §6.5) — pré-carregado em lote
    // igual o resto desta função, pra partySocket.js/pvpLiveSocket.js
    // montarem `acao.efeitosConsumiveisModernos` sem N+1 nenhuma. Um
    // item com HEAL_HP_*/RESTORE_MANA_* aqui faz duelEngine.js ignorar o
    // efeito_vida/efeito_mana legado dele (nunca os dois juntos).
    ConsumableEffect.findAll({ where: { id_item: idsUnicos, ativo: true }, transaction }),
  ]);

  const quantidadePorItem = new Map(inventario.map((entrada) => [entrada.id_item, entrada.quantidade]));
  const itemPorId = new Map(itens.map((item) => [item.id, item]));
  const efeitosModernosPorItem = new Map();
  for (const efeito of efeitosModernos) {
    const lista = efeitosModernosPorItem.get(efeito.id_item) ?? [];
    lista.push({
      effect_key: efeito.effect_key,
      magnitude: efeito.magnitude,
      config: efeito.config,
      duration_turns: efeito.duration_turns,
    });
    efeitosModernosPorItem.set(efeito.id_item, lista);
  }

  // Preserva a ordem dos slots escolhida pelo jogador — um slot cujo
  // item não existe mais (removido do catálogo) simplesmente some da
  // lista em vez de quebrar a resposta inteira.
  return idsUnicos
    .map((idItem) => {
      const item = itemPorId.get(idItem);
      if (!item) return null;
      return {
        id_item: idItem,
        nome: item.nome,
        imagem_url: item.imagem_url,
        quantidade: quantidadePorItem.get(idItem) ?? 0,
        efeito_vida: item.consumableProperties?.efeito_vida ?? 0,
        efeito_mana: item.consumableProperties?.efeito_mana ?? 0,
        efeitos_modernos: efeitosModernosPorItem.get(idItem) ?? [],
      };
    })
    .filter(Boolean);
}

module.exports = { listarConsumiveisDeCombate };
