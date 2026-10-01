// Torneio da Pesca (versão enxuta — ver relatório final pro corte de
// escopo completo). Regra de pontuação escolhida: soma de
// weight_g * quality de cada captura feita DENTRO da janela do torneio
// (e dentro da zona, se o torneio tiver escopo de zona). Por quê essa
// regra e não "maior peixe único":
//   - "maior peixe único" é *mais* fácil de sortear/explorar num RNG de
//     peso (basta tentar até sair um outlier e parar) e não recompensa
//     jogar o evento inteiro;
//   - somar quality×peso de TODAS as capturas do período recompensa
//     volume + qualidade junto, então "pescar uma vez e sair" nunca
//     compete com quem jogou o evento inteiro — não há atalho de
//     "1 captura boa vale o torneio todo";
//   - é 100% materializado na leitura a partir de fishing_catch_records
//     (histórico imutável, spec §12.1) — nenhuma escrita nova, nenhuma
//     race condition nova.
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const FishingTournament = require("../models/FishingTournament");
const FishingTournamentEntry = require("../models/FishingTournamentEntry");
const FishingZone = require("../models/FishingZone");
const { TAMANHO_PAGINA_PADRAO } = require("../config/rankingConfig");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

// Ideia #1 da fila de melhorias — inscrição explícita, aberta desde a
// criação do torneio até o instante em que ele começa (inicia_em).
// Depois disso fecha: nem pra entrar atrasado, nem o próprio torneio já
// em andamento aceita gente nova — mesmo critério "só quem decidiu
// participar ANTES" que o pedido original descreveu.
async function inscreverNoTorneio(idTorneio, idPersonagem) {
  const torneio = await FishingTournament.findByPk(idTorneio);
  if (!torneio) throw erro("Torneio não encontrado.", 404);
  if (!torneio.ativo) throw erro("Este torneio não está mais disponível.", 409);

  const agora = new Date();
  if (agora >= new Date(torneio.inicia_em)) {
    throw erro("Inscrições encerradas: o torneio já começou (ou já terminou).", 409);
  }

  // Idempotente — inscrever de novo não é erro, só confirma que já está
  // inscrito (evita uma corrida de duplo-clique virar 500 por causa da
  // unique constraint).
  const [entrada] = await FishingTournamentEntry.findOrCreate({
    where: { id_tournament: idTorneio, id_personagem: idPersonagem },
    defaults: { id_tournament: idTorneio, id_personagem: idPersonagem },
  });
  return entrada;
}

async function estaInscrito(idTorneio, idPersonagem) {
  if (!idTorneio) return false;
  const entrada = await FishingTournamentEntry.findOne({
    where: { id_tournament: idTorneio, id_personagem: idPersonagem },
  });
  return Boolean(entrada);
}

// Torneio "atual" pra tela de jogo: o que está rolando AGORA, ou, se
// nenhum estiver ativo, o próximo agendado (pra mostrar "Torneio X
// começa em..." mesmo fora da janela).
async function obterTorneioAtual() {
  const agora = new Date();
  const emAndamento = await FishingTournament.findOne({
    where: { ativo: true, inicia_em: { [Op.lte]: agora }, termina_em: { [Op.gte]: agora } },
    include: [{ model: FishingZone, as: "zona", attributes: ["id", "nome"] }],
    order: [["termina_em", "ASC"]],
  });
  if (emAndamento) return { torneio: emAndamento, status: "EM_ANDAMENTO" };

  const proximo = await FishingTournament.findOne({
    where: { ativo: true, inicia_em: { [Op.gt]: agora } },
    include: [{ model: FishingZone, as: "zona", attributes: ["id", "nome"] }],
    order: [["inicia_em", "ASC"]],
  });
  if (proximo) return { torneio: proximo, status: "AGENDADO" };

  // Nenhum ativo/agendado — mostra o ÚLTIMO finalizado (vencedor + placar
  // final continuam consultáveis pra sempre, ver comentário no topo do
  // scheduler) em vez de simplesmente "nenhum torneio", pra quem perdeu
  // o fim ainda saber quem ganhou.
  const ultimoFinalizado = await FishingTournament.findOne({
    where: { finalizado_em: { [Op.not]: null } },
    include: [{ model: FishingZone, as: "zona", attributes: ["id", "nome"] }],
    order: [["finalizado_em", "DESC"]],
  });
  if (ultimoFinalizado) return { torneio: ultimoFinalizado, status: "FINALIZADO" };

  return { torneio: null, status: "NENHUM" };
}

function paginar(page) {
  const pagina = Math.max(1, Number.parseInt(page, 10) || 1);
  const offset = (pagina - 1) * TAMANHO_PAGINA_PADRAO;
  return { pagina, offset, limite: TAMANHO_PAGINA_PADRAO };
}

async function listarLeaderboardTorneio(idTorneio, page) {
  const torneio = await FishingTournament.findByPk(idTorneio);
  if (!torneio) throw erro("Torneio não encontrado.", 404);

  const { pagina, offset, limite } = paginar(page);
  const filtroZona = torneio.id_zone ? "AND fcr.id_zone = :idZone" : "";
  // Ideia #1 da fila de melhorias — só captura de quem se inscreveu
  // conta pro placar (antes era "qualquer um que pescou na janela").
  const filtroInscritos = "AND fcr.id_personagem IN (SELECT id_personagem FROM fishing_tournament_entries WHERE id_tournament = :idTorneio)";

  const [contagem] = await sequelize.query(
    `SELECT COUNT(DISTINCT fcr.id_personagem)::int AS count
     FROM fishing_catch_records fcr
     WHERE fcr.caught_at BETWEEN :inicio AND :fim ${filtroZona} ${filtroInscritos};`,
    { replacements: { inicio: torneio.inicia_em, fim: torneio.termina_em, idZone: torneio.id_zone, idTorneio } },
  );

  const [linhas] = await sequelize.query(
    `SELECT fcr.id_personagem, c.nome AS nome_personagem,
        SUM(fcr.weight_g * fcr.quality)::float AS pontuacao,
        COUNT(*)::int AS capturas
     FROM fishing_catch_records fcr
     JOIN "Characters" c ON c.id = fcr.id_personagem
     WHERE fcr.caught_at BETWEEN :inicio AND :fim ${filtroZona} ${filtroInscritos}
     GROUP BY fcr.id_personagem, c.nome
     ORDER BY pontuacao DESC, fcr.id_personagem ASC
     LIMIT :limite OFFSET :offset;`,
    {
      replacements: {
        inicio: torneio.inicia_em,
        fim: torneio.termina_em,
        idZone: torneio.id_zone,
        idTorneio,
        limite,
        offset,
      },
    },
  );

  const itens = linhas.map((linha, indice) => ({
    posicao: offset + indice + 1,
    id: linha.id_personagem,
    nome: linha.nome_personagem,
    pontuacao: Math.round(linha.pontuacao),
    capturas: linha.capturas,
  }));

  return { itens, pagina, totalPaginas: Math.max(1, Math.ceil(contagem[0].count / limite)), totalItens: contagem[0].count };
}

async function obterMinhaPosicaoTorneio(idTorneio, idPersonagem) {
  const torneio = await FishingTournament.findByPk(idTorneio);
  if (!torneio) throw erro("Torneio não encontrado.", 404);
  const filtroZona = torneio.id_zone ? "AND fcr.id_zone = :idZone" : "";
  const filtroInscritos = "AND fcr.id_personagem IN (SELECT id_personagem FROM fishing_tournament_entries WHERE id_tournament = :idTorneio)";

  // Ideia #1 da fila de melhorias — sem inscrição, nem pescar conta:
  // mensagem diferente de "ainda não pescou nada" pra deixar claro que
  // falta se inscrever, não só pescar.
  if (!(await estaInscrito(idTorneio, idPersonagem))) {
    return { elegivel: false, motivo: "Você não se inscreveu neste torneio.", pontuacao: 0, capturas: 0 };
  }

  const [minha] = await sequelize.query(
    `SELECT SUM(fcr.weight_g * fcr.quality)::float AS pontuacao, COUNT(*)::int AS capturas
     FROM fishing_catch_records fcr
     WHERE fcr.id_personagem = :idPersonagem AND fcr.caught_at BETWEEN :inicio AND :fim ${filtroZona};`,
    {
      replacements: { idPersonagem, inicio: torneio.inicia_em, fim: torneio.termina_em, idZone: torneio.id_zone },
    },
  );

  const pontuacao = minha[0].pontuacao ?? 0;
  if (!pontuacao) {
    return { elegivel: false, motivo: "Você ainda não pescou nada durante este torneio.", pontuacao: 0, capturas: 0 };
  }

  const [linhas] = await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM (
       SELECT fcr.id_personagem, SUM(fcr.weight_g * fcr.quality) AS pontuacao
       FROM fishing_catch_records fcr
       WHERE fcr.caught_at BETWEEN :inicio AND :fim ${filtroZona} ${filtroInscritos}
       GROUP BY fcr.id_personagem
     ) t WHERE t.pontuacao > :pontuacao;`,
    { replacements: { inicio: torneio.inicia_em, fim: torneio.termina_em, idZone: torneio.id_zone, idTorneio, pontuacao } },
  );

  return {
    elegivel: true,
    posicao: linhas[0].count + 1,
    pontuacao: Math.round(pontuacao),
    capturas: minha[0].capturas,
  };
}

module.exports = {
  obterTorneioAtual,
  listarLeaderboardTorneio,
  obterMinhaPosicaoTorneio,
  inscreverNoTorneio,
  estaInscrito,
};
