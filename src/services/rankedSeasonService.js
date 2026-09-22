// Temporadas da Arena Ranqueada (§7/§12). Garante que sempre existe uma
// temporada Ativa (bootstrap automático por data) e sabe fazer o soft
// reset ao abrir a próxima, copiando a participação da temporada
// anterior já com o rating reduzido em direção a 1000.
const { sequelize } = require("../config/database");
const PvPSeason = require("../models/PvPSeason");
const CharacterPvpSeason = require("../models/CharacterPvpSeason");
const { softReset } = require("./rankedRatingService");
const { DURACAO_TEMPORADA_DIAS } = require("../config/rankedConfig");

const MS_POR_DIA = 24 * 60 * 60 * 1000;
// §13 — janelas FIXAS de 14 dias corridos contadas a partir do
// starts_at da temporada; nunca alinhadas a mês ou semana de
// calendário.
const DURACAO_TEMPORADA_MS = DURACAO_TEMPORADA_DIAS * MS_POR_DIA;

// `inicio` permite encadear janelas de 14 dias SEM deriva: a temporada
// seguinte começa exatamente no ends_at da anterior, não no instante em
// que alguém abriu o jogo e disparou o bootstrap. Se a anterior venceu
// há mais de uma janela (servidor parado), avança de 14 em 14 dias até
// cair numa janela que ainda contenha o agora (§13).
function inicioDaJanelaVigente(inicioProposto) {
  const agora = Date.now();
  let inicio = inicioProposto.getTime();
  while (inicio + DURACAO_TEMPORADA_MS <= agora) {
    inicio += DURACAO_TEMPORADA_MS;
  }
  return new Date(inicio);
}

async function criarProximaTemporada({ seedDaTemporadaAnteriorId, inicio } = {}, transaction) {
  const numero = (await PvPSeason.count({ transaction })) + 1;
  const comeca = inicio ? inicioDaJanelaVigente(inicio) : new Date();
  const novaTemporada = await PvPSeason.create(
    {
      nome: `Temporada ${numero}`,
      starts_at: comeca,
      ends_at: new Date(comeca.getTime() + DURACAO_TEMPORADA_MS),
      status: "Ativa",
    },
    { transaction },
  );

  if (seedDaTemporadaAnteriorId) {
    const participacoesAnteriores = await CharacterPvpSeason.findAll({
      where: { season_id: seedDaTemporadaAnteriorId },
      transaction,
    });

    if (participacoesAnteriores.length > 0) {
      await CharacterPvpSeason.bulkCreate(
        participacoesAnteriores.map((p) => {
          // §13 — soft reset leva em conta winrate e tamanho de
          // amostra da temporada que acabou, não só o rating final.
          const ratingInicial = softReset(p.rating, { jogos: p.jogos, vitorias: p.vitorias });
          return {
            character_id: p.character_id,
            season_id: novaTemporada.id,
            rating: ratingInicial,
            jogos: 0,
            vitorias: 0,
            derrotas: 0,
            peak_rating: ratingInicial,
          };
        }),
        { transaction },
      );
    }
  }

  return novaTemporada;
}

async function obterTemporadaAtiva(transaction) {
  return PvPSeason.findOne({ where: { status: "Ativa" }, order: [["id", "DESC"]], transaction });
}

// Bootstrap chamado por qualquer rota/serviço ranked antes de agir: se a
// temporada ativa já passou do ends_at, encerra e abre a próxima com
// soft reset; se não existe nenhuma temporada ainda, cria a primeira.
async function obterOuIniciarTemporadaAtiva() {
  return sequelize.transaction(async (transaction) => {
    let temporada = await obterTemporadaAtiva(transaction);

    if (temporada && temporada.ends_at.getTime() <= Date.now()) {
      await temporada.update({ status: "Encerrada" }, { transaction });
      temporada = await criarProximaTemporada(
        { seedDaTemporadaAnteriorId: temporada.id, inicio: temporada.ends_at },
        transaction,
      );
    }

    if (!temporada) {
      const temporadaAnterior = await PvPSeason.findOne({
        where: { status: "Encerrada" },
        order: [["id", "DESC"]],
        transaction,
      });
      temporada = await criarProximaTemporada(
        { seedDaTemporadaAnteriorId: temporadaAnterior?.id },
        transaction,
      );
    }

    return temporada;
  });
}

// Encerramento explícito (ex.: rotina/admin), fora do bootstrap por data.
async function encerrarTemporadaEIniciarProxima() {
  return sequelize.transaction(async (transaction) => {
    const atual = await obterTemporadaAtiva(transaction);
    if (!atual) return criarProximaTemporada({}, transaction);

    await atual.update({ status: "Encerrada" }, { transaction });
    // Encerramento manual quebra a janela de propósito: a próxima
    // temporada começa agora, não no ends_at que não chegou a valer.
    return criarProximaTemporada({ seedDaTemporadaAnteriorId: atual.id }, transaction);
  });
}

// §15 — dias restantes da temporada, arredondado pra cima (um dia
// parcial ainda é "1 dia restante"); nunca negativo.
function diasRestantes(temporada) {
  if (!temporada?.ends_at) return 0;
  const restanteMs = new Date(temporada.ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(restanteMs / MS_POR_DIA));
}

module.exports = {
  diasRestantes,
  criarProximaTemporada,
  obterTemporadaAtiva,
  obterOuIniciarTemporadaAtiva,
  encerrarTemporadaEIniciarProxima,
};
