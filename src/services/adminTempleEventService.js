// Painel Administrativo — Templo do Véu Celestial (permissão
// temple.manage, única — diferente do Boss Global, aqui não existe
// catálogo reutilizável separado do evento vivo: a própria TempleEvent
// É o catálogo até ser ativada). CRUD de identidade/datas + lifecycle
// (publicar/agendar/duplicar/cancelar) — §12.1/§12.2.
//
// Edição normal só é permitida em DRAFT/SCHEDULED: §12.2 "bloquear
// edição normal de evento ACTIVE" — a partir daí o config_snapshot já
// está congelado e mudar o catálogo editável nunca pode afetar uma
// Convergência em andamento silenciosamente.
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const TempleEvent = require("../models/TempleEvent");
const TempleMission = require("../models/TempleMission");
const TempleRewardPool = require("../models/TempleRewardPool");
const TempleRewardEntry = require("../models/TempleRewardEntry");
const TempleBossConfig = require("../models/TempleBossConfig");
const TempleBossPhase = require("../models/TempleBossPhase");
const TempleBossStatusResistance = require("../models/TempleBossStatusResistance");
const TempleBossRewardEntry = require("../models/TempleBossRewardEntry");
const Item = require("../models/Item");
const { registrarAcao } = require("./adminAuditService");
const { EVENT_STATUS, EVENT_STATUS_ABERTOS } = require("../config/templeConfig");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

const EDITAVEIS = [EVENT_STATUS.DRAFT, EVENT_STATUS.SCHEDULED];

function exigirEditavel(evento) {
  if (!EDITAVEIS.includes(evento.status)) {
    throw erro(
      `Esta Convergência está em ${evento.status} — o catálogo só pode ser editado em DRAFT ou SCHEDULED (o snapshot já está congelado a partir de ACTIVE).`,
      409,
    );
  }
}

async function obterItemSigiloCelestial(transaction) {
  // §5.1 — UM único Item Currencia "Sigilo Celestial" pra TODAS as
  // Convergências (saldo persiste entre elas); nunca um item novo por
  // evento, nunca escolhido livremente pelo Admin.
  const item = await Item.findOne({ where: { nome: "Sigilo Celestial", tipo_item: "Currencia" }, transaction });
  if (!item) throw erro("Item 'Sigilo Celestial' não encontrado — a migration de fundação do Templo não rodou?", 500);
  return item;
}

async function carregarComDetalhes(id, transaction) {
  const evento = await TempleEvent.findByPk(id, { transaction });
  if (!evento) return null;
  const [missoes, pool, bossConfig] = await Promise.all([
    TempleMission.findAll({ where: { id_event: id }, order: [["ordem", "ASC"]], transaction }),
    TempleRewardPool.findOne({ where: { id_event: id }, transaction }),
    TempleBossConfig.findOne({ where: { id_event: id }, transaction }),
  ]);
  const entries = pool ? await TempleRewardEntry.findAll({ where: { id_pool: pool.id }, order: [["ordem", "ASC"]], transaction }) : [];
  let fases = [];
  let resistencias = [];
  let bossRewardEntries = [];
  if (bossConfig) {
    [fases, resistencias, bossRewardEntries] = await Promise.all([
      TempleBossPhase.findAll({ where: { id_boss_config: bossConfig.id }, order: [["ordem", "ASC"]], transaction }),
      TempleBossStatusResistance.findAll({ where: { id_boss_config: bossConfig.id }, transaction }),
      TempleBossRewardEntry.findAll({ where: { id_boss_config: bossConfig.id }, transaction }),
    ]);
  }
  return {
    evento,
    missoes,
    relicario: pool ? { pool, entries } : null,
    guardiao: bossConfig ? { config: bossConfig, fases, resistencias, rewardEntries: bossRewardEntries } : null,
  };
}

async function listarEventos({ pagina = 1, porPagina = 20, status, nome } = {}) {
  const where = {};
  if (status) where.status = status;
  if (nome) where.nome = { [Op.iLike]: `%${nome}%` };
  const offset = Math.max(0, (Number(pagina) - 1) * Number(porPagina));
  const { rows, count } = await TempleEvent.findAndCountAll({
    where,
    order: [["id", "DESC"]],
    limit: Number(porPagina),
    offset,
  });
  return { eventos: rows, total: count, pagina: Number(pagina), porPagina: Number(porPagina) };
}

async function obterEvento(id) {
  const detalhes = await carregarComDetalhes(id);
  if (!detalhes) throw erro("Convergência não encontrada.", 404);
  return detalhes;
}

function validarIdentidade(dados, { parcial = false } = {}) {
  const erros = [];
  if (!parcial || dados.key !== undefined) {
    if (!dados.key || typeof dados.key !== "string" || !/^[a-z0-9_]{3,80}$/.test(dados.key)) {
      erros.push("key é obrigatória: minúsculas/números/underscore, 3-80 caracteres.");
    }
  }
  if (!parcial || dados.nome !== undefined) {
    if (!dados.nome || typeof dados.nome !== "string") erros.push("nome é obrigatório.");
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

async function criarEvento(dados, { idAdmin, req }) {
  validarIdentidade(dados);
  return sequelize.transaction(async (transaction) => {
    const existente = await TempleEvent.findOne({ where: { key: dados.key }, transaction });
    if (existente) throw erro("Já existe uma Convergência com esta key.", 409);
    const itemSigilo = await obterItemSigiloCelestial(transaction);
    const evento = await TempleEvent.create(
      {
        key: dados.key,
        nome: dados.nome,
        lore: dados.lore ?? null,
        teaser: dados.teaser ?? null,
        imagem_url: dados.imagem_url ?? null,
        status: EVENT_STATUS.DRAFT,
        id_currency_item: itemSigilo.id,
      },
      { transaction },
    );
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "TempleEvent",
      idEntidade: evento.id,
      dadosDepois: evento.toJSON(),
      req,
      transaction,
    });
    return evento;
  });
}

async function atualizarEvento(id, dados, { idAdmin, req }) {
  validarIdentidade(dados, { parcial: true });
  return sequelize.transaction(async (transaction) => {
    const evento = await TempleEvent.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!evento) throw erro("Convergência não encontrada.", 404);
    exigirEditavel(evento);

    if (dados.key !== undefined && dados.key !== evento.key) {
      const existente = await TempleEvent.findOne({ where: { key: dados.key, id: { [Op.ne]: id } }, transaction });
      if (existente) throw erro("Já existe uma Convergência com esta key.", 409);
    }

    const antes = evento.toJSON();
    for (const campo of ["key", "nome", "lore", "teaser", "imagem_url"]) {
      if (dados[campo] !== undefined) evento[campo] = dados[campo];
    }
    await evento.save({ transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "TempleEvent",
      idEntidade: evento.id,
      dadosAntes: antes,
      dadosDepois: evento.toJSON(),
      req,
      transaction,
    });
    return evento;
  });
}

// §3.2/§12.1 "agendar" — define as 3 datas e publica (DRAFT/SCHEDULED
// -> SCHEDULED; o scheduler assume a partir daqui, nunca é o Admin que
// força SCHEDULED->ACTIVE — ver comentário em ativarEvento).
async function agendarEvento(id, { starts_at, missions_end_at, relicary_end_at }, { idAdmin, req }) {
  if (!starts_at || !missions_end_at || !relicary_end_at) {
    throw erro("starts_at, missions_end_at e relicary_end_at são todos obrigatórios pra agendar.");
  }
  const inicio = new Date(starts_at).getTime();
  const fimMissoes = new Date(missions_end_at).getTime();
  const fimRelicario = new Date(relicary_end_at).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fimMissoes) || Number.isNaN(fimRelicario)) {
    throw erro("Datas inválidas.");
  }
  if (!(inicio < fimMissoes && fimMissoes < fimRelicario)) {
    throw erro("As datas precisam seguir a ordem: início < fim das Provações < fim do Relicário.");
  }
  if (inicio <= Date.now()) {
    throw erro("starts_at precisa estar no futuro.");
  }

  return sequelize.transaction(async (transaction) => {
    const evento = await TempleEvent.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!evento) throw erro("Convergência não encontrada.", 404);
    exigirEditavel(evento);

    const antes = evento.toJSON();
    evento.starts_at = starts_at;
    evento.missions_end_at = missions_end_at;
    evento.relicary_end_at = relicary_end_at;
    evento.status = EVENT_STATUS.SCHEDULED;
    await evento.save({ transaction });
    await registrarAcao({
      idAdmin,
      acao: "agendar",
      entidade: "TempleEvent",
      idEntidade: evento.id,
      dadosAntes: antes,
      dadosDepois: evento.toJSON(),
      req,
      transaction,
    });
    return evento;
  });
}

// §12.1 "cancelar" — sempre com motivo (fica na auditoria pra sempre,
// mesmo padrão de adminWorldBossEventService.exigirMotivo). Nunca
// cancela DRAFT (não tem nada "em andamento" pra cancelar — é só
// deixar em DRAFT ou editar) nem um estado já terminal.
async function cancelarEvento(id, { motivo }, { idAdmin, req }) {
  if (!motivo || !motivo.trim()) {
    throw erro("motivo é obrigatório — cancelar fica registrado na auditoria com o porquê.");
  }
  return sequelize.transaction(async (transaction) => {
    const evento = await TempleEvent.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!evento) throw erro("Convergência não encontrada.", 404);
    if (![EVENT_STATUS.SCHEDULED, ...EVENT_STATUS_ABERTOS].includes(evento.status)) {
      throw erro(`Não é possível cancelar uma Convergência em ${evento.status}.`, 409);
    }

    const antes = evento.toJSON();
    evento.status = EVENT_STATUS.CANCELLED;
    evento.cancelled_at = new Date();
    evento.cancel_reason = motivo;
    await evento.save({ transaction });
    await registrarAcao({
      idAdmin,
      acao: "cancelar",
      entidade: "TempleEvent",
      idEntidade: evento.id,
      dadosAntes: antes,
      dadosDepois: evento.toJSON(),
      motivo,
      req,
      transaction,
    });
    return evento;
  });
}

// §12.1 "duplicar" — clona identidade + TODO o catálogo editável
// (Provações/Relicário/Guardião) pra uma Convergência nova em DRAFT,
// sem datas e sem snapshot. Nunca duplica progresso de jogador (não
// existe nenhum em DRAFT/catálogo) nem o snapshot congelado.
async function duplicarEvento(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const original = await carregarComDetalhes(id, transaction);
    if (!original) throw erro("Convergência não encontrada.", 404);

    const sufixo = Date.now().toString(36);
    const copia = await TempleEvent.create(
      {
        key: `${original.evento.key}_copia_${sufixo}`,
        nome: `${original.evento.nome} (cópia)`,
        lore: original.evento.lore,
        teaser: original.evento.teaser,
        imagem_url: original.evento.imagem_url,
        status: EVENT_STATUS.DRAFT,
        id_currency_item: original.evento.id_currency_item,
      },
      { transaction },
    );

    for (const missao of original.missoes) {
      await TempleMission.create(
        {
          id_event: copia.id,
          key: missao.key,
          categoria: missao.categoria,
          objective_type: missao.objective_type,
          objective_config: missao.objective_config,
          meta: missao.meta,
          reward_sigils: missao.reward_sigils,
          nome_exibicao: missao.nome_exibicao,
          descricao: missao.descricao,
          ordem: missao.ordem,
          ativo: missao.ativo,
        },
        { transaction },
      );
    }

    if (original.relicario) {
      const novoPool = await TempleRewardPool.create(
        {
          id_event: copia.id,
          nome: original.relicario.pool.nome,
          custo_sigilos_draw: original.relicario.pool.custo_sigilos_draw,
          pity_raro_mais_garantia: original.relicario.pool.pity_raro_mais_garantia,
          pity_featured_garantia: original.relicario.pool.pity_featured_garantia,
          ativo: original.relicario.pool.ativo,
        },
        { transaction },
      );
      for (const entrada of original.relicario.entries) {
        await TempleRewardEntry.create(
          {
            id_pool: novoPool.id,
            key: entrada.key,
            reward_kind: entrada.reward_kind,
            id_item: entrada.id_item,
            quantidade: entrada.quantidade,
            raridade_instancia: entrada.raridade_instancia,
            weight: entrada.weight,
            eh_raro_mais: entrada.eh_raro_mais,
            eh_featured: entrada.eh_featured,
            eh_unico: entrada.eh_unico,
            fallback_key: entrada.fallback_key,
            nome_exibicao: entrada.nome_exibicao,
            ordem: entrada.ordem,
            ativo: entrada.ativo,
          },
          { transaction },
        );
      }
    }

    if (original.guardiao) {
      const novoBossConfig = await TempleBossConfig.create(
        {
          id_event: copia.id,
          id_monstro_base: original.guardiao.config.id_monstro_base,
          nome_exibicao: original.guardiao.config.nome_exibicao,
          lore: original.guardiao.config.lore,
          target_turns_to_kill: original.guardiao.config.target_turns_to_kill,
          target_boss_actions_survivable: original.guardiao.config.target_boss_actions_survivable,
          scaling_min_multiplier: original.guardiao.config.scaling_min_multiplier,
          scaling_max_multiplier: original.guardiao.config.scaling_max_multiplier,
          reward_sigils_primeira_vitoria: original.guardiao.config.reward_sigils_primeira_vitoria,
          ativo: original.guardiao.config.ativo,
        },
        { transaction },
      );
      for (const fase of original.guardiao.fases) {
        await TempleBossPhase.create(
          {
            id_boss_config: novoBossConfig.id,
            ordem: fase.ordem,
            hp_threshold_pct: fase.hp_threshold_pct,
            nome_exibicao: fase.nome_exibicao,
            dano_multiplicador: fase.dano_multiplicador,
            defesa_multiplicador: fase.defesa_multiplicador,
            enrage: fase.enrage,
          },
          { transaction },
        );
      }
      for (const resistencia of original.guardiao.resistencias) {
        await TempleBossStatusResistance.create(
          {
            id_boss_config: novoBossConfig.id,
            status_key: resistencia.status_key,
            imune: resistencia.imune,
            resistencia_pct: resistencia.resistencia_pct,
          },
          { transaction },
        );
      }
      for (const recompensa of original.guardiao.rewardEntries) {
        await TempleBossRewardEntry.create(
          {
            id_boss_config: novoBossConfig.id,
            reward_kind: recompensa.reward_kind,
            id_item: recompensa.id_item,
            quantidade: recompensa.quantidade,
            raridade_instancia: recompensa.raridade_instancia,
            weight: recompensa.weight,
            nivel_minimo: recompensa.nivel_minimo,
            nivel_maximo: recompensa.nivel_maximo,
            nome_exibicao: recompensa.nome_exibicao,
            garantido: recompensa.garantido,
            ativo: recompensa.ativo,
          },
          { transaction },
        );
      }
    }

    const completo = await carregarComDetalhes(copia.id, transaction);
    await registrarAcao({
      idAdmin,
      acao: "duplicar",
      entidade: "TempleEvent",
      idEntidade: copia.id,
      dadosAntes: { origemId: original.evento.id },
      dadosDepois: completo.evento.toJSON(),
      req,
      transaction,
    });
    return completo;
  });
}

module.exports = {
  EDITAVEIS,
  exigirEditavel,
  listarEventos,
  obterEvento,
  criarEvento,
  atualizarEvento,
  agendarEvento,
  cancelarEvento,
  duplicarEvento,
};
