// Provação de promoção (§28-§31 da spec) — missão especial só
// alcançável quando apto_para_promocao=true, nunca uma missão genérica
// do pool normal. Reaproveita o MESMO sistema de objetivo/progresso dos
// contratos normais (registrarProgressoContrato/entregarItens já tratam
// qualquer contrato Ativo, Provação incluída) — só o início/falha são
// específicos daqui.
const CharacterAdventureGuildProgress = require("../models/CharacterAdventureGuildProgress");
const CharacterAdventureGuildContract = require("../models/CharacterAdventureGuildContract");
const AdventureGuildMission = require("../models/AdventureGuildMission");
const AdventureGuildMissionReward = require("../models/AdventureGuildMissionReward");
const Item = require("../models/Item");
const { obterOuCriarProgresso } = require("./adventureGuildProgressionService");
const { COOLDOWN_PROVACAO_MS } = require("../config/adventureGuildConfig");

function erroGuilda(statusCode, mensagem) {
  return Object.assign(new Error(mensagem), { statusCode });
}

async function obterProvacaoAtiva(idPersonagem, transaction) {
  return CharacterAdventureGuildContract.findOne({
    where: { id_personagem: idPersonagem, eh_provacao: true, status: "Ativo" },
    include: [
      {
        model: AdventureGuildMission,
        as: "missao",
        include: [{ model: AdventureGuildMissionReward, as: "recompensas", include: [{ model: Item, as: "item" }] }],
      },
    ],
    transaction,
  });
}

async function iniciarProvacao(idPersonagem, transaction) {
  const progresso = await obterOuCriarProgresso(idPersonagem, transaction);
  await progresso.reload({ transaction, lock: transaction.LOCK.UPDATE });

  if (!progresso.apto_para_promocao) {
    throw erroGuilda(403, "Você ainda não atingiu os requisitos deste Rank.");
  }

  if (progresso.ultima_falha_provacao_em) {
    const liberadaEm = progresso.ultima_falha_provacao_em.getTime() + COOLDOWN_PROVACAO_MS;
    if (Date.now() < liberadaEm) {
      throw erroGuilda(429, "Você ainda está no cooldown depois de falhar a última Provação.");
    }
  }

  const jaAtiva = await obterProvacaoAtiva(idPersonagem, transaction);
  if (jaAtiva) throw erroGuilda(409, "Você já tem uma Provação em andamento.");

  const missaoProvacao = await AdventureGuildMission.findOne({
    where: { rank: progresso.rank, eh_provacao: true, ativa: true },
    transaction,
  });
  if (!missaoProvacao) {
    throw erroGuilda(500, `Provação do Rank ${progresso.rank} ainda não está configurada.`);
  }

  return CharacterAdventureGuildContract.create(
    {
      id_personagem: idPersonagem,
      id_offer: null,
      id_mission: missaoProvacao.id,
      eh_provacao: true,
      aceito_em: new Date(),
      expira_em: null,
    },
    { transaction },
  );
}

// §30 — falhar nunca reduz o contador já conquistado; só aplica o
// cooldown antes de poder tentar de novo.
async function falharProvacao(idPersonagem, transaction) {
  const contrato = await obterProvacaoAtiva(idPersonagem, transaction);
  if (!contrato) throw erroGuilda(404, "Você não tem uma Provação ativa.");

  contrato.status = "Falhou";
  await contrato.save({ transaction });

  const progresso = await CharacterAdventureGuildProgress.findOne({
    where: { id_personagem: idPersonagem },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  progresso.ultima_falha_provacao_em = new Date();
  await progresso.save({ transaction });

  return contrato;
}

module.exports = { obterProvacaoAtiva, iniciarProvacao, falharProvacao };
