// Painel Administrativo — Templo do Véu Celestial: Relicário dos Ecos
// (§6/§7/§12.1 "entries, pesos/odds, pity, duplicate policy e reward
// bands" + preview de odds). Um TempleRewardPool por evento (upsert);
// só editável enquanto a Convergência está em DRAFT/SCHEDULED.
const { sequelize } = require("../config/database");
const TempleEvent = require("../models/TempleEvent");
const TempleRewardPool = require("../models/TempleRewardPool");
const TempleRewardEntry = require("../models/TempleRewardEntry");
const Item = require("../models/Item");
const { registrarAcao } = require("./adminAuditService");
const { exigirEditavel } = require("./adminTempleEventService");
const { REWARD_KIND } = require("../config/templeConfig");

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

async function obterRelicarioAdmin(idEvento) {
  const pool = await TempleRewardPool.findOne({ where: { id_event: idEvento } });
  if (!pool) return { pool: null, entries: [] };
  const entries = await TempleRewardEntry.findAll({ where: { id_pool: pool.id }, order: [["ordem", "ASC"]] });
  return { pool, entries };
}

function validarPool(dados, { parcial = false } = {}) {
  const erros = [];
  if (!parcial || dados.nome !== undefined) {
    if (!dados.nome) erros.push("nome é obrigatório.");
  }
  if (!parcial || dados.custo_sigilos_draw !== undefined) {
    if (!Number.isInteger(dados.custo_sigilos_draw) || dados.custo_sigilos_draw <= 0) erros.push("custo_sigilos_draw precisa ser um inteiro positivo.");
  }
  for (const campo of ["pity_raro_mais_garantia", "pity_featured_garantia"]) {
    if (dados[campo] !== undefined && dados[campo] !== null && (!Number.isInteger(dados[campo]) || dados[campo] <= 0)) {
      erros.push(`${campo} precisa ser um inteiro positivo (ou null pra sem garantia).`);
    }
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

// §6.1/§12.1 — upsert: cada evento tem no máximo UM pool (nunca vários
// concorrendo pelo mesmo Relicário). Criado na primeira chamada,
// atualizado nas seguintes.
async function salvarPool(idEvento, dados, { idAdmin, req }) {
  validarPool(dados);
  return sequelize.transaction(async (transaction) => {
    await carregarEventoEditavel(idEvento, transaction);
    let pool = await TempleRewardPool.findOne({ where: { id_event: idEvento }, transaction, lock: transaction.LOCK.UPDATE });
    const antes = pool?.toJSON() ?? null;
    const campos = {
      id_event: idEvento,
      nome: dados.nome,
      custo_sigilos_draw: dados.custo_sigilos_draw,
      pity_raro_mais_garantia: dados.pity_raro_mais_garantia ?? null,
      pity_featured_garantia: dados.pity_featured_garantia ?? null,
      ativo: dados.ativo ?? true,
    };
    if (pool) {
      await pool.update(campos, { transaction });
    } else {
      pool = await TempleRewardPool.create(campos, { transaction });
    }
    await registrarAcao({
      idAdmin,
      acao: antes ? "editar" : "criar",
      entidade: "TempleRewardPool",
      idEntidade: pool.id,
      dadosAntes: antes,
      dadosDepois: pool.toJSON(),
      req,
      transaction,
    });
    return pool;
  });
}

async function validarEntry(dados, { transaction, idPoolAtual, idEntryExcluida } = {}) {
  const erros = [];
  if (!dados.key || !/^[a-z0-9_]{2,80}$/.test(dados.key)) erros.push("key é obrigatória: minúsculas/números/underscore.");
  if (!REWARD_KINDS_VALIDOS.includes(dados.reward_kind)) erros.push(`reward_kind precisa ser um de: ${REWARD_KINDS_VALIDOS.join(", ")}.`);
  if (!dados.id_item) erros.push("id_item é obrigatório.");
  if (!dados.nome_exibicao) erros.push("nome_exibicao é obrigatório.");
  if (dados.weight !== undefined && (!Number.isInteger(dados.weight) || dados.weight < 0)) erros.push("weight precisa ser um inteiro >= 0.");
  if (dados.quantidade !== undefined && (!Number.isInteger(dados.quantidade) || dados.quantidade <= 0)) erros.push("quantidade precisa ser um inteiro positivo.");
  if (dados.eh_unico && !dados.fallback_key) {
    // §7.2 — "recompensa única já possuída... o pool precisa ter uma
    // entry de fallback configurada" — validado JÁ na gravação, nunca
    // só descoberto em runtime quando alguém sortear essa entry.
    erros.push("entries eh_unico precisam de fallback_key (pra quando o jogador já possuir).");
  }
  if (erros.length > 0) throw erro(erros.join(" "));

  const item = await Item.findByPk(dados.id_item, { transaction });
  if (!item) throw erro("id_item não aponta pra nenhum Item existente.");

  if (dados.fallback_key) {
    const fallback = await TempleRewardEntry.findOne({
      where: { id_pool: idPoolAtual, key: dados.fallback_key },
      transaction,
    });
    if (!fallback || fallback.id === idEntryExcluida) {
      throw erro("fallback_key precisa apontar pra outra entry existente no mesmo pool.");
    }
  }
}

async function criarEntry(idEvento, dados, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    await carregarEventoEditavel(idEvento, transaction);
    const pool = await TempleRewardPool.findOne({ where: { id_event: idEvento }, transaction });
    if (!pool) throw erro("Crie o pool do Relicário antes de adicionar entries.");

    await validarEntry(dados, { transaction, idPoolAtual: pool.id });
    const existente = await TempleRewardEntry.findOne({ where: { id_pool: pool.id, key: dados.key }, transaction });
    if (existente) throw erro("Já existe uma entry com esta key neste pool.", 409);

    const entry = await TempleRewardEntry.create(
      {
        id_pool: pool.id,
        key: dados.key,
        reward_kind: dados.reward_kind,
        id_item: dados.id_item,
        quantidade: dados.quantidade ?? 1,
        raridade_instancia: dados.raridade_instancia ?? null,
        weight: dados.weight ?? 1,
        eh_raro_mais: Boolean(dados.eh_raro_mais),
        eh_featured: Boolean(dados.eh_featured),
        eh_unico: Boolean(dados.eh_unico),
        fallback_key: dados.fallback_key ?? null,
        nome_exibicao: dados.nome_exibicao,
        ordem: dados.ordem ?? 0,
        ativo: dados.ativo ?? true,
      },
      { transaction },
    );
    await registrarAcao({ idAdmin, acao: "criar", entidade: "TempleRewardEntry", idEntidade: entry.id, dadosDepois: entry.toJSON(), req, transaction });
    return entry;
  });
}

async function atualizarEntry(idEvento, idEntry, dados, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    await carregarEventoEditavel(idEvento, transaction);
    const pool = await TempleRewardPool.findOne({ where: { id_event: idEvento }, transaction });
    if (!pool) throw erro("Pool do Relicário não encontrado.", 404);
    const entry = await TempleRewardEntry.findOne({ where: { id: idEntry, id_pool: pool.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!entry) throw erro("Entry não encontrada.", 404);

    const mesclado = { ...entry.toJSON(), ...dados };
    await validarEntry(mesclado, { transaction, idPoolAtual: pool.id, idEntryExcluida: entry.id });
    if (dados.key !== undefined && dados.key !== entry.key) {
      const existente = await TempleRewardEntry.findOne({ where: { id_pool: pool.id, key: dados.key }, transaction });
      if (existente) throw erro("Já existe uma entry com esta key neste pool.", 409);
    }

    const antes = entry.toJSON();
    for (const campo of [
      "key", "reward_kind", "id_item", "quantidade", "raridade_instancia", "weight",
      "eh_raro_mais", "eh_featured", "eh_unico", "fallback_key", "nome_exibicao", "ordem", "ativo",
    ]) {
      if (dados[campo] !== undefined) entry[campo] = dados[campo];
    }
    await entry.save({ transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "TempleRewardEntry", idEntidade: entry.id, dadosAntes: antes, dadosDepois: entry.toJSON(), req, transaction });
    return entry;
  });
}

async function excluirEntry(idEvento, idEntry, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    await carregarEventoEditavel(idEvento, transaction);
    const pool = await TempleRewardPool.findOne({ where: { id_event: idEvento }, transaction });
    if (!pool) throw erro("Pool do Relicário não encontrado.", 404);
    const entry = await TempleRewardEntry.findOne({ where: { id: idEntry, id_pool: pool.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!entry) throw erro("Entry não encontrada.", 404);

    const dependente = await TempleRewardEntry.findOne({ where: { id_pool: pool.id, fallback_key: entry.key }, transaction });
    if (dependente) throw erro(`A entry "${dependente.nome_exibicao}" usa esta como fallback — mude o fallback dela antes de excluir.`, 409);

    const antes = entry.toJSON();
    await entry.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "excluir", entidade: "TempleRewardEntry", idEntidade: idEntry, dadosAntes: antes, req, transaction });
    return { excluida: true };
  });
}

// §7.3/§12.1 "preview de odds" — mesmo cálculo de peso/total que
// templeRelicaryService.obterRelicario usa pro jogador, SEM o filtro
// de "já possui" (que é por personagem, não existe no catálogo). Sem
// pool configurado ainda, devolve zero entries em vez de 404 — a tela
// de preview precisa funcionar mesmo num evento recém-criado.
async function previewOdds(idEvento) {
  const { pool, entries } = await obterRelicarioAdmin(idEvento);
  if (!pool) return { pool: null, entries: [], avisos: ["Nenhum pool configurado ainda."] };

  const ativas = entries.filter((e) => e.ativo);
  const pesoTotal = ativas.reduce((soma, e) => soma + e.weight, 0);
  const avisos = [];
  if (ativas.length === 0) avisos.push("Nenhuma entry ativa — o Relicário não teria nada pra sortear.");
  if (pesoTotal <= 0 && ativas.length > 0) avisos.push("Peso total é zero — nenhuma entry seria sorteada.");

  for (const entry of ativas) {
    if (entry.eh_unico && entry.fallback_key) {
      const fallback = ativas.find((e) => e.key === entry.fallback_key);
      if (!fallback) avisos.push(`"${entry.nome_exibicao}": fallback_key "${entry.fallback_key}" não aponta pra uma entry ativa.`);
    }
  }
  if (ativas.some((e) => e.eh_raro_mais) === false) avisos.push("Nenhuma entry marcada eh_raro_mais — a garantia de Raro+ nunca teria o que conceder.");
  if (pool.pity_featured_garantia && ativas.every((e) => !e.eh_featured)) avisos.push("pity_featured_garantia configurado, mas nenhuma entry é eh_featured.");

  return {
    pool,
    entries: ativas.map((entry) => ({
      key: entry.key,
      nome_exibicao: entry.nome_exibicao,
      reward_kind: entry.reward_kind,
      weight: entry.weight,
      eh_raro_mais: entry.eh_raro_mais,
      eh_featured: entry.eh_featured,
      eh_unico: entry.eh_unico,
      chance_pct: pesoTotal > 0 ? (entry.weight / pesoTotal) * 100 : 0,
    })),
    avisos,
  };
}

module.exports = {
  obterRelicarioAdmin,
  salvarPool,
  criarEntry,
  atualizarEntry,
  excluirEntry,
  previewOdds,
};
