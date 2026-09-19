// Contribuição do membro — spec "Aprimoramento do Sistema de Guildas"
// §43/§44: contribuicao_total deixa de ser quase só Gold doado e passa
// a somar PONTOS de Missões da Guilda + Boss + Doação normalizada.
// Um ponto de entrada só (`pontuarContribuicao`) usado por quem quer
// que seja — guildMissionService, guildBossService, guildController.doar
// — pra nunca duplicar a lógica de "achar ou criar a linha e somar".
const GuildContribution = require("../models/GuildContribution");
const { PONTOS_CONTRIBUICAO } = require("../config/guildConfig");

async function pontuarContribuicao(idGuild, idPersonagem, pontos, transaction) {
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
}

// §44 — doação normalizada (não Gold cru), com teto por doação.
function pontosPorDoacao(valorOuro) {
  return Math.min(
    Math.floor(valorOuro * PONTOS_CONTRIBUICAO.DoacaoPorOuro),
    PONTOS_CONTRIBUICAO.DoacaoTetoPorDoacao,
  );
}

module.exports = { pontuarContribuicao, pontosPorDoacao };
