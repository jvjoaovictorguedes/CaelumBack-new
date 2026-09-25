// Painel Administrativo Fase 9 — "Missões" (permissão missions.manage:
// "Missões livres, Guilda dos Aventureiros, Missões de Guilda"), os três
// catálogos de missão do jogo, agrupados aqui porque compartilham a
// mesma permissão e o mesmo hub. Cada um é puramente CATÁLOGO/TEMPLATE —
// as tabelas de progresso de jogador (CharacterMissionProgress,
// CharacterAdventureGuildContract, GuildMissionCycle/
// GuildMemberMissionProgress) nunca são tocadas por aqui, só lidas
// implicitamente pelo motor de jogo quando `ativa` permite.
const { sequelize } = require("../config/database");
const Mission = require("../models/Mission");
const AdventureGuildMission = require("../models/AdventureGuildMission");
const AdventureGuildMissionReward = require("../models/AdventureGuildMissionReward");
const GuildMission = require("../models/GuildMission");
const Item = require("../models/Item");
const AdventureMonster = require("../models/AdventureMonster");
const AdventureZone = require("../models/AdventureZone");
const { RANKS_AVENTUREIRO } = require("../config/adventureGuildConfig");
const { RANKS_GUILDA } = require("../config/guildConfig");
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

// ==================================================== MISSÕES LIVRES
const TIPOS_MISSAO_LIVRE = [
  "MatarInimigos",
  "VencerDuelos",
  "GanharOuro",
  "AlcancarNivel",
  "CompletarExpedicoes",
  "Fabricar",
  "CompletarContratosGuilda",
];
const CATEGORIAS_MISSAO_LIVRE = ["Diaria", "Unica", "Semanal", "Mensal"];
const CAMPOS_MISSAO = [
  "nome",
  "descricao",
  "tipo",
  "meta",
  "categoria",
  "nivel_minimo",
  "recompensa_dinheiro",
  "recompensa_xp",
  "recompensa_item_id",
  "recompensa_item_quantidade",
  "ativa",
];

function validarMissaoLivre(dados) {
  if (dados.tipo !== undefined && !TIPOS_MISSAO_LIVRE.includes(dados.tipo)) {
    throw erro(`tipo precisa ser um de: ${TIPOS_MISSAO_LIVRE.join(", ")}.`);
  }
  if (dados.categoria !== undefined && !CATEGORIAS_MISSAO_LIVRE.includes(dados.categoria)) {
    throw erro(`categoria precisa ser uma de: ${CATEGORIAS_MISSAO_LIVRE.join(", ")}.`);
  }
  if (dados.meta !== undefined && (!Number.isInteger(dados.meta) || dados.meta <= 0)) {
    throw erro("meta precisa ser um inteiro positivo.");
  }
  if (dados.nivel_minimo !== undefined && (!Number.isInteger(dados.nivel_minimo) || dados.nivel_minimo < 1)) {
    throw erro("nivel_minimo precisa ser um inteiro >= 1.");
  }
}

async function validarItemRecompensa(idItem) {
  if (idItem == null) return;
  const item = await Item.findByPk(idItem);
  if (!item) throw erro("recompensa_item_id não corresponde a nenhum item existente.");
}

async function listAdminMissions({ tipo, categoria, ativa } = {}) {
  const where = {};
  if (tipo) where.tipo = tipo;
  if (categoria) where.categoria = categoria;
  if (ativa !== undefined) where.ativa = ativa === "true" || ativa === true;
  return Mission.findAll({ where, include: [{ model: Item, as: "itemRecompensa", attributes: ["id", "nome", "imagem_url"] }], order: [["nome", "ASC"]] });
}

async function createAdminMission(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_MISSAO);
  if (!dados.nome) throw erro("nome é obrigatório.");
  if (!dados.descricao) throw erro("descricao é obrigatória.");
  if (!dados.tipo) throw erro("tipo é obrigatório.");
  if (dados.meta == null) throw erro("meta é obrigatória.");
  validarMissaoLivre(dados);
  await validarItemRecompensa(dados.recompensa_item_id);

  return sequelize.transaction(async (transaction) => {
    const missao = await Mission.create(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "criar", entidade: "Mission", idEntidade: missao.id, dadosDepois: missao.toJSON(), req, transaction });
    return missao;
  });
}

async function updateAdminMission(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_MISSAO);
  validarMissaoLivre(dados);
  await validarItemRecompensa(dados.recompensa_item_id);

  return sequelize.transaction(async (transaction) => {
    const missao = await Mission.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!missao) throw erro("Missão não encontrada.", 404);
    const antes = missao.toJSON();
    await missao.update(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "Mission", idEntidade: missao.id, dadosAntes: antes, dadosDepois: missao.toJSON(), req, transaction });
    return missao;
  });
}

async function duplicateAdminMission(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const original = await Mission.findByPk(id, { transaction });
    if (!original) throw erro("Missão não encontrada.", 404);
    const dados = somenteCampos(original.toJSON(), CAMPOS_MISSAO);
    dados.nome = `${original.nome} (cópia)`;
    dados.ativa = false;
    const copia = await Mission.create(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "duplicar", entidade: "Mission", idEntidade: copia.id, dadosAntes: { origemId: original.id }, dadosDepois: copia.toJSON(), req, transaction });
    return copia;
  });
}

// ============================================ GUILDA DOS AVENTUREIROS
const TIPOS_OBJETIVO_GUILDA_AVENTUREIROS = [
  "MatarInimigos",
  "MatarMonstroEspecifico",
  "MatarNaRegiao",
  "VencerDuelos",
  "GanharOuro",
  "CompletarExpedicoes",
  "Fabricar",
  "Refinar",
  "Entregar",
  "AlcancarNivel",
];
const CAMPOS_ADVENTURE_GUILD_MISSION = [
  "rank",
  "nome",
  "descricao",
  "tipo_objetivo",
  "id_monstro_alvo",
  "id_area_alvo",
  "id_item_alvo",
  "quantidade_objetivo",
  "qualidade_minima",
  "eh_provacao",
  "ativa",
];

async function validarAdventureGuildMission(dados) {
  if (dados.rank !== undefined && !RANKS_AVENTUREIRO.includes(dados.rank)) {
    throw erro(`rank precisa ser um de: ${RANKS_AVENTUREIRO.join(", ")}.`);
  }
  if (dados.tipo_objetivo !== undefined && !TIPOS_OBJETIVO_GUILDA_AVENTUREIROS.includes(dados.tipo_objetivo)) {
    throw erro(`tipo_objetivo precisa ser um de: ${TIPOS_OBJETIVO_GUILDA_AVENTUREIROS.join(", ")}.`);
  }
  if (dados.quantidade_objetivo !== undefined && (!Number.isInteger(dados.quantidade_objetivo) || dados.quantidade_objetivo <= 0)) {
    throw erro("quantidade_objetivo precisa ser um inteiro positivo.");
  }
  if (dados.id_monstro_alvo != null) {
    const monstro = await AdventureMonster.findByPk(dados.id_monstro_alvo);
    if (!monstro) throw erro("id_monstro_alvo não corresponde a nenhum monstro existente.");
  }
  if (dados.id_area_alvo != null) {
    const zona = await AdventureZone.findByPk(dados.id_area_alvo);
    if (!zona) throw erro("id_area_alvo não corresponde a nenhuma zona existente.");
  }
  if (dados.id_item_alvo != null) {
    const item = await Item.findByPk(dados.id_item_alvo);
    if (!item) throw erro("id_item_alvo não corresponde a nenhum item existente.");
  }
}

async function listAdminAdventureGuildMissions({ rank, ativa, eh_provacao } = {}) {
  const where = {};
  if (rank) where.rank = rank;
  if (ativa !== undefined) where.ativa = ativa === "true" || ativa === true;
  if (eh_provacao !== undefined) where.eh_provacao = eh_provacao === "true" || eh_provacao === true;
  return AdventureGuildMission.findAll({
    where,
    include: [{ model: AdventureGuildMissionReward, as: "recompensas", include: [{ model: Item, as: "item", attributes: ["id", "nome", "imagem_url"] }] }],
    order: [
      ["rank", "ASC"],
      ["nome", "ASC"],
    ],
  });
}

async function createAdminAdventureGuildMission(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_ADVENTURE_GUILD_MISSION);
  if (!dados.rank) throw erro("rank é obrigatório.");
  if (!dados.nome) throw erro("nome é obrigatório.");
  if (!dados.descricao) throw erro("descricao é obrigatória.");
  if (!dados.tipo_objetivo) throw erro("tipo_objetivo é obrigatório.");
  if (dados.quantidade_objetivo == null) throw erro("quantidade_objetivo é obrigatória.");
  await validarAdventureGuildMission(dados);

  return sequelize.transaction(async (transaction) => {
    const missao = await AdventureGuildMission.create(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "criar", entidade: "AdventureGuildMission", idEntidade: missao.id, dadosDepois: missao.toJSON(), req, transaction });
    return missao;
  });
}

async function updateAdminAdventureGuildMission(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_ADVENTURE_GUILD_MISSION);
  await validarAdventureGuildMission(dados);

  return sequelize.transaction(async (transaction) => {
    const missao = await AdventureGuildMission.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!missao) throw erro("Missão não encontrada.", 404);
    const antes = missao.toJSON();
    await missao.update(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "AdventureGuildMission", idEntidade: missao.id, dadosAntes: antes, dadosDepois: missao.toJSON(), req, transaction });
    return missao;
  });
}

async function duplicateAdminAdventureGuildMission(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const original = await AdventureGuildMission.findByPk(id, { transaction, include: [{ model: AdventureGuildMissionReward, as: "recompensas" }] });
    if (!original) throw erro("Missão não encontrada.", 404);

    const dados = somenteCampos(original.toJSON(), CAMPOS_ADVENTURE_GUILD_MISSION);
    dados.nome = `${original.nome} (cópia)`;
    dados.ativa = false;
    const copia = await AdventureGuildMission.create(dados, { transaction });

    for (const recompensa of original.recompensas ?? []) {
      await AdventureGuildMissionReward.create(
        { id_mission: copia.id, tipo: recompensa.tipo, id_item: recompensa.id_item, quantidade: recompensa.quantidade },
        { transaction },
      );
    }

    await registrarAcao({
      idAdmin,
      acao: "duplicar",
      entidade: "AdventureGuildMission",
      idEntidade: copia.id,
      dadosAntes: { origemId: original.id },
      dadosDepois: copia.toJSON(),
      req,
      transaction,
    });
    return copia;
  });
}

async function addAdventureGuildMissionReward(idMission, payload, { idAdmin, req }) {
  const { tipo, id_item, quantidade } = payload;
  if (!["Ouro", "XP", "Item"].includes(tipo)) throw erro("tipo precisa ser um de: Ouro, XP, Item.");
  if (!Number.isInteger(quantidade) || quantidade <= 0) throw erro("quantidade precisa ser um inteiro positivo.");
  if (tipo === "Item") {
    if (!id_item) throw erro("id_item é obrigatório pra recompensa do tipo Item.");
    const item = await Item.findByPk(id_item);
    if (!item) throw erro("id_item não corresponde a nenhum item existente.");
  }

  return sequelize.transaction(async (transaction) => {
    const missao = await AdventureGuildMission.findByPk(idMission, { transaction });
    if (!missao) throw erro("Missão não encontrada.", 404);
    const recompensa = await AdventureGuildMissionReward.create(
      { id_mission: idMission, tipo, id_item: tipo === "Item" ? id_item : null, quantidade },
      { transaction },
    );
    await registrarAcao({ idAdmin, acao: "criar", entidade: "AdventureGuildMissionReward", idEntidade: recompensa.id, dadosDepois: recompensa.toJSON(), req, transaction });
    return recompensa;
  });
}

async function removeAdventureGuildMissionReward(idRecompensa, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const recompensa = await AdventureGuildMissionReward.findByPk(idRecompensa, { transaction });
    if (!recompensa) throw erro("Recompensa não encontrada.", 404);
    const antes = recompensa.toJSON();
    await recompensa.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "remover", entidade: "AdventureGuildMissionReward", idEntidade: idRecompensa, dadosAntes: antes, req, transaction });
    return { removido: true };
  });
}

// ===================================================== MISSÕES DE GUILDA
const TIPOS_OBJETIVO_MISSAO_GUILDA = ["MatarInimigos", "GanharOuro", "CompletarExpedicoes", "Fabricar", "Refinar", "VencerDuelos"];
const CATEGORIAS_MISSAO_GUILDA = ["Diaria", "Semanal", "Mensal", "Rank"];
const CAMPOS_MISSAO_GUILDA = ["categoria", "rank", "nome", "descricao", "tipo_objetivo", "meta", "xp_guilda", "pontos_contribuicao", "ativa"];

function validarMissaoGuilda(dados) {
  if (dados.categoria !== undefined && !CATEGORIAS_MISSAO_GUILDA.includes(dados.categoria)) {
    throw erro(`categoria precisa ser uma de: ${CATEGORIAS_MISSAO_GUILDA.join(", ")}.`);
  }
  if (dados.categoria === "Rank" && !dados.rank) {
    throw erro('rank é obrigatório quando categoria é "Rank".');
  }
  if (dados.categoria && dados.categoria !== "Rank") {
    dados.rank = null;
  }
  if (dados.rank != null && !RANKS_GUILDA.includes(dados.rank)) {
    throw erro(`rank precisa ser um de: ${RANKS_GUILDA.join(", ")}.`);
  }
  if (dados.tipo_objetivo !== undefined && !TIPOS_OBJETIVO_MISSAO_GUILDA.includes(dados.tipo_objetivo)) {
    throw erro(`tipo_objetivo precisa ser um de: ${TIPOS_OBJETIVO_MISSAO_GUILDA.join(", ")}.`);
  }
  if (dados.meta !== undefined && (!Number.isInteger(dados.meta) || dados.meta <= 0)) {
    throw erro("meta precisa ser um inteiro positivo.");
  }
}

async function listAdminGuildMissions({ categoria, rank, ativa } = {}) {
  const where = {};
  if (categoria) where.categoria = categoria;
  if (rank) where.rank = rank;
  if (ativa !== undefined) where.ativa = ativa === "true" || ativa === true;
  return GuildMission.findAll({ where, order: [["categoria", "ASC"], ["nome", "ASC"]] });
}

async function createAdminGuildMission(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_MISSAO_GUILDA);
  if (!dados.nome) throw erro("nome é obrigatório.");
  if (!dados.descricao) throw erro("descricao é obrigatória.");
  if (!dados.categoria) throw erro("categoria é obrigatória.");
  if (!dados.tipo_objetivo) throw erro("tipo_objetivo é obrigatório.");
  if (dados.meta == null) throw erro("meta é obrigatória.");
  validarMissaoGuilda(dados);

  return sequelize.transaction(async (transaction) => {
    const missao = await GuildMission.create(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "criar", entidade: "GuildMission", idEntidade: missao.id, dadosDepois: missao.toJSON(), req, transaction });
    return missao;
  });
}

async function updateAdminGuildMission(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_MISSAO_GUILDA);

  return sequelize.transaction(async (transaction) => {
    const missao = await GuildMission.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!missao) throw erro("Missão não encontrada.", 404);
    // Validação roda sobre o estado FINAL (existente + alterações), nunca
    // só sobre o que veio no payload — uma edição parcial que só muda
    // `nome`, por exemplo, não pode reprovar por "rank obrigatório" só
    // porque `rank` não veio de novo nesse payload (ele já está salvo).
    const estadoFinal = {
      categoria: dados.categoria ?? missao.categoria,
      rank: dados.rank !== undefined ? dados.rank : missao.rank,
    };
    validarMissaoGuilda(estadoFinal);
    // validarMissaoGuilda pode ter limpado rank pra null quando a
    // categoria final não é "Rank" — sempre propaga o rank RESOLVIDO
    // (existente ou novo) pro update de verdade, senão um rank antigo
    // ficaria órfão no banco numa missão que deixou de ser "Rank".
    dados.rank = estadoFinal.rank;

    const antes = missao.toJSON();
    await missao.update(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "GuildMission", idEntidade: missao.id, dadosAntes: antes, dadosDepois: missao.toJSON(), req, transaction });
    return missao;
  });
}

async function duplicateAdminGuildMission(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const original = await GuildMission.findByPk(id, { transaction });
    if (!original) throw erro("Missão não encontrada.", 404);
    const dados = somenteCampos(original.toJSON(), CAMPOS_MISSAO_GUILDA);
    dados.nome = `${original.nome} (cópia)`;
    dados.ativa = false;
    const copia = await GuildMission.create(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "duplicar", entidade: "GuildMission", idEntidade: copia.id, dadosAntes: { origemId: original.id }, dadosDepois: copia.toJSON(), req, transaction });
    return copia;
  });
}

module.exports = {
  TIPOS_MISSAO_LIVRE,
  CATEGORIAS_MISSAO_LIVRE,
  TIPOS_OBJETIVO_GUILDA_AVENTUREIROS,
  RANKS_AVENTUREIRO,
  TIPOS_OBJETIVO_MISSAO_GUILDA,
  CATEGORIAS_MISSAO_GUILDA,
  RANKS_GUILDA,
  listAdminMissions,
  createAdminMission,
  updateAdminMission,
  duplicateAdminMission,
  listAdminAdventureGuildMissions,
  createAdminAdventureGuildMission,
  updateAdminAdventureGuildMission,
  duplicateAdminAdventureGuildMission,
  addAdventureGuildMissionReward,
  removeAdventureGuildMissionReward,
  listAdminGuildMissions,
  createAdminGuildMission,
  updateAdminGuildMission,
  duplicateAdminGuildMission,
};
