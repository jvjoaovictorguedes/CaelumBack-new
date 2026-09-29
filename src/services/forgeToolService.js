// Profissão de Ferreiro §6/§11.3 — Ferraria: equipar/desequipar
// ferramentas profissionais (Fole/Martelo/Tenaz). Reaproveita
// CharacterEquipmentInstance (mesmo pipeline de Vara de Pesca — nunca
// cria uma segunda tabela de instância), mas nunca toca
// CharacterEquipment/estado "Equipada" (isso é reservado pro
// equipamento de COMBATE — spec §6: "loadout profissional separado").
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const CharacterEquipmentInstance = require("../models/CharacterEquipmentInstance");
const CharacterForgeProgress = require("../models/CharacterForgeProgress");
const CharacterForgeToolLoadout = require("../models/CharacterForgeToolLoadout");
const ForgeToolProperties = require("../models/ForgeToolProperties");
const ForgeToolEffect = require("../models/ForgeToolEffect");
const Item = require("../models/Item");
const { nivelPorXpTotal } = require("./forgeProgressionService");

const COLUNA_POR_SLOT = { Fole: "id_instancia_fole", Martelo: "id_instancia_martelo", Tenaz: "id_instancia_tenaz" };
const SLOTS = ["Fole", "Martelo", "Tenaz"];

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

async function garantirLoadout(characterId, transaction) {
  const [loadout] = await CharacterForgeToolLoadout.findOrCreate({
    where: { id_personagem: characterId },
    defaults: { id_personagem: characterId },
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
  return loadout;
}

// GET /crafting/tools (spec §12) — ferramentas do personagem (só as que
// têm ForgeToolProperties — nunca lista Vara de Pesca aqui) + estado
// atual do loadout.
async function listarFerramentas(characterId) {
  const [progresso, loadout, instancias] = await Promise.all([
    CharacterForgeProgress.findOne({ where: { id_personagem: characterId } }),
    CharacterForgeToolLoadout.findOne({ where: { id_personagem: characterId } }),
    CharacterEquipmentInstance.findAll({
      where: { id_personagem: characterId },
      include: [
        {
          model: Item,
          as: "item",
          required: true,
          where: { tipo_item: "Ferramenta" },
          include: [
            {
              model: ForgeToolProperties,
              as: "forgeToolProperties",
              required: true,
              where: { ativo: true },
              include: [{ model: ForgeToolEffect, as: "efeitos" }],
            },
          ],
        },
      ],
    }),
  ]);
  const nivelForja = nivelPorXpTotal(progresso?.experiencia ?? 0);
  const equipadoPorSlot = {
    Fole: loadout?.id_instancia_fole ?? null,
    Martelo: loadout?.id_instancia_martelo ?? null,
    Tenaz: loadout?.id_instancia_tenaz ?? null,
  };

  return instancias.map((instancia) => {
    const propriedades = instancia.item.forgeToolProperties;
    return {
      id_instancia: instancia.id,
      id_item: instancia.id_item,
      nome: instancia.item.nome,
      imagem_url: instancia.item.imagem_url,
      raridade: instancia.raridade,
      tier_equipamento: instancia.item.tier_equipamento,
      refinamento: instancia.refinamento,
      slot: propriedades.slot,
      nivel_ferreiro_minimo: propriedades.nivel_ferreiro_minimo,
      nivel_suficiente: nivelForja >= propriedades.nivel_ferreiro_minimo,
      efeitos: propriedades.efeitos.map((e) => ({ effect_key: e.effect_key, valor_ppm: e.valor_ppm })),
      equipada: equipadoPorSlot[propriedades.slot] === instancia.id,
      pode_negociar: instancia.estado === "Inventario" && equipadoPorSlot[propriedades.slot] !== instancia.id,
    };
  });
}

// POST /crafting/tools/:instanceId/equip
async function equiparFerramenta(characterId, idInstancia) {
  return sequelize.transaction(async (transaction) => {
    await Character.findByPk(characterId, { transaction, lock: transaction.LOCK.UPDATE });

    // Nunca combinar FOR UPDATE com o include (LEFT JOIN) — Postgres
    // rejeita "FOR UPDATE cannot be applied to the nullable side of an
    // outer join". Mesmo padrão de equipmentInstanceService.equip: trava
    // a instância sozinha, busca o Item à parte.
    const instancia = await CharacterEquipmentInstance.findOne({
      where: { id: idInstancia, id_personagem: characterId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!instancia) throw erro("Ferramenta não encontrada.", 404);
    const item = await Item.findByPk(instancia.id_item, { transaction });
    if (!item || item.tipo_item !== "Ferramenta") throw erro("Esse item não é uma ferramenta.", 400);
    if (instancia.estado === "Mercado") {
      throw erro("Essa ferramenta está anunciada no Mercado — cancele o anúncio antes de equipar.", 400);
    }

    const propriedades = await ForgeToolProperties.findByPk(instancia.id_item, { transaction });
    if (!propriedades || !propriedades.ativo) throw erro("Essa ferramenta de Ferraria não está mais disponível.", 400);

    const progresso = await CharacterForgeProgress.findOne({ where: { id_personagem: characterId }, transaction });
    const nivelForja = nivelPorXpTotal(progresso?.experiencia ?? 0);
    // §6.1 — ferramenta nunca ignora requisito real de nível.
    if (nivelForja < propriedades.nivel_ferreiro_minimo) {
      throw erro(`Essa ferramenta exige Nível de Ferreiro ${propriedades.nivel_ferreiro_minimo}.`, 400);
    }

    const loadout = await garantirLoadout(characterId, transaction);
    const coluna = COLUNA_POR_SLOT[propriedades.slot];
    loadout[coluna] = instancia.id;
    await loadout.save({ transaction });

    return { slot: propriedades.slot, id_instancia: instancia.id };
  });
}

// POST /crafting/tools/:slot/unequip
async function desequiparFerramenta(characterId, slot) {
  if (!SLOTS.includes(slot)) throw erro("Slot de Ferraria inválido.", 400);
  return sequelize.transaction(async (transaction) => {
    const loadout = await garantirLoadout(characterId, transaction);
    const coluna = COLUNA_POR_SLOT[slot];
    if (!loadout[coluna]) throw erro("Esse slot já estava vazio.", 404);
    loadout[coluna] = null;
    await loadout.save({ transaction });
    return true;
  });
}

// Usado por equipmentInstanceService.reserveForMarket — bloqueia
// anunciar uma ferramenta que está equipada na Ferraria (spec §17).
async function instanciaEquipadaEmFerraria(characterId, idInstancia, transaction) {
  const loadout = await CharacterForgeToolLoadout.findOne({ where: { id_personagem: characterId }, transaction });
  if (!loadout) return false;
  return [loadout.id_instancia_fole, loadout.id_instancia_martelo, loadout.id_instancia_tenaz].includes(idInstancia);
}

module.exports = {
  listarFerramentas,
  equiparFerramenta,
  desequiparFerramenta,
  instanciaEquipadaEmFerraria,
};
