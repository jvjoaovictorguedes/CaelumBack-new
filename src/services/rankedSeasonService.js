// Temporadas da Arena Ranqueada (§7/§12). Garante que sempre existe uma
// temporada Ativa (bootstrap automático por data) e sabe fazer o soft
// reset ao abrir a próxima, copiando a participação da temporada
// anterior já com o rating reduzido em direção a 1000.
const { sequelize } = require("../config/database");
const PvPSeason = require("../models/PvPSeason");
const CharacterPvpSeason = require("../models/CharacterPvpSeason");
const { softReset } = require("./rankedRatingService");
const { DURACAO_TEMPORADA_SEMANAS } = require("../config/rankedConfig");

const MS_POR_SEMANA = 7 * 24 * 60 * 60 * 1000;

async function criarProximaTemporada({ seedDaTemporadaAnteriorId } = {}, transaction) {
  const numero = (await PvPSeason.count({ transaction })) + 1;
  const agora = new Date();
  const novaTemporada = await PvPSeason.create(
    {
      nome: `Temporada ${numero}`,
      starts_at: agora,
      ends_at: new Date(agora.getTime() + DURACAO_TEMPORADA_SEMANAS * MS_POR_SEMANA),
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
          const ratingInicial = softReset(p.rating);
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
      temporada = await criarProximaTemporada({ seedDaTemporadaAnteriorId: temporada.id }, transaction);
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
    return criarProximaTemporada({ seedDaTemporadaAnteriorId: atual.id }, transaction);
  });
}

module.exports = {
  obterTemporadaAtiva,
  obterOuIniciarTemporadaAtiva,
  encerrarTemporadaEIniciarProxima,
};
