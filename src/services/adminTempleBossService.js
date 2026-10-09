// Painel Administrativo — Templo do Véu Celestial: Provação Final
// (§8/§9/§12.1 "escolher monstro-base exclusivo, fases, resistências,
// scaling, loot e AI profile/build proveniente do Documento 1" +
// simulação do Boss em perfis de Poder distintos). Um TempleBossConfig
// por evento (upsert); só editável enquanto a Convergência está em
// DRAFT/SCHEDULED. Nunca cria IA/Power/Status/equipamento paralelo —
// a build do Guardião (Powers/passivas/ataque básico) é 100% a do
// AdventureMonster referenciado, montada pelo Documento 1
// (monsterCombatAdapter.construirHabilidadesParaEncontro).
const { sequelize } = require("../config/database");
const TempleEvent = require("../models/TempleEvent");
const TempleBossConfig = require("../models/TempleBossConfig");
const TempleBossPhase = require("../models/TempleBossPhase");
const TempleBossStatusResistance = require("../models/TempleBossStatusResistance");
const TempleBossRewardEntry = require("../models/TempleBossRewardEntry");
const AdventureMonster = require("../models/AdventureMonster");
const AdventureZoneMonster = require("../models/AdventureZoneMonster");
const Item = require("../models/Item");
const { registrarAcao } = require("./adminAuditService");
const { exigirEditavel } = require("./adminTempleEventService");
const { REWARD_KIND, GAME_SETTINGS_DEFAULT } = require("../config/templeConfig");
const { CHAVES_VALIDAS: STATUS_KEYS_VALIDAS } = require("../config/statusEffectConfig");
const templeBossScalingService = require("./templeBossScalingService");
const gameSettingCache = require("./gameSettingCache");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

const REWARD_KINDS_VALIDOS = Object.values(REWARD_KIND);

async function carregarEventoEditavel(idEvento, transaction) {
  const evento = await TempleEvent.findByPk(idEvento, { transaction, lock: transaction?.LOCK?.UPDATE });
  if (!evento) throw erro("Convergência não encontrada.", 404);
  exigirEditavel(evento);
  return evento;
}

async function obterGuardiaoAdmin(idEvento) {
  const config = await TempleBossConfig.findOne({ where: { id_event: idEvento } });
  if (!config) return { config: null, fases: [], resistencias: [], rewardEntries: [] };
  const [fases, resistencias, rewardEntries] = await Promise.all([
    TempleBossPhase.findAll({ where: { id_boss_config: config.id }, order: [["ordem", "ASC"]] }),
    TempleBossStatusResistance.findAll({ where: { id_boss_config: config.id } }),
    TempleBossRewardEntry.findAll({ where: { id_boss_config: config.id } }),
  ]);
  return { config, fases, resistencias, rewardEntries };
}

function validarConfig(dados, { parcial = false } = {}) {
  const erros = [];
  if (!parcial || dados.id_monstro_base !== undefined) {
    if (!dados.id_monstro_base) erros.push("id_monstro_base é obrigatório.");
  }
  for (const campo of ["target_turns_to_kill", "target_boss_actions_survivable"]) {
    if (dados[campo] !== undefined && dados[campo] !== null && (!Number.isInteger(dados[campo]) || dados[campo] <= 0)) {
      erros.push(`${campo} precisa ser um inteiro positivo (ou null pra usar o default operacional).`);
    }
  }
  for (const campo of ["scaling_min_multiplier", "scaling_max_multiplier"]) {
    if (dados[campo] !== undefined && dados[campo] !== null && Number(dados[campo]) <= 0) {
      erros.push(`${campo} precisa ser > 0 (ou null pra usar o default operacional).`);
    }
  }
  if (dados.scaling_min_multiplier != null && dados.scaling_max_multiplier != null && Number(dados.scaling_min_multiplier) > Number(dados.scaling_max_multiplier)) {
    erros.push("scaling_min_multiplier não pode ser maior que scaling_max_multiplier.");
  }
  if (dados.reward_sigils_primeira_vitoria !== undefined && (!Number.isInteger(dados.reward_sigils_primeira_vitoria) || dados.reward_sigils_primeira_vitoria < 0)) {
    erros.push("reward_sigils_primeira_vitoria precisa ser um inteiro >= 0.");
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

// §8.2 — valida e MARCA o monstro escolhido como exclusivo do Templo
// (nunca silenciosamente): rejeita se ele já está em rotação normal
// (AdventureZoneMonster ativo) e exige ai_profile ELITE_BOSS (única
// profile com a menor aleatoriedade de decisão — §5.4 do Documento 1),
// porque o Guardião NUNCA tem sua própria IA. Desmarca o monstro
// anterior (se for outro) pra ele poder voltar a uma rotação normal.
async function garantirMonstroExclusivo(idBossConfig, idMonstroNovo, idMonstroAnterior, transaction) {
  const monstro = await AdventureMonster.findByPk(idMonstroNovo, { transaction, lock: transaction.LOCK.UPDATE });
  if (!monstro) throw erro("id_monstro_base não aponta pra nenhum AdventureMonster existente.");
  if (monstro.ai_profile !== "ELITE_BOSS") {
    throw erro(`O monstro "${monstro.nome}" precisa ter ai_profile ELITE_BOSS (edite-o no Admin de Monstros antes de usá-lo como Guardião).`);
  }
  if (!monstro.temple_exclusive) {
    const vinculoAtivo = await AdventureZoneMonster.findOne({ where: { id_monstro: idMonstroNovo }, transaction });
    if (vinculoAtivo) {
      throw erro(`O monstro "${monstro.nome}" já está em rotação de zona normal — remova-o de lá antes de torná-lo exclusivo do Templo.`);
    }
  }
  await monstro.update({ temple_exclusive: true, disponivel_emboscada: false }, { transaction });

  if (idMonstroAnterior && idMonstroAnterior !== idMonstroNovo) {
    const anterior = await AdventureMonster.findByPk(idMonstroAnterior, { transaction, lock: transaction.LOCK.UPDATE });
    if (anterior) await anterior.update({ temple_exclusive: false }, { transaction });
  }
}

// §8.1/§12.1 — upsert do config do Guardião. ativo é sempre true na
// prática (um evento só tem um Guardião possível), mantido só pra
// simetria com o resto do catálogo admin.
async function salvarConfig(idEvento, dados, { idAdmin, req }) {
  validarConfig(dados);
  return sequelize.transaction(async (transaction) => {
    await carregarEventoEditavel(idEvento, transaction);
    let config = await TempleBossConfig.findOne({ where: { id_event: idEvento }, transaction, lock: transaction.LOCK.UPDATE });
    const antes = config?.toJSON() ?? null;

    await garantirMonstroExclusivo(config?.id ?? null, dados.id_monstro_base, config?.id_monstro_base ?? null, transaction);

    const campos = {
      id_event: idEvento,
      id_monstro_base: dados.id_monstro_base,
      nome_exibicao: dados.nome_exibicao ?? null,
      lore: dados.lore ?? null,
      target_turns_to_kill: dados.target_turns_to_kill ?? null,
      target_boss_actions_survivable: dados.target_boss_actions_survivable ?? null,
      scaling_min_multiplier: dados.scaling_min_multiplier ?? null,
      scaling_max_multiplier: dados.scaling_max_multiplier ?? null,
      reward_sigils_primeira_vitoria: dados.reward_sigils_primeira_vitoria ?? 0,
      ativo: true,
    };
    if (config) {
      await config.update(campos, { transaction });
    } else {
      config = await TempleBossConfig.create(campos, { transaction });
    }
    await registrarAcao({
      idAdmin,
      acao: antes ? "editar" : "criar",
      entidade: "TempleBossConfig",
      idEntidade: config.id,
      dadosAntes: antes,
      dadosDepois: config.toJSON(),
      req,
      transaction,
    });
    return config;
  });
}

async function exigirConfig(idEvento, transaction) {
  const config = await TempleBossConfig.findOne({ where: { id_event: idEvento }, transaction, lock: transaction?.LOCK?.UPDATE });
  if (!config) throw erro("Configure o Guardião (monstro-base) antes de editar fases/resistências/recompensas.", 409);
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

async function criarFase(idEvento, dados, { idAdmin, req }) {
  validarFase(dados);
  return sequelize.transaction(async (transaction) => {
    await carregarEventoEditavel(idEvento, transaction);
    const config = await exigirConfig(idEvento, transaction);
    const fase = await TempleBossPhase.create(
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
    await registrarAcao({ idAdmin, acao: "criar", entidade: "TempleBossPhase", idEntidade: fase.id, dadosDepois: fase.toJSON(), req, transaction });
    return fase;
  });
}

async function atualizarFase(idEvento, idFase, dados, { idAdmin, req }) {
  validarFase(dados, { parcial: true });
  return sequelize.transaction(async (transaction) => {
    await carregarEventoEditavel(idEvento, transaction);
    const config = await exigirConfig(idEvento, transaction);
    const fase = await TempleBossPhase.findOne({ where: { id: idFase, id_boss_config: config.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!fase) throw erro("Fase não encontrada.", 404);
    const antes = fase.toJSON();
    for (const campo of ["ordem", "hp_threshold_pct", "nome_exibicao", "dano_multiplicador", "defesa_multiplicador", "enrage"]) {
      if (dados[campo] !== undefined) fase[campo] = dados[campo];
    }
    await fase.save({ transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "TempleBossPhase", idEntidade: fase.id, dadosAntes: antes, dadosDepois: fase.toJSON(), req, transaction });
    return fase;
  });
}

async function excluirFase(idEvento, idFase, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    await carregarEventoEditavel(idEvento, transaction);
    const config = await exigirConfig(idEvento, transaction);
    const fase = await TempleBossPhase.findOne({ where: { id: idFase, id_boss_config: config.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!fase) throw erro("Fase não encontrada.", 404);
    const antes = fase.toJSON();
    await fase.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "excluir", entidade: "TempleBossPhase", idEntidade: idFase, dadosAntes: antes, req, transaction });
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

async function criarResistencia(idEvento, dados, { idAdmin, req }) {
  validarResistencia(dados);
  return sequelize.transaction(async (transaction) => {
    await carregarEventoEditavel(idEvento, transaction);
    const config = await exigirConfig(idEvento, transaction);
    const existente = await TempleBossStatusResistance.findOne({ where: { id_boss_config: config.id, status_key: dados.status_key }, transaction });
    if (existente) throw erro("Já existe uma resistência cadastrada para este status.", 409);
    const resistencia = await TempleBossStatusResistance.create(
      { id_boss_config: config.id, status_key: dados.status_key, imune: Boolean(dados.imune), resistencia_pct: dados.resistencia_pct ?? 0 },
      { transaction },
    );
    await registrarAcao({ idAdmin, acao: "criar", entidade: "TempleBossStatusResistance", idEntidade: resistencia.id, dadosDepois: resistencia.toJSON(), req, transaction });
    return resistencia;
  });
}

async function atualizarResistencia(idEvento, idResistencia, dados, { idAdmin, req }) {
  validarResistencia(dados, { parcial: true });
  return sequelize.transaction(async (transaction) => {
    await carregarEventoEditavel(idEvento, transaction);
    const config = await exigirConfig(idEvento, transaction);
    const resistencia = await TempleBossStatusResistance.findOne({ where: { id: idResistencia, id_boss_config: config.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!resistencia) throw erro("Resistência não encontrada.", 404);
    const antes = resistencia.toJSON();
    for (const campo of ["imune", "resistencia_pct"]) {
      if (dados[campo] !== undefined) resistencia[campo] = dados[campo];
    }
    await resistencia.save({ transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "TempleBossStatusResistance", idEntidade: resistencia.id, dadosAntes: antes, dadosDepois: resistencia.toJSON(), req, transaction });
    return resistencia;
  });
}

async function excluirResistencia(idEvento, idResistencia, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    await carregarEventoEditavel(idEvento, transaction);
    const config = await exigirConfig(idEvento, transaction);
    const resistencia = await TempleBossStatusResistance.findOne({ where: { id: idResistencia, id_boss_config: config.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!resistencia) throw erro("Resistência não encontrada.", 404);
    const antes = resistencia.toJSON();
    await resistencia.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "excluir", entidade: "TempleBossStatusResistance", idEntidade: idResistencia, dadosAntes: antes, req, transaction });
    return { excluida: true };
  });
}

async function validarRewardEntry(dados, { transaction } = {}) {
  const erros = [];
  if (!REWARD_KINDS_VALIDOS.includes(dados.reward_kind)) erros.push(`reward_kind precisa ser um de: ${REWARD_KINDS_VALIDOS.join(", ")}.`);
  if (!dados.id_item) erros.push("id_item é obrigatório.");
  if (!dados.nome_exibicao) erros.push("nome_exibicao é obrigatório.");
  if (dados.weight !== undefined && (!Number.isInteger(dados.weight) || dados.weight < 0)) erros.push("weight precisa ser um inteiro >= 0.");
  if (dados.quantidade !== undefined && (!Number.isInteger(dados.quantidade) || dados.quantidade <= 0)) erros.push("quantidade precisa ser um inteiro positivo.");
  for (const campo of ["nivel_minimo", "nivel_maximo"]) {
    if (dados[campo] !== undefined && dados[campo] !== null && (!Number.isInteger(dados[campo]) || dados[campo] < 1)) {
      erros.push(`${campo} precisa ser um inteiro >= 1 (ou null pra sem piso/teto).`);
    }
  }
  if (dados.nivel_minimo != null && dados.nivel_maximo != null && dados.nivel_minimo > dados.nivel_maximo) {
    erros.push("nivel_minimo não pode ser maior que nivel_maximo.");
  }
  if (erros.length > 0) throw erro(erros.join(" "));
  const item = await Item.findByPk(dados.id_item, { transaction });
  if (!item) throw erro("id_item não aponta pra nenhum Item existente.");
}

async function criarRewardEntry(idEvento, dados, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    await carregarEventoEditavel(idEvento, transaction);
    const config = await exigirConfig(idEvento, transaction);
    await validarRewardEntry(dados, { transaction });
    const entry = await TempleBossRewardEntry.create(
      {
        id_boss_config: config.id,
        reward_kind: dados.reward_kind,
        id_item: dados.id_item,
        quantidade: dados.quantidade ?? 1,
        raridade_instancia: dados.raridade_instancia ?? null,
        weight: dados.weight ?? 1,
        nivel_minimo: dados.nivel_minimo ?? null,
        nivel_maximo: dados.nivel_maximo ?? null,
        nome_exibicao: dados.nome_exibicao,
        garantido: Boolean(dados.garantido),
        ativo: dados.ativo ?? true,
      },
      { transaction },
    );
    await registrarAcao({ idAdmin, acao: "criar", entidade: "TempleBossRewardEntry", idEntidade: entry.id, dadosDepois: entry.toJSON(), req, transaction });
    return entry;
  });
}

async function atualizarRewardEntry(idEvento, idEntry, dados, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    await carregarEventoEditavel(idEvento, transaction);
    const config = await exigirConfig(idEvento, transaction);
    const entry = await TempleBossRewardEntry.findOne({ where: { id: idEntry, id_boss_config: config.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!entry) throw erro("Recompensa não encontrada.", 404);
    const mesclado = { ...entry.toJSON(), ...dados };
    await validarRewardEntry(mesclado, { transaction });

    const antes = entry.toJSON();
    for (const campo of ["reward_kind", "id_item", "quantidade", "raridade_instancia", "weight", "nivel_minimo", "nivel_maximo", "nome_exibicao", "garantido", "ativo"]) {
      if (dados[campo] !== undefined) entry[campo] = dados[campo];
    }
    await entry.save({ transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "TempleBossRewardEntry", idEntidade: entry.id, dadosAntes: antes, dadosDepois: entry.toJSON(), req, transaction });
    return entry;
  });
}

async function excluirRewardEntry(idEvento, idEntry, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    await carregarEventoEditavel(idEvento, transaction);
    const config = await exigirConfig(idEvento, transaction);
    const entry = await TempleBossRewardEntry.findOne({ where: { id: idEntry, id_boss_config: config.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!entry) throw erro("Recompensa não encontrada.", 404);
    const antes = entry.toJSON();
    await entry.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "excluir", entidade: "TempleBossRewardEntry", idEntidade: idEntry, dadosAntes: antes, req, transaction });
    return { excluida: true };
  });
}

// §9.2/§12.1 "simulação do Boss em perfis de Poder distintos" — MESMA
// fórmula de templeBossScalingService usada em combate real
// (templeBossAttemptService.montarSnapshots), só trocando o
// playerSnapshot real por um perfil hipotético {dpr, ehp} digitado
// pelo Admin. Nunca uma segunda fórmula de calibração.
async function simularBoss(idEvento, { dpr, ehp } = {}) {
  if (!(Number(dpr) > 0) || !(Number(ehp) > 0)) throw erro("dpr e ehp precisam ser números positivos.");

  const { config } = await obterGuardiaoAdmin(idEvento);
  if (!config) throw erro("Configure o Guardião (monstro-base) antes de simular.", 409);
  const monstro = await AdventureMonster.findByPk(config.id_monstro_base);
  if (!monstro) throw erro("Monstro-base não encontrado.", 404);

  const scaling = {
    target_turns_to_kill: config.target_turns_to_kill ?? gameSettingCache.obter("temple.boss.target_turns_to_kill", GAME_SETTINGS_DEFAULT["temple.boss.target_turns_to_kill"]),
    target_boss_actions_survivable: config.target_boss_actions_survivable ?? gameSettingCache.obter("temple.boss.target_boss_actions_survivable", GAME_SETTINGS_DEFAULT["temple.boss.target_boss_actions_survivable"]),
    scaling_min_multiplier: config.scaling_min_multiplier ?? gameSettingCache.obter("temple.boss.scaling_min_multiplier", GAME_SETTINGS_DEFAULT["temple.boss.scaling_min_multiplier"]),
    scaling_max_multiplier: config.scaling_max_multiplier ?? gameSettingCache.obter("temple.boss.scaling_max_multiplier", GAME_SETTINGS_DEFAULT["temple.boss.scaling_max_multiplier"]),
  };
  const bossBase = { vida_maxima: monstro.vida_maxima, dano_min: monstro.dano_min, dano_max: monstro.dano_max, defesa: monstro.defesa };
  const stats = templeBossScalingService.calcularStatsEscaladosDoBoss({ playerSnapshot: { dpr: Number(dpr), ehp: Number(ehp) }, bossBase, scaling });

  return {
    perfil_jogador: { dpr: Number(dpr), ehp: Number(ehp) },
    scaling,
    base: bossBase,
    stats_escalados: stats,
    turnos_estimados_pra_matar: Math.round(stats.vida_maxima / Math.max(1, Number(dpr))),
    acoes_do_boss_pra_matar_jogador: Math.round(Number(ehp) / Math.max(1, (stats.dano_min + stats.dano_max) / 2)),
  };
}

module.exports = {
  obterGuardiaoAdmin,
  salvarConfig,
  criarFase,
  atualizarFase,
  excluirFase,
  criarResistencia,
  atualizarResistencia,
  excluirResistencia,
  criarRewardEntry,
  atualizarRewardEntry,
  excluirRewardEntry,
  simularBoss,
};
