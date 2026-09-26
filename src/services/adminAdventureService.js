// Painel Administrativo Fase 8 (§19) — Zonas, Monstros, Aparições
// (vínculo zona-monstro) e Drops (AdventureMonsterLoot) da Aventura.
// Reaproveita os models existentes (AdventureZone/AdventureMonster/
// AdventureZoneMonster/AdventureMonsterLoot) — nenhuma tabela nova.
// Recompensa de XP/ouro continua calculada em adventureRewardService.js
// (não duplicado aqui).
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const AdventureZone = require("../models/AdventureZone");
const AdventureMonster = require("../models/AdventureMonster");
const AdventureZoneMonster = require("../models/AdventureZoneMonster");
const AdventureMonsterLoot = require("../models/AdventureMonsterLoot");
const Item = require("../models/Item");
const { registrarAcao } = require("./adminAuditService");
const monsterBalancePreviewService = require("./monsterBalancePreviewService");
const monsterBalanceSimulationService = require("./monsterBalanceSimulationService");
const { PRESETS_MONSTRO, SIMULACAO_MAX_ITERACOES } = require("../config/monsterBalanceConfig");

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
const CAMPOS_ZONA = ["nome", "descricao", "nivel_monstro_min", "nivel_monstro_max", "imagem_url", "ordem", "ativa"];

async function listAdminZones() {
  return AdventureZone.findAll({ order: [["ordem", "ASC"], ["id", "ASC"]] });
}

async function createAdminZone(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_ZONA);
  if (!dados.nome) throw erro("nome é obrigatório.");
  if (dados.nivel_monstro_min == null || dados.nivel_monstro_max == null) {
    throw erro("nivel_monstro_min e nivel_monstro_max são obrigatórios.");
  }
  if (dados.nivel_monstro_min > dados.nivel_monstro_max) {
    throw erro("nivel_monstro_min não pode ser maior que nivel_monstro_max.");
  }

  return sequelize.transaction(async (transaction) => {
    const zona = await AdventureZone.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "AdventureZone",
      idEntidade: zona.id,
      dadosDepois: zona.toJSON(),
      req,
      transaction,
    });
    return zona;
  });
}

async function updateAdminZone(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_ZONA);
  const min = dados.nivel_monstro_min;
  const max = dados.nivel_monstro_max;
  if (min != null && max != null && min > max) {
    throw erro("nivel_monstro_min não pode ser maior que nivel_monstro_max.");
  }

  return sequelize.transaction(async (transaction) => {
    const zona = await AdventureZone.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!zona) throw erro("Zona não encontrada.", 404);
    const antes = zona.toJSON();
    await zona.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "AdventureZone",
      idEntidade: zona.id,
      dadosAntes: antes,
      dadosDepois: zona.toJSON(),
      req,
      transaction,
    });
    return zona;
  });
}

// ------------------------------------------------------------- MONSTROS
const CAMPOS_MONSTRO = [
  "nome",
  "descricao",
  "imagem_url",
  "multiplicador_vida",
  "multiplicador_dano",
  "multiplicador_agilidade",
  "multiplicador_velocidade",
  "ativo",
];

async function listAdminMonsters() {
  return AdventureMonster.findAll({ order: [["nome", "ASC"]] });
}

async function createAdminMonster(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_MONSTRO);
  if (!dados.nome) throw erro("nome é obrigatório.");

  return sequelize.transaction(async (transaction) => {
    const monstro = await AdventureMonster.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "AdventureMonster",
      idEntidade: monstro.id,
      dadosDepois: monstro.toJSON(),
      req,
      transaction,
    });
    return monstro;
  });
}

// `balanceContext` (opcional) vem do Editor de Balanceamento por
// Resultado (Admin Aventura §12) quando o salvamento vier do Modo
// Simples/Avançado: nível de referência usado e os valores desejados
// que o admin viu na tela — nunca persistido no AdventureMonster (§9.3
// "nenhuma migração obrigatória"), só anexado ao audit log pra dar
// rastreabilidade de POR QUE os multiplicadores viraram esses números.
async function updateAdminMonster(id, payload, { idAdmin, req, balanceContext = null }) {
  const dados = somenteCampos(payload, CAMPOS_MONSTRO);

  return sequelize.transaction(async (transaction) => {
    const monstro = await AdventureMonster.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!monstro) throw erro("Monstro não encontrado.", 404);
    const antes = monstro.toJSON();
    await monstro.update(dados, { transaction });
    const depois = monstro.toJSON();
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "AdventureMonster",
      idEntidade: monstro.id,
      dadosAntes: antes,
      dadosDepois: balanceContext ? { ...depois, balanceContext } : depois,
      req,
      transaction,
    });
    return monstro;
  });
}

// ------------------------------------- BALANCEAMENTO (preview/simulação)
// Editor de Balanceamento de Monstros por Resultado (§9/§10). Nunca
// persiste nada — só traduz/simula em cima dos multiplicadores reais.

async function previewMonsterBalance(id, payload) {
  const monstro = await AdventureMonster.findByPk(id);
  if (!monstro) throw erro("Monstro não encontrado.", 404);

  return monsterBalancePreviewService.gerarPreview({
    idMonstro: monstro.id,
    referenceLevel: payload?.referenceLevel,
    mode: payload?.mode,
    desired: payload?.desired,
    multiplicadores: payload?.multiplicadores ?? {
      vida: monstro.multiplicador_vida,
      dano: monstro.multiplicador_dano,
      agilidade: monstro.multiplicador_agilidade,
      velocidade: monstro.multiplicador_velocidade,
    },
    zoneId: payload?.zoneId,
  });
}

async function simulateMonsterBalance(id, payload) {
  const monstro = await AdventureMonster.findByPk(id);
  if (!monstro) throw erro("Monstro não encontrado.", 404);

  const nivel = Math.max(1, Math.round(Number(payload?.referenceLevel) || 1));
  const multiplicadores = payload?.multiplicadores ?? {
    vida: monstro.multiplicador_vida,
    dano: monstro.multiplicador_dano,
    agilidade: monstro.multiplicador_agilidade,
    velocidade: monstro.multiplicador_velocidade,
  };
  const iteracoes = Math.min(SIMULACAO_MAX_ITERACOES, Math.max(1, Math.round(Number(payload?.iterations) || 1000)));

  return monsterBalanceSimulationService.simularCombates({
    nivel,
    multiplicadores,
    perfilChave: payload?.profile ?? "MEDIO",
    iteracoes,
  });
}

function listarPresetsDeBalanceamento() {
  return Object.entries(PRESETS_MONSTRO).map(([chave, preset]) => ({ chave, ...preset }));
}

function listarPerfisSinteticos() {
  return monsterBalancePreviewService.perfisDisponiveis();
}

async function duplicateAdminMonster(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const original = await AdventureMonster.findByPk(id, { transaction });
    if (!original) throw erro("Monstro não encontrado.", 404);

    const dados = somenteCampos(original.toJSON(), CAMPOS_MONSTRO);
    dados.nome = `${original.nome} (cópia)`;
    dados.ativo = false;

    const copia = await AdventureMonster.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "duplicar",
      entidade: "AdventureMonster",
      idEntidade: copia.id,
      dadosAntes: { origemId: original.id },
      dadosDepois: copia.toJSON(),
      req,
      transaction,
    });
    return copia;
  });
}

// ------------------------------------------------------------ APARIÇÕES
const CAMPOS_APARICAO = ["id_area", "id_monstro", "peso_aparicao", "tipo_aparicao", "nivel_min_override", "nivel_max_override", "ativo"];

async function listAdminZoneMonsters({ idArea } = {}) {
  const where = {};
  if (idArea) where.id_area = idArea;
  return AdventureZoneMonster.findAll({
    where,
    // Sem `as:` nos dois includes de propósito — AdventureZoneMonster
    // registra essas duas belongsTo SEM alias em associations.js
    // (adventureHuntRotationService.js já lê `.AdventureZone` assim);
    // "monstro" é a exceção que já tem alias próprio.
    include: [
      { model: AdventureZone, attributes: ["id", "nome"] },
      { model: AdventureMonster, as: "monstro", attributes: ["id", "nome", "imagem_url"] },
    ],
    order: [["id_area", "ASC"], ["tipo_aparicao", "ASC"]],
  });
}

async function createAdminZoneMonster(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_APARICAO);
  if (!dados.id_area || !dados.id_monstro) throw erro("id_area e id_monstro são obrigatórios.");

  return sequelize.transaction(async (transaction) => {
    const zona = await AdventureZone.findByPk(dados.id_area, { transaction });
    if (!zona) throw erro("Zona não encontrada.", 404);
    const monstro = await AdventureMonster.findByPk(dados.id_monstro, { transaction });
    if (!monstro) throw erro("Monstro não encontrado.", 404);

    const existente = await AdventureZoneMonster.findOne({
      where: { id_area: dados.id_area, id_monstro: dados.id_monstro },
      transaction,
    });
    if (existente) throw erro("Esse monstro já está vinculado a essa zona.");

    const vinculo = await AdventureZoneMonster.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "AdventureZoneMonster",
      idEntidade: vinculo.id,
      dadosDepois: vinculo.toJSON(),
      req,
      transaction,
    });
    return vinculo;
  });
}

async function updateAdminZoneMonster(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, ["peso_aparicao", "tipo_aparicao", "nivel_min_override", "nivel_max_override", "ativo"]);

  return sequelize.transaction(async (transaction) => {
    const vinculo = await AdventureZoneMonster.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!vinculo) throw erro("Vínculo não encontrado.", 404);
    const antes = vinculo.toJSON();
    await vinculo.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "AdventureZoneMonster",
      idEntidade: vinculo.id,
      dadosAntes: antes,
      dadosDepois: vinculo.toJSON(),
      req,
      transaction,
    });
    return vinculo;
  });
}

// ----------------------------------------------------------------- LOOT
const PPM_MAXIMO = 1_000_000;
const CAMPOS_LOOT = ["id_monstro", "id_item", "chance_ppm", "quantidade_min", "quantidade_max", "categoria", "ativo"];

async function listAdminMonsterLoot({ idMonstro } = {}) {
  const where = {};
  if (idMonstro) where.id_monstro = idMonstro;
  return AdventureMonsterLoot.findAll({
    where,
    // AdventureMonsterLoot->AdventureMonster também não tem alias em
    // associations.js (só ->Item tem, "item").
    include: [
      { model: AdventureMonster, attributes: ["id", "nome"] },
      { model: Item, as: "item", attributes: ["id", "nome", "raridade", "imagem_url"] },
    ],
    order: [["id_monstro", "ASC"], ["chance_ppm", "DESC"]],
  });
}

function validarLoot(dados) {
  if (dados.chance_ppm != null) {
    if (!Number.isInteger(dados.chance_ppm) || dados.chance_ppm <= 0 || dados.chance_ppm > PPM_MAXIMO) {
      throw erro(`chance_ppm precisa ser um inteiro entre 1 e ${PPM_MAXIMO} (100%).`);
    }
  }
  const min = dados.quantidade_min;
  const max = dados.quantidade_max;
  if (min != null && max != null && min > max) {
    throw erro("quantidade_min não pode ser maior que quantidade_max.");
  }
}

async function createAdminMonsterLoot(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_LOOT);
  if (!dados.id_monstro || !dados.id_item || dados.chance_ppm == null) {
    throw erro("id_monstro, id_item e chance_ppm são obrigatórios.");
  }
  validarLoot(dados);

  return sequelize.transaction(async (transaction) => {
    const monstro = await AdventureMonster.findByPk(dados.id_monstro, { transaction });
    if (!monstro) throw erro("Monstro não encontrado.", 404);
    const item = await Item.findByPk(dados.id_item, { transaction });
    if (!item) throw erro("Item não encontrado.", 404);

    const loot = await AdventureMonsterLoot.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "AdventureMonsterLoot",
      idEntidade: loot.id,
      dadosDepois: loot.toJSON(),
      req,
      transaction,
    });
    return loot;
  });
}

async function updateAdminMonsterLoot(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, ["chance_ppm", "quantidade_min", "quantidade_max", "categoria", "ativo"]);
  validarLoot(dados);

  return sequelize.transaction(async (transaction) => {
    const loot = await AdventureMonsterLoot.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!loot) throw erro("Drop não encontrado.", 404);
    const antes = loot.toJSON();
    await loot.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "AdventureMonsterLoot",
      idEntidade: loot.id,
      dadosAntes: antes,
      dadosDepois: loot.toJSON(),
      req,
      transaction,
    });
    return loot;
  });
}

module.exports = {
  listAdminZones,
  createAdminZone,
  updateAdminZone,
  listAdminMonsters,
  createAdminMonster,
  updateAdminMonster,
  duplicateAdminMonster,
  listAdminZoneMonsters,
  createAdminZoneMonster,
  updateAdminZoneMonster,
  listAdminMonsterLoot,
  createAdminMonsterLoot,
  updateAdminMonsterLoot,
  previewMonsterBalance,
  simulateMonsterBalance,
  listarPresetsDeBalanceamento,
  listarPerfisSinteticos,
};
