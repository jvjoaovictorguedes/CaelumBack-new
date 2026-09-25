// Leituras de catálogo pra tela de Pesca (zonas/espécies/iscas/almanaque
// simplificado) — nada aqui decide resultado de captura.
const FishingZone = require("../models/FishingZone");
const FishingSpecies = require("../models/FishingSpecies");
const FishingBait = require("../models/FishingBait");
const FishingZoneSpecies = require("../models/FishingZoneSpecies");
const Item = require("../models/Item");
const CharacterInventory = require("../models/CharacterInventory");
const CharacterFishingSpeciesDiscovery = require("../models/CharacterFishingSpeciesDiscovery");

async function listarZonas() {
  return FishingZone.findAll({ where: { ativo: true }, order: [["nivel_pesca_minimo", "ASC"]] });
}

async function listarEspeciesDaZona(zoneId) {
  return FishingZoneSpecies.findAll({
    where: { id_zone: zoneId, ativo: true },
    include: [{ model: FishingSpecies, as: "species", where: { ativo: true } }],
  });
}

async function listarIscas(characterId) {
  const iscas = await FishingBait.findAll({
    where: { ativo: true },
    include: [{ model: Item, as: "item" }],
  });
  const idsItens = iscas.map((i) => i.id_item);
  const inventario = idsItens.length
    ? await CharacterInventory.findAll({ where: { id_personagem: characterId, id_item: idsItens } })
    : [];
  const quantidadePorItem = new Map(inventario.map((e) => [e.id_item, e.quantidade]));
  return iscas.map((isca) => ({
    id_item: isca.id_item,
    key: isca.key,
    nome: isca.nome_exibicao ?? isca.item?.nome,
    imagem_url: isca.item?.imagem_url ?? null,
    nivel_pesca_minimo: isca.nivel_pesca_minimo,
    quantidade_disponivel: quantidadePorItem.get(isca.id_item) ?? 0,
  }));
}

// Almanaque simplificado (spec §20 — só o DADO nesta fase, sem tela
// dedicada — ver relatório final): espécies descobertas x total.
async function listarAlmanaque(characterId) {
  const [todasEspecies, descobertas] = await Promise.all([
    FishingSpecies.findAll({ where: { ativo: true }, include: [{ model: Item, as: "item" }] }),
    CharacterFishingSpeciesDiscovery.findAll({ where: { id_personagem: characterId } }),
  ]);
  const porEspecie = new Map(descobertas.map((d) => [d.id_species, d]));
  return todasEspecies.map((especie) => {
    const descoberta = porEspecie.get(especie.id);
    return {
      id: especie.id,
      key: especie.key,
      nome: descoberta ? especie.item?.nome : null,
      descoberto: Boolean(descoberta),
      total_capturado: descoberta?.total_capturado ?? 0,
      maior_peso_g: descoberta?.maior_peso_g ?? 0,
      lendario: especie.lendario,
    };
  });
}

module.exports = { listarZonas, listarEspeciesDaZona, listarIscas, listarAlmanaque };
