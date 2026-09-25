// Painel Administrativo — Sistema de Taverna (permissão tavern.manage).
// Separa CRUD de conteúdo (Cardápio/Jogos) de configuração operacional
// (Descanso/Jogos globais, guardada em GameSetting) e métricas
// somente-leitura, mesmo padrão dos módulos anteriores do painel.
const { Op, QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const TavernMenuItem = require("../models/TavernMenuItem");
const TavernGame = require("../models/TavernGame");
const GameSetting = require("../models/GameSetting");
const gameSettingCache = require("./gameSettingCache");
const { registrarAcao } = require("./adminAuditService");
const {
  TAVERN_BUFF_KEYS,
  CATEGORIAS_CARDAPIO,
  PRESENTATION_KEYS,
  GAME_SETTINGS_DEFAULT,
} = require("../config/tavernConfig");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

// ---------------------------------------------------------------------
// Cardápio (TavernMenuItem)
// ---------------------------------------------------------------------

function validarMenuItem(dados, { parcial = false } = {}) {
  const erros = [];
  if (!parcial || dados.nome !== undefined) {
    if (!dados.nome || typeof dados.nome !== "string") erros.push("nome é obrigatório.");
  }
  if (!parcial || dados.descricao !== undefined) {
    if (!dados.descricao || typeof dados.descricao !== "string") erros.push("descricao é obrigatória.");
  }
  if (!parcial || dados.categoria !== undefined) {
    if (!CATEGORIAS_CARDAPIO.includes(dados.categoria)) erros.push(`categoria precisa ser uma de: ${CATEGORIAS_CARDAPIO.join(", ")}.`);
  }
  if (!parcial || dados.preco_gold !== undefined) {
    if (!Number.isInteger(dados.preco_gold) || dados.preco_gold < 0) erros.push("preco_gold precisa ser um inteiro >= 0.");
  }
  if (!parcial || dados.buff_key !== undefined) {
    if (!TAVERN_BUFF_KEYS.includes(dados.buff_key)) erros.push(`buff_key precisa ser uma de: ${TAVERN_BUFF_KEYS.join(", ")}.`);
  }
  if (!parcial || dados.magnitude !== undefined) {
    if (typeof dados.magnitude !== "number" || dados.magnitude <= 0) erros.push("magnitude precisa ser um número positivo.");
  }
  if (!parcial || dados.duracao_segundos !== undefined) {
    if (!Number.isInteger(dados.duracao_segundos) || dados.duracao_segundos <= 0) erros.push("duracao_segundos precisa ser um inteiro positivo.");
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

function camposMenuItem(dados) {
  const permitidos = ["nome", "descricao", "categoria", "preco_gold", "buff_key", "magnitude", "duracao_segundos", "imagem_url", "ordem", "ativo"];
  const out = {};
  for (const campo of permitidos) {
    if (dados[campo] !== undefined) out[campo] = dados[campo];
  }
  return out;
}

async function listAdminTavernMenu({ pagina = 1, porPagina = 20, categoria, ativo, nome } = {}) {
  const where = {};
  if (categoria) where.categoria = categoria;
  if (ativo !== undefined && ativo !== "") where.ativo = ativo === true || ativo === "true";
  if (nome) where.nome = { [Op.iLike]: `%${nome}%` };

  const limite = Math.min(100, Math.max(1, Number(porPagina) || 20));
  const paginaAtual = Math.max(1, Number(pagina) || 1);
  const offset = (paginaAtual - 1) * limite;

  const { count, rows } = await TavernMenuItem.findAndCountAll({
    where,
    order: [["categoria", "ASC"], ["ordem", "ASC"]],
    limit: limite,
    offset,
  });
  return { total: count, pagina: paginaAtual, porPagina: limite, itens: rows };
}

async function createAdminTavernMenuItem(dados, { idAdmin, req }) {
  validarMenuItem(dados);
  return sequelize.transaction(async (transaction) => {
    const item = await TavernMenuItem.create(
      { ...camposMenuItem(dados), ativo: dados.ativo ?? true },
      { transaction },
    );
    await registrarAcao({ idAdmin, acao: "criar", entidade: "TavernMenuItem", idEntidade: item.id, dadosDepois: item.toJSON(), req, transaction });
    return item;
  });
}

async function updateAdminTavernMenuItem(id, dados, { idAdmin, req }) {
  validarMenuItem(dados, { parcial: true });
  return sequelize.transaction(async (transaction) => {
    const item = await TavernMenuItem.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!item) throw erro("Oferta não encontrada.", 404);
    const antes = item.toJSON();
    await item.update(camposMenuItem(dados), { transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "TavernMenuItem", idEntidade: item.id, dadosAntes: antes, dadosDepois: item.toJSON(), req, transaction });
    return item;
  });
}

async function duplicateAdminTavernMenuItem(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const original = await TavernMenuItem.findByPk(id, { transaction });
    if (!original) throw erro("Oferta não encontrada.", 404);
    const copia = await TavernMenuItem.create(
      {
        nome: `${original.nome} (cópia)`,
        descricao: original.descricao,
        categoria: original.categoria,
        preco_gold: original.preco_gold,
        buff_key: original.buff_key,
        magnitude: original.magnitude,
        duracao_segundos: original.duracao_segundos,
        imagem_url: original.imagem_url,
        ordem: original.ordem,
        ativo: false,
      },
      { transaction },
    );
    await registrarAcao({ idAdmin, acao: "duplicar", entidade: "TavernMenuItem", idEntidade: copia.id, dadosAntes: { origemId: original.id }, dadosDepois: copia.toJSON(), req, transaction });
    return copia;
  });
}

async function setAtivoAdminTavernMenuItem(id, ativo, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const item = await TavernMenuItem.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!item) throw erro("Oferta não encontrada.", 404);
    const antes = item.toJSON();
    await item.update({ ativo }, { transaction });
    await registrarAcao({ idAdmin, acao: ativo ? "reativar" : "desativar", entidade: "TavernMenuItem", idEntidade: item.id, dadosAntes: antes, dadosDepois: item.toJSON(), req, transaction });
    return item;
  });
}

// ---------------------------------------------------------------------
// Jogos (TavernGame)
// ---------------------------------------------------------------------

const WIN_CHANCE_PPM_V1 = 500000;

function validarGame(dados, { parcial = false } = {}) {
  const erros = [];
  if (!parcial || dados.key !== undefined) {
    if (!dados.key || typeof dados.key !== "string") erros.push("key é obrigatória.");
  }
  if (!parcial || dados.nome !== undefined) {
    if (!dados.nome || typeof dados.nome !== "string") erros.push("nome é obrigatório.");
  }
  if (!parcial || dados.descricao !== undefined) {
    if (!dados.descricao || typeof dados.descricao !== "string") erros.push("descricao é obrigatória.");
  }
  if (!parcial || dados.presentation_key !== undefined) {
    if (!PRESENTATION_KEYS.includes(dados.presentation_key)) erros.push(`presentation_key precisa ser uma de: ${PRESENTATION_KEYS.join(", ")}.`);
  }
  if (!parcial || dados.payout_multiplier !== undefined) {
    if (typeof dados.payout_multiplier !== "number" || dados.payout_multiplier <= 0) erros.push("payout_multiplier precisa ser um número positivo.");
  }
  if (!parcial || dados.min_bet !== undefined) {
    if (!Number.isInteger(dados.min_bet) || dados.min_bet <= 0) erros.push("min_bet precisa ser um inteiro positivo.");
  }
  if (!parcial || dados.max_bet !== undefined) {
    if (!Number.isInteger(dados.max_bet) || dados.max_bet <= 0) erros.push("max_bet precisa ser um inteiro positivo.");
  }
  if (dados.min_bet !== undefined && dados.max_bet !== undefined && dados.min_bet > dados.max_bet) {
    erros.push("min_bet não pode ser maior que max_bet.");
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

function camposGame(dados) {
  // win_chance_ppm NUNCA vem do payload (§15.4 — V1 trava em 500000,
  // "requisito funcional atual é 50/50"; travar no server, não só na UI,
  // é o que garante isso de verdade).
  const permitidos = ["key", "nome", "descricao", "presentation_key", "payout_multiplier", "min_bet", "max_bet", "ordem", "ativo"];
  const out = {};
  for (const campo of permitidos) {
    if (dados[campo] !== undefined) out[campo] = dados[campo];
  }
  out.win_chance_ppm = WIN_CHANCE_PPM_V1;
  return out;
}

function alertaHouseEdge(payoutMultiplier) {
  if (payoutMultiplier >= 2.0) {
    return "payout_multiplier >= 2.00 — o jogo deixa de ser Gold sink (expectativa igual ou favorável ao jogador).";
  }
  return null;
}

async function listAdminTavernGames({ pagina = 1, porPagina = 20, ativo } = {}) {
  const where = {};
  if (ativo !== undefined && ativo !== "") where.ativo = ativo === true || ativo === "true";

  const limite = Math.min(100, Math.max(1, Number(porPagina) || 20));
  const paginaAtual = Math.max(1, Number(pagina) || 1);
  const offset = (paginaAtual - 1) * limite;

  const { count, rows } = await TavernGame.findAndCountAll({
    where,
    order: [["ordem", "ASC"]],
    limit: limite,
    offset,
  });
  return {
    total: count,
    pagina: paginaAtual,
    porPagina: limite,
    itens: rows.map((jogo) => ({ ...jogo.toJSON(), houseEdgeAlerta: alertaHouseEdge(jogo.payout_multiplier) })),
  };
}

async function createAdminTavernGame(dados, { idAdmin, req }) {
  validarGame(dados);
  return sequelize.transaction(async (transaction) => {
    const jogo = await TavernGame.create({ ...camposGame(dados), ativo: dados.ativo ?? true }, { transaction });
    await registrarAcao({ idAdmin, acao: "criar", entidade: "TavernGame", idEntidade: jogo.id, dadosDepois: jogo.toJSON(), req, transaction });
    return jogo;
  });
}

async function updateAdminTavernGame(id, dados, { idAdmin, req }) {
  validarGame(dados, { parcial: true });
  return sequelize.transaction(async (transaction) => {
    const jogo = await TavernGame.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!jogo) throw erro("Jogo não encontrado.", 404);
    const antes = jogo.toJSON();
    await jogo.update(camposGame(dados), { transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "TavernGame", idEntidade: jogo.id, dadosAntes: antes, dadosDepois: jogo.toJSON(), req, transaction });
    return jogo;
  });
}

async function duplicateAdminTavernGame(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const original = await TavernGame.findByPk(id, { transaction });
    if (!original) throw erro("Jogo não encontrado.", 404);
    // key é STRING(40) — trunca a base pra sempre caber o sufixo de
    // desambiguação, mesmo se a key original já estiver perto do limite.
    const sufixoCopia = `-copia-${Date.now()}`;
    const baseKey = original.key.slice(0, 40 - sufixoCopia.length);
    const copia = await TavernGame.create(
      {
        key: `${baseKey}${sufixoCopia}`,
        nome: `${original.nome} (cópia)`,
        descricao: original.descricao,
        presentation_key: original.presentation_key,
        win_chance_ppm: WIN_CHANCE_PPM_V1,
        payout_multiplier: original.payout_multiplier,
        min_bet: original.min_bet,
        max_bet: original.max_bet,
        ordem: original.ordem,
        ativo: false,
      },
      { transaction },
    );
    await registrarAcao({ idAdmin, acao: "duplicar", entidade: "TavernGame", idEntidade: copia.id, dadosAntes: { origemId: original.id }, dadosDepois: copia.toJSON(), req, transaction });
    return copia;
  });
}

async function setAtivoAdminTavernGame(id, ativo, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const jogo = await TavernGame.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!jogo) throw erro("Jogo não encontrado.", 404);
    const antes = jogo.toJSON();
    await jogo.update({ ativo }, { transaction });
    await registrarAcao({ idAdmin, acao: ativo ? "reativar" : "desativar", entidade: "TavernGame", idEntidade: jogo.id, dadosAntes: antes, dadosDepois: jogo.toJSON(), req, transaction });
    return jogo;
  });
}

// ---------------------------------------------------------------------
// Configurações (GameSetting: tavern.rest.*, tavern.games.*, tavern.enabled)
// ---------------------------------------------------------------------

const CHAVES_CONFIG = Object.keys(GAME_SETTINGS_DEFAULT);

async function getAdminTavernSettings() {
  const linhas = await GameSetting.findAll({ where: { chave: CHAVES_CONFIG } });
  const porChave = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  const out = {};
  for (const chave of CHAVES_CONFIG) {
    out[chave] = porChave[chave] ?? GAME_SETTINGS_DEFAULT[chave];
  }
  return out;
}

function validarValorDeConfig(chave, valor) {
  if (chave === "tavern.enabled") {
    if (typeof valor !== "boolean") throw erro(`${chave} precisa ser boolean.`);
    return;
  }
  if (!Number.isInteger(valor) || valor < 0) throw erro(`${chave} precisa ser um inteiro >= 0.`);
  if (chave === "tavern.rest.minimum_gold" && valor > 100000) throw erro(`${chave} fora de uma faixa segura.`);
  if (chave === "tavern.games.max_bet_global" && valor > 1_000_000) throw erro(`${chave} fora de uma faixa segura.`);
}

async function updateAdminTavernSettings(payload, { idAdmin, req }) {
  const mudancas = [];
  for (const [chave, valor] of Object.entries(payload ?? {})) {
    if (!CHAVES_CONFIG.includes(chave)) throw erro(`Chave desconhecida: ${chave}.`);
    validarValorDeConfig(chave, valor);
    mudancas.push([chave, valor, typeof valor === "boolean" ? "boolean" : "number"]);
  }
  if (mudancas.length === 0) throw erro("Nada pra salvar — envie ao menos uma configuração.");

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
  return getAdminTavernSettings();
}

// ---------------------------------------------------------------------
// Métricas (§15.5) — somente leitura.
// ---------------------------------------------------------------------

async function getAdminTavernMetrics() {
  const [apostas24h] = await sequelize.query(
    `SELECT
       COUNT(*)::int AS apostas,
       COALESCE(SUM(bet_amount), 0)::bigint AS gold_apostado,
       COALESCE(SUM(payout_amount), 0)::bigint AS gold_pago,
       COALESCE(SUM(bet_amount - payout_amount), 0)::bigint AS gold_liquido_removido,
       COALESCE(AVG(bet_amount), 0)::float AS aposta_media,
       COALESCE(MAX(bet_amount), 0)::int AS maior_aposta,
       COALESCE(AVG(CASE WHEN outcome = 'Win' THEN 1.0 ELSE 0.0 END), 0)::float AS taxa_vitoria
     FROM tavern_game_bets WHERE "createdAt" >= now() - interval '24 hours';`,
    { type: QueryTypes.SELECT },
  );
  const [apostas7d] = await sequelize.query(
    `SELECT
       COUNT(*)::int AS apostas,
       COALESCE(SUM(bet_amount), 0)::bigint AS gold_apostado,
       COALESCE(SUM(payout_amount), 0)::bigint AS gold_pago,
       COALESCE(SUM(bet_amount - payout_amount), 0)::bigint AS gold_liquido_removido
     FROM tavern_game_bets WHERE "createdAt" >= now() - interval '7 days';`,
    { type: QueryTypes.SELECT },
  );
  const comprasPorOferta = await sequelize.query(
    `SELECT tmi.nome, COUNT(*)::int AS total
     FROM character_tavern_buffs ctb
     JOIN tavern_menu_items tmi ON tmi.id = ctb.source_menu_item_id
     GROUP BY tmi.nome
     ORDER BY total DESC
     LIMIT 20;`,
    { type: QueryTypes.SELECT },
  );

  return {
    apostas24h,
    apostas7d,
    comprasPorOferta,
  };
}

module.exports = {
  listAdminTavernMenu,
  createAdminTavernMenuItem,
  updateAdminTavernMenuItem,
  duplicateAdminTavernMenuItem,
  setAtivoAdminTavernMenuItem,
  listAdminTavernGames,
  createAdminTavernGame,
  updateAdminTavernGame,
  duplicateAdminTavernGame,
  setAtivoAdminTavernGame,
  getAdminTavernSettings,
  updateAdminTavernSettings,
  getAdminTavernMetrics,
  WIN_CHANCE_PPM_V1,
};
