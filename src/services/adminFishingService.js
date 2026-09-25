// Painel Administrativo — Pesca & Navegação: Zonas, Espécies, Pool
// (zona x espécie), Portos, Iscas e Afinidades (isca x espécie).
// Reaproveita os models existentes (FishingZone/FishingSpecies/
// FishingZoneSpecies/FishingPort/FishingBait/FishingBaitAffinity) —
// nenhuma tabela nova. Vara de Pesca (FishingRodProperties) já é
// gerenciada dentro do admin de Itens (tipo "Ferramenta"), não
// duplicada aqui.
const { sequelize } = require("../config/database");
const FishingZone = require("../models/FishingZone");
const FishingSpecies = require("../models/FishingSpecies");
const FishingZoneSpecies = require("../models/FishingZoneSpecies");
const FishingPort = require("../models/FishingPort");
const FishingBait = require("../models/FishingBait");
const FishingBaitAffinity = require("../models/FishingBaitAffinity");
const Vessel = require("../models/Vessel");
const MarineRoute = require("../models/MarineRoute");
const FishingTournament = require("../models/FishingTournament");
const Item = require("../models/Item");
const WorldMapNode = require("../models/WorldMapNode");
const { registrarAcao } = require("./adminAuditService");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function somenteCampos(objeto, campos) {
  const out = {};
  for (const campo of campos) {
    if (objeto?.[campo] !== undefined) out[campo] = objeto[campo];
  }
  return out;
}

// ---------------------------------------------------------------- ZONAS
const CAMPOS_ZONA = [
  "key",
  "nome",
  "descricao",
  "imagem_url",
  "id_world_node",
  "nivel_pesca_minimo",
  "tier_embarcacao_minimo",
  "dificuldade_ambiente",
  "ativo",
];

async function listAdminFishingZones() {
  return FishingZone.findAll({
    include: [{ model: WorldMapNode, attributes: ["id", "nome"] }],
    order: [["nome", "ASC"]],
  });
}

async function createAdminFishingZone(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_ZONA);
  if (!dados.key || !dados.nome) throw erro("key e nome são obrigatórios.");

  return sequelize.transaction(async (transaction) => {
    const zona = await FishingZone.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "FishingZone",
      idEntidade: zona.id,
      dadosDepois: zona.toJSON(),
      req,
      transaction,
    });
    return zona;
  });
}

async function updateAdminFishingZone(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_ZONA);

  return sequelize.transaction(async (transaction) => {
    const zona = await FishingZone.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!zona) throw erro("Zona de pesca não encontrada.", 404);
    const antes = zona.toJSON();
    await zona.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "FishingZone",
      idEntidade: zona.id,
      dadosAntes: antes,
      dadosDepois: zona.toJSON(),
      req,
      transaction,
    });
    return zona;
  });
}

// ------------------------------------------------------------ ESPÉCIES
const CAMPOS_ESPECIE = [
  "key",
  "id_item",
  "nome_cientifico",
  "descricao",
  "comportamento_key",
  "dificuldade_base",
  "peso_min_g",
  "peso_max_g",
  "perfil_peso",
  "pontos_base_torneio",
  "lendario",
  "ativo",
];

function validarEspecie(dados) {
  const min = dados.peso_min_g;
  const max = dados.peso_max_g;
  if (min != null && max != null && min > max) {
    throw erro("peso_min_g não pode ser maior que peso_max_g.");
  }
  if (dados.dificuldade_base != null && (dados.dificuldade_base < 1 || dados.dificuldade_base > 1000)) {
    throw erro("dificuldade_base precisa estar entre 1 e 1000.");
  }
}

async function listAdminFishingSpecies() {
  return FishingSpecies.findAll({
    include: [{ model: Item, as: "item", attributes: ["id", "nome", "raridade", "imagem_url"] }],
    order: [["key", "ASC"]],
  });
}

async function createAdminFishingSpecies(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_ESPECIE);
  if (!dados.key || !dados.id_item || !dados.comportamento_key) {
    throw erro("key, id_item e comportamento_key são obrigatórios.");
  }
  if (dados.dificuldade_base == null || dados.peso_min_g == null || dados.peso_max_g == null) {
    throw erro("dificuldade_base, peso_min_g e peso_max_g são obrigatórios.");
  }
  validarEspecie(dados);

  return sequelize.transaction(async (transaction) => {
    const item = await Item.findByPk(dados.id_item, { transaction });
    if (!item) throw erro("Item não encontrado.", 404);
    const existente = await FishingSpecies.findOne({ where: { id_item: dados.id_item }, transaction });
    if (existente) throw erro("Esse item já é uma espécie de pesca cadastrada.");

    const especie = await FishingSpecies.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "FishingSpecies",
      idEntidade: especie.id,
      dadosDepois: especie.toJSON(),
      req,
      transaction,
    });
    return especie;
  });
}

async function updateAdminFishingSpecies(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_ESPECIE.filter((c) => c !== "id_item"));
  validarEspecie(dados);

  return sequelize.transaction(async (transaction) => {
    const especie = await FishingSpecies.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!especie) throw erro("Espécie não encontrada.", 404);
    const antes = especie.toJSON();
    await especie.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "FishingSpecies",
      idEntidade: especie.id,
      dadosAntes: antes,
      dadosDepois: especie.toJSON(),
      req,
      transaction,
    });
    return especie;
  });
}

// ------------------------------------------------------------------ POOL
const CAMPOS_POOL = ["id_zone", "id_species", "encounter_weight", "nivel_pesca_minimo", "ativo"];

async function listAdminFishingPool({ idZone } = {}) {
  const where = {};
  if (idZone) where.id_zone = idZone;
  return FishingZoneSpecies.findAll({
    where,
    include: [
      { model: FishingZone, attributes: ["id", "nome"] },
      { model: FishingSpecies, as: "species", attributes: ["id", "key", "id_item"], include: [{ model: Item, as: "item", attributes: ["id", "nome"] }] },
    ],
    order: [["id_zone", "ASC"], ["encounter_weight", "DESC"]],
  });
}

async function createAdminFishingPool(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_POOL);
  if (!dados.id_zone || !dados.id_species) throw erro("id_zone e id_species são obrigatórios.");
  if (dados.encounter_weight != null && dados.encounter_weight < 1) {
    throw erro("encounter_weight precisa ser >= 1.");
  }

  return sequelize.transaction(async (transaction) => {
    const zona = await FishingZone.findByPk(dados.id_zone, { transaction });
    if (!zona) throw erro("Zona de pesca não encontrada.", 404);
    const especie = await FishingSpecies.findByPk(dados.id_species, { transaction });
    if (!especie) throw erro("Espécie não encontrada.", 404);

    const existente = await FishingZoneSpecies.findOne({
      where: { id_zone: dados.id_zone, id_species: dados.id_species },
      transaction,
    });
    if (existente) throw erro("Essa espécie já está vinculada a essa zona.");

    const vinculo = await FishingZoneSpecies.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "FishingZoneSpecies",
      idEntidade: vinculo.id,
      dadosDepois: vinculo.toJSON(),
      req,
      transaction,
    });
    return vinculo;
  });
}

async function updateAdminFishingPool(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, ["encounter_weight", "nivel_pesca_minimo", "ativo"]);
  if (dados.encounter_weight != null && dados.encounter_weight < 1) {
    throw erro("encounter_weight precisa ser >= 1.");
  }

  return sequelize.transaction(async (transaction) => {
    const vinculo = await FishingZoneSpecies.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!vinculo) throw erro("Vínculo não encontrado.", 404);
    const antes = vinculo.toJSON();
    await vinculo.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "FishingZoneSpecies",
      idEntidade: vinculo.id,
      dadosAntes: antes,
      dadosDepois: vinculo.toJSON(),
      req,
      transaction,
    });
    return vinculo;
  });
}

// ---------------------------------------------------------------- PORTOS
const CAMPOS_PORTO = ["key", "nome", "id_world_node", "descricao", "ativo"];

async function listAdminFishingPorts() {
  return FishingPort.findAll({
    include: [{ model: WorldMapNode, attributes: ["id", "nome"] }],
    order: [["nome", "ASC"]],
  });
}

async function createAdminFishingPort(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_PORTO);
  if (!dados.key || !dados.nome) throw erro("key e nome são obrigatórios.");

  return sequelize.transaction(async (transaction) => {
    const porto = await FishingPort.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "FishingPort",
      idEntidade: porto.id,
      dadosDepois: porto.toJSON(),
      req,
      transaction,
    });
    return porto;
  });
}

async function updateAdminFishingPort(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_PORTO);

  return sequelize.transaction(async (transaction) => {
    const porto = await FishingPort.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!porto) throw erro("Porto não encontrado.", 404);
    const antes = porto.toJSON();
    await porto.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "FishingPort",
      idEntidade: porto.id,
      dadosAntes: antes,
      dadosDepois: porto.toJSON(),
      req,
      transaction,
    });
    return porto;
  });
}

// ----------------------------------------------------------------- ISCAS
const CAMPOS_ISCA = ["key", "nome_exibicao", "nivel_pesca_minimo", "ativo"];

async function listAdminFishingBaits() {
  return FishingBait.findAll({
    include: [{ model: Item, as: "item", attributes: ["id", "nome", "raridade", "imagem_url"] }],
    order: [["key", "ASC"]],
  });
}

async function createAdminFishingBait(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_ISCA);
  const idItem = payload?.id_item;
  if (!idItem || !dados.key) throw erro("id_item e key são obrigatórios.");

  return sequelize.transaction(async (transaction) => {
    const item = await Item.findByPk(idItem, { transaction });
    if (!item) throw erro("Item não encontrado.", 404);
    const existente = await FishingBait.findByPk(idItem, { transaction });
    if (existente) throw erro("Esse item já é uma isca cadastrada.");

    const isca = await FishingBait.create({ id_item: idItem, ...dados }, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "FishingBait",
      idEntidade: isca.id_item,
      dadosDepois: isca.toJSON(),
      req,
      transaction,
    });
    return isca;
  });
}

async function updateAdminFishingBait(idItem, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_ISCA.filter((c) => c !== "key"));

  return sequelize.transaction(async (transaction) => {
    const isca = await FishingBait.findByPk(idItem, { transaction, lock: transaction.LOCK.UPDATE });
    if (!isca) throw erro("Isca não encontrada.", 404);
    const antes = isca.toJSON();
    await isca.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "FishingBait",
      idEntidade: isca.id_item,
      dadosAntes: antes,
      dadosDepois: isca.toJSON(),
      req,
      transaction,
    });
    return isca;
  });
}

// ------------------------------------------------------------ AFINIDADES
const PPM_NEUTRO = 1_000_000;
const CAMPOS_AFINIDADE = ["id_bait_item", "id_species", "multiplicador_peso_ppm"];

async function listAdminFishingAffinities({ idBaitItem } = {}) {
  const where = {};
  if (idBaitItem) where.id_bait_item = idBaitItem;
  return FishingBaitAffinity.findAll({
    where,
    include: [
      { model: FishingBait, attributes: ["id_item", "key"], include: [{ model: Item, as: "item", attributes: ["id", "nome"] }] },
      { model: FishingSpecies, as: "species", attributes: ["id", "key"], include: [{ model: Item, as: "item", attributes: ["id", "nome"] }] },
    ],
    order: [["id_bait_item", "ASC"]],
  });
}

async function createAdminFishingAffinity(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_AFINIDADE);
  if (!dados.id_bait_item || !dados.id_species) throw erro("id_bait_item e id_species são obrigatórios.");
  if (dados.multiplicador_peso_ppm != null && dados.multiplicador_peso_ppm < 0) {
    throw erro("multiplicador_peso_ppm não pode ser negativo.");
  }

  return sequelize.transaction(async (transaction) => {
    const isca = await FishingBait.findByPk(dados.id_bait_item, { transaction });
    if (!isca) throw erro("Isca não encontrada.", 404);
    const especie = await FishingSpecies.findByPk(dados.id_species, { transaction });
    if (!especie) throw erro("Espécie não encontrada.", 404);

    const existente = await FishingBaitAffinity.findOne({
      where: { id_bait_item: dados.id_bait_item, id_species: dados.id_species },
      transaction,
    });
    if (existente) throw erro("Já existe uma afinidade cadastrada pra essa isca e espécie.");

    const afinidade = await FishingBaitAffinity.create(
      { multiplicador_peso_ppm: PPM_NEUTRO, ...dados },
      { transaction },
    );
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "FishingBaitAffinity",
      idEntidade: afinidade.id,
      dadosDepois: afinidade.toJSON(),
      req,
      transaction,
    });
    return afinidade;
  });
}

async function updateAdminFishingAffinity(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, ["multiplicador_peso_ppm"]);
  if (dados.multiplicador_peso_ppm != null && dados.multiplicador_peso_ppm < 0) {
    throw erro("multiplicador_peso_ppm não pode ser negativo.");
  }

  return sequelize.transaction(async (transaction) => {
    const afinidade = await FishingBaitAffinity.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!afinidade) throw erro("Afinidade não encontrada.", 404);
    const antes = afinidade.toJSON();
    await afinidade.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "FishingBaitAffinity",
      idEntidade: afinidade.id,
      dadosAntes: antes,
      dadosDepois: afinidade.toJSON(),
      req,
      transaction,
    });
    return afinidade;
  });
}

// --------------------------------------------------------- EMBARCAÇÕES
const CAMPOS_VESSEL = ["key", "nome", "tier", "nivel_pesca_minimo", "preco", "descricao", "ativo"];

async function listAdminVessels() {
  return Vessel.findAll({ order: [["tier", "ASC"], ["nome", "ASC"]] });
}

async function createAdminVessel(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_VESSEL);
  if (!dados.key || !dados.nome) throw erro("key e nome são obrigatórios.");
  if (dados.preco != null && dados.preco < 0) throw erro("preco não pode ser negativo.");

  return sequelize.transaction(async (transaction) => {
    const vessel = await Vessel.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "Vessel",
      idEntidade: vessel.id,
      dadosDepois: vessel.toJSON(),
      req,
      transaction,
    });
    return vessel;
  });
}

async function updateAdminVessel(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_VESSEL.filter((c) => c !== "key"));
  if (dados.preco != null && dados.preco < 0) throw erro("preco não pode ser negativo.");

  return sequelize.transaction(async (transaction) => {
    const vessel = await Vessel.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!vessel) throw erro("Embarcação não encontrada.", 404);
    const antes = vessel.toJSON();
    await vessel.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "Vessel",
      idEntidade: vessel.id,
      dadosAntes: antes,
      dadosDepois: vessel.toJSON(),
      req,
      transaction,
    });
    return vessel;
  });
}

// ------------------------------------------------------- ROTAS MARÍTIMAS
const CAMPOS_ROTA = ["id_world_connection", "id_port_origem", "id_zone_destino", "min_vessel_tier", "distance", "ativo"];

async function listAdminMarineRoutes() {
  return MarineRoute.findAll({
    include: [
      { model: FishingPort, as: "portoOrigem", attributes: ["id", "nome"] },
      { model: FishingZone, as: "zonaDestino", attributes: ["id", "nome"] },
    ],
    order: [["id", "ASC"]],
  });
}

async function createAdminMarineRoute(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_ROTA);
  if (!dados.id_world_connection || !dados.id_port_origem || !dados.id_zone_destino) {
    throw erro("id_world_connection, id_port_origem e id_zone_destino são obrigatórios.");
  }

  return sequelize.transaction(async (transaction) => {
    const porto = await FishingPort.findByPk(dados.id_port_origem, { transaction });
    if (!porto) throw erro("Porto de origem não encontrado.", 404);
    const zona = await FishingZone.findByPk(dados.id_zone_destino, { transaction });
    if (!zona) throw erro("Zona de destino não encontrada.", 404);

    const existente = await MarineRoute.findOne({ where: { id_world_connection: dados.id_world_connection }, transaction });
    if (existente) throw erro("Já existe uma rota marítima pra essa conexão do mapa.");

    const rota = await MarineRoute.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "MarineRoute",
      idEntidade: rota.id,
      dadosDepois: rota.toJSON(),
      req,
      transaction,
    });
    return rota;
  });
}

async function updateAdminMarineRoute(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, ["min_vessel_tier", "distance", "ativo"]);

  return sequelize.transaction(async (transaction) => {
    const rota = await MarineRoute.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!rota) throw erro("Rota marítima não encontrada.", 404);
    const antes = rota.toJSON();
    await rota.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "MarineRoute",
      idEntidade: rota.id,
      dadosAntes: antes,
      dadosDepois: rota.toJSON(),
      req,
      transaction,
    });
    return rota;
  });
}

// ------------------------------------------------------------- TORNEIOS
const CAMPOS_TORNEIO = ["nome", "id_zone", "inicia_em", "termina_em", "ativo"];

async function listAdminFishingTournaments() {
  return FishingTournament.findAll({
    include: [{ model: FishingZone, as: "zona", attributes: ["id", "nome"] }],
    order: [["inicia_em", "DESC"]],
  });
}

function validarTorneio(dados) {
  if (dados.inicia_em && dados.termina_em && new Date(dados.inicia_em) >= new Date(dados.termina_em)) {
    throw erro("inicia_em precisa ser antes de termina_em.");
  }
}

async function createAdminFishingTournament(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_TORNEIO);
  if (!dados.nome || !dados.inicia_em || !dados.termina_em) {
    throw erro("nome, inicia_em e termina_em são obrigatórios.");
  }
  validarTorneio(dados);

  return sequelize.transaction(async (transaction) => {
    if (dados.id_zone) {
      const zona = await FishingZone.findByPk(dados.id_zone, { transaction });
      if (!zona) throw erro("Zona não encontrada.", 404);
    }
    const torneio = await FishingTournament.create({ ...dados, id_admin_criador: idAdmin }, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "FishingTournament",
      idEntidade: torneio.id,
      dadosDepois: torneio.toJSON(),
      req,
      transaction,
    });
    return torneio;
  });
}

async function updateAdminFishingTournament(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_TORNEIO);

  return sequelize.transaction(async (transaction) => {
    const torneio = await FishingTournament.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!torneio) throw erro("Torneio não encontrado.", 404);
    const antes = torneio.toJSON();
    const mesclado = { ...antes, ...dados };
    validarTorneio(mesclado);
    await torneio.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "FishingTournament",
      idEntidade: torneio.id,
      dadosAntes: antes,
      dadosDepois: torneio.toJSON(),
      req,
      transaction,
    });
    return torneio;
  });
}

module.exports = {
  listAdminFishingZones,
  createAdminFishingZone,
  updateAdminFishingZone,
  listAdminFishingSpecies,
  createAdminFishingSpecies,
  updateAdminFishingSpecies,
  listAdminFishingPool,
  createAdminFishingPool,
  updateAdminFishingPool,
  listAdminFishingPorts,
  createAdminFishingPort,
  updateAdminFishingPort,
  listAdminFishingBaits,
  createAdminFishingBait,
  updateAdminFishingBait,
  listAdminFishingAffinities,
  createAdminFishingAffinity,
  updateAdminFishingAffinity,
  listAdminVessels,
  createAdminVessel,
  updateAdminVessel,
  listAdminMarineRoutes,
  createAdminMarineRoute,
  updateAdminMarineRoute,
  listAdminFishingTournaments,
  createAdminFishingTournament,
  updateAdminFishingTournament,
};
