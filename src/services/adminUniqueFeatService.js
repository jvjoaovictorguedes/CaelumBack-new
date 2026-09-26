// Painel Administrativo — Proezas Únicas ("Habilidade Única" + "Proeza
// Única" pedidas junto com a ampliação de Premiações): até agora este
// sistema (uniqueFeatService.js) só existia no schema/backend — não
// havia NENHUM jeito de cadastrar uma Proeza Única real pelo painel, só
// via migration/seed manual. Este service cobre o catálogo (criar/
// editar/listar) e a concessão manual (grantToCharacter), sempre
// reaproveitando os mesmos invariantes já documentados em Power.js/
// UniqueFeat.js/uniqueFeatService.js — nunca duplicando a lógica de
// concessão atômica.
const { sequelize } = require("../config/database");
const Power = require("../models/Power");
const UniqueFeat = require("../models/UniqueFeat");
const Character = require("../models/Character");
const { triggerKeyValida, TRIGGER_KEYS } = require("../config/uniqueFeatConfig");
const { tryClaimAtomic } = require("./uniqueFeatService");
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

const CAMPOS_POWER = ["nome", "descricao", "tipo_poder", "custo_mana", "dano_base", "cura_base", "cooldown", "escala_atributo", "valor_escala", "imagem_url"];
const CAMPOS_FEAT_CRIACAO = [
  "key",
  "nome",
  "descricao_publica",
  "descricao_secreta_admin",
  "icone_url",
  "categoria",
  "trigger_key",
  "trigger_config",
  "visibility_before_claim",
  "reveal_after_claim",
  "announce_global",
];
// id_power_reward/trigger_key/key nunca mudam depois de criados — são a
// identidade estrutural da Proeza (mudar o gatilho ou a habilidade
// concedida depois de já existir claim seria reescrever o histórico).
const CAMPOS_FEAT_EDICAO = ["nome", "descricao_publica", "descricao_secreta_admin", "icone_url", "categoria", "visibility_before_claim", "reveal_after_claim", "announce_global", "ativa"];

function validarPower(dadosPower) {
  if (!dadosPower || typeof dadosPower !== "object") throw erro("Dados da Habilidade Única (power) são obrigatórios.");
  if (!dadosPower.nome || !dadosPower.nome.trim()) throw erro("Nome da Habilidade Única é obrigatório.");
  if (!dadosPower.descricao || !dadosPower.descricao.trim()) throw erro("Descrição da Habilidade Única é obrigatória.");
  if (!["Ativo", "Passivo"].includes(dadosPower.tipo_poder)) throw erro('tipo_poder precisa ser "Ativo" ou "Passivo".');
  if (!["Forca", "Vitalidade", "Agilidade", "Inteligencia", "Velocidade"].includes(dadosPower.escala_atributo)) {
    throw erro("escala_atributo inválido.");
  }
}

function validarFeat(dados) {
  if (!dados.key || !dados.key.trim()) throw erro('"key" é obrigatória (identificador técnico único da Proeza).');
  if (!dados.nome || !dados.nome.trim()) throw erro("Nome é obrigatório.");
  if (!dados.descricao_publica || !dados.descricao_publica.trim()) throw erro("Descrição pública é obrigatória.");
  if (!dados.descricao_secreta_admin || !dados.descricao_secreta_admin.trim()) throw erro("Descrição secreta (admin) é obrigatória.");
  if (!triggerKeyValida(dados.trigger_key)) {
    throw erro(`trigger_key precisa ser um dos valores válidos: ${TRIGGER_KEYS.join(", ")}.`);
  }
}

async function listAdminUniqueFeats() {
  return UniqueFeat.findAll({
    include: [
      { association: "claim" },
      { association: "powerRecompensa" },
    ],
    order: [["id", "DESC"]],
  });
}

// Cria a Habilidade Única (Power com acquisition_scope=UNIQUE_FEAT) e a
// Proeza Única que a concede, na MESMA transaction — nunca uma Proeza
// sem Power vinculado nem um Power UNIQUE_FEAT órfão de Proeza (ver
// unique de id_power_reward em UniqueFeat.js).
async function createAdminUniqueFeat(payload, { idAdmin, req }) {
  const dadosFeat = somenteCampos(payload, CAMPOS_FEAT_CRIACAO);
  validarFeat(dadosFeat);
  validarPower(payload.power);

  return sequelize.transaction(async (transaction) => {
    const power = await Power.create(
      { ...somenteCampos(payload.power, CAMPOS_POWER), acquisition_scope: "UNIQUE_FEAT" },
      { transaction },
    );

    const feat = await UniqueFeat.create(
      { ...dadosFeat, id_power_reward: power.id },
      { transaction },
    );

    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "UniqueFeat",
      idEntidade: feat.id,
      dadosDepois: { feat: feat.toJSON(), power: power.toJSON() },
      req,
      transaction,
    });

    return feat;
  });
}

async function updateAdminUniqueFeat(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_FEAT_EDICAO);

  return sequelize.transaction(async (transaction) => {
    const feat = await UniqueFeat.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!feat) throw erro("Proeza Única não encontrada.", 404);

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

// Concessão manual de uma Proeza Única (Admin Premiações) — reaproveita
// o MESMO claim atômico que o jogo usa quando o gatilho real acontece
// (uniqueFeatService.tryClaimAtomic): garante a mesma corrida de "um
// vencedor global" mesmo concedida manualmente, nunca um caminho
// paralelo que pudesse duplicar a Proeza.
async function grantUniqueFeatToCharacter(idFeat, idPersonagem, { idAdmin, req, motivo }) {
  if (!motivo || !motivo.trim()) {
    throw erro("motivo é obrigatório — toda concessão de Proeza fica registrada na auditoria com o porquê.");
  }

  return sequelize.transaction(async (transaction) => {
    const feat = await UniqueFeat.findByPk(idFeat, { transaction });
    if (!feat) throw erro("Proeza Única não encontrada.", 404);
    if (!feat.ativa) throw erro("Essa Proeza Única está inativa.", 400);

    const character = await Character.findByPk(idPersonagem, { transaction });
    if (!character) throw erro("Personagem não encontrado.", 404);

    const resultado = await tryClaimAtomic(
      {
        feat,
        character,
        triggerKey: feat.trigger_key,
        triggerSnapshot: { concedidoManualmente: true, motivo, idAdmin },
        sourceEventId: `admin_grant:${idAdmin}:${Date.now()}`,
      },
      { transaction },
    );

    if (!resultado.vencedor) {
      throw erro("Essa Proeza Única já foi conquistada por outro jogador — só existe um vencedor global.", 409);
    }

    await registrarAcao({
      idAdmin,
      acao: "conceder",
      entidade: "UniqueFeatClaim",
      idEntidade: resultado.claim.id,
      dadosDepois: { id_unique_feat: feat.id, id_personagem: character.id, nome_personagem: character.nome },
      motivo,
      req,
      transaction,
    });

    return resultado.claim;
  });
}

module.exports = {
  listAdminUniqueFeats,
  createAdminUniqueFeat,
  updateAdminUniqueFeat,
  grantUniqueFeatToCharacter,
};
