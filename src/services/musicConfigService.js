"use strict";

// Painel Administrativo de Músicas §7/§8/§9/§10/§11.3 — ciclo de
// rascunho/publicação/rollback da MusicConfigVersion. Regra de ouro:
// isto NUNCA toca no MusicProvider do frontend, só alimenta a origem
// dos dados que ele consome (via GET /api/music/config).
const { sequelize } = require("../config/database");
const MusicConfigVersion = require("../models/MusicConfigVersion");
const MusicAssignment = require("../models/MusicAssignment");
const MusicPoolTrackAssignment = require("../models/MusicPoolTrackAssignment");
const MusicPool = require("../models/MusicPool");
const MusicTrack = require("../models/MusicTrack");
const { registrarAcao } = require("./adminAuditService");
const { existeSlot, obterSlot } = require("../config/musicSlotRegistry");
const { REGEX_KEY_VALIDA, FADE_MS_MINIMO, FADE_MS_MAXIMO } = require("../config/musicTrackConfig");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

async function proximoVersionNumber(transaction) {
  const maior = await MusicConfigVersion.max("version_number", { transaction });
  return (maior ?? 0) + 1;
}

async function obterVersionPublicada() {
  return MusicConfigVersion.findOne({ where: { status: "PUBLISHED" } });
}

// Clona assignments + pool memberships de uma versão fonte pra uma
// versão destino nova (usado tanto no clone do draft quanto no rollback).
async function clonarConteudo(idOrigem, idDestino, transaction) {
  const assignments = await MusicAssignment.findAll({ where: { id_config_version: idOrigem }, transaction });
  for (const a of assignments) {
    await MusicAssignment.create(
      {
        id_config_version: idDestino,
        slot_key: a.slot_key,
        assignment_type: a.assignment_type,
        id_track: a.id_track,
        id_pool: a.id_pool,
        fade_ms: a.fade_ms,
      },
      { transaction },
    );
  }
  const memberships = await MusicPoolTrackAssignment.findAll({ where: { id_config_version: idOrigem }, transaction });
  for (const m of memberships) {
    await MusicPoolTrackAssignment.create(
      {
        id_config_version: idDestino,
        id_pool: m.id_pool,
        id_track: m.id_track,
        peso: m.peso,
        ordem: m.ordem,
      },
      { transaction },
    );
  }
}

// Retorna o DRAFT atual, criando um clonado da versão PUBLISHED (ou
// vazio, se nunca houve publicação) se ainda não existir (§10.1).
async function criarOuObterDraft({ idAdmin }) {
  const existente = await MusicConfigVersion.findOne({ where: { status: "DRAFT" } });
  if (existente) return existente;

  return sequelize.transaction(async (transaction) => {
    const publicada = await MusicConfigVersion.findOne({ where: { status: "PUBLISHED" }, transaction });
    const versionNumber = await proximoVersionNumber(transaction);
    const draft = await MusicConfigVersion.create(
      { version_number: versionNumber, status: "DRAFT", created_by: idAdmin },
      { transaction },
    );
    if (publicada) {
      await clonarConteudo(publicada.id, draft.id, transaction);
    }
    return draft;
  });
}

async function obterDraftCompleto() {
  const draft = await criarOuObterDraft({ idAdmin: null });
  const assignments = await MusicAssignment.findAll({
    where: { id_config_version: draft.id },
    include: [
      { model: MusicTrack, as: "track" },
      { model: MusicPool, as: "pool" },
    ],
  });
  const memberships = await MusicPoolTrackAssignment.findAll({
    where: { id_config_version: draft.id },
    include: [{ model: MusicTrack, as: "track" }],
    order: [["id_pool", "ASC"], ["ordem", "ASC"]],
  });
  const publicada = await obterVersionPublicada();

  return {
    draft: draft.toJSON(),
    publicadaVersionNumber: publicada?.version_number ?? null,
    assignments,
    memberships,
  };
}

async function atualizarAssignment(slotKey, patch, { idAdmin, req }) {
  if (!existeSlot(slotKey)) throw erro(`Slot "${slotKey}" não existe no registry.`);
  const { assignment_type, id_track, id_pool, fade_ms } = patch;
  if (!["TRACK", "POOL", "SILENCE"].includes(assignment_type)) {
    throw erro("assignment_type precisa ser TRACK, POOL ou SILENCE.");
  }
  if (fade_ms != null && (fade_ms < FADE_MS_MINIMO || fade_ms > FADE_MS_MAXIMO)) {
    throw erro(`fade_ms precisa estar entre ${FADE_MS_MINIMO} e ${FADE_MS_MAXIMO}.`);
  }

  const draft = await criarOuObterDraft({ idAdmin });

  if (assignment_type === "TRACK") {
    if (!id_track) throw erro("id_track é obrigatório pra assignment_type TRACK.");
    const track = await MusicTrack.findByPk(id_track);
    if (!track || !track.ativo) throw erro("Faixa selecionada não existe ou está inativa.");
  } else if (assignment_type === "POOL") {
    if (!id_pool) throw erro("id_pool é obrigatório pra assignment_type POOL.");
    const pool = await MusicPool.findByPk(id_pool);
    if (!pool || !pool.ativo) throw erro("Pool selecionado não existe ou está inativo.");
    const membrosAtivos = await MusicPoolTrackAssignment.count({
      where: { id_config_version: draft.id, id_pool },
      include: [{ model: MusicTrack, as: "track", where: { ativo: true }, required: true }],
    });
    if (membrosAtivos === 0) {
      throw erro("Esse pool não tem nenhuma faixa ativa com peso>0 no rascunho — adicione antes de atribuir.");
    }
  }

  return sequelize.transaction(async (transaction) => {
    const anterior = await MusicAssignment.findOne({
      where: { id_config_version: draft.id, slot_key: slotKey },
      transaction,
    });
    const antes = anterior ? anterior.toJSON() : null;

    const valores = {
      assignment_type,
      id_track: assignment_type === "TRACK" ? id_track : null,
      id_pool: assignment_type === "POOL" ? id_pool : null,
      fade_ms: fade_ms ?? null,
    };

    let registro;
    if (anterior) {
      await anterior.update(valores, { transaction });
      registro = anterior;
    } else {
      registro = await MusicAssignment.create(
        { id_config_version: draft.id, slot_key: slotKey, ...valores },
        { transaction },
      );
    }

    await registrarAcao({
      idAdmin,
      acao: "MUSIC_DRAFT_ASSIGNMENT_UPDATE",
      entidade: "MusicAssignment",
      idEntidade: registro.id,
      dadosAntes: antes,
      dadosDepois: registro.toJSON(),
      req,
      transaction,
    });
    return registro;
  });
}

// --- Pools (catálogo em si; membership é por versão) ---

async function listarPools() {
  const pools = await MusicPool.findAll({ order: [["nome", "ASC"]] });
  return pools;
}

async function criarPool({ key, nome, descricao }, { idAdmin, req }) {
  if (!key || !REGEX_KEY_VALIDA.test(key)) throw erro("key de pool inválida.");
  if (!nome) throw erro("nome é obrigatório.");
  const existente = await MusicPool.findOne({ where: { key } });
  if (existente) throw erro("Já existe um pool com essa key.", 409);
  const pool = await MusicPool.create({ key, nome, descricao: descricao ?? null, ativo: true });
  await registrarAcao({
    idAdmin,
    acao: "MUSIC_POOL_CREATE",
    entidade: "MusicPool",
    idEntidade: pool.id,
    dadosAntes: null,
    dadosDepois: pool.toJSON(),
    req,
  });
  return pool;
}

// Substitui o membership do pool NO DRAFT atual (§9) — lista completa
// [{id_track, peso, ordem}], nunca incremental (evita "esqueci de
// remover" deixando lixo).
async function atualizarTracksDoPool(idPool, itens, { idAdmin, req }) {
  const pool = await MusicPool.findByPk(idPool);
  if (!pool) throw erro("Pool não encontrado.", 404);
  if (!Array.isArray(itens)) throw erro("itens precisa ser uma lista.");
  for (const item of itens) {
    if (!item.id_track) throw erro("Cada item precisa de id_track.");
    if (!Number.isInteger(item.peso) || item.peso <= 0) throw erro("peso precisa ser um inteiro positivo.");
  }

  const draft = await criarOuObterDraft({ idAdmin });

  return sequelize.transaction(async (transaction) => {
    const antes = await MusicPoolTrackAssignment.findAll({
      where: { id_config_version: draft.id, id_pool: idPool },
      transaction,
    });
    await MusicPoolTrackAssignment.destroy({ where: { id_config_version: draft.id, id_pool: idPool }, transaction });

    const criados = [];
    let ordemAuto = 0;
    for (const item of itens) {
      ordemAuto += 1;
      const linha = await MusicPoolTrackAssignment.create(
        {
          id_config_version: draft.id,
          id_pool: idPool,
          id_track: item.id_track,
          peso: item.peso,
          ordem: item.ordem ?? ordemAuto,
        },
        { transaction },
      );
      criados.push(linha);
    }

    await registrarAcao({
      idAdmin,
      acao: "MUSIC_POOL_UPDATE",
      entidade: "MusicPool",
      idEntidade: pool.id,
      dadosAntes: { membros: antes.map((a) => ({ id_track: a.id_track, peso: a.peso })) },
      dadosDepois: { membros: criados.map((a) => ({ id_track: a.id_track, peso: a.peso })) },
      req,
      transaction,
    });
    return criados;
  });
}

// --- Validação (§7.1/§9.3/§15.1) ---

async function validarDraft(idConfigVersion) {
  const erros = [];
  const assignments = await MusicAssignment.findAll({
    where: { id_config_version: idConfigVersion },
    include: [
      { model: MusicTrack, as: "track" },
      { model: MusicPool, as: "pool" },
    ],
  });

  const slotsVistos = new Set();
  for (const a of assignments) {
    if (!existeSlot(a.slot_key)) {
      erros.push(`slot_key "${a.slot_key}" não existe mais no registry.`);
      continue;
    }
    if (slotsVistos.has(a.slot_key)) erros.push(`slot "${a.slot_key}" duplicado.`);
    slotsVistos.add(a.slot_key);

    if (a.assignment_type === "TRACK") {
      if (!a.track || !a.track.ativo) erros.push(`slot "${a.slot_key}": faixa vinculada está inativa ou não existe mais.`);
    } else if (a.assignment_type === "POOL") {
      if (!a.pool || !a.pool.ativo) {
        erros.push(`slot "${a.slot_key}": pool vinculado está inativo ou não existe mais.`);
      } else {
        const membros = await MusicPoolTrackAssignment.findAll({
          where: { id_config_version: idConfigVersion, id_pool: a.id_pool },
          include: [{ model: MusicTrack, as: "track" }],
        });
        const ativosComPeso = membros.filter((m) => m.track?.ativo && m.peso > 0);
        if (ativosComPeso.length === 0) {
          erros.push(`slot "${a.slot_key}": pool "${a.pool.key}" está vazio ou sem faixas ativas com peso>0.`);
        }
      }
    } else if (a.assignment_type === "SILENCE") {
      if (a.id_track || a.id_pool) erros.push(`slot "${a.slot_key}": SILENCE não deveria ter track/pool vinculado.`);
    }
  }

  return { valido: erros.length === 0, erros };
}

// --- Publish (§10.2 — atômico, nunca deixa duas PUBLISHED) ---

async function publicarDraft({ idAdmin, req, notes }) {
  return sequelize.transaction(async (transaction) => {
    const draft = await MusicConfigVersion.findOne({
      where: { status: "DRAFT" },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!draft) throw erro("Não existe rascunho pra publicar.", 409);

    // Revalida DENTRO da transaction (double-click / corrida — segundo
    // clique acha status != DRAFT e falha com 409 em vez de duplicar).
    const draftAtualizado = await MusicConfigVersion.findByPk(draft.id, { transaction });
    if (draftAtualizado.status !== "DRAFT") {
      throw erro("Esse rascunho já foi publicado por outra requisição.", 409);
    }

    const { valido, erros } = await validarDraft(draft.id);
    if (!valido) {
      const e = erro("Rascunho inválido — corrija antes de publicar.", 422);
      e.erros = erros;
      throw e;
    }

    const publicadaAnterior = await MusicConfigVersion.findOne({
      where: { status: "PUBLISHED" },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (publicadaAnterior) {
      await publicadaAnterior.update({ status: "ARCHIVED" }, { transaction });
    }

    await draft.update(
      { status: "PUBLISHED", published_by: idAdmin, published_at: new Date(), notes: notes ?? draft.notes },
      { transaction },
    );

    await registrarAcao({
      idAdmin,
      acao: "MUSIC_CONFIG_PUBLISH",
      entidade: "MusicConfigVersion",
      idEntidade: draft.id,
      dadosAntes: { versionAnteriorPublicada: publicadaAnterior?.version_number ?? null },
      dadosDepois: { versionPublicada: draft.version_number },
      req,
      transaction,
    });

    return draft;
  });
}

async function descartarDraft({ idAdmin, req }) {
  const draft = await MusicConfigVersion.findOne({ where: { status: "DRAFT" } });
  if (!draft) return null;
  await sequelize.transaction(async (transaction) => {
    await MusicAssignment.destroy({ where: { id_config_version: draft.id }, transaction });
    await MusicPoolTrackAssignment.destroy({ where: { id_config_version: draft.id }, transaction });
    await draft.destroy({ transaction });
    await registrarAcao({
      idAdmin,
      acao: "MUSIC_DRAFT_DISCARD",
      entidade: "MusicConfigVersion",
      idEntidade: draft.id,
      dadosAntes: { version_number: draft.version_number },
      dadosDepois: null,
      req,
      transaction,
    });
  });
  return true;
}

async function listarHistorico() {
  return MusicConfigVersion.findAll({
    where: { status: ["PUBLISHED", "ARCHIVED"] },
    order: [["version_number", "DESC"]],
  });
}

// Rollback (§10.3) — NUNCA transforma histórico em PUBLISHED direto;
// clona pra um DRAFT novo (substitui um draft existente, se houver).
async function restaurarComoNovoDraft(versionNumber, { idAdmin, req }) {
  const origem = await MusicConfigVersion.findOne({ where: { version_number: versionNumber } });
  if (!origem) throw erro("Versão não encontrada.", 404);

  return sequelize.transaction(async (transaction) => {
    const draftExistente = await MusicConfigVersion.findOne({ where: { status: "DRAFT" }, transaction });
    if (draftExistente) {
      await MusicAssignment.destroy({ where: { id_config_version: draftExistente.id }, transaction });
      await MusicPoolTrackAssignment.destroy({ where: { id_config_version: draftExistente.id }, transaction });
      await draftExistente.destroy({ transaction });
    }

    const versionNumberNovo = await proximoVersionNumber(transaction);
    const novoDraft = await MusicConfigVersion.create(
      {
        version_number: versionNumberNovo,
        status: "DRAFT",
        created_by: idAdmin,
        notes: `Restaurado da versão ${versionNumber}.`,
      },
      { transaction },
    );
    await clonarConteudo(origem.id, novoDraft.id, transaction);

    await registrarAcao({
      idAdmin,
      acao: "MUSIC_CONFIG_ROLLBACK_TO_DRAFT",
      entidade: "MusicConfigVersion",
      idEntidade: novoDraft.id,
      dadosAntes: { restauradoDeVersion: versionNumber },
      dadosDepois: { novoDraftVersion: novoDraft.version_number },
      req,
      transaction,
    });

    return novoDraft;
  });
}

// GET /api/music/config — snapshot público, único ponto que o
// MusicConfigContext do frontend consulta.
async function obterConfigPublicada() {
  const publicada = await obterVersionPublicada();
  if (!publicada) return { version: 0, slots: {}, pools: {} };

  const assignments = await MusicAssignment.findAll({
    where: { id_config_version: publicada.id },
    include: [
      { model: MusicTrack, as: "track" },
      { model: MusicPool, as: "pool" },
    ],
  });
  const memberships = await MusicPoolTrackAssignment.findAll({
    where: { id_config_version: publicada.id },
    include: [{ model: MusicTrack, as: "track" }],
    order: [["ordem", "ASC"]],
  });

  const poolsPorId = new Map();
  for (const m of memberships) {
    if (!m.track?.ativo) continue;
    if (!poolsPorId.has(m.id_pool)) poolsPorId.set(m.id_pool, []);
    poolsPorId.get(m.id_pool).push({
      trackKey: m.track.key,
      peso: m.peso,
      loop: m.track.loop,
      defaultVolume: m.track.default_volume,
    });
  }

  const slots = {};
  const pools = {};
  for (const a of assignments) {
    if (a.assignment_type === "TRACK" && a.track?.ativo) {
      slots[a.slot_key] = {
        type: "TRACK",
        trackKey: a.track.key,
        loop: a.track.loop,
        defaultVolume: a.track.default_volume,
        fadeMs: a.fade_ms,
      };
    } else if (a.assignment_type === "POOL" && a.pool?.ativo) {
      const membros = poolsPorId.get(a.id_pool) ?? [];
      slots[a.slot_key] = { type: "POOL", poolKey: a.pool.key, fadeMs: a.fade_ms };
      pools[a.pool.key] = membros;
    } else {
      slots[a.slot_key] = { type: "SILENCE", fadeMs: a.fade_ms };
    }
  }

  return { version: publicada.version_number, slots, pools };
}

module.exports = {
  criarOuObterDraft,
  obterDraftCompleto,
  atualizarAssignment,
  listarPools,
  criarPool,
  atualizarTracksDoPool,
  validarDraft,
  publicarDraft,
  descartarDraft,
  listarHistorico,
  restaurarComoNovoDraft,
  obterConfigPublicada,
  obterVersionPublicada,
};
