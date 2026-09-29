// Leituras de catálogo pra tela de Pesca (zonas/espécies/iscas/almanaque
// simplificado) — nada aqui decide resultado de captura.
const FishingZone = require("../models/FishingZone");
const FishingSpecies = require("../models/FishingSpecies");
const FishingBait = require("../models/FishingBait");
const FishingZoneSpecies = require("../models/FishingZoneSpecies");
const Item = require("../models/Item");
const CharacterInventory = require("../models/CharacterInventory");
const CharacterFishingSpeciesDiscovery = require("../models/CharacterFishingSpeciesDiscovery");
const { metaComportamento, rotuloDificuldade } = require("../config/fishingConfig");

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

// Almanaque Marinho (Pesca v3 §7) — antes da primeira captura só nome/
// comportamento/dificuldade/peso ficam ocultos ("???"); após a
// descoberta, revela comportamento em português + dica, faixa de peso e
// zonas conhecidas (spec §7.3). Nunca vaza esses dados de espécie ainda
// não descoberta.
async function listarAlmanaque(characterId) {
  const [todasEspecies, descobertas] = await Promise.all([
    FishingSpecies.findAll({ where: { ativo: true }, include: [{ model: Item, as: "item" }] }),
    CharacterFishingSpeciesDiscovery.findAll({ where: { id_personagem: characterId } }),
  ]);
  const porEspecie = new Map(descobertas.map((d) => [d.id_species, d]));

  const idsDescobertos = todasEspecies.filter((e) => porEspecie.has(e.id)).map((e) => e.id);
  const vinculos = idsDescobertos.length
    ? await FishingZoneSpecies.findAll({
        where: { id_species: idsDescobertos, ativo: true },
        include: [{ model: FishingZone, where: { ativo: true }, required: true }],
      })
    : [];
  const zonasPorEspecie = new Map();
  for (const vinculo of vinculos) {
    const lista = zonasPorEspecie.get(vinculo.id_species) ?? [];
    lista.push({ id: vinculo.FishingZone.id, nome: vinculo.FishingZone.nome });
    zonasPorEspecie.set(vinculo.id_species, lista);
  }

  return todasEspecies.map((especie) => {
    const descoberta = porEspecie.get(especie.id);
    if (!descoberta) {
      return {
        id: especie.id,
        key: especie.key,
        nome: null,
        descoberto: false,
        comportamento: null,
        dificuldade: null,
        peso_min_g: null,
        peso_max_g: null,
        total_capturado: 0,
        maior_peso_g: 0,
        zonas: [],
        lendario: especie.lendario,
      };
    }
    const meta = metaComportamento(especie.comportamento_key);
    return {
      id: especie.id,
      key: especie.key,
      nome: especie.item?.nome ?? null,
      descoberto: true,
      comportamento: { key: especie.comportamento_key, nome: meta.nome, descricao: meta.descricao, dica: meta.dica },
      dificuldade: { valor: especie.dificuldade_base, rotulo: rotuloDificuldade(especie.dificuldade_base) },
      peso_min_g: especie.peso_min_g,
      peso_max_g: especie.peso_max_g,
      total_capturado: descoberta.total_capturado,
      maior_peso_g: descoberta.maior_peso_g,
      zonas: zonasPorEspecie.get(especie.id) ?? [],
      lendario: especie.lendario,
    };
  });
}

module.exports = { listarZonas, listarEspeciesDaZona, listarIscas, listarAlmanaque };
