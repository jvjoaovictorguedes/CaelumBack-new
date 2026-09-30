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
const GuildBossAbility = require("../models/GuildBossAbility");
const Power = require("../models/Power");
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

// ---------------------------------------------- HABILIDADES DO BOSS DA GUILDA
// Pedido do dono do projeto: "igual no boss mundial, a mesma criação do
// boss mundial é para ser feita no boss da guilda" — mesmo padrão de
// WorldBossAbility (vínculo Boss -> Power reutilizado, nunca duplica
// dano/cura/custo/cooldown aqui). Sem fases_permitidas/escala_com_furia/
// custo_mana_override (Boss da Guilda não tem fases nem mana) e sem
// N_ALEATORIOS (grupo pequeno — TODOS já cobre o caso de AoE).
const CAMPOS_HABILIDADE_BOSS = ["id_power", "peso_uso", "prioridade", "tipo_alvo", "tempo_conjuracao_ms", "cooldown_rodadas_override", "ativo"];
const TIPOS_ALVO_HABILIDADE_BOSS = ["ALEATORIO", "MENOR_VIDA", "TODOS"];

function validarHabilidadeBossPayload(dados, { parcial = false } = {}) {
  if (!parcial || dados.id_power !== undefined) {
    if (!Number.isInteger(dados.id_power)) throw erro("id_power é obrigatório.");
  }
  if (!parcial || dados.tipo_alvo !== undefined) {
    if (!TIPOS_ALVO_HABILIDADE_BOSS.includes(dados.tipo_alvo)) {
      throw erro(`tipo_alvo precisa ser um de: ${TIPOS_ALVO_HABILIDADE_BOSS.join(", ")}.`);
    }
  }
  if (dados.peso_uso !== undefined && (!Number.isInteger(dados.peso_uso) || dados.peso_uso < 0)) {
    throw erro("peso_uso precisa ser um inteiro >= 0.");
  }
  if (dados.prioridade !== undefined && !Number.isInteger(dados.prioridade)) {
    throw erro("prioridade precisa ser um inteiro.");
  }
  if (dados.tempo_conjuracao_ms !== undefined && (!Number.isInteger(dados.tempo_conjuracao_ms) || dados.tempo_conjuracao_ms < 0)) {
    throw erro("tempo_conjuracao_ms precisa ser um inteiro >= 0.");
  }
  if (dados.cooldown_rodadas_override !== undefined && dados.cooldown_rodadas_override !== null) {
    if (!Number.isInteger(dados.cooldown_rodadas_override) || dados.cooldown_rodadas_override < 0) {
      throw erro("cooldown_rodadas_override precisa ser um inteiro >= 0 (ou null pra usar o cooldown do Power).");
    }
  }
}

async function listarHabilidadesBoss(idGuildBossConfig) {
  const where = {};
  if (idGuildBossConfig) where.id_guild_boss_config = idGuildBossConfig;
  return GuildBossAbility.findAll({
    where,
    include: [{ model: Power, attributes: ["id", "nome", "imagem_url", "tipo_dano", "dano_base", "cura_base", "custo_mana", "cooldown"] }],
    order: [["prioridade", "DESC"]],
  });
}

async function criarHabilidadeBoss(idGuildBossConfig, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_HABILIDADE_BOSS);
  validarHabilidadeBossPayload(dados);

  return sequelize.transaction(async (transaction) => {
    const boss = await GuildBossConfig.findByPk(idGuildBossConfig, { transaction });
    if (!boss) throw erro("Boss da Guilda não encontrado.", 404);
    const power = await Power.findByPk(dados.id_power, { transaction });
    if (!power) throw erro("Power não encontrado.", 404);

    const habilidade = await GuildBossAbility.create(
      { id_guild_boss_config: idGuildBossConfig, peso_uso: 1, prioridade: 0, tempo_conjuracao_ms: 0, ativo: true, ...dados },
      { transaction },
    );
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "GuildBossAbility",
      idEntidade: habilidade.id,
      dadosAntes: null,
      dadosDepois: habilidade.toJSON(),
      req,
      transaction,
    });
    return habilidade;
  });
}

async function atualizarHabilidadeBoss(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_HABILIDADE_BOSS);
  validarHabilidadeBossPayload(dados, { parcial: true });

  return sequelize.transaction(async (transaction) => {
    const habilidade = await GuildBossAbility.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!habilidade) throw erro("Habilidade do Boss da Guilda não encontrada.", 404);
    if (dados.id_power !== undefined) {
      const power = await Power.findByPk(dados.id_power, { transaction });
      if (!power) throw erro("Power não encontrado.", 404);
    }
    const dadosAntes = habilidade.toJSON();
    await habilidade.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "GuildBossAbility",
      idEntidade: habilidade.id,
      dadosAntes,
      dadosDepois: habilidade.toJSON(),
      req,
      transaction,
    });
    return habilidade;
  });
}

async function excluirHabilidadeBoss(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const habilidade = await GuildBossAbility.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!habilidade) throw erro("Habilidade do Boss da Guilda não encontrada.", 404);
    const dadosAntes = habilidade.toJSON();
    await habilidade.destroy({ transaction });
    await registrarAcao({
      idAdmin,
      acao: "excluir",
      entidade: "GuildBossAbility",
      idEntidade: id,
      dadosAntes,
      dadosDepois: null,
      req,
      transaction,
    });
    return { id };
  });
}

module.exports = {
  listarNiveis,
  upsertNivel,
  listarBosses,
  criarBoss,
  atualizarBoss,
  listarHabilidadesBoss,
  criarHabilidadeBoss,
  atualizarHabilidadeBoss,
  excluirHabilidadeBoss,
};
