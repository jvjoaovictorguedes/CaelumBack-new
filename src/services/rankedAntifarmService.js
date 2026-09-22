// Anti-rematch da Arena Ranqueada v2 (§7).
//
// A v1 guardava histórico em memória porque o pareamento acontecia
// dentro do tick da fila e precisava ser síncrono. A v2 não tem fila: a
// seleção de oponente é assíncrona, roda uma vez por partida e já está
// dentro de uma requisição HTTP — então a validação passa a ser feita
// contra o histórico PERSISTIDO (ranked_matches), que é o único que
// sobrevive a restart e não pode ser zerado por quem quer farmar.
//
// Regra: no máximo RANKED_MAX_PARTIDAS_MESMO_OPONENTE_DIA partidas
// contra o MESMO oponente, por desafiante, por dia contábil. O bloqueio
// só vale enquanto existir alternativa — se o oponente bloqueado for o
// único candidato elegível, a seleção devolve "sem oponente" (§6) em
// vez de repetir o rematch.
const { Op, fn, col } = require("sequelize");
const RankedMatch = require("../models/RankedMatch");
const { RANKED_MAX_PARTIDAS_MESMO_OPONENTE_DIA } = require("../config/rankedConfig");
const { chaveDoDia } = require("./rankedDailyLimitService");

// Quantas partidas o desafiante já fez hoje contra cada oponente.
// Retorna Map<idOponente(Number), quantidade>.
async function partidasPorOponenteHoje(idDesafiante, { dateKey } = {}) {
  const chave = dateKey ?? chaveDoDia();

  const linhas = await RankedMatch.findAll({
    where: { id_jogador1: idDesafiante, date_key: chave },
    attributes: ["id_jogador2", [fn("COUNT", col("id")), "total"]],
    group: ["id_jogador2"],
    raw: true,
  });

  const mapa = new Map();
  for (const linha of linhas) {
    mapa.set(Number(linha.id_jogador2), Number(linha.total));
  }
  return mapa;
}

// Ids que NÃO podem ser sorteados hoje pra esse desafiante.
async function oponentesBloqueadosHoje(idDesafiante, { dateKey } = {}) {
  const mapa = await partidasPorOponenteHoje(idDesafiante, { dateKey });
  const bloqueados = [];
  for (const [idOponente, total] of mapa.entries()) {
    if (total >= RANKED_MAX_PARTIDAS_MESMO_OPONENTE_DIA) bloqueados.push(idOponente);
  }
  return bloqueados;
}

async function podeEnfrentar(idDesafiante, idOponente, { dateKey } = {}) {
  const chave = dateKey ?? chaveDoDia();
  const total = await RankedMatch.count({
    where: { id_jogador1: idDesafiante, id_jogador2: idOponente, date_key: chave },
  });
  return total < RANKED_MAX_PARTIDAS_MESMO_OPONENTE_DIA;
}

// Compat com chamadas antigas que passavam um par qualquer — mantida
// porque o duelo casual e testes legados podiam depender do nome.
async function rematchesConsecutivos(idDesafiante, idOponente) {
  return !(await podeEnfrentar(idDesafiante, idOponente));
}

// Partidas ranqueadas do desafiante no dia, independente de oponente
// (usado só em log/observabilidade §18).
async function partidasHoje(idDesafiante, { dateKey } = {}) {
  return RankedMatch.count({
    where: { id_jogador1: idDesafiante, date_key: dateKey ?? chaveDoDia(), id: { [Op.gt]: 0 } },
  });
}

module.exports = {
  partidasPorOponenteHoje,
  oponentesBloqueadosHoje,
  podeEnfrentar,
  rematchesConsecutivos,
  partidasHoje,
};
