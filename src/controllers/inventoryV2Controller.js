// Inventário v2 (spec "Inventário e Equipamentos v2" §9) — visão
// unificada: stacks (empilháveis) + instâncias de equipamento soltas no
// inventário + o que está equipado agora. Só leitura; equipar/
// desequipar/anunciar são endpoints próprios (equipmentInstanceController.js).
const CharacterInventory = require("../models/CharacterInventory");
const CharacterEquipment = require("../models/CharacterEquipment");
const CharacterEquipmentInstance = require("../models/CharacterEquipmentInstance");
const Item = require("../models/Item");
const ArmorProperties = require("../models/ArmorProperties");
const WeaponProperties = require("../models/WeaponProperties");
const ConsumableProperties = require("../models/ConsumableProperties");
const ItemRarityAttributeOverride = require("../models/ItemRarityAttributeOverride");
const { listarInstancias, formatarInstancia, formatarEquipado, ESTADOS } = require("../services/equipmentInstanceService");
const { resolverConjuntosEquipados } = require("../services/equipmentSetService");

function formatarStack(entrada) {
  const item = entrada.Item;
  return {
    id_personagem_inventario: entrada.id_personagem_inventario,
    id_item: entrada.id_item,
    nome: item?.nome,
    tipo_item: item?.tipo_item,
    raridade: item?.raridade,
    imagem_url: item?.imagem_url,
    quantidade: entrada.quantidade,
    consumableProperties: item?.consumableProperties ?? null,
  };
}

// GET /api/inventory/v2
exports.obterInventarioV2 = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;

    const [stacks, instancias, equipados, conjuntos] = await Promise.all([
      CharacterInventory.findAll({
        where: { id_personagem: idPersonagem },
        include: [{ model: Item, include: [{ model: ConsumableProperties, as: "consumableProperties" }] }],
      }),
      listarInstancias(idPersonagem),
      CharacterEquipment.findAll({
        where: { id_personagem: idPersonagem },
        include: [
          {
            model: Item,
            as: "item",
            include: [
              { model: WeaponProperties, as: "weaponProperties" },
              { model: ArmorProperties, as: "armorProperties" },
              { model: ItemRarityAttributeOverride, as: "raridadeOverrides" },
            ],
          },
          { model: CharacterEquipmentInstance, as: "instancia" },
        ],
      }),
      // Sistema de Conjuntos de Equipamentos — visão já resolvida
      // (peças/thresholds/ativação), pra tela de equipamentos não
      // precisar recalcular regra nenhuma (§10 da Especificação).
      resolverConjuntosEquipados(idPersonagem),
    ]);

    res.status(200).json({
      status: "success",
      data: {
        stacks: stacks.map(formatarStack),
        // Só as SOLTAS no inventário — equipada/anunciada aparecem em
        // `equipped`/reservadas ao Mercado, nunca duplicadas aqui.
        equipmentInstances: instancias.filter((i) => i.estado === ESTADOS.INVENTARIO).map(formatarInstancia),
        equipped: equipados.map(formatarEquipado),
        equipmentSets: conjuntos.sets,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar inventário v2:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar o inventário." });
  }
};
