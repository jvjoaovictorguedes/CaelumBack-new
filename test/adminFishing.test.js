// Painel Administrativo — Pesca. Cobre CRUD de Zonas/Espécies/Pool/
// Portos/Iscas/Afinidades via adminFishingService, seguindo os mesmos
// helpers de fixture de test/fishing.test.js (criarItemMaterial etc) —
// arquivo separado de propósito: nenhum invariante único global aqui
// (ao contrário de Boss Global), então cada teste cria seus próprios
// itens/zonas/espécies e não corre risco de colidir com outro arquivo.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const FishingSpecies = require("../src/models/FishingSpecies");
const FishingZone = require("../src/models/FishingZone");
const FishingZoneSpecies = require("../src/models/FishingZoneSpecies");
const FishingBait = require("../src/models/FishingBait");
const FishingBaitAffinity = require("../src/models/FishingBaitAffinity");
const FishingPort = require("../src/models/FishingPort");
const Vessel = require("../src/models/Vessel");
const MarineRoute = require("../src/models/MarineRoute");
const FishingTournament = require("../src/models/FishingTournament");
const WorldMapNode = require("../src/models/WorldMapNode");
const WorldMapConnection = require("../src/models/WorldMapConnection");
const adminFishingService = require("../src/services/adminFishingService");

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

const itensCriados = [];
const especiesCriadas = [];
const zonasCriadas = [];
const baitsCriados = [];
const portosCriados = [];
const vesselsCriados = [];
const rotasCriadas = [];
const torneiosCriados = [];
const conexoesCriadas = [];
const nodesCriados = [];

test.after(async () => {
  if (!temBanco) return;
  await FishingZoneSpecies.destroy({ where: { id_zone: zonasCriadas.length ? zonasCriadas : [-1] } });
  await FishingBaitAffinity.destroy({ where: { id_bait_item: baitsCriados.length ? baitsCriados : [-1] } });
  await FishingBait.destroy({ where: { id_item: baitsCriados.length ? baitsCriados : [-1] } });
  await MarineRoute.destroy({ where: { id: rotasCriadas.length ? rotasCriadas : [-1] } });
  await FishingTournament.destroy({ where: { id: torneiosCriados.length ? torneiosCriados : [-1] } });
  await Vessel.destroy({ where: { id: vesselsCriados.length ? vesselsCriados : [-1] } });
  await WorldMapConnection.destroy({ where: { id: conexoesCriadas.length ? conexoesCriadas : [-1] } });
  await WorldMapNode.destroy({ where: { id: nodesCriados.length ? nodesCriados : [-1] } });
  await FishingSpecies.destroy({ where: { id: especiesCriadas.length ? especiesCriadas : [-1] } });
  await FishingZone.destroy({ where: { id: zonasCriadas.length ? zonasCriadas : [-1] } });
  await FishingPort.destroy({ where: { id: portosCriados.length ? portosCriados : [-1] } });
  if (itensCriados.length > 0) await Item.destroy({ where: { id: itensCriados } });
  if (temBanco) await sequelize.close();
});

async function criarItemMaterial(nome = "Peixe de Teste") {
  const item = await Item.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "Item de teste do admin de Pesca.",
    tipo_item: "Material",
    raridade: "Comum",
  });
  itensCriados.push(item.id);
  return item;
}

testeComBanco("admin fishing zonas: create/update com validação de key/nome", async () => {
  await assert.rejects(() => adminFishingService.createAdminFishingZone({}, { idAdmin: 1 }), /key.*nome|nome.*key/i);

  const zona = await adminFishingService.createAdminFishingZone(
    { key: `zona_admin_${sufixo()}`, nome: "Zona Admin Teste", nivel_pesca_minimo: 3 },
    { idAdmin: 1 },
  );
  zonasCriadas.push(zona.id);
  assert.equal(zona.ativo, true);

  const atualizada = await adminFishingService.updateAdminFishingZone(zona.id, { dificuldade_ambiente: 300 }, { idAdmin: 1 });
  assert.equal(atualizada.dificuldade_ambiente, 300);
  assert.equal(atualizada.nome, "Zona Admin Teste");

  await assert.rejects(
    () => adminFishingService.updateAdminFishingZone(999999999, { nome: "X" }, { idAdmin: 1 }),
    (err) => err.statusCode === 404,
  );
});

testeComBanco("admin fishing espécies: create exige item existente e rejeita id_item duplicado", async () => {
  const item = await criarItemMaterial();

  await assert.rejects(
    () =>
      adminFishingService.createAdminFishingSpecies(
        { key: `esp_${sufixo()}`, id_item: 999999999, comportamento_key: "CALM", dificuldade_base: 100, peso_min_g: 100, peso_max_g: 200 },
        { idAdmin: 1 },
      ),
    (err) => err.statusCode === 404,
  );

  const especie = await adminFishingService.createAdminFishingSpecies(
    { key: `esp_${sufixo()}`, id_item: item.id, comportamento_key: "BURST", dificuldade_base: 200, peso_min_g: 100, peso_max_g: 500 },
    { idAdmin: 1 },
  );
  especiesCriadas.push(especie.id);

  await assert.rejects(
    () =>
      adminFishingService.createAdminFishingSpecies(
        { key: `esp_dup_${sufixo()}`, id_item: item.id, comportamento_key: "CALM", dificuldade_base: 100, peso_min_g: 100, peso_max_g: 200 },
        { idAdmin: 1 },
      ),
    /já é uma espécie/i,
  );
});

testeComBanco("admin fishing espécies: rejeita peso_min_g > peso_max_g e dificuldade_base fora de 1..1000", async () => {
  const item = await criarItemMaterial();
  await assert.rejects(
    () =>
      adminFishingService.createAdminFishingSpecies(
        { key: `esp_${sufixo()}`, id_item: item.id, comportamento_key: "CALM", dificuldade_base: 100, peso_min_g: 500, peso_max_g: 100 },
        { idAdmin: 1 },
      ),
    /peso_min_g/i,
  );

  const item2 = await criarItemMaterial();
  await assert.rejects(
    () =>
      adminFishingService.createAdminFishingSpecies(
        { key: `esp_${sufixo()}`, id_item: item2.id, comportamento_key: "CALM", dificuldade_base: 5000, peso_min_g: 100, peso_max_g: 200 },
        { idAdmin: 1 },
      ),
    /dificuldade_base/i,
  );
});

testeComBanco("admin fishing pool: cria vínculo zona×espécie e rejeita duplicata", async () => {
  const item = await criarItemMaterial();
  const especie = await adminFishingService.createAdminFishingSpecies(
    { key: `esp_${sufixo()}`, id_item: item.id, comportamento_key: "CALM", dificuldade_base: 100, peso_min_g: 100, peso_max_g: 200 },
    { idAdmin: 1 },
  );
  especiesCriadas.push(especie.id);
  const zona = await adminFishingService.createAdminFishingZone(
    { key: `zona_${sufixo()}`, nome: "Zona Pool Teste" },
    { idAdmin: 1 },
  );
  zonasCriadas.push(zona.id);

  const vinculo = await adminFishingService.createAdminFishingPool(
    { id_zone: zona.id, id_species: especie.id, encounter_weight: 250 },
    { idAdmin: 1 },
  );
  assert.equal(vinculo.encounter_weight, 250);

  await assert.rejects(
    () => adminFishingService.createAdminFishingPool({ id_zone: zona.id, id_species: especie.id }, { idAdmin: 1 }),
    /já está vinculada/i,
  );

  const atualizado = await adminFishingService.updateAdminFishingPool(vinculo.id, { ativo: false }, { idAdmin: 1 });
  assert.equal(atualizado.ativo, false);

  const listado = await adminFishingService.listAdminFishingPool({ idZone: zona.id });
  assert.equal(listado.length, 1);
  assert.equal(listado[0].id, vinculo.id);
});

testeComBanco("admin fishing portos: create/update", async () => {
  const porto = await adminFishingService.createAdminFishingPort(
    { key: `porto_${sufixo()}`, nome: "Porto Teste" },
    { idAdmin: 1 },
  );
  portosCriados.push(porto.id);
  assert.equal(porto.ativo, true);

  const atualizado = await adminFishingService.updateAdminFishingPort(porto.id, { descricao: "Novo texto" }, { idAdmin: 1 });
  assert.equal(atualizado.descricao, "Novo texto");
});

testeComBanco("admin fishing iscas: create exige item existente, rejeita duplicata e permite update", async () => {
  const item = await criarItemMaterial("Isca de Teste");

  const isca = await adminFishingService.createAdminFishingBait(
    { key: `isca_${sufixo()}`, id_item: item.id, nome_exibicao: "Isca X" },
    { idAdmin: 1 },
  );
  baitsCriados.push(isca.id_item);
  assert.equal(isca.ativo, true);

  await assert.rejects(
    () => adminFishingService.createAdminFishingBait({ key: `isca_dup_${sufixo()}`, id_item: item.id }, { idAdmin: 1 }),
    /já é uma isca/i,
  );

  const atualizada = await adminFishingService.updateAdminFishingBait(isca.id_item, { nivel_pesca_minimo: 8 }, { idAdmin: 1 });
  assert.equal(atualizada.nivel_pesca_minimo, 8);
});

testeComBanco("admin fishing afinidades: create exige isca e espécie existentes, rejeita duplicata e valida ppm >= 0", async () => {
  const itemPeixe = await criarItemMaterial();
  const especie = await adminFishingService.createAdminFishingSpecies(
    { key: `esp_${sufixo()}`, id_item: itemPeixe.id, comportamento_key: "CALM", dificuldade_base: 100, peso_min_g: 100, peso_max_g: 200 },
    { idAdmin: 1 },
  );
  especiesCriadas.push(especie.id);

  const itemIsca = await criarItemMaterial("Isca de Teste");
  const isca = await adminFishingService.createAdminFishingBait(
    { key: `isca_${sufixo()}`, id_item: itemIsca.id },
    { idAdmin: 1 },
  );
  baitsCriados.push(isca.id_item);

  const afinidade = await adminFishingService.createAdminFishingAffinity(
    { id_bait_item: isca.id_item, id_species: especie.id, multiplicador_peso_ppm: 1_500_000 },
    { idAdmin: 1 },
  );
  assert.equal(afinidade.multiplicador_peso_ppm, 1_500_000);

  await assert.rejects(
    () =>
      adminFishingService.createAdminFishingAffinity(
        { id_bait_item: isca.id_item, id_species: especie.id },
        { idAdmin: 1 },
      ),
    /já existe uma afinidade/i,
  );

  await assert.rejects(
    () => adminFishingService.updateAdminFishingAffinity(afinidade.id, { multiplicador_peso_ppm: -1 }, { idAdmin: 1 }),
    /multiplicador_peso_ppm/i,
  );
});

// ------------------------------------------------------- EMBARCAÇÕES
testeComBanco("admin fishing embarcações: create/update com validação de key/nome/preco", async () => {
  await assert.rejects(() => adminFishingService.createAdminVessel({}, { idAdmin: 1 }), /key.*nome|nome.*key/i);

  const vessel = await adminFishingService.createAdminVessel(
    { key: `vessel_${sufixo()}`, nome: "Barco Teste", tier: 2, nivel_pesca_minimo: 5, preco: 500 },
    { idAdmin: 1 },
  );
  vesselsCriados.push(vessel.id);
  assert.equal(vessel.ativo, true);

  await assert.rejects(
    () => adminFishingService.createAdminVessel({ key: `vessel2_${sufixo()}`, nome: "X", preco: -1 }, { idAdmin: 1 }),
    /preco/i,
  );

  const atualizado = await adminFishingService.updateAdminVessel(vessel.id, { preco: 900 }, { idAdmin: 1 });
  assert.equal(atualizado.preco, 900);
  assert.equal(atualizado.nome, "Barco Teste");

  await assert.rejects(
    () => adminFishingService.updateAdminVessel(999999999, { nome: "X" }, { idAdmin: 1 }),
    (err) => err.statusCode === 404,
  );
});

// --------------------------------------------------- ROTAS MARÍTIMAS
testeComBanco("admin fishing rotas marítimas: create exige porto/zona existentes e rejeita conexão duplicada", async () => {
  const nodeOrigem = await WorldMapNode.create({ nome: `Node Origem ${sufixo()}`, tipo: "Landmark", x: 10, y: 10 });
  nodesCriados.push(nodeOrigem.id);
  const nodeDestino = await WorldMapNode.create({ nome: `Node Destino ${sufixo()}`, tipo: "Landmark", x: 20, y: 20 });
  nodesCriados.push(nodeDestino.id);
  const conexao = await WorldMapConnection.create({ id_origem: nodeOrigem.id, id_destino: nodeDestino.id });
  conexoesCriadas.push(conexao.id);

  const porto = await adminFishingService.createAdminFishingPort({ key: `porto_rota_${sufixo()}`, nome: "Porto Rota" }, { idAdmin: 1 });
  portosCriados.push(porto.id);
  const zona = await adminFishingService.createAdminFishingZone({ key: `zona_rota_${sufixo()}`, nome: "Zona Rota" }, { idAdmin: 1 });
  zonasCriadas.push(zona.id);

  await assert.rejects(
    () =>
      adminFishingService.createAdminMarineRoute(
        { id_world_connection: conexao.id, id_port_origem: 999999999, id_zone_destino: zona.id },
        { idAdmin: 1 },
      ),
    (err) => err.statusCode === 404,
  );

  const rota = await adminFishingService.createAdminMarineRoute(
    { id_world_connection: conexao.id, id_port_origem: porto.id, id_zone_destino: zona.id, min_vessel_tier: 2, distance: 5 },
    { idAdmin: 1 },
  );
  rotasCriadas.push(rota.id);
  assert.equal(rota.distance, 5);

  await assert.rejects(
    () =>
      adminFishingService.createAdminMarineRoute(
        { id_world_connection: conexao.id, id_port_origem: porto.id, id_zone_destino: zona.id },
        { idAdmin: 1 },
      ),
    /já existe uma rota/i,
  );

  const atualizada = await adminFishingService.updateAdminMarineRoute(rota.id, { distance: 9 }, { idAdmin: 1 });
  assert.equal(atualizada.distance, 9);
});

// ------------------------------------------------------------- TORNEIOS
testeComBanco("admin fishing torneios: create/update valida janela de tempo e escopo de zona", async () => {
  const agora = new Date();
  const amanha = new Date(Date.now() + 86_400_000);

  await assert.rejects(
    () =>
      adminFishingService.createAdminFishingTournament(
        { nome: "Torneio Invertido", inicia_em: amanha, termina_em: agora },
        { idAdmin: 1 },
      ),
    /inicia_em/i,
  );

  const torneio = await adminFishingService.createAdminFishingTournament(
    { nome: `Torneio Admin ${sufixo()}`, inicia_em: agora, termina_em: amanha },
    { idAdmin: 1 },
  );
  torneiosCriados.push(torneio.id);
  assert.equal(torneio.ativo, true);

  await assert.rejects(
    () =>
      adminFishingService.createAdminFishingTournament(
        { nome: "Torneio Zona Inválida", id_zone: 999999999, inicia_em: agora, termina_em: amanha },
        { idAdmin: 1 },
      ),
    (err) => err.statusCode === 404,
  );

  const atualizado = await adminFishingService.updateAdminFishingTournament(torneio.id, { nome: "Torneio Renomeado" }, { idAdmin: 1 });
  assert.equal(atualizado.nome, "Torneio Renomeado");

  await assert.rejects(
    () => adminFishingService.updateAdminFishingTournament(torneio.id, { termina_em: new Date(Date.now() - 1000) }, { idAdmin: 1 }),
    /inicia_em/i,
  );
});
