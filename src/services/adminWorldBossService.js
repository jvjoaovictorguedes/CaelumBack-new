// Painel Administrativo — Boss Global / Ameaça Mundial (permissão
// worldboss.manage). CRUD do CATÁLOGO (WorldBossConfig + fases +
// zonas elegíveis) — nunca toca no ciclo atual (evento em andamento),
// isso é adminWorldBossEventService.js (permissão events.manage,
// mesmo critério já usado pelo resto do painel: catálogo vs operação
// do ciclo vivo são responsabilidades separadas). Editar o catálogo
// NUNCA afeta um evento já em andamento — ele already carrega seu
// próprio config_snapshot congelado (§18/§19).
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const WorldBossConfig = require("../models/WorldBossConfig");
const WorldBossPhase = require("../models/WorldBossPhase");
const WorldBossConfigZone = require("../models/WorldBossConfigZone");
const WorldBossActivityMetric = require("../models/WorldBossActivityMetric");
const WorldBossEvent = require("../models/WorldBossEvent");
const Item = require("../models/Item");
const GameSetting = require("../models/GameSetting");
const gameSettingCache = require("./gameSettingCache");
const { registrarAcao } = require("./adminAuditService");
const { GAME_SETTINGS_DEFAULT } = require("../config/worldBossConfig");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

const CAMPOS_CONFIG = [
  "nome",
  "descricao",
  "lore",
  "imagem_url",
  "peso_selecao",
  "vida_base",
  "defesa",
  "mensagem_descoberta",
  "mensagem_convocacao",
  "mensagem_fase_final",
  "mensagem_derrota",
  "id_item_golpe_final",
  "gold_descoberta",
  "gold_participacao",
  "xp_participacao",
  "min_dano_participacao",
];

function camposConfig(dados) {
  const out = {};
  for (const campo of CAMPOS_CONFIG) {
    if (dados[campo] !== undefined) out[campo] = dados[campo];
  }
  return out;
}

async function validarConfig(dados, { parcial = false, transaction } = {}) {
  const erros = [];
  if (!parcial || dados.nome !== undefined) {
    if (!dados.nome || typeof dados.nome !== "string") erros.push("nome é obrigatório.");
  }
  if (!parcial || dados.descricao !== undefined) {
    if (!dados.descricao || typeof dados.descricao !== "string") erros.push("descricao é obrigatória.");
  }
  if (!parcial || dados.mensagem_descoberta !== undefined) {
    if (!dados.mensagem_descoberta) erros.push("mensagem_descoberta é obrigatória.");
  }
  if (!parcial || dados.mensagem_convocacao !== undefined) {
    if (!dados.mensagem_convocacao) erros.push("mensagem_convocacao é obrigatória.");
  }
  if (!parcial || dados.vida_base !== undefined) {
    if (!Number.isInteger(dados.vida_base) || dados.vida_base <= 0) erros.push("vida_base precisa ser um inteiro positivo.");
  }
  if (!parcial || dados.defesa !== undefined) {
    if (dados.defesa !== undefined && (!Number.isInteger(dados.defesa) || dados.defesa < 0)) erros.push("defesa precisa ser um inteiro >= 0.");
  }
  if (!parcial || dados.peso_selecao !== undefined) {
    if (dados.peso_selecao !== undefined && (!Number.isInteger(dados.peso_selecao) || dados.peso_selecao <= 0)) erros.push("peso_selecao precisa ser um inteiro positivo.");
  }
  for (const campoGold of ["gold_descoberta", "gold_participacao", "xp_participacao"]) {
    if (dados[campoGold] !== undefined && (!Number.isInteger(dados[campoGold]) || dados[campoGold] < 0)) {
      erros.push(`${campoGold} precisa ser um inteiro >= 0.`);
    }
  }
  if (dados.min_dano_participacao !== undefined && dados.min_dano_participacao !== null) {
    if (!Number.isInteger(dados.min_dano_participacao) || dados.min_dano_participacao < 0) {
      erros.push("min_dano_participacao precisa ser um inteiro >= 0 (ou null).");
    }
  }
  if (!parcial || dados.id_item_golpe_final !== undefined) {
    if (!dados.id_item_golpe_final) {
      erros.push("id_item_golpe_final é obrigatório.");
    } else {
      const item = await Item.findByPk(dados.id_item_golpe_final, { transaction });
      if (!item) erros.push("id_item_golpe_final não aponta pra nenhum Item existente.");
    }
  }
  if (dados.fases !== undefined) {
    if (!Array.isArray(dados.fases) || dados.fases.length === 0) {
      erros.push("fases precisa ser uma lista com pelo menos uma fase.");
    } else {
      for (const fase of dados.fases) {
        if (!fase.nome_fase || !Number.isInteger(fase.ordem) || !Number.isInteger(fase.hp_percentual_max)) {
          erros.push("cada fase precisa de nome_fase, ordem e hp_percentual_max (inteiros).");
          break;
        }
      }
    }
  }
  if (dados.zonas !== undefined && !Array.isArray(dados.zonas)) {
    erros.push("zonas precisa ser uma lista de IDs de AdventureZone.");
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

async function substituirFasesEZonas(config, dados, transaction) {
  if (dados.fases !== undefined) {
    await WorldBossPhase.destroy({ where: { id_world_boss_config: config.id }, transaction });
    for (const fase of dados.fases) {
      await WorldBossPhase.create(
        {
          id_world_boss_config: config.id,
          ordem: fase.ordem,
          nome_fase: fase.nome_fase,
          hp_percentual_max: fase.hp_percentual_max,
          modificador_dano_percentual: fase.modificador_dano_percentual ?? 0,
          texto_alerta: fase.texto_alerta ?? null,
        },
        { transaction },
      );
    }
  }
  if (dados.zonas !== undefined) {
    await WorldBossConfigZone.destroy({ where: { id_world_boss_config: config.id }, transaction });
    for (const idZone of dados.zonas) {
      await WorldBossConfigZone.create({ id_world_boss_config: config.id, id_zone: idZone }, { transaction });
    }
  }
}

async function carregarComDetalhes(id, transaction) {
  const config = await WorldBossConfig.findByPk(id, { transaction });
  if (!config) return null;
  const [fases, zonas] = await Promise.all([
    WorldBossPhase.findAll({ where: { id_world_boss_config: id }, order: [["ordem", "ASC"]], transaction }),
    WorldBossConfigZone.findAll({ where: { id_world_boss_config: id }, transaction }),
  ]);
  return { ...config.toJSON(), fases, zonas: zonas.map((z) => z.id_zone) };
}

async function listAdminWorldBossConfigs({ pagina = 1, porPagina = 20, ativo, nome } = {}) {
  const where = {};
  if (ativo !== undefined && ativo !== "") where.ativo = ativo === true || ativo === "true";
  if (nome) where.nome = { [Op.iLike]: `%${nome}%` };

  const limite = Math.min(100, Math.max(1, Number(porPagina) || 20));
  const paginaAtual = Math.max(1, Number(pagina) || 1);
  const offset = (paginaAtual - 1) * limite;

  const { count, rows } = await WorldBossConfig.findAndCountAll({
    where,
    order: [["id", "DESC"]],
    limit: limite,
    offset,
  });
  return { total: count, pagina: paginaAtual, porPagina: limite, itens: rows };
}

async function getAdminWorldBossConfig(id) {
  const detalhes = await carregarComDetalhes(id);
  if (!detalhes) throw erro("Ameaça Mundial não encontrada.", 404);
  return detalhes;
}

async function createAdminWorldBossConfig(dados, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    await validarConfig(dados, { transaction });
    const config = await WorldBossConfig.create(
      { ...camposConfig(dados), ativo: dados.ativo ?? true },
      { transaction },
    );
    await substituirFasesEZonas(config, dados, transaction);
    const completo = await carregarComDetalhes(config.id, transaction);
    await registrarAcao({ idAdmin, acao: "criar", entidade: "WorldBossConfig", idEntidade: config.id, dadosDepois: completo, req, transaction });
    return completo;
  });
}

async function updateAdminWorldBossConfig(id, dados, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const config = await WorldBossConfig.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!config) throw erro("Ameaça Mundial não encontrada.", 404);
    await validarConfig(dados, { parcial: true, transaction });
    const antes = await carregarComDetalhes(id, transaction);
    await config.update(camposConfig(dados), { transaction });
    await substituirFasesEZonas(config, dados, transaction);
    const depois = await carregarComDetalhes(id, transaction);
    await registrarAcao({ idAdmin, acao: "editar", entidade: "WorldBossConfig", idEntidade: config.id, dadosAntes: antes, dadosDepois: depois, req, transaction });
    return depois;
  });
}

async function duplicateAdminWorldBossConfig(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const original = await carregarComDetalhes(id, transaction);
    if (!original) throw erro("Ameaça Mundial não encontrada.", 404);
    const copia = await WorldBossConfig.create(
      {
        nome: `${original.nome} (cópia)`,
        descricao: original.descricao,
        lore: original.lore,
        imagem_url: original.imagem_url,
        peso_selecao: original.peso_selecao,
        vida_base: original.vida_base,
        defesa: original.defesa,
        mensagem_descoberta: original.mensagem_descoberta,
        mensagem_convocacao: original.mensagem_convocacao,
        mensagem_fase_final: original.mensagem_fase_final,
        mensagem_derrota: original.mensagem_derrota,
        id_item_golpe_final: original.id_item_golpe_final,
        gold_descoberta: original.gold_descoberta,
        gold_participacao: original.gold_participacao,
        xp_participacao: original.xp_participacao,
        min_dano_participacao: original.min_dano_participacao,
        ativo: false,
      },
      { transaction },
    );
    await substituirFasesEZonas(copia, { fases: original.fases, zonas: original.zonas }, transaction);
    const completo = await carregarComDetalhes(copia.id, transaction);
    await registrarAcao({ idAdmin, acao: "duplicar", entidade: "WorldBossConfig", idEntidade: copia.id, dadosAntes: { origemId: original.id }, dadosDepois: completo, req, transaction });
    return completo;
  });
}

async function setAtivoAdminWorldBossConfig(id, ativo, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const config = await WorldBossConfig.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!config) throw erro("Ameaça Mundial não encontrada.", 404);
    const antes = config.toJSON();
    await config.update({ ativo }, { transaction });
    await registrarAcao({ idAdmin, acao: ativo ? "reativar" : "desativar", entidade: "WorldBossConfig", idEntidade: config.id, dadosAntes: antes, dadosDepois: config.toJSON(), req, transaction });
    return config;
  });
}

// ---------------------------------------------------------------------
// Configurações operacionais (GameSetting: worldboss.*)
// ---------------------------------------------------------------------

const CHAVES_CONFIG = Object.keys(GAME_SETTINGS_DEFAULT);

async function getAdminWorldBossSettings() {
  const linhas = await GameSetting.findAll({ where: { chave: CHAVES_CONFIG } });
  const porChave = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  const out = {};
  for (const chave of CHAVES_CONFIG) out[chave] = porChave[chave] ?? GAME_SETTINGS_DEFAULT[chave];
  return out;
}

function validarValorDeConfig(chave, valor) {
  if (chave === "worldboss.enabled" || chave === "worldboss.participation_rewards_enabled") {
    if (typeof valor !== "boolean") throw erro(`${chave} precisa ser boolean.`);
    return;
  }
  if (!Number.isInteger(valor) || valor < 0) throw erro(`${chave} precisa ser um inteiro >= 0.`);
  if (chave === "worldboss.discovery_threshold_min" || chave === "worldboss.discovery_threshold_max") {
    if (valor <= 0) throw erro(`${chave} precisa ser positivo.`);
  }
  if (chave === "worldboss.cooldown_hours" && valor > 24 * 30) throw erro(`${chave} fora de uma faixa segura.`);
}

async function updateAdminWorldBossSettings(payload, { idAdmin, req }) {
  const mudancas = [];
  for (const [chave, valor] of Object.entries(payload ?? {})) {
    if (!CHAVES_CONFIG.includes(chave)) throw erro(`Chave desconhecida: ${chave}.`);
    validarValorDeConfig(chave, valor);
    mudancas.push([chave, valor, typeof valor === "boolean" ? "boolean" : "number"]);
  }
  if (mudancas.length === 0) throw erro("Nada pra salvar — envie ao menos uma configuração.");

  const min = payload["worldboss.discovery_threshold_min"];
  const max = payload["worldboss.discovery_threshold_max"];
  if (min !== undefined && max !== undefined && min > max) {
    throw erro("worldboss.discovery_threshold_min não pode ser maior que worldboss.discovery_threshold_max.");
  }

  await sequelize.transaction(async (transaction) => {
    for (const [chave, valor, tipo] of mudancas) {
      const existente = await GameSetting.findByPk(chave, { transaction, lock: transaction.LOCK.UPDATE });
      const dadosAntes = existente ? existente.toJSON() : null;
      const [registro] = await GameSetting.upsert(
        { chave, valor, tipo, editavel_admin: true, updated_by_admin_id: idAdmin },
        { transaction, returning: true },
      );
      await registrarAcao({ idAdmin, acao: existente ? "editar" : "criar", entidade: "GameSetting", idEntidade: null, dadosAntes, dadosDepois: registro.toJSON(), req, transaction });
    }
  });

  await gameSettingCache.recarregar();
  return getAdminWorldBossSettings();
}

// ---------------------------------------------------------------------
// Métricas (somente leitura)
// ---------------------------------------------------------------------

async function getAdminWorldBossMetrics() {
  const metricas = await WorldBossActivityMetric.findAll({
    order: [["window_start", "DESC"]],
    limit: 48,
  });
  const historico = await WorldBossEvent.findAll({
    where: { status: ["DEFEATED", "CANCELLED"] },
    order: [["id", "DESC"]],
    limit: 20,
  });
  return {
    encontrosElegiveisPorHora: metricas.reverse().map((m) => ({
      window_start: m.window_start,
      encontros_elegiveis: Number(m.encontros_elegiveis),
    })),
    historico: historico.map((e) => ({
      id: e.id,
      status: e.status,
      nome: e.config_snapshot?.nome ?? null,
      discovered_at: e.discovered_at,
      activated_at: e.activated_at,
      defeated_at: e.defeated_at,
      discoverer_character_id: e.discoverer_character_id,
      final_blow_character_id: e.final_blow_character_id,
      participation_rewards_status: e.participation_rewards_status,
    })),
  };
}

module.exports = {
  listAdminWorldBossConfigs,
  getAdminWorldBossConfig,
  createAdminWorldBossConfig,
  updateAdminWorldBossConfig,
  duplicateAdminWorldBossConfig,
  setAtivoAdminWorldBossConfig,
  getAdminWorldBossSettings,
  updateAdminWorldBossSettings,
  getAdminWorldBossMetrics,
};
