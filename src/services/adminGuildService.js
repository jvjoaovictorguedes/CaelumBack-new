// Painel Administrativo — Guilda: Níveis (GuildLevelConfig) e Boss por
// Rank (GuildBossConfig). O balanceamento de guildConfig.js (requisitos
// de rank, carência, buffs, contribuição, frações/tamanho do Boss ao
// vivo) mora em guildSettingsService.js, mesmo padrão de
// expeditionSettingsService.js — este arquivo cobre só os 2 CATÁLOGOS
// gerenciáveis daqui (linhas de verdade no banco, não constantes de
// JS). Missões de Guilda (GuildMission) NÃO entram aqui — já têm CRUD
// completo (list/create/update/duplicate) em adminMissionService.js,
// servido em /admin/missions/guild sob a permissão missions.manage;
// duplicar essa tela aqui criaria dois caminhos administrando a mesma
// tabela, com validação potencialmente divergente.
const { sequelize } = require("../config/database");
const GuildLevelConfig = require("../models/GuildLevelConfig");
const GuildBossConfig = require("../models/GuildBossConfig");
const guildConfig = require("../config/guildConfig");
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

// ------------------------------------------------------------ NÍVEIS
async function listarNiveis() {
  return GuildLevelConfig.findAll({ order: [["nivel", "ASC"]] });
}

async function upsertNivel(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, ["nivel", "xp_para_proximo_nivel", "limite_membros"]);
  if (!Number.isInteger(dados.nivel) || dados.nivel < 1) throw erro("nivel precisa ser um inteiro >= 1.");
  if (!Number.isInteger(dados.limite_membros) || dados.limite_membros < 1) {
    throw erro("limite_membros precisa ser um inteiro >= 1.");
  }
  if (dados.xp_para_proximo_nivel !== undefined && dados.xp_para_proximo_nivel !== null) {
    if (!Number.isInteger(dados.xp_para_proximo_nivel) || dados.xp_para_proximo_nivel < 0) {
      throw erro("xp_para_proximo_nivel precisa ser um inteiro >= 0 (ou null pro nível máximo).");
    }
  }

  return sequelize.transaction(async (transaction) => {
    const existente = await GuildLevelConfig.findByPk(dados.nivel, { transaction });
    const dadosAntes = existente ? existente.toJSON() : null;
    const [linha] = await GuildLevelConfig.upsert(dados, { transaction, returning: true });
    await registrarAcao({
      idAdmin,
      acao: existente ? "editar" : "criar",
      entidade: "GuildLevelConfig",
      idEntidade: linha.nivel,
      dadosAntes,
      dadosDepois: linha.toJSON(),
      req,
      transaction,
    });
    return linha;
  });
}

// -------------------------------------------------------- BOSS DA GUILDA
const CAMPOS_BOSS = [
  "rank",
  "nome_chefe",
  "descricao",
  "vida_total",
  "defesa",
  "janela_horas",
  "custo_liberacao",
  "xp_guilda_concedido",
  "pool_dinheiro_total",
  "pool_xp_total",
  "dano_base_ataque",
  "premio_maior_dano",
  "imagem_url",
];

function validarBossPayload(dados) {
  if (!guildConfig.ehRankGuildaValido(dados.rank)) throw erro(`Rank inválido: ${dados.rank}.`);
  if (!dados.nome_chefe) throw erro("nome_chefe é obrigatório.");
  if (!dados.descricao) throw erro("descricao é obrigatória.");
  if (!Number.isInteger(dados.vida_total) || dados.vida_total <= 0) throw erro("vida_total precisa ser um inteiro > 0.");
  if (dados.defesa !== undefined && (!Number.isInteger(dados.defesa) || dados.defesa < 0)) {
    throw erro("defesa precisa ser um inteiro >= 0.");
  }
  if (!Number.isInteger(dados.janela_horas) || dados.janela_horas <= 0) throw erro("janela_horas precisa ser um inteiro > 0.");
  for (const campo of ["custo_liberacao", "xp_guilda_concedido", "pool_dinheiro_total", "pool_xp_total", "dano_base_ataque", "premio_maior_dano"]) {
    if (dados[campo] !== undefined && (!Number.isInteger(dados[campo]) || dados[campo] < 0)) {
      throw erro(`${campo} precisa ser um inteiro >= 0.`);
    }
  }
}

async function listarBosses() {
  return GuildBossConfig.findAll({
    order: [
      [
        sequelize.literal(`array_position(ARRAY[${guildConfig.RANKS_GUILDA.map((r) => `'${r}'`).join(",")}], rank)`),
        "ASC",
      ],
    ],
  });
}

async function criarBoss(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_BOSS);
  validarBossPayload(dados);

  return sequelize.transaction(async (transaction) => {
    const jaExiste = await GuildBossConfig.findOne({ where: { rank: dados.rank }, transaction });
    if (jaExiste) throw erro(`Já existe um Boss cadastrado pro rank ${dados.rank}.`);
    const boss = await GuildBossConfig.create(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "GuildBossConfig",
      idEntidade: boss.id,
      dadosAntes: null,
      dadosDepois: boss.toJSON(),
      req,
      transaction,
    });
    return boss;
  });
}

async function atualizarBoss(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_BOSS);

  return sequelize.transaction(async (transaction) => {
    const boss = await GuildBossConfig.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!boss) throw erro("Boss da Guilda não encontrado.", 404);
    const mesclado = { ...boss.toJSON(), ...dados };
    validarBossPayload(mesclado);
    if (dados.rank && dados.rank !== boss.rank) {
      const conflito = await GuildBossConfig.findOne({ where: { rank: dados.rank }, transaction });
      if (conflito) throw erro(`Já existe um Boss cadastrado pro rank ${dados.rank}.`);
    }
    const dadosAntes = boss.toJSON();
    await boss.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "GuildBossConfig",
      idEntidade: boss.id,
      dadosAntes,
      dadosDepois: boss.toJSON(),
      req,
      transaction,
    });
    return boss;
  });
}

module.exports = {
  listarNiveis,
  upsertNivel,
  listarBosses,
  criarBoss,
  atualizarBoss,
};
