// Painel Administrativo — Evento "O Coração da Máquina Celestial",
// Fase 15 (Admin completo): CRUD do Custódio do Meridiano (config/
// fases/resistências). Clone estrutural de adminTempleBossService.js
// (mesmo formato de validação + registrarAcao), com duas diferenças
// deliberadas que já vêm da Fase 13 (ver eventPuzzleBossModels.js):
//
// 1. "Editável" é guardado pela EventDefinition (ARCHIVED bloqueia),
//    nunca por um TempleEvent-like singleton — Puzzle não tem essa
//    noção de "a Convergência aberta agora".
// 2. Nenhuma exigência de ai_profile ELITE_BOSS nem "marcar monstro
//    exclusivo" (isso é um conceito específico do Templo, nunca
//    reaproveitado aqui — a Fase 13 já decidiu ai_profile "BOSS" pro
//    Custódio, ELITE_BOSS é reservado ao Templo por comentário
//    explícito em AdventureMonster.js).
const { sequelize } = require("../config/database");
const { EventPuzzleBossConfig, EventPuzzleBossPhase, EventPuzzleBossStatusResistance } = require("../models/eventPuzzleBossModels");
const { PuzzleBlueprint } = require("../models/eventPuzzleModels");
const AdventureMonster = require("../models/AdventureMonster");
const eventDefinitionService = require("./eventDefinitionService");
const { registrarAcao } = require("./adminAuditService");
const { CHAVES_VALIDAS: STATUS_KEYS_VALIDAS } = require("../config/statusEffectConfig");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

async function carregarDefinicaoEditavel(idEventDefinition, transaction) {
  const definicao = await eventDefinitionService.obterPorId(idEventDefinition, transaction, { lock: true });
  if (definicao.status === "ARCHIVED") {
    throw erro("Esse evento foi arquivado — não é possível editar o Custódio do Meridiano.", 409);
  }
  return definicao;
}

async function obterConfigAdmin(idEventDefinition) {
  const config = await EventPuzzleBossConfig.findOne({ where: { id_event_definition: idEventDefinition } });
  if (!config) return { config: null, fases: [], resistencias: [] };
  const [fases, resistencias] = await Promise.all([
    EventPuzzleBossPhase.findAll({ where: { id_boss_config: config.id }, order: [["ordem", "ASC"]] }),
    EventPuzzleBossStatusResistance.findAll({ where: { id_boss_config: config.id } }),
  ]);
  return { config, fases, resistencias };
}

function validarConfig(dados, { parcial = false } = {}) {
  const erros = [];
  if (!parcial || dados.id_monstro_base !== undefined) {
    if (!dados.id_monstro_base) erros.push("id_monstro_base é obrigatório.");
  }
  for (const campo of ["target_turns_to_kill", "target_boss_actions_survivable"]) {
    if (dados[campo] !== undefined && (!Number.isInteger(dados[campo]) || dados[campo] <= 0)) {
      erros.push(`${campo} precisa ser um inteiro positivo.`);
    }
  }
  for (const campo of ["scaling_min_multiplier", "scaling_max_multiplier"]) {
    if (dados[campo] !== undefined && Number(dados[campo]) <= 0) erros.push(`${campo} precisa ser > 0.`);
  }
  if (dados.scaling_min_multiplier !== undefined && dados.scaling_max_multiplier !== undefined
    && Number(dados.scaling_min_multiplier) > Number(dados.scaling_max_multiplier)) {
    erros.push("scaling_min_multiplier não pode ser maior que scaling_max_multiplier.");
  }
  for (const campo of ["reward_ouro_primeira_vitoria", "reward_xp_primeira_vitoria"]) {
    if (dados[campo] !== undefined && (!Number.isInteger(dados[campo]) || dados[campo] < 0)) {
      erros.push(`${campo} precisa ser um inteiro >= 0.`);
    }
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

// Upsert do Custódio (um config por EventDefinition, ver UNIQUE em
// EventPuzzleBossConfig.id_event_definition).
async function salvarConfig(idEventDefinition, dados, { idAdmin, req }) {
  validarConfig(dados);
  return sequelize.transaction(async (transaction) => {
    await carregarDefinicaoEditavel(idEventDefinition, transaction);
    let config = await EventPuzzleBossConfig.findOne({
      where: { id_event_definition: idEventDefinition },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const antes = config?.toJSON() ?? null;

    const monstro = await AdventureMonster.findByPk(dados.id_monstro_base ?? config?.id_monstro_base, { transaction });
    if (!monstro) throw erro("id_monstro_base não aponta pra nenhum AdventureMonster existente.", 404);

    let idBlueprintGatilho = dados.id_blueprint_gatilho !== undefined ? dados.id_blueprint_gatilho : config?.id_blueprint_gatilho ?? null;
    if (idBlueprintGatilho != null) {
      const gatilho = await PuzzleBlueprint.findByPk(idBlueprintGatilho, { transaction });
      if (!gatilho || gatilho.id_event_definition !== Number(idEventDefinition)) {
        throw erro("id_blueprint_gatilho precisa ser um blueprint existente do mesmo evento.", 400);
      }
    }

    const campos = {
      id_event_definition: idEventDefinition,
      id_monstro_base: monstro.id,
      id_blueprint_gatilho: idBlueprintGatilho,
      nome_exibicao: dados.nome_exibicao ?? config?.nome_exibicao ?? null,
      lore: dados.lore ?? config?.lore ?? null,
      target_turns_to_kill: dados.target_turns_to_kill ?? config?.target_turns_to_kill ?? 8,
      target_boss_actions_survivable: dados.target_boss_actions_survivable ?? config?.target_boss_actions_survivable ?? 6,
      scaling_min_multiplier: dados.scaling_min_multiplier ?? config?.scaling_min_multiplier ?? 0.5,
      scaling_max_multiplier: dados.scaling_max_multiplier ?? config?.scaling_max_multiplier ?? 3,
      reward_ouro_primeira_vitoria: dados.reward_ouro_primeira_vitoria ?? config?.reward_ouro_primeira_vitoria ?? 0,
      reward_xp_primeira_vitoria: dados.reward_xp_primeira_vitoria ?? config?.reward_xp_primeira_vitoria ?? 0,
      ativo: dados.ativo ?? config?.ativo ?? true,
    };
    if (config) {
      await config.update(campos, { transaction });
    } else {
      config = await EventPuzzleBossConfig.create(campos, { transaction });
    }
    await registrarAcao({
      idAdmin,
      acao: antes ? "editar" : "criar",
      entidade: "EventPuzzleBossConfig",
      idEntidade: config.id,
      dadosAntes: antes,
      dadosDepois: config.toJSON(),
      req,
      transaction,
    });
    return config;
  });
}

async function exigirConfig(idEventDefinition, transaction) {
  const config = await EventPuzzleBossConfig.findOne({
    where: { id_event_definition: idEventDefinition },
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
  if (!config) throw erro("Configure o Custódio (monstro-base) antes de editar fases/resistências.", 409);
  return config;
}

function validarFase(dados, { parcial = false } = {}) {
  const erros = [];
  if (!parcial || dados.hp_threshold_pct !== undefined) {
    if (!Number.isInteger(dados.hp_threshold_pct) || dados.hp_threshold_pct < 1 || dados.hp_threshold_pct > 100) {
      erros.push("hp_threshold_pct precisa ser um inteiro entre 1 e 100.");
    }
  }
  for (const campo of ["dano_multiplicador", "defesa_multiplicador"]) {
    if (dados[campo] !== undefined && Number(dados[campo]) <= 0) erros.push(`${campo} precisa ser > 0.`);
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

async function criarFase(idEventDefinition, dados, { idAdmin, req }) {
  validarFase(dados);
  return sequelize.transaction(async (transaction) => {
    await carregarDefinicaoEditavel(idEventDefinition, transaction);
    const config = await exigirConfig(idEventDefinition, transaction);
    const fase = await EventPuzzleBossPhase.create(
      {
        id_boss_config: config.id,
        ordem: dados.ordem ?? 0,
        hp_threshold_pct: dados.hp_threshold_pct,
        nome_exibicao: dados.nome_exibicao ?? null,
        dano_multiplicador: dados.dano_multiplicador ?? 1,
        defesa_multiplicador: dados.defesa_multiplicador ?? 1,
        enrage: Boolean(dados.enrage),
      },
      { transaction },
    );
    await registrarAcao({ idAdmin, acao: "criar", entidade: "EventPuzzleBossPhase", idEntidade: fase.id, dadosDepois: fase.toJSON(), req, transaction });
    return fase;
  });
}

async function atualizarFase(idEventDefinition, idFase, dados, { idAdmin, req }) {
  validarFase(dados, { parcial: true });
  return sequelize.transaction(async (transaction) => {
    await carregarDefinicaoEditavel(idEventDefinition, transaction);
    const config = await exigirConfig(idEventDefinition, transaction);
    const fase = await EventPuzzleBossPhase.findOne({ where: { id: idFase, id_boss_config: config.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!fase) throw erro("Fase não encontrada.", 404);
    const antes = fase.toJSON();
    for (const campo of ["ordem", "hp_threshold_pct", "nome_exibicao", "dano_multiplicador", "defesa_multiplicador", "enrage"]) {
      if (dados[campo] !== undefined) fase[campo] = dados[campo];
    }
    await fase.save({ transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "EventPuzzleBossPhase", idEntidade: fase.id, dadosAntes: antes, dadosDepois: fase.toJSON(), req, transaction });
    return fase;
  });
}

async function excluirFase(idEventDefinition, idFase, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    await carregarDefinicaoEditavel(idEventDefinition, transaction);
    const config = await exigirConfig(idEventDefinition, transaction);
    const fase = await EventPuzzleBossPhase.findOne({ where: { id: idFase, id_boss_config: config.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!fase) throw erro("Fase não encontrada.", 404);
    const antes = fase.toJSON();
    await fase.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "excluir", entidade: "EventPuzzleBossPhase", idEntidade: idFase, dadosAntes: antes, req, transaction });
    return { excluida: true };
  });
}

function validarResistencia(dados, { parcial = false } = {}) {
  const erros = [];
  if (!parcial || dados.status_key !== undefined) {
    if (!STATUS_KEYS_VALIDAS.includes(dados.status_key)) erros.push(`status_key precisa ser uma das chaves válidas: ${STATUS_KEYS_VALIDAS.join(", ")}.`);
  }
  if (dados.resistencia_pct !== undefined && (!Number.isInteger(dados.resistencia_pct) || dados.resistencia_pct < 0 || dados.resistencia_pct > 100)) {
    erros.push("resistencia_pct precisa ser um inteiro entre 0 e 100.");
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

async function criarResistencia(idEventDefinition, dados, { idAdmin, req }) {
  validarResistencia(dados);
  return sequelize.transaction(async (transaction) => {
    await carregarDefinicaoEditavel(idEventDefinition, transaction);
    const config = await exigirConfig(idEventDefinition, transaction);
    const existente = await EventPuzzleBossStatusResistance.findOne({ where: { id_boss_config: config.id, status_key: dados.status_key }, transaction });
    if (existente) throw erro("Já existe uma resistência cadastrada para este status.", 409);
    const resistencia = await EventPuzzleBossStatusResistance.create(
      { id_boss_config: config.id, status_key: dados.status_key, imune: Boolean(dados.imune), resistencia_pct: dados.resistencia_pct ?? 0 },
      { transaction },
    );
    await registrarAcao({ idAdmin, acao: "criar", entidade: "EventPuzzleBossStatusResistance", idEntidade: resistencia.id, dadosDepois: resistencia.toJSON(), req, transaction });
    return resistencia;
  });
}

async function atualizarResistencia(idEventDefinition, idResistencia, dados, { idAdmin, req }) {
  validarResistencia(dados, { parcial: true });
  return sequelize.transaction(async (transaction) => {
    await carregarDefinicaoEditavel(idEventDefinition, transaction);
    const config = await exigirConfig(idEventDefinition, transaction);
    const resistencia = await EventPuzzleBossStatusResistance.findOne({ where: { id: idResistencia, id_boss_config: config.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!resistencia) throw erro("Resistência não encontrada.", 404);
    const antes = resistencia.toJSON();
    for (const campo of ["imune", "resistencia_pct"]) {
      if (dados[campo] !== undefined) resistencia[campo] = dados[campo];
    }
    await resistencia.save({ transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "EventPuzzleBossStatusResistance", idEntidade: resistencia.id, dadosAntes: antes, dadosDepois: resistencia.toJSON(), req, transaction });
    return resistencia;
  });
}

async function excluirResistencia(idEventDefinition, idResistencia, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    await carregarDefinicaoEditavel(idEventDefinition, transaction);
    const config = await exigirConfig(idEventDefinition, transaction);
    const resistencia = await EventPuzzleBossStatusResistance.findOne({ where: { id: idResistencia, id_boss_config: config.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!resistencia) throw erro("Resistência não encontrada.", 404);
    const antes = resistencia.toJSON();
    await resistencia.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "excluir", entidade: "EventPuzzleBossStatusResistance", idEntidade: idResistencia, dadosAntes: antes, req, transaction });
    return { excluida: true };
  });
}

module.exports = {
  obterConfigAdmin,
  salvarConfig,
  criarFase,
  atualizarFase,
  excluirFase,
  criarResistencia,
  atualizarResistencia,
  excluirResistencia,
};
