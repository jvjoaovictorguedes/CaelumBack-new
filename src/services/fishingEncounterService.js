// Sorteio de espécie do encontro (spec §8.3/§11) — pool de
// FishingZoneSpecies ativos, peso relativo (encounter_weight) modificado
// pela afinidade da isca (multiplicador_peso_ppm). O backend NORMALIZA
// em probabilidade; nunca guarda percentual fixo (spec §8.3).
const FishingZoneSpecies = require("../models/FishingZoneSpecies");
const FishingBaitAffinity = require("../models/FishingBaitAffinity");
const FishingSpecies = require("../models/FishingSpecies");

// pesosBrutos: [{ id_species, peso }] já com afinidade aplicada.
// random: injeção de dependência pra teste determinístico.
function sortearPonderado(itens, random = Math.random) {
  const total = itens.reduce((soma, item) => soma + item.peso, 0);
  if (total <= 0) return null;
  let alvo = random() * total;
  for (const item of itens) {
    alvo -= item.peso;
    if (alvo <= 0) return item;
  }
  return itens[itens.length - 1];
}

async function carregarPoolDaZona(idZone, nivelPesca, transaction) {
  const pool = await FishingZoneSpecies.findAll({
    where: { id_zone: idZone, ativo: true },
    include: [{ model: FishingSpecies, as: "species", where: { ativo: true } }],
    transaction,
  });
  return pool.filter((entrada) => (entrada.nivel_pesca_minimo ?? 1) <= nivelPesca);
}

// Retorna a lista já ponderada (peso base * afinidade da isca em ppm) —
// função pura o bastante pra testar isoladamente (spec §35.1: "Pool de
// espécie com weights/iscas/condição" — condição está deferida nesta
// fase, ver relatório final).
async function calcularPesosDoPool(idZone, nivelPesca, idBaitItem, transaction) {
  const pool = await carregarPoolDaZona(idZone, nivelPesca, transaction);
  if (pool.length === 0) return [];

  let afinidades = new Map();
  if (idBaitItem) {
    const linhas = await FishingBaitAffinity.findAll({ where: { id_bait_item: idBaitItem }, transaction });
    afinidades = new Map(linhas.map((l) => [l.id_species, l.multiplicador_peso_ppm]));
  }

  return pool.map((entrada) => {
    const multiplicadorPpm = afinidades.get(entrada.id_species) ?? 1_000_000;
    const peso = Math.max(0, Math.round(entrada.encounter_weight * (multiplicadorPpm / 1_000_000)));
    return { id_species: entrada.id_species, species: entrada.species, peso };
  });
}

async function sortearEspecie(idZone, nivelPesca, idBaitItem, { transaction, random = Math.random } = {}) {
  const pesos = await calcularPesosDoPool(idZone, nivelPesca, idBaitItem, transaction);
  const escolhido = sortearPonderado(pesos, random);
  return escolhido ? escolhido.species : null;
}

module.exports = { sortearPonderado, calcularPesosDoPool, sortearEspecie, carregarPoolDaZona };
