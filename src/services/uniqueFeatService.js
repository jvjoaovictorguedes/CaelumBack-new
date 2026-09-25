// Sistema de Proezas Únicas §7/§8/§9 — contrato central:
//   check(triggerKey, context, { transaction, characterId, sourceEventId })
// Chamado pelo serviço de origem AUTORITATIVO, sempre dentro da MESMA
// transaction que já confirma o evento real (vitória de combate, coleta
// de craft, captura de peixe etc.) — nunca em leitura de tela/polling.
// NUNCA confia no frontend: quem decide se uma condição foi cumprida é
// sempre este serviço, a partir de um context montado no backend.
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const UniqueFeat = require("../models/UniqueFeat");
const UniqueFeatClaim = require("../models/UniqueFeatClaim");
const CharacterAbilities = require("../models/CharacterAbilities");
const CharacterAchievement = require("../models/CharacterAchievement");
const CharacterTitle = require("../models/CharacterTitle");
const triggerRegistry = require("./uniqueFeatTriggerRegistry");
const { triggerKeyValida } = require("../config/uniqueFeatConfig");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

// §8 — corrida entre jogadores: a condição "primeiro do servidor" torna
// concorrência parte da regra de negócio. Roda num SAVEPOINT (nunca a
// transaction do chamador inteira) porque a violação de UNIQUE é
// ESPERADA sempre que outra transação venceu primeiro — precisa poder
// "desfazer só esta tentativa" e deixar o resto do fluxo do chamador
// (XP, ouro, progresso etc.) seguir intacto e committar normalmente.
// sequelize.transaction({ transaction }, cb) cria um SAVEPOINT quando já
// existe uma transaction pai (suporte nativo do dialeto Postgres).
async function tryClaimAtomic({ feat, character, triggerKey, triggerSnapshot, sourceEventId }, { transaction }) {
  try {
    return await sequelize.transaction({ transaction }, async (savepoint) => {
      const claim = await UniqueFeatClaim.create(
        {
          id_unique_feat: feat.id,
          id_personagem: character.id,
          character_name_snapshot: character.nome,
          claimed_at: new Date(),
          trigger_key: triggerKey,
          trigger_snapshot: triggerSnapshot ?? {},
          source_event_id: sourceEventId ?? null,
        },
        { transaction: savepoint },
      );

      // §9 — nível 1, inativo, sem slot extra (o jogador ativa como
      // qualquer outro poder, respeitando o MESMO limite de habilidades
      // ativas). level_learned é só metadado histórico do nível do
      // personagem no momento do feito, nunca reavaliado depois.
      // NUNCA findOrCreate: se já existir uma linha aqui é corrupção/
      // grant manual anterior — a transaction (e o savepoint) devem
      // falhar de verdade, nunca esconder o problema (§8).
      await CharacterAbilities.create(
        {
          id_personagem: character.id,
          id_power: feat.id_power_reward,
          level_learned: character.nivel,
          is_active: false,
          nivel_habilidade: 1,
        },
        { transaction: savepoint },
      );

      // Achievement/Title são representação pública OPCIONAL do feito
      // (§2) — usa findOrCreate aqui (não CharacterAbilities) porque não
      // há problema em o personagem já ter essa Achievement/Title por
      // outro caminho legítimo; só a posse do Power é que precisa
      // detectar corrupção.
      if (feat.id_achievement_reward) {
        await CharacterAchievement.findOrCreate({
          where: { id_personagem: character.id, id_achievement: feat.id_achievement_reward },
          defaults: { desbloqueada_em: new Date() },
          transaction: savepoint,
        });
      }
      if (feat.id_title_reward) {
        await CharacterTitle.findOrCreate({
          where: { id_personagem: character.id, id_title: feat.id_title_reward },
          defaults: { desbloqueado_em: new Date() },
          transaction: savepoint,
        });
      }

      return { vencedor: true, claim };
    });
  } catch (error) {
    // Só a violação DESTA constraint específica (a UNIQUE de
    // id_unique_feat) é o resultado normal da corrida — "outra
    // transação já venceu esta Proeza" (§8). Qualquer OUTRA violação de
    // unicidade (ex.: CharacterAbilities já existir por corrupção/grant
    // manual anterior, ver §8) precisa propagar como erro de verdade;
    // tratar todo SequelizeUniqueConstraintError igual esconderia
    // exatamente o problema que a spec pede pra nunca esconder.
    if (error?.name === "SequelizeUniqueConstraintError" && error?.parent?.constraint === "unique_feat_claims_id_unique_feat_key") {
      return { vencedor: false, claim: null };
    }
    throw error;
  }
}

// §7 — avalia todas as Proezas ativas daquele trigger_key contra o
// context de um evento real e tenta reivindicar cada match. Retorna só
// as REALMENTE conquistadas NESTE evento (lista vazia é o caso comum:
// quase todo check() não bate condição nenhuma).
async function check(triggerKey, context, { transaction, characterId, sourceEventId } = {}) {
  if (!triggerKeyValida(triggerKey)) {
    throw erro(`trigger_key desconhecido: "${triggerKey}".`);
  }
  if (!transaction) {
    // §16 — toda integração roda dentro do MESMO fluxo/transaction que
    // já confirma o evento; check() sem transaction é sempre um erro de
    // uso, nunca um caminho válido de produção.
    throw erro("uniqueFeatService.check precisa rodar dentro de uma transaction.", 500);
  }
  if (!characterId) {
    throw erro("characterId é obrigatório para checar Proezas Únicas.", 500);
  }

  const feats = await UniqueFeat.findAll({
    where: { trigger_key: triggerKey, ativa: true },
    include: [{ association: "claim", required: false, attributes: ["id"] }],
    transaction,
  });
  if (feats.length === 0) return [];

  const character = await Character.findByPk(characterId, { transaction });
  if (!character) return [];

  const conquistadas = [];
  for (const feat of feats) {
    // eslint-disable-next-line no-continue -- pular Proezas já reivindicadas evita tentativa de INSERT à toa
    if (feat.claim) continue;
    if (!triggerRegistry.avaliar(triggerKey, feat.trigger_config, context)) continue;

    // eslint-disable-next-line no-await-in-loop -- cada tentativa depende do resultado da anterior via savepoint sequencial na mesma transaction
    const resultado = await tryClaimAtomic(
      { feat, character, triggerKey, triggerSnapshot: context, sourceEventId },
      { transaction },
    );
    if (resultado.vencedor) {
      conquistadas.push({ feat, claim: resultado.claim });
    }
  }
  return conquistadas;
}

module.exports = {
  check,
  tryClaimAtomic,
};
