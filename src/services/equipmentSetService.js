// src/services/equipmentSetService.js
//
// Sistema de Conjuntos de Equipamentos — serviço central (Especificação
// Sistema de Conjuntos §6). Concentra contagem, deduplicação, thresholds
// e serialização do estado dos conjuntos de um personagem. Controllers e
// frontend NUNCA reproduzem essas regras — só consomem o resultado daqui
// (mesmo princípio já usado por combatPowerService pro Poder de Combate).
//
// Autoridade: o servidor é a única fonte de quantas peças estão
// equipadas e quais thresholds estão ativos. O cliente nunca envia
// quantidade de peças nem bônus ativado.
const CharacterEquipment = require("../models/CharacterEquipment");
const EquipmentSet = require("../models/EquipmentSet");
const EquipmentSetPiece = require("../models/EquipmentSetPiece");
const EquipmentSetBonus = require("../models/EquipmentSetBonus");
const Item = require("../models/Item");
const ForgeBlueprint = require("../models/ForgeBlueprint");
const ForgeBlueprintResult = require("../models/ForgeBlueprintResult");
const { Op } = require("sequelize");
// Só o require garante que as associações (com alias explícito) já
// foram declaradas — ver models/associations.js pra fonte única.
require("../models/associations");

const CAMPOS_STAT = ["forca", "vitalidade", "agilidade", "inteligencia", "velocidade", "defesa"];

function statBonusZerado() {
  return { forca: 0, vitalidade: 0, agilidade: 0, inteligencia: 0, velocidade: 0, defesa: 0 };
}

function estadoVazio() {
  return { statBonus: statBonusZerado(), activeEffects: [], sets: [] };
}

// Resolve os conjuntos equipados por um personagem: quantas peças
// únicas de cada conjunto estão equipadas, quais thresholds estão
// ativos, a soma dos stats numéricos ativos e quais passivas
// (effect_key) devem ser consideradas ativas.
//
// `transaction` é opcional — mesma razão de buscarBonusDeAtributos:
// precisa ser propagada quando o chamador está no meio de um
// equip/unequip ainda não commitado (§9 "Equipar, desequipar e
// transações").
async function resolverConjuntosEquipados(idPersonagem, transaction) {
  const equipados = await CharacterEquipment.findAll({
    where: { id_personagem: idPersonagem },
    attributes: ["slot", "id_item"],
    transaction,
  });

  if (equipados.length === 0) return estadoVazio();

  // Peça lógica conta no máximo uma vez por conjunto (§3 regras
  // funcionais) — dedup aqui já evita contar duas vezes um item que,
  // por alguma inconsistência de inventário, ocupasse dois slots com o
  // mesmo id_item.
  const idsItemEquipados = [...new Set(equipados.map((e) => e.id_item))];

  // Peça por blueprint (qualquer raridade conta, ver EquipmentSetPiece):
  // descobre de quais blueprints os itens equipados vieram, pra também
  // casar EquipmentSetPiece.id_blueprint — não só item_id direto.
  const resultadosBlueprint = await ForgeBlueprintResult.findAll({
    where: { id_item: idsItemEquipados },
    attributes: ["id_blueprint"],
    transaction,
  });
  const idsBlueprintEquipados = [...new Set(resultadosBlueprint.map((r) => r.id_blueprint))];

  const condicoesPeca = [{ item_id: idsItemEquipados }];
  if (idsBlueprintEquipados.length > 0) {
    condicoesPeca.push({ id_blueprint: idsBlueprintEquipados });
  }

  const pecasEquipadas = await EquipmentSetPiece.findAll({
    where: { [Op.or]: condicoesPeca },
    include: [{ model: EquipmentSet, as: "equipmentSet", where: { ativo: true }, required: true }],
    transaction,
  });

  if (pecasEquipadas.length === 0) return estadoVazio();

  // Agrupa por conjunto, deduplicando por piece_key — não por linha
  // equipada nem por id_item (§6.3: o contador usa Set(piece_key), sem
  // refinamento/id_instancia/raridade como parte da identidade).
  const porSet = new Map();
  for (const peca of pecasEquipadas) {
    const set = peca.equipmentSet;
    if (!porSet.has(set.id)) {
      porSet.set(set.id, { set, pieceKeys: new Set() });
    }
    porSet.get(set.id).pieceKeys.add(peca.piece_key);
  }

  const idsSets = [...porSet.keys()];

  // Carrega TODAS as peças/bonuses dos conjuntos encontrados em lote
  // (nunca uma query por item/threshold — §14 Performance) — isso
  // também é o que permite ao resumo de UI mostrar peças faltantes, não
  // só as equipadas.
  const [todasPecasDosSets, todosBonusDosSets] = await Promise.all([
    EquipmentSetPiece.findAll({
      where: { equipment_set_id: idsSets },
      include: [
        { model: Item, as: "item", attributes: ["id", "nome"] },
        { model: ForgeBlueprint, as: "blueprint", attributes: ["id", "nome"] },
      ],
      order: [["ordem", "ASC"], ["id", "ASC"]],
      transaction,
    }),
    EquipmentSetBonus.findAll({
      where: { equipment_set_id: idsSets },
      order: [["pieces_required", "ASC"]],
      transaction,
    }),
  ]);

  const pecasPorSet = new Map();
  for (const peca of todasPecasDosSets) {
    if (!pecasPorSet.has(peca.equipment_set_id)) pecasPorSet.set(peca.equipment_set_id, []);
    pecasPorSet.get(peca.equipment_set_id).push(peca);
  }
  const bonusPorSet = new Map();
  for (const bonus of todosBonusDosSets) {
    if (!bonusPorSet.has(bonus.equipment_set_id)) bonusPorSet.set(bonus.equipment_set_id, []);
    bonusPorSet.get(bonus.equipment_set_id).push(bonus);
  }

  const statBonus = statBonusZerado();
  const activeEffects = [];
  const sets = [];

  for (const [setId, estado] of porSet) {
    const uniquePieces = estado.pieceKeys.size;
    const bonusesDoSet = bonusPorSet.get(setId) ?? [];
    const pecasDoSet = pecasPorSet.get(setId) ?? [];

    const bonuses = bonusesDoSet.map((bonus) => {
      const active = uniquePieces >= bonus.pieces_required;
      if (active) {
        for (const campo of CAMPOS_STAT) {
          statBonus[campo] += Number(bonus.stats?.[campo] || 0);
        }
        if (bonus.effect_key) {
          activeEffects.push({
            setKey: estado.set.key,
            effectKey: bonus.effect_key,
            config: bonus.effect_config ?? {},
            piecesRequired: bonus.pieces_required,
          });
        }
      }
      return {
        piecesRequired: bonus.pieces_required,
        active,
        stats: bonus.stats ?? {},
        effectKey: bonus.effect_key,
        descricao: bonus.descricao,
      };
    });

    sets.push({
      id: estado.set.id,
      key: estado.set.key,
      nome: estado.set.nome,
      imagemUrl: estado.set.imagem_url,
      equippedPieces: uniquePieces,
      totalPieces: pecasDoSet.length,
      pieces: pecasDoSet.map((peca) => ({
        pieceKey: peca.piece_key,
        itemId: peca.item_id,
        blueprintId: peca.id_blueprint,
        nome: peca.item?.nome ?? peca.blueprint?.nome ?? null,
        equipped: estado.pieceKeys.has(peca.piece_key),
      })),
      bonuses,
    });
  }

  for (const campo of CAMPOS_STAT) {
    statBonus[campo] = Math.round(statBonus[campo]);
  }

  return { statBonus, activeEffects, sets };
}

module.exports = { resolverConjuntosEquipados, statBonusZerado, CAMPOS_STAT };
