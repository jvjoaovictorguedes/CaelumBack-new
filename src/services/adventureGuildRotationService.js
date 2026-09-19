// Rotação de contratos de Rank da Guilda dos Aventureiros (§13-§15/§40/
// §41 da spec) — as 5 ofertas são GLOBAIS (mesmas pra todo mundo no
// mesmo Rank) e geradas de forma preguiçosa: a primeira requisição de
// uma janela nova que não encontra ofertas gera elas; qualquer outra
// requisição concorrente na mesma janela só lê o que já foi gerado
// (nunca sorteia uma segunda vez — ver `gerarOfertas`).
const crypto = require("crypto");
const AdventureGuildMission = require("../models/AdventureGuildMission");
const AdventureGuildMissionReward = require("../models/AdventureGuildMissionReward");
const AdventureGuildOffer = require("../models/AdventureGuildOffer");
const Item = require("../models/Item");
const AdventureMonster = require("../models/AdventureMonster");
const AdventureZone = require("../models/AdventureZone");
const { OFERTAS_POR_ROTACAO, ROTACAO_MS, inicioDaJanelaAtual } = require("../config/adventureGuildConfig");

function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Sorteia e persiste as 5 ofertas de uma janela — evita, quando o pool
// permite, repetir imediatamente as mesmas missões da janela anterior
// (§14: "não precisa impedir repetição pra sempre, só reduzir
// repetição consecutiva"). Se duas requisições caírem aqui ao mesmo
// tempo pra mesma janela, a unique index (rank, janela_inicio, ordem/
// id_mission) em AdventureGuildOffer deixa só uma delas inserir de
// verdade — a outra recebe erro de constraint, que é ignorado aqui
// (quem chamou relê do banco depois).
async function gerarOfertas(rank, janelaInicio, transaction) {
  const pool = await AdventureGuildMission.findAll({
    where: { rank, eh_provacao: false, ativa: true },
    transaction,
  });
  if (pool.length === 0) return;

  const janelaAnterior = new Date(janelaInicio.getTime() - ROTACAO_MS);
  const ofertasAnteriores = await AdventureGuildOffer.findAll({
    where: { rank, janela_inicio: janelaAnterior },
    attributes: ["id_mission"],
    transaction,
  });
  const idsRecentes = new Set(ofertasAnteriores.map((o) => o.id_mission));

  const naoRecentes = embaralhar(pool.filter((m) => !idsRecentes.has(m.id)));
  const recentes = embaralhar(pool.filter((m) => idsRecentes.has(m.id)));
  const candidatos = [...naoRecentes, ...recentes].slice(0, OFERTAS_POR_ROTACAO);

  const agora = new Date();
  const linhas = candidatos.map((missao, indice) => ({
    rank,
    janela_inicio: janelaInicio,
    id_mission: missao.id,
    ordem: indice + 1,
    createdAt: agora,
    updatedAt: agora,
  }));

  try {
    await AdventureGuildOffer.bulkCreate(linhas, { transaction, validate: true });
  } catch (erro) {
    if (erro.name !== "SequelizeUniqueConstraintError") throw erro;
  }
}

// Devolve as ofertas da janela ATUAL do Rank, gerando se ainda não
// existirem. `janelaInicio`/`proximaJanela` vêm do relógio do
// SERVIDOR (nunca do cliente, §15) — o frontend só usa isso pra
// calcular o timer.
async function obterOfertasDoRank(rank, transaction) {
  const janelaInicio = inicioDaJanelaAtual();

  const buscar = () =>
    AdventureGuildOffer.findAll({
      where: { rank, janela_inicio: janelaInicio },
      include: [
        {
          model: AdventureGuildMission,
          as: "missao",
          include: [
            { model: AdventureGuildMissionReward, as: "recompensas", include: [{ model: Item, as: "item" }] },
            { model: AdventureMonster, as: "monstroAlvo" },
            { model: AdventureZone, as: "areaAlvo" },
            { model: Item, as: "itemAlvo" },
          ],
        },
      ],
      order: [["ordem", "ASC"]],
      transaction,
    });

  let ofertas = await buscar();
  if (ofertas.length === 0) {
    await gerarOfertas(rank, janelaInicio, transaction);
    ofertas = await buscar();
  }

  return {
    janelaInicio,
    proximaJanela: new Date(janelaInicio.getTime() + ROTACAO_MS),
    ofertas,
  };
}

module.exports = { obterOfertasDoRank };
