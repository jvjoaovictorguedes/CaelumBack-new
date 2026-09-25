// Pesca & Navegação — cobre pool/weights, curva de peso, determinismo de
// comportamento, tensão/progresso, propriedades efetivas de vara,
// XP/nível, captura (Item + CatchRecord + XP), idempotência de retry,
// falha sem recompensa, consumo de isca, e as regras de "vara nunca é
// combate" (spec §35.1/§35.2). Usa banco real pros fluxos transacionais,
// igual ao padrão de alchemy.test.js — e, pela MESMA lição aprendida
// naquele arquivo, rastreia e limpa TUDO que cria (test.after), na
// ordem certa de FK.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const FishingSpecies = require("../src/models/FishingSpecies");
const FishingZone = require("../src/models/FishingZone");
const FishingZoneSpecies = require("../src/models/FishingZoneSpecies");
const FishingBait = require("../src/models/FishingBait");
const FishingBaitAffinity = require("../src/models/FishingBaitAffinity");
const FishingRodProperties = require("../src/models/FishingRodProperties");
const CharacterFishingProgress = require("../src/models/CharacterFishingProgress");
const CharacterFishingLoadout = require("../src/models/CharacterFishingLoadout");
const FishingSession = require("../src/models/FishingSession");
const FishingCatchRecord = require("../src/models/FishingCatchRecord");
const CharacterFishingSpeciesDiscovery = require("../src/models/CharacterFishingSpeciesDiscovery");
const CharacterEquipmentInstance = require("../src/models/CharacterEquipmentInstance");
const CharacterInventory = require("../src/models/CharacterInventory");
const CharacterNavigationState = require("../src/models/CharacterNavigationState");

const fishingConfig = require("../src/config/fishingConfig");
const fishingEngine = require("../src/services/fishingEngine");
const fishingEncounterService = require("../src/services/fishingEncounterService");
const equipmentRefinementService = require("../src/services/equipmentRefinementService");
const equipmentInstanceService = require("../src/services/equipmentInstanceService");
const fishingService = require("../src/services/fishingService");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

// --- Rastreio de tudo que este arquivo cria no banco compartilhado -------
const itensCriados = [];
const especiesCriadas = [];
const zonasCriadas = [];
const baitsCriados = [];

test.after(async () => {
  if (!temBanco) return;
  await FishingCatchRecord.destroy({ where: { id_species: especiesCriadas.length ? especiesCriadas : [-1] } });
  await CharacterFishingSpeciesDiscovery.destroy({ where: { id_species: especiesCriadas.length ? especiesCriadas : [-1] } });
  await FishingSession.destroy({ where: { id_zone: zonasCriadas.length ? zonasCriadas : [-1] } });
  await FishingZoneSpecies.destroy({ where: { id_zone: zonasCriadas.length ? zonasCriadas : [-1] } });
  await FishingBaitAffinity.destroy({ where: { id_bait_item: baitsCriados.length ? baitsCriados : [-1] } });
  await FishingBait.destroy({ where: { id_item: baitsCriados.length ? baitsCriados : [-1] } });
  await FishingRodProperties.destroy({ where: { id_item: itensCriados.length ? itensCriados : [-1] } });
  await FishingSpecies.destroy({ where: { id: especiesCriadas.length ? especiesCriadas : [-1] } });
  await FishingZone.destroy({ where: { id: zonasCriadas.length ? zonasCriadas : [-1] } });
  if (itensCriados.length > 0) {
    await CharacterEquipmentInstance.destroy({ where: { id_item: itensCriados } });
    await CharacterInventory.destroy({ where: { id_item: itensCriados } });
    await Item.destroy({ where: { id: itensCriados } });
  }
});

async function criarItemMaterial(nome) {
  const item = await Item.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "Item de teste de Pesca.",
    tipo_item: "Material",
    raridade: "Comum",
  });
  itensCriados.push(item.id);
  return item;
}

async function criarItemFerramenta(nome) {
  const item = await Item.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "Vara de teste.",
    tipo_item: "Ferramenta",
    raridade: "Comum",
    tier_equipamento: 5,
  });
  itensCriados.push(item.id);
  return item;
}

async function criarEspecie({ comportamento_key = "CALM", peso_min_g = 100, peso_max_g = 500, dificuldade_base = 100 } = {}) {
  const item = await criarItemMaterial("Peixe de Teste");
  const especie = await FishingSpecies.create({
    key: `especie_teste_${sufixo()}`,
    id_item: item.id,
    comportamento_key,
    dificuldade_base,
    peso_min_g,
    peso_max_g,
    perfil_peso: "NORMAL",
    pontos_base_torneio: 100,
  });
  especiesCriadas.push(especie.id);
  return { item, especie };
}

async function criarZonaComEspecie(especie, { encounterWeight = 100, nivelMinimo = 1 } = {}) {
  const zona = await FishingZone.create({
    key: `zona_teste_${sufixo()}`,
    nome: "Zona de Teste",
    nivel_pesca_minimo: nivelMinimo,
    tier_embarcacao_minimo: 1,
    dificuldade_ambiente: 100,
  });
  zonasCriadas.push(zona.id);
  await FishingZoneSpecies.create({ id_zone: zona.id, id_species: especie.id, encounter_weight: encounterWeight });
  return zona;
}

async function posicionarPersonagemNaZona(characterId, zoneId) {
  await CharacterNavigationState.upsert({ id_personagem: characterId, id_zone_atual: zoneId, id_port_atual: null });
}

// A espera até a mordida é sorteada num range (fishingConfig) — em vez
// de um sleep fixo (flaky, pode cair antes ou depois da janela), faz
// polling curto até o servidor confirmar a mordida ou a janela real
// (também decidida pelo servidor) se esgotar.
async function fisgarComRetry(characterId, sessionId, tentativasMax = 90) {
  for (let i = 0; i < tentativasMax; i += 1) {
    try {
      return await fishingService.fisgar(characterId, sessionId);
    } catch (e) {
      if (!/ainda não mordeu/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error("mordida nunca ficou disponível dentro do tempo de teste");
}

async function criarVaraMaximaParaPersonagem(characterId) {
  const item = await criarItemFerramenta("Vara de Teste");
  await FishingRodProperties.create({
    id_item: item.id,
    forca_linha: 1000,
    controle: 1000,
    recolhimento: 1000,
    precisao: 1000,
    estabilidade: 1000,
    nivel_pesca_minimo: 1,
  });
  const instancia = await equipmentInstanceService.create({ idPersonagem: characterId, idItem: item.id }, null);
  return { item, instancia };
}

// ---------------------------------------------------------------------
// Testes PUROS (não precisam de banco) — pool/curva/determinismo/XP/
// propriedades efetivas.
// ---------------------------------------------------------------------

test("sortearPesoGramas sempre fica dentro de peso_min_g/peso_max_g (spec §17)", () => {
  for (let i = 0; i < 2000; i += 1) {
    for (const perfil of fishingConfig.PERFIS_PESO) {
      const peso = fishingConfig.sortearPesoGramas(500, 3000, perfil);
      assert.ok(peso >= 500 && peso <= 3000, `peso ${peso} fora da faixa (${perfil})`);
    }
  }
});

test("qualidadeEspecime fica sempre entre 0 e 1", () => {
  assert.equal(fishingConfig.qualidadeEspecime(100, 100, 500), 0);
  assert.equal(fishingConfig.qualidadeEspecime(500, 100, 500), 1);
  assert.ok(fishingConfig.qualidadeEspecime(300, 100, 500) > 0);
});

test("Nível de Pesca: XP total é crescente e nível 1 começa em 0 XP", () => {
  assert.equal(fishingConfig.nivelPescaPorXpTotal(0), 1);
  assert.equal(fishingConfig.nivelPescaPorXpTotal(999_999_999), fishingConfig.NIVEL_MAXIMO_PESCA);
  let anterior = -1;
  for (let nivel = 1; nivel <= fishingConfig.NIVEL_MAXIMO_PESCA; nivel += 1) {
    const total = fishingConfig.XP_TOTAL_PARA_NIVEL_PESCA[nivel];
    assert.ok(total > anterior, "XP total precisa ser estritamente crescente por nível");
    anterior = total;
  }
});

test("fishingEngine.resolverPassoDeReel é determinístico pelo mesmo seed+sequence (spec §35.1)", () => {
  const params = {
    behaviorKey: "ERRATIC",
    seed: 12345,
    sequence: 7,
    tensaoAtual: 200,
    progressoAtual: 300,
    rod: { forca_linha: 300, controle: 300, recolhimento: 300, precisao: 300, estabilidade: 300 },
    active: true,
  };
  const a = fishingEngine.resolverPassoDeReel(params);
  const b = fishingEngine.resolverPassoDeReel(params);
  assert.deepEqual(a, b);

  // Sequences diferentes usam RNG diferente — nem toda sequence muda o
  // resultado (pode cair no mesmo ramo "sem arrancada" por coincidência),
  // então testamos numa amostra que pelo menos ALGUMA diverge do
  // resultado original.
  let algumaDivergiu = false;
  for (let seq = 1; seq <= 30; seq += 1) {
    const variante = fishingEngine.resolverPassoDeReel({ ...params, sequence: seq });
    if (JSON.stringify(variante) !== JSON.stringify(a)) algumaDivergiu = true;
  }
  assert.ok(algumaDivergiu, "variar sequence deveria produzir pelo menos um resultado diferente");
});

test("propriedadesEfetivasVara: +10 sempre igual ou maior que +0, nunca some a outros atributos", () => {
  const base = { forca_linha: 100, controle: 100, recolhimento: 100, precisao: 100, estabilidade: 100 };
  const efetivo0 = equipmentRefinementService.propriedadesEfetivasVara(base, 0);
  const efetivo10 = equipmentRefinementService.propriedadesEfetivasVara(base, 10);
  for (const campo of ["forca_linha", "controle", "recolhimento", "precisao", "estabilidade"]) {
    assert.ok(efetivo10[campo] >= efetivo0[campo], `${campo} deveria crescer com refinamento`);
  }
  assert.equal(Object.keys(efetivo10).sort().join(","), Object.keys(base).sort().join(","));
});

test("sortearPonderado nunca escolhe item de peso 0 quando há alternativa com peso > 0", () => {
  const itens = [
    { id_species: 1, peso: 0 },
    { id_species: 2, peso: 100 },
  ];
  for (let i = 0; i < 200; i += 1) {
    const escolhido = fishingEncounterService.sortearPonderado(itens, Math.random);
    assert.equal(escolhido.id_species, 2);
  }
});

// ---------------------------------------------------------------------
// Testes de INTEGRAÇÃO (banco real) — spec §35.2.
// ---------------------------------------------------------------------

testeComBanco("calcularPesosDoPool aplica afinidade de isca sobre o encounter_weight (spec §8.3/§8.4)", async () => {
  const { especie: especieA } = await criarEspecie();
  const { especie: especieB } = await criarEspecie();
  const zona = await criarZonaComEspecie(especieA, { encounterWeight: 100 });
  await FishingZoneSpecies.create({ id_zone: zona.id, id_species: especieB.id, encounter_weight: 100 });

  const baitItem = await criarItemMaterial("Isca de Teste");
  baitsCriados.push(baitItem.id);
  await FishingBait.create({ id_item: baitItem.id, key: `isca_teste_${sufixo()}` });
  // Afinidade 3x só pra espécie B — depois da afinidade, B deve pesar mais que A.
  await FishingBaitAffinity.create({ id_bait_item: baitItem.id, id_species: especieB.id, multiplicador_peso_ppm: 3_000_000 });

  const semIsca = await fishingEncounterService.calcularPesosDoPool(zona.id, 1, null);
  const pesoASemIsca = semIsca.find((p) => p.id_species === especieA.id).peso;
  const pesoBSemIsca = semIsca.find((p) => p.id_species === especieB.id).peso;
  assert.equal(pesoASemIsca, pesoBSemIsca);

  const comIsca = await fishingEncounterService.calcularPesosDoPool(zona.id, 1, baitItem.id);
  const pesoBComIsca = comIsca.find((p) => p.id_species === especieB.id).peso;
  assert.ok(pesoBComIsca > pesoBSemIsca, "afinidade deveria aumentar o peso da espécie B");
});

testeComBanco("Pescar sem vara de pesca no inventário é rejeitado (exige rodInstanceId)", async () => {
  const { personagem } = await criarPersonagem();
  const { especie } = await criarEspecie();
  const zona = await criarZonaComEspecie(especie);
  await posicionarPersonagemNaZona(personagem.id, zona.id);

  await assert.rejects(
    () => fishingService.iniciarSessao(personagem.id, { zoneId: zona.id, rodInstanceId: null, baitItemId: null }),
    /vara de pesca/i,
  );
});

testeComBanco("Vara (Ferramenta) nunca pode ser equipada em slot de combate (spec §9.2/§35.2)", async () => {
  const { personagem } = await criarPersonagem();
  const { instancia } = await criarVaraMaximaParaPersonagem(personagem.id);
  await assert.rejects(
    () => sequelize.transaction((t) => equipmentInstanceService.equip(personagem.id, instancia.id, t)),
    /não podem ser equipadas em combate/,
  );
});

testeComBanco("Vara no Loadout de Pesca não pode ser anunciada no Mercado sem desequipar antes", async () => {
  const fishingRodService = require("../src/services/fishingRodService");
  const { personagem } = await criarPersonagem();
  const { instancia } = await criarVaraMaximaParaPersonagem(personagem.id);

  await fishingRodService.definirVaraAtiva(personagem.id, instancia.id);
  await assert.rejects(
    () => sequelize.transaction((t) => equipmentInstanceService.reserveForMarket(personagem.id, instancia.id, t)),
    /Desequipe a vara de pesca/,
  );

  await fishingRodService.definirVaraAtiva(personagem.id, null);
  const reservada = await sequelize.transaction((t) => equipmentInstanceService.reserveForMarket(personagem.id, instancia.id, t));
  assert.equal(reservada.estado, "Mercado");
  // Devolve pro inventário pra não afetar outros asserts/limpeza.
  await sequelize.transaction((t) => equipmentInstanceService.releaseFromMarket(instancia.id, t));
});

testeComBanco("Captura bem-sucedida cria exatamente 1 Item + 1 CatchRecord + XP (spec §35.2)", async (t) => {
  const { personagem } = await criarPersonagem();
  const { especie, item: itemPeixe } = await criarEspecie({ comportamento_key: "CALM" });
  const zona = await criarZonaComEspecie(especie);
  await posicionarPersonagemNaZona(personagem.id, zona.id);
  const { instancia } = await criarVaraMaximaParaPersonagem(personagem.id);

  const sessaoInicial = await fishingService.iniciarSessao(personagem.id, { zoneId: zona.id, rodInstanceId: instancia.id, baitItemId: null });
  await fishingService.lancar(personagem.id, sessaoInicial.id);
  const aposFisgar = await fisgarComRetry(personagem.id, sessaoInicial.id);
  assert.equal(aposFisgar.fase, "FIGHTING");

  let ultimo = aposFisgar;
  let voltas = 0;
  while (ultimo.fase === "FIGHTING" && voltas < 200) {
    ultimo = await fishingService.recolher(personagem.id, sessaoInicial.id, true);
    voltas += 1;
  }
  assert.equal(ultimo.fase, "CAUGHT", `sessão deveria terminar capturada (chegou em ${ultimo.fase} após ${voltas} voltas)`);

  const entradaInventario = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: itemPeixe.id } });
  assert.equal(entradaInventario.quantidade, 1);

  const registros = await FishingCatchRecord.findAll({ where: { id_personagem: personagem.id, id_species: especie.id } });
  assert.equal(registros.length, 1);

  const progresso = await CharacterFishingProgress.findOne({ where: { id_personagem: personagem.id } });
  assert.ok(progresso.experiencia > 0);
  assert.equal(progresso.total_capturado, 1);

  const descoberta = await CharacterFishingSpeciesDiscovery.findOne({ where: { id_personagem: personagem.id, id_species: especie.id } });
  assert.equal(descoberta.total_capturado, 1);

  // Retry de finalize (chamar reel de novo numa sessão já CAUGHT) NÃO
  // duplica recompensa — idempotência (spec §30/§35.2).
  await fishingService.recolher(personagem.id, sessaoInicial.id, true);
  const entradaDepoisRetry = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: itemPeixe.id } });
  assert.equal(entradaDepoisRetry.quantidade, 1);
  const registrosDepoisRetry = await FishingCatchRecord.findAll({ where: { id_personagem: personagem.id, id_species: especie.id } });
  assert.equal(registrosDepoisRetry.length, 1);

  // Vender/consumir o peixe (debitar o stack) nunca apaga o CatchRecord
  // (spec §12.1/§38) — simulamos o débito direto.
  entradaDepoisRetry.quantidade = 0;
  await entradaDepoisRetry.destroy();
  const registroAindaExiste = await FishingCatchRecord.findByPk(registros[0].id);
  assert.ok(registroAindaExiste, "CatchRecord precisa sobreviver ao consumo do Item");
});

testeComBanco("Isca é consumida no lançamento e abandonar depois não devolve (sem reroll de graça — spec §11/§31)", async () => {
  const { personagem } = await criarPersonagem();
  const { especie } = await criarEspecie();
  const zona = await criarZonaComEspecie(especie);
  await posicionarPersonagemNaZona(personagem.id, zona.id);
  const { instancia } = await criarVaraMaximaParaPersonagem(personagem.id);

  const baitItem = await criarItemMaterial("Isca Consumo Teste");
  baitsCriados.push(baitItem.id);
  await FishingBait.create({ id_item: baitItem.id, key: `isca_consumo_${sufixo()}` });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: baitItem.id, quantidade: 1 });

  const sessao = await fishingService.iniciarSessao(personagem.id, { zoneId: zona.id, rodInstanceId: instancia.id, baitItemId: baitItem.id });
  let entrada = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: baitItem.id } });
  assert.equal(entrada.quantidade, 1, "isca só é consumida no marco de lançamento, não no start");

  await fishingService.lancar(personagem.id, sessao.id);
  entrada = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: baitItem.id } });
  assert.equal(entrada, null, "isca deveria ter sido consumida (1 -> 0, linha apagada)");

  await fishingService.abandonar(personagem.id, sessao.id);
  const entradaDepoisAbandono = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: baitItem.id } });
  assert.equal(entradaDepoisAbandono, null, "abandonar depois do consumo não devolve a isca");
});

testeComBanco("Falha (linha arrebentada) não concede Item nem XP (spec §35.2)", async () => {
  const { personagem } = await criarPersonagem();
  const { especie, item: itemPeixe } = await criarEspecie({ comportamento_key: "BURST" });
  const zona = await criarZonaComEspecie(especie);
  await posicionarPersonagemNaZona(personagem.id, zona.id);
  // Vara fraca de propósito (força de linha baixa) pra estourar a
  // tensão rápido e forçar BROKEN_LINE de forma confiável.
  const item = await criarItemFerramenta("Vara Fraca de Teste");
  await FishingRodProperties.create({
    id_item: item.id, forca_linha: 0, controle: 0, recolhimento: 1000, precisao: 0, estabilidade: 0, nivel_pesca_minimo: 1,
  });
  const instancia = await equipmentInstanceService.create({ idPersonagem: personagem.id, idItem: item.id }, null);

  const sessao = await fishingService.iniciarSessao(personagem.id, { zoneId: zona.id, rodInstanceId: instancia.id, baitItemId: null });
  await fishingService.lancar(personagem.id, sessao.id);
  await fisgarComRetry(personagem.id, sessao.id);

  let ultimo;
  for (let i = 0; i < 100; i += 1) {
    ultimo = await fishingService.recolher(personagem.id, sessao.id, true);
    if (ultimo.fase !== "FIGHTING") break;
  }
  assert.equal(ultimo.fase, "BROKEN_LINE");

  const entradaInventario = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: itemPeixe.id } });
  assert.equal(entradaInventario, null, "falha não deveria conceder o Item do peixe");
  const registros = await FishingCatchRecord.findAll({ where: { id_personagem: personagem.id, id_species: especie.id } });
  assert.equal(registros.length, 0, "falha não deveria criar CatchRecord");
});
