// Varas de Pesca — instâncias (CharacterEquipmentInstance com
// Item.tipo_item = "Ferramenta") e o CharacterFishingLoadout (spec §9.4).
// Nunca usa "Equipada" pra vara — esse estado é reservado a combate
// (spec §9.2); a vara ativa fica em Inventario, só referenciada pelo
// loadout.
const { sequelize } = require("../config/database");
const CharacterEquipmentInstance = require("../models/CharacterEquipmentInstance");
const CharacterFishingLoadout = require("../models/CharacterFishingLoadout");
const Item = require("../models/Item");
const FishingRodProperties = require("../models/FishingRodProperties");
const { propriedadesEfetivasVara } = require("./equipmentRefinementService");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

async function listarVarasDoPersonagem(characterId) {
  const instancias = await CharacterEquipmentInstance.findAll({
    where: { id_personagem: characterId },
    include: [{ model: Item, as: "item", include: [{ model: FishingRodProperties, as: "fishingRodProperties" }] }],
    order: [["id", "DESC"]],
  });
  return instancias
    .filter((i) => i.item?.tipo_item === "Ferramenta")
    .map((i) => formatarVara(i));
}

function formatarVara(instancia) {
  const item = instancia.item;
  const efetivo = propriedadesEfetivasVara(item?.fishingRodProperties, instancia.refinamento);
  return {
    id_instancia: instancia.id,
    id_item: item?.id,
    nome: item?.nome,
    raridade: item?.raridade,
    imagem_url: item?.imagem_url,
    refinamento: instancia.refinamento,
    estado: instancia.estado,
    propriedades_base: item?.fishingRodProperties ?? null,
    propriedades_efetivas: efetivo,
  };
}

async function obterLoadout(characterId) {
  const loadout = await CharacterFishingLoadout.findOne({ where: { id_personagem: characterId } });
  if (!loadout?.id_instancia_vara) return { id_instancia_vara: null, vara: null };
  const instancia = await CharacterEquipmentInstance.findOne({
    where: { id: loadout.id_instancia_vara, id_personagem: characterId },
    include: [{ model: Item, as: "item", include: [{ model: FishingRodProperties, as: "fishingRodProperties" }] }],
  });
  return { id_instancia_vara: loadout.id_instancia_vara, vara: instancia ? formatarVara(instancia) : null };
}

// Troca a vara ativa do loadout — valida dono/tipo/estado, mas NUNCA
// mexe em CharacterEquipment (spec §9.2/§9.4).
async function definirVaraAtiva(characterId, idInstancia) {
  return sequelize.transaction(async (transaction) => {
    if (idInstancia == null) {
      await CharacterFishingLoadout.upsert(
        { id_personagem: characterId, id_instancia_vara: null },
        { transaction },
      );
      return { id_instancia_vara: null };
    }

    const instancia = await CharacterEquipmentInstance.findOne({
      where: { id: idInstancia },
      // required: true — Postgres recusa FOR UPDATE sobre o lado
      // nullable de um LEFT JOIN; Item sempre existe pra uma instância
      // válida (FK obrigatória), então o INNER JOIN aqui é seguro.
      include: [{ model: Item, as: "item", required: true }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!instancia) throw erro("Vara não encontrada.", 404);
    if (instancia.id_personagem !== Number(characterId)) throw erro("Essa vara não pertence a você.", 403);
    if (instancia.item?.tipo_item !== "Ferramenta") throw erro("Esse item não é uma vara de pesca.", 400);
    if (instancia.estado === "Mercado") {
      throw erro("Essa vara está anunciada no Mercado Negro — cancele o anúncio antes de usá-la na Pesca.", 400);
    }

    await CharacterFishingLoadout.upsert(
      { id_personagem: characterId, id_instancia_vara: idInstancia },
      { transaction },
    );
    return { id_instancia_vara: idInstancia };
  });
}

module.exports = { listarVarasDoPersonagem, formatarVara, obterLoadout, definirVaraAtiva };
