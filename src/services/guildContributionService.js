// Contribuição do membro — spec "Aprimoramento do Sistema de Guildas"
// §43/§44: contribuicao_total deixa de ser quase só Gold doado e passa
// a somar PONTOS de Missões da Guilda + Boss + Doação normalizada.
// Um ponto de entrada só (`pontuarContribuicao`) usado por quem quer
// que seja — guildMissionService, guildBossService, guildController.doar
// — pra nunca duplicar a lógica de "achar ou criar a linha e somar".
//
// Contribuição V2 (spec "Tesouro da Guilda V2 + Contribuição V2" §15) —
// além de somar em GuildContribution (mantido como legado histórico),
// toda chamada agora grava um GuildContributionEvent imutável, fonte
// real do ranking semanal/mensal/histórico por AGREGAÇÃO (§16: nunca
// um scheduler que zera contador).
const { Op } = require("sequelize");
const GuildContribution = require("../models/GuildContribution");
const GuildContributionEvent = require("../models/GuildContributionEvent");
const { PONTOS_CONTRIBUICAO, inicioDoCicloSemanal } = require("../config/guildConfig");

// `origem` é obrigatório pra todo chamador NOVO (sourceType entre os
// valores do ENUM GuildContributionEvent.source_type) — só fica
// opcional na assinatura por retrocompatibilidade de chamada antiga sem
// quebrar import nenhum; nenhum chamador real deste código deve omitir.
async function pontuarContribuicao(idGuild, idPersonagem, pontos, transaction, origem = {}) {
  if (!(pontos > 0)) return;

  const [contribuicao] = await GuildContribution.findOrCreate({
    where: { id_guild: idGuild, id_personagem: idPersonagem },
    defaults: {},
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });

  contribuicao.contribuicao_total += pontos;
  contribuicao.contribuicao_temporada += pontos;
  await contribuicao.save({ transaction });

  const { sourceType, sourceId = null, metadata = null } = origem;
  if (sourceType) {
    await GuildContributionEvent.create(
      { id_guild: idGuild, id_personagem: idPersonagem, source_type: sourceType, source_id: sourceId, pontos, metadata },
      { transaction },
    );
  }
}

// §44 — doação normalizada (não Gold cru), com teto por doação.
function pontosPorDoacao(valorOuro) {
  return Math.min(
    Math.floor(valorOuro * PONTOS_CONTRIBUICAO.DoacaoPorOuro),
    PONTOS_CONTRIBUICAO.DoacaoTetoPorDoacao,
  );
}

// §17.1 — teto SEMANAL de pontos vindos só de GOLD_DONATION (proteção
// contra "comprar atividade"). Soma os eventos dessa fonte já creditados
// no ciclo semanal atual e devolve quantos pontos ainda cabem — o
// chamador (guildController.doar) usa isso pra limitar o quanto passa
// pra pontuarContribuicao, nunca o Gold em si (ouro_doado_total e o
// Tesouro continuam crescendo normalmente acima do teto).
async function pontosDoacaoDisponiveisNaSemana(idGuild, idPersonagem, transaction) {
  const inicio = new Date(inicioDoCicloSemanal());
  const jaPontuado = await GuildContributionEvent.sum("pontos", {
    where: {
      id_guild: idGuild,
      id_personagem: idPersonagem,
      source_type: "GOLD_DONATION",
      createdAt: { [Op.gte]: inicio },
    },
    transaction,
  });
  return Math.max(0, PONTOS_CONTRIBUICAO.DoacaoTetoPontosSemanal - (jaPontuado ?? 0));
}

module.exports = { pontuarContribuicao, pontosPorDoacao, pontosDoacaoDisponiveisNaSemana };
