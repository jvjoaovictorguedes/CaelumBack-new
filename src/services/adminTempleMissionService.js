// Painel Administrativo — Templo do Véu Celestial: catálogo de
// Provações de UM evento (§4/§12.1 "builder por objective_type com
// preview"). Só editável enquanto a Convergência está em DRAFT/
// SCHEDULED (exigirEditavel de adminTempleEventService — nunca edita
// uma Provação depois que o snapshot já congelou).
const { sequelize } = require("../config/database");
const TempleEvent = require("../models/TempleEvent");
const TempleMission = require("../models/TempleMission");
const Item = require("../models/Item");
const { registrarAcao } = require("./adminAuditService");
const { exigirEditavel } = require("./adminTempleEventService");
const {
  MISSION_CATEGORY,
  MISSION_CATEGORY_NAO_PERMITIDA_EM_TEMPLE_MISSION,
  OBJECTIVE_TYPE,
  OBJECTIVE_TYPES_COM_SET,
} = require("../config/templeConfig");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

const CATEGORIAS_VALIDAS = Object.values(MISSION_CATEGORY);
const OBJECTIVE_TYPES_VALIDOS = Object.values(OBJECTIVE_TYPE);

// §4.2 — cada objective_type tem seu próprio contrato de
// objective_config, sempre tipado (nunca um JSON livre aceito sem
// checagem). DELIVER_ITEM é o único cujo config referencia um Item
// real (validado contra o banco); os demais são opcionais/sem config.
async function validarObjectiveConfig(objectiveType, config, transaction) {
  const cfg = config ?? {};
  if (objectiveType === OBJECTIVE_TYPE.DELIVER_ITEM) {
    if (!cfg.itemId || !Number.isInteger(cfg.quantidade) || cfg.quantidade <= 0) {
      throw erro("DELIVER_ITEM precisa de objective_config.itemId e quantidade (inteiro positivo).");
    }
    const item = await Item.findByPk(cfg.itemId, { transaction });
    if (!item) throw erro("objective_config.itemId não aponta pra nenhum Item existente.");
    return { itemId: cfg.itemId, quantidade: cfg.quantidade };
  }
  if (objectiveType === OBJECTIVE_TYPE.APPLY_STATUS) {
    return cfg.statusKey ? { statusKey: String(cfg.statusKey) } : {};
  }
  if (objectiveType === OBJECTIVE_TYPE.DEFEAT_AFFECTED_BY_STATUS) {
    if (cfg.statusKeys !== undefined && !Array.isArray(cfg.statusKeys)) {
      throw erro("objective_config.statusKeys precisa ser uma lista (ou ausente).");
    }
    return cfg.statusKeys ? { statusKeys: cfg.statusKeys.map(String) } : {};
  }
  if (objectiveType === OBJECTIVE_TYPE.CRAFT_RARITY_OR_HIGHER) {
    const raridades = ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"];
    if (cfg.minRaridade !== undefined && !raridades.includes(cfg.minRaridade)) {
      throw erro(`objective_config.minRaridade precisa ser uma das raridades válidas: ${raridades.join(", ")}.`);
    }
    return cfg.minRaridade ? { minRaridade: cfg.minRaridade } : {};
  }
  // WIN_ADVENTURE_NO_CONSUMABLE/WIN_DISTINCT_ZONES/FINAL_BLOW_WITH_POWER/
  // COMPLETE_EXPEDITIONS/PARTY_ADVENTURE_WINS/CLEANSE_STATUS nunca
  // precisam de config própria — o handler em templeObjectiveService já
  // ignora qualquer coisa fora do que ele mesmo espera (§4.2 "state_json
  // server-owned", nunca o objective_config que é só configuração).
  return {};
}

function validarCamposBasicos(dados, { parcial = false } = {}) {
  const erros = [];
  if (!parcial || dados.key !== undefined) {
    if (!dados.key || !/^[a-z0-9_]{2,80}$/.test(dados.key)) erros.push("key é obrigatória: minúsculas/números/underscore.");
  }
  if (!parcial || dados.categoria !== undefined) {
    if (!CATEGORIAS_VALIDAS.includes(dados.categoria)) {
      erros.push(`categoria precisa ser uma de: ${CATEGORIAS_VALIDAS.join(", ")} (${MISSION_CATEGORY_NAO_PERMITIDA_EM_TEMPLE_MISSION} nunca é uma linha de TempleMission).`);
    }
  }
  if (!parcial || dados.objective_type !== undefined) {
    if (!OBJECTIVE_TYPES_VALIDOS.includes(dados.objective_type)) {
      erros.push(`objective_type precisa ser um da whitelist: ${OBJECTIVE_TYPES_VALIDOS.join(", ")}.`);
    }
  }
  if (!parcial || dados.nome_exibicao !== undefined) {
    if (!dados.nome_exibicao) erros.push("nome_exibicao é obrigatório.");
  }
  if (!parcial || dados.meta !== undefined) {
    if (!Number.isInteger(dados.meta) || dados.meta <= 0) erros.push("meta precisa ser um inteiro positivo.");
  }
  if (!parcial || dados.reward_sigils !== undefined) {
    if (!Number.isInteger(dados.reward_sigils) || dados.reward_sigils < 0) erros.push("reward_sigils precisa ser um inteiro >= 0.");
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

async function carregarEventoEditavel(idEvento, transaction) {
  const evento = await TempleEvent.findByPk(idEvento, { transaction, lock: transaction?.LOCK?.UPDATE });
  if (!evento) throw erro("Convergência não encontrada.", 404);
  exigirEditavel(evento);
  return evento;
}

async function listarMissoes(idEvento) {
  return TempleMission.findAll({ where: { id_event: idEvento }, order: [["ordem", "ASC"]] });
}

async function criarMissao(idEvento, dados, { idAdmin, req }) {
  validarCamposBasicos(dados);
  return sequelize.transaction(async (transaction) => {
    await carregarEventoEditavel(idEvento, transaction);
    const objectiveConfig = await validarObjectiveConfig(dados.objective_type, dados.objective_config, transaction);

    const existente = await TempleMission.findOne({ where: { id_event: idEvento, key: dados.key }, transaction });
    if (existente) throw erro("Já existe uma Provação com esta key nesta Convergência.", 409);

    const missao = await TempleMission.create(
      {
        id_event: idEvento,
        key: dados.key,
        categoria: dados.categoria,
        objective_type: dados.objective_type,
        objective_config: objectiveConfig,
        meta: dados.meta,
        reward_sigils: dados.reward_sigils ?? 0,
        nome_exibicao: dados.nome_exibicao,
        descricao: dados.descricao ?? null,
        ordem: dados.ordem ?? 0,
        ativo: dados.ativo ?? true,
      },
      { transaction },
    );
    await registrarAcao({ idAdmin, acao: "criar", entidade: "TempleMission", idEntidade: missao.id, dadosDepois: missao.toJSON(), req, transaction });
    return missao;
  });
}

async function atualizarMissao(idEvento, idMissao, dados, { idAdmin, req }) {
  validarCamposBasicos(dados, { parcial: true });
  return sequelize.transaction(async (transaction) => {
    await carregarEventoEditavel(idEvento, transaction);
    const missao = await TempleMission.findOne({ where: { id: idMissao, id_event: idEvento }, transaction, lock: transaction.LOCK.UPDATE });
    if (!missao) throw erro("Provação não encontrada.", 404);

    const tipoFinal = dados.objective_type ?? missao.objective_type;
    const configFinal = dados.objective_config !== undefined ? dados.objective_config : missao.objective_config;
    const objectiveConfig = await validarObjectiveConfig(tipoFinal, configFinal, transaction);

    if (dados.key !== undefined && dados.key !== missao.key) {
      const existente = await TempleMission.findOne({ where: { id_event: idEvento, key: dados.key } , transaction});
      if (existente) throw erro("Já existe uma Provação com esta key nesta Convergência.", 409);
    }

    const antes = missao.toJSON();
    for (const campo of ["key", "categoria", "nome_exibicao", "descricao", "meta", "reward_sigils", "ordem", "ativo"]) {
      if (dados[campo] !== undefined) missao[campo] = dados[campo];
    }
    missao.objective_type = tipoFinal;
    missao.objective_config = objectiveConfig;
    await missao.save({ transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "TempleMission", idEntidade: missao.id, dadosAntes: antes, dadosDepois: missao.toJSON(), req, transaction });
    return missao;
  });
}

async function excluirMissao(idEvento, idMissao, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    await carregarEventoEditavel(idEvento, transaction);
    const missao = await TempleMission.findOne({ where: { id: idMissao, id_event: idEvento }, transaction, lock: transaction.LOCK.UPDATE });
    if (!missao) throw erro("Provação não encontrada.", 404);
    const antes = missao.toJSON();
    await missao.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "excluir", entidade: "TempleMission", idEntidade: idMissao, dadosAntes: antes, req, transaction });
    return { excluida: true };
  });
}

// §12.1 "preview" — exatamente o shape que templeObjectiveService.
// listarMissoes devolveria pro jogador no dia 1 (progresso 0, nunca
// completada) — nunca uma segunda função de formatação paralela.
function previewMissao(dados) {
  return {
    key: dados.key ?? null,
    categoria: dados.categoria ?? null,
    nome_exibicao: dados.nome_exibicao ?? null,
    descricao: dados.descricao ?? null,
    meta: dados.meta ?? null,
    reward_sigils: dados.reward_sigils ?? 0,
    objective_type: dados.objective_type ?? null,
    progresso_atual: 0,
    completed_at: null,
    claimed_at: null,
    objetivo_e_set: OBJECTIVE_TYPES_COM_SET.includes(dados.objective_type),
  };
}

module.exports = {
  listarMissoes,
  criarMissao,
  atualizarMissao,
  excluirMissao,
  previewMissao,
};
