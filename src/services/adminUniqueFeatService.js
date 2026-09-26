// Painel Administrativo — Sistema de Proezas Únicas §19 (Proezas /
// Legados / Triggers / Histórico e Reparos). Segue o mesmo padrão dos
// demais módulos de conteúdo (Forja, Itens): validação fora da
// transaction quando possível, tudo-ou-nada quando cria Power+Proeza
// juntos, adminAuditService em toda mutação sensível.
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const UniqueFeat = require("../models/UniqueFeat");
const UniqueFeatClaim = require("../models/UniqueFeatClaim");
const UniquePowerEffect = require("../models/UniquePowerEffect");
const Power = require("../models/Power");
const Achievement = require("../models/Achievement");
const Title = require("../models/Title");
const Character = require("../models/Character");
const CharacterAbilities = require("../models/CharacterAbilities");
const CharacterAchievement = require("../models/CharacterAchievement");
const CharacterTitle = require("../models/CharacterTitle");
const { registrarAcao } = require("./adminAuditService");
const {
  TRIGGER_KEYS,
  VISIBILITY_BEFORE_CLAIM,
  REVEAL_AFTER_CLAIM,
  POWER_EFFECT_CONTEXT_COLUMNS,
} = require("../config/uniqueFeatConfig");
const { validarTriggerConfig, schemaDoTrigger, SCHEMA_POR_TRIGGER } = require("./uniqueFeatTriggerRegistry");
const uniquePowerEffectRegistry = require("./uniquePowerEffectRegistry");

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

const CAMPOS_POWER_NOVO = ["nome", "descricao", "tipo_poder", "custo_mana", "dano_base", "cura_base", "cooldown", "escala_atributo", "valor_escala", "imagem_url"];
const ATRIBUTOS_VALIDOS = ["Forca", "Vitalidade", "Agilidade", "Inteligencia", "Velocidade"];

const CAMPOS_FEAT = [
  "nome",
  "key",
  "descricao_publica",
  "descricao_secreta_admin",
  "icone_url",
  "categoria",
  "trigger_key",
  "trigger_config",
  "id_achievement_reward",
  "id_title_reward",
  "visibility_before_claim",
  "reveal_after_claim",
  "announce_global",
];

function validarCamposFeat(dados, { exigirObrigatorios }) {
  if (exigirObrigatorios) {
    if (!dados.nome) throw erro("nome é obrigatório.");
    if (!dados.key) throw erro("key é obrigatória.");
    if (!dados.descricao_publica) throw erro("descricao_publica é obrigatória.");
    if (!dados.descricao_secreta_admin) throw erro("descricao_secreta_admin é obrigatória — explica ao admin a condição real.");
    if (!dados.trigger_key) throw erro("trigger_key é obrigatório.");
  }
  if (dados.trigger_key && !TRIGGER_KEYS.includes(dados.trigger_key)) {
    throw erro(`trigger_key desconhecido. Válidos: ${TRIGGER_KEYS.join(", ")}.`);
  }
  if (dados.trigger_key && dados.trigger_config) {
    validarTriggerConfig(dados.trigger_key, dados.trigger_config); // lança se inválido
  }
  if (dados.visibility_before_claim && !VISIBILITY_BEFORE_CLAIM.includes(dados.visibility_before_claim)) {
    throw erro(`visibility_before_claim precisa ser um de: ${VISIBILITY_BEFORE_CLAIM.join(", ")}.`);
  }
  if (dados.reveal_after_claim && !REVEAL_AFTER_CLAIM.includes(dados.reveal_after_claim)) {
    throw erro(`reveal_after_claim precisa ser um de: ${REVEAL_AFTER_CLAIM.join(", ")}.`);
  }
}

// ------------------------------------------------------- 19.1 PROEZAS

async function listAdminUniqueFeats({ nome, trigger_key, ativa, conquistada, categoria } = {}) {
  const where = {};
  if (nome) where.nome = { [Op.iLike]: `%${nome}%` };
  if (trigger_key) where.trigger_key = trigger_key;
  if (ativa !== undefined && ativa !== "") where.ativa = ativa === true || ativa === "true";
  if (categoria) where.categoria = categoria;

  const feats = await UniqueFeat.findAll({
    where,
    include: [
      { model: UniqueFeatClaim, as: "claim", required: false },
      { model: Power, as: "powerRecompensa", attributes: ["id", "nome", "acquisition_scope"] },
    ],
    order: [["id", "ASC"]],
  });

  const filtrados =
    conquistada === undefined || conquistada === ""
      ? feats
      : feats.filter((f) => Boolean(f.claim) === (conquistada === true || conquistada === "true"));

  return filtrados;
}

async function obterAdminUniqueFeat(id) {
  const feat = await UniqueFeat.findByPk(id, {
    include: [
      { model: UniqueFeatClaim, as: "claim" },
      { model: Power, as: "powerRecompensa" },
      { model: Achievement, as: "achievementRecompensa" },
      { model: Title, as: "titleRecompensa" },
    ],
  });
  if (!feat) throw erro("Proeza não encontrada.", 404);
  return feat;
}

// Cria a Proeza e (quando `novo_power` é enviado em vez de
// `id_power_reward`) o Power exclusivo junto, na MESMA transaction —
// nunca client-settable acquisition_scope: sempre forçado aqui,
// nunca aceito do payload (§9: Legado nunca entra por fonte comum).
async function createAdminUniqueFeat(payload, { idAdmin, req } = {}) {
  const dados = somenteCampos(payload, CAMPOS_FEAT);
  validarCamposFeat(dados, { exigirObrigatorios: true });
  if (!payload.id_power_reward && !payload.novo_power) {
    throw erro("Envie id_power_reward (Power existente já UNIQUE_FEAT) ou novo_power (cria um Legado novo).");
  }

  return sequelize.transaction(async (transaction) => {
    let idPowerReward = payload.id_power_reward ? Number(payload.id_power_reward) : null;

    if (idPowerReward) {
      const powerExistente = await Power.findByPk(idPowerReward, { transaction });
      if (!powerExistente) throw erro("Power selecionado não encontrado.", 404);
      if (powerExistente.acquisition_scope !== "UNIQUE_FEAT") {
        throw erro("O Power selecionado precisa ter acquisition_scope=UNIQUE_FEAT (marque-o como Legado antes, ou crie um novo aqui).");
      }
    } else {
      const dadosPower = somenteCampos(payload.novo_power, CAMPOS_POWER_NOVO);
      if (!dadosPower.nome) throw erro("novo_power.nome é obrigatório.");
      if (!dadosPower.tipo_poder) throw erro("novo_power.tipo_poder é obrigatório.");
      if (!dadosPower.descricao) throw erro("novo_power.descricao é obrigatória.");
      if (!dadosPower.escala_atributo || !ATRIBUTOS_VALIDOS.includes(dadosPower.escala_atributo)) {
        throw erro(`novo_power.escala_atributo precisa ser um de: ${ATRIBUTOS_VALIDOS.join(", ")}.`);
      }
      const powerCriado = await Power.create({ ...dadosPower, acquisition_scope: "UNIQUE_FEAT" }, { transaction });
      idPowerReward = powerCriado.id;
    }

    const feat = await UniqueFeat.create({ ...dados, id_power_reward: idPowerReward, ativa: false }, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "UniqueFeat",
      idEntidade: feat.id,
      dadosDepois: feat.toJSON(),
      req,
      transaction,
    });
    return feat;
  });
}

async function updateAdminUniqueFeat(id, payload, { idAdmin, req } = {}) {
  const dados = somenteCampos(payload, CAMPOS_FEAT);
  validarCamposFeat(dados, { exigirObrigatorios: false });

  return sequelize.transaction(async (transaction) => {
    const feat = await UniqueFeat.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!feat) throw erro("Proeza não encontrada.", 404);

    // §19.1 — editar Proeza já conquistada nunca troca o vencedor (a
    // claim é intocada aqui); o "banner de risco" é responsabilidade
    // do frontend, mas o backend garante que trigger_key/trigger_config
    // continuam validados normalmente mesmo assim.
    const antes = feat.toJSON();
    await feat.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "UniqueFeat",
      idEntidade: feat.id,
      dadosAntes: antes,
      dadosDepois: feat.toJSON(),
      req,
      transaction,
    });
    return feat;
  });
}

// §19.1 — duplicar gera key nova e NUNCA copia claim (a cópia nasce
// sempre inativa e sem vencedor). id_power_reward é UNIQUE em UniqueFeat
// (um Legado pertence a UMA Proeza só) — duplicar precisa duplicar o
// Power também (mesmo padrão de adminPowerService.duplicateAdminPower),
// nunca reaproveitar o id_power_reward original.
async function duplicateAdminUniqueFeat(id, { idAdmin, req } = {}) {
  return sequelize.transaction(async (transaction) => {
    const original = await UniqueFeat.findByPk(id, { transaction });
    if (!original) throw erro("Proeza não encontrada.", 404);

    const powerOriginal = await Power.findByPk(original.id_power_reward, { transaction });
    if (!powerOriginal) throw erro("Power original do Legado não encontrado.", 500);
    const dadosPower = somenteCampos(powerOriginal.toJSON(), CAMPOS_POWER_NOVO);
    dadosPower.nome = `${powerOriginal.nome} (cópia)`;
    const powerCopia = await Power.create({ ...dadosPower, acquisition_scope: "UNIQUE_FEAT" }, { transaction });

    const dados = somenteCampos(original.toJSON(), CAMPOS_FEAT);
    dados.key = `${original.key}_copia_${Date.now()}`;
    dados.nome = `${original.nome} (cópia)`;

    const copia = await UniqueFeat.create(
      { ...dados, id_power_reward: powerCopia.id, ativa: false },
      { transaction },
    );
    await registrarAcao({
      idAdmin,
      acao: "duplicar",
      entidade: "UniqueFeat",
      idEntidade: copia.id,
      dadosAntes: { origemId: original.id },
      dadosDepois: copia.toJSON(),
      req,
      transaction,
    });
    return copia;
  });
}

async function setAtivoAdminUniqueFeat(id, ativo, { idAdmin, req, motivo } = {}) {
  return sequelize.transaction(async (transaction) => {
    const feat = await UniqueFeat.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!feat) throw erro("Proeza não encontrada.", 404);
    // Consulta separada (nunca no mesmo SELECT ... FOR UPDATE do feat
    // acima): Postgres rejeita "FOR UPDATE" numa query com LEFT OUTER
    // JOIN pro lado nullable (claim pode não existir).
    const claimExistente = await UniqueFeatClaim.findOne({ where: { id_unique_feat: id }, transaction });

    // §19.4/§19.5 — motivo obrigatório pra desativar uma Proeza JÁ
    // conquistada (desativar impede novos claims, nunca remove o já
    // existente — §21).
    if (!ativo && claimExistente && !motivo?.trim()) {
      throw erro("motivo é obrigatório para desativar uma Proeza já conquistada.");
    }

    const antes = feat.toJSON();
    feat.ativa = ativo;
    await feat.save({ transaction });
    await registrarAcao({
      idAdmin,
      acao: ativo ? "reativar" : "desativar",
      entidade: "UniqueFeat",
      idEntidade: feat.id,
      dadosAntes: antes,
      dadosDepois: feat.toJSON(),
      motivo: motivo ?? null,
      req,
      transaction,
    });
    return feat;
  });
}

// ------------------------------------------------------- 19.2 LEGADOS

async function getUniquePowerEffect(idPower) {
  const power = await Power.findByPk(idPower);
  if (!power) throw erro("Power não encontrado.", 404);
  if (power.acquisition_scope !== "UNIQUE_FEAT") throw erro("Esse Power não é um Legado (acquisition_scope != UNIQUE_FEAT).", 400);
  const efeito = await UniquePowerEffect.findOne({ where: { id_power: idPower } });
  const jogadoresAfetados = await CharacterAbilities.count({ where: { id_power: idPower } });
  return { power, efeito, jogadoresAfetados };
}

const CAMPOS_EFEITO = ["effect_key", "config", "allow_pve", "allow_party", "allow_guild_boss", "allow_world_boss", "allow_pvp_casual", "allow_ranked", "allow_tournament", "ativo"];

async function upsertUniquePowerEffect(idPower, payload, { idAdmin, req } = {}) {
  const dados = somenteCampos(payload, CAMPOS_EFEITO);
  return sequelize.transaction(async (transaction) => {
    const power = await Power.findByPk(idPower, { transaction });
    if (!power) throw erro("Power não encontrado.", 404);
    if (power.acquisition_scope !== "UNIQUE_FEAT") throw erro("Esse Power não é um Legado (acquisition_scope != UNIQUE_FEAT).", 400);

    if (dados.effect_key && !uniquePowerEffectRegistry.efeitoConhecido(dados.effect_key)) {
      // §10 — sem handler concreto ainda (Fase de Conteúdo), mas a
      // config em si continua tendo que ser um objeto — nunca eval.
      if (dados.config !== undefined && (typeof dados.config !== "object" || dados.config === null || Array.isArray(dados.config))) {
        throw erro("config precisa ser um objeto.");
      }
    } else if (dados.effect_key && dados.config !== undefined) {
      uniquePowerEffectRegistry.validarConfig(dados.effect_key, dados.config); // lança se inválido
    }

    const [efeito] = await UniquePowerEffect.findOrCreate({
      where: { id_power: idPower },
      defaults: { id_power: idPower, effect_key: dados.effect_key ?? "indefinido", config: dados.config ?? {} },
      transaction,
    });
    const antes = efeito.toJSON();
    await efeito.update(dados, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "editar-legado",
      entidade: "UniquePowerEffect",
      idEntidade: efeito.id,
      dadosAntes: antes,
      dadosDepois: efeito.toJSON(),
      req,
      transaction,
    });
    return efeito;
  });
}

// ------------------------------------------------------ 19.3 TRIGGERS

// Só leitura — nunca aceita trigger_key/config vindos daqui pra
// persistir nada (isso acontece em create/updateAdminUniqueFeat).
function listarTriggerSchemas() {
  return TRIGGER_KEYS.map((chave) => ({ trigger_key: chave, schema: SCHEMA_POR_TRIGGER[chave] }));
}

function obterTriggerSchema(triggerKey) {
  const schema = schemaDoTrigger(triggerKey);
  if (!schema) throw erro(`trigger_key desconhecido: "${triggerKey}".`, 404);
  return { trigger_key: triggerKey, schema };
}

// "Validar configuração" (§19.3) — só validação estrutural, nunca
// revela quem está perto de cumprir (não roda avaliar() contra
// personagem nenhum).
function validarConfiguracaoDeTrigger(triggerKey, config) {
  validarTriggerConfig(triggerKey, config ?? {});
  return { valido: true };
}

// -------------------------------------------------- 19.4 HISTÓRICO/REPARO

async function listAdminClaims({ idPersonagem, trigger_key, status } = {}) {
  const where = {};
  if (idPersonagem) where.id_personagem = idPersonagem;
  if (trigger_key) where.trigger_key = trigger_key;
  if (status) where.status = status;

  return UniqueFeatClaim.findAll({
    where,
    include: [
      { model: UniqueFeat, as: "proeza", attributes: ["id", "key", "nome", "id_power_reward"] },
      { model: Character, as: "personagem", attributes: ["id", "nome"], required: false },
    ],
    order: [["claimed_at", "DESC"]],
  });
}

// Revoga uma claim (exploit/bug comprovado — §21/§29): marca REVOKED e
// remove SÓ o grant mecânico (CharacterAbilities). Nunca deleta a
// linha (preserva histórico) e nunca reabre a Proeza pra reclaim — a
// UNIQUE em id_unique_feat continua valendo mesmo pra uma claim
// REVOKED de propósito (§8: nunca existe "reset operacional comum").
async function revogarClaim(idClaim, { motivo, idAdmin, req } = {}) {
  if (!motivo?.trim()) throw erro("motivo é obrigatório para revogar uma claim.");

  return sequelize.transaction(async (transaction) => {
    const claim = await UniqueFeatClaim.findByPk(idClaim, { transaction, lock: transaction.LOCK.UPDATE });
    if (!claim) throw erro("Claim não encontrada.", 404);
    if (claim.status === "REVOKED") throw erro("Essa claim já está revogada.", 400);

    const feat = await UniqueFeat.findByPk(claim.id_unique_feat, { transaction });
    const antes = claim.toJSON();

    if (claim.id_personagem) {
      await CharacterAbilities.destroy({
        where: { id_personagem: claim.id_personagem, id_power: feat.id_power_reward },
        transaction,
      });
    }

    claim.status = "REVOKED";
    claim.repair_metadata = { ...(claim.repair_metadata ?? {}), revogado_em: new Date(), revogado_por: idAdmin, motivo };
    await claim.save({ transaction });

    await registrarAcao({
      idAdmin,
      acao: "revogar-claim",
      entidade: "UniqueFeatClaim",
      idEntidade: claim.id,
      dadosAntes: antes,
      dadosDepois: claim.toJSON(),
      motivo,
      req,
      transaction,
    });
    return claim;
  });
}

// Transfere o Legado pra outro personagem (§19.4): atualiza a claim +
// remove/adiciona CharacterAbilities + Achievement/Title correlatos,
// tudo na MESMA transaction.
async function transferirClaim(idClaim, { idPersonagemNovo, motivo, idAdmin, req } = {}) {
  if (!motivo?.trim()) throw erro("motivo é obrigatório para transferir uma claim.");
  if (!idPersonagemNovo) throw erro("idPersonagemNovo é obrigatório.");

  return sequelize.transaction(async (transaction) => {
    const claim = await UniqueFeatClaim.findByPk(idClaim, { transaction, lock: transaction.LOCK.UPDATE });
    if (!claim) throw erro("Claim não encontrada.", 404);
    if (claim.status !== "VALID") throw erro("Só é possível transferir uma claim VALID.", 400);

    const novoPersonagem = await Character.findByPk(idPersonagemNovo, { transaction });
    if (!novoPersonagem) throw erro("Personagem de destino não encontrado.", 404);

    const feat = await UniqueFeat.findByPk(claim.id_unique_feat, { transaction });
    const antigoPersonagemId = claim.id_personagem;
    const antes = claim.toJSON();

    if (antigoPersonagemId) {
      await CharacterAbilities.destroy({ where: { id_personagem: antigoPersonagemId, id_power: feat.id_power_reward }, transaction });
      if (feat.id_achievement_reward) {
        await CharacterAchievement.destroy({ where: { id_personagem: antigoPersonagemId, id_achievement: feat.id_achievement_reward }, transaction });
      }
      if (feat.id_title_reward) {
        await CharacterTitle.destroy({ where: { id_personagem: antigoPersonagemId, id_title: feat.id_title_reward }, transaction });
      }
    }

    await CharacterAbilities.create(
      { id_personagem: idPersonagemNovo, id_power: feat.id_power_reward, level_learned: novoPersonagem.nivel, is_active: false, nivel_habilidade: 1 },
      { transaction },
    );
    if (feat.id_achievement_reward) {
      await CharacterAchievement.findOrCreate({
        where: { id_personagem: idPersonagemNovo, id_achievement: feat.id_achievement_reward },
        defaults: { desbloqueada_em: new Date() },
        transaction,
      });
    }
    if (feat.id_title_reward) {
      await CharacterTitle.findOrCreate({
        where: { id_personagem: idPersonagemNovo, id_title: feat.id_title_reward },
        defaults: { desbloqueado_em: new Date() },
        transaction,
      });
    }

    claim.id_personagem = idPersonagemNovo;
    claim.character_name_snapshot = novoPersonagem.nome;
    claim.repair_metadata = { ...(claim.repair_metadata ?? {}), transferido_em: new Date(), transferido_de: antigoPersonagemId, transferido_por: idAdmin, motivo };
    await claim.save({ transaction });

    await registrarAcao({
      idAdmin,
      acao: "transferir-claim",
      entidade: "UniqueFeatClaim",
      idEntidade: claim.id,
      dadosAntes: antes,
      dadosDepois: claim.toJSON(),
      motivo,
      req,
      transaction,
    });
    return claim;
  });
}

module.exports = {
  listAdminUniqueFeats,
  obterAdminUniqueFeat,
  createAdminUniqueFeat,
  updateAdminUniqueFeat,
  duplicateAdminUniqueFeat,
  setAtivoAdminUniqueFeat,
  getUniquePowerEffect,
  upsertUniquePowerEffect,
  listarTriggerSchemas,
  obterTriggerSchema,
  validarConfiguracaoDeTrigger,
  listAdminClaims,
  revogarClaim,
  transferirClaim,
  POWER_EFFECT_CONTEXT_COLUMNS,
};
