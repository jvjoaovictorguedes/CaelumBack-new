// Regras de "antifarm" de PVP compartilhadas entre o duelo assíncrono
// (pvpController.js) e o duelo ao vivo (pvpLiveSocket.js) — antes cada
// caminho tinha sua própria noção (ou nenhuma) de cooldown, e o ao vivo
// nem checava o cooldown por personagem que o assíncrono já tinha.
//
// Duas proteções, cada uma cobrindo um exploit diferente:
// - Cooldown por DESAFIANTE: intervalo mínimo entre um duelo e o
//   próximo, qualquer que seja o alvo (já existia só no assíncrono).
// - Antifarm por PAR: mesmo respeitando o cooldown acima, nada impedia
//   duas contas combinadas (ou um alt) de se desafiarem repetidamente
//   uma à outra pra farmar ouro/XP sem risco real — aqui isso é limitado
//   por um cooldown mais longo entre confrontos do MESMO par e um teto
//   de confrontos entre o mesmo par numa janela de tempo.
const { Op } = require("sequelize");
const PvpStatus = require("../models/PvpStatus");
const PvpMatches = require("../models/PvpMatches");

const COOLDOWN_DESAFIO_SEGUNDOS = 10;
const COOLDOWN_MESMO_PAR_SEGUNDOS = 60;
const JANELA_ANTIFARM_MS = 24 * 60 * 60 * 1000;
const LIMITE_DUELOS_MESMO_PAR_NA_JANELA = 10;

// Retorna uma mensagem de erro se o personagem ainda está em cooldown
// desde seu último duelo (qualquer oponente), ou null se pode duelar.
async function verificarCooldownDesafiante(idDesafiante) {
  const status = await PvpStatus.findOne({ where: { id_personagem: idDesafiante } });
  if (!status?.ultima_batalha_dia) return null;

  const segundosDesdeUltima =
    (Date.now() - new Date(status.ultima_batalha_dia).getTime()) / 1000;
  if (segundosDesdeUltima < COOLDOWN_DESAFIO_SEGUNDOS) {
    return `Aguarde ${Math.ceil(COOLDOWN_DESAFIO_SEGUNDOS - segundosDesdeUltima)}s para duelar de novo.`;
  }
  return null;
}

// Retorna uma mensagem de erro se esse PAR de personagens já duelou
// recente ou frequente demais entre si, ou null se pode duelar.
async function verificarAntifarmPar(idA, idB) {
  const desde = new Date(Date.now() - JANELA_ANTIFARM_MS);
  const condicaoPar = {
    [Op.or]: [
      { id_vencedor: idA, id_perdedor: idB },
      { id_vencedor: idB, id_perdedor: idA },
    ],
  };

  const [ultimoConfronto, totalNaJanela] = await Promise.all([
    PvpMatches.findOne({ where: condicaoPar, order: [["tempo_final_combate", "DESC"]] }),
    PvpMatches.count({
      where: { ...condicaoPar, tempo_final_combate: { [Op.gte]: desde } },
    }),
  ]);

  if (ultimoConfronto?.tempo_final_combate) {
    const segundosDesdeUltimoPar =
      (Date.now() - new Date(ultimoConfronto.tempo_final_combate).getTime()) / 1000;
    if (segundosDesdeUltimoPar < COOLDOWN_MESMO_PAR_SEGUNDOS) {
      return `Aguarde ${Math.ceil(COOLDOWN_MESMO_PAR_SEGUNDOS - segundosDesdeUltimoPar)}s para duelar de novo contra esse oponente.`;
    }
  }

  if (totalNaJanela >= LIMITE_DUELOS_MESMO_PAR_NA_JANELA) {
    return "Limite de duelos contra esse mesmo oponente atingido por hoje. Desafie outro jogador.";
  }

  return null;
}

module.exports = {
  COOLDOWN_DESAFIO_SEGUNDOS,
  verificarCooldownDesafiante,
  verificarAntifarmPar,
};
