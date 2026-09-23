// Torneios (PvP v2 §16) — ciclo de vida: criação (admin), inscrição,
// início com sorteio do chaveamento, cancelamento e marcação de prêmio
// entregue.
//
// Torneio NÃO toca rating ranqueado, limite diário ranqueado nem
// PvpStatus casual — as três experiências são isoladas (§1).
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Tournament = require("../models/Tournament");
const TournamentParticipant = require("../models/TournamentParticipant");
const TournamentSeries = require("../models/TournamentSeries");
const Character = require("../models/Character");
const CharacterEquipment = require("../models/CharacterEquipment");
const tournamentBracketService = require("./tournamentBracketService");
const {
  MAX_PARTICIPANTES,
  TAMANHOS_DE_CHAVE_VALIDOS,
  MIN_PARTICIPANTES_PARA_INICIAR,
  READY_CHECK_SEGUNDOS,
} = require("../config/tournamentConfig");

function log(evento, dados) {
  console.log(`[torneio] ${evento}`, JSON.stringify(dados));
}

class TournamentError extends Error {
  constructor(codigo, mensagem, status = 400) {
    super(mensagem);
    this.codigo = codigo;
    this.status = status;
  }
}

async function criar({ criadoPorUserId, dados }) {
  const maxParticipantes = Number(dados.max_participants ?? MAX_PARTICIPANTES);
  if (!TAMANHOS_DE_CHAVE_VALIDOS.includes(maxParticipantes)) {
    throw new TournamentError(
      "max-participantes-invalido",
      `max_participants precisa ser um destes formatos: ${TAMANHOS_DE_CHAVE_VALIDOS.join(", ")}.`,
    );
  }
  if (!dados.name || !String(dados.name).trim()) {
    throw new TournamentError("nome-obrigatorio", "O torneio precisa de um nome.");
  }
  if (!dados.starts_at || Number.isNaN(new Date(dados.starts_at).getTime())) {
    throw new TournamentError("data-invalida", "starts_at precisa ser uma data válida.");
  }

  const nivelMin = Number(dados.level_min ?? 1);
  const nivelMax = Number(dados.level_max ?? 999);
  if (nivelMin > nivelMax) {
    throw new TournamentError("faixa-nivel-invalida", "level_min não pode ser maior que level_max.");
  }

  const torneio = await Tournament.create({
    name: String(dados.name).trim(),
    description: dados.description ?? null,
    level_min: nivelMin,
    level_max: nivelMax,
    starts_at: new Date(dados.starts_at),
    max_participants: maxParticipantes,
    prize_description: dados.prize_description ?? null,
    // Um torneio pode já nascer com inscrições abertas — é o caso comum.
    status: dados.status === "Rascunho" ? "Rascunho" : "InscricoesAbertas",
    created_by: criadoPorUserId,
  });

  log("admin:criado", { id: torneio.id, admin: criadoPorUserId, nome: torneio.name });
  return torneio;
}

// Regras de elegibilidade, aplicadas TANTO na inscrição quanto de novo
// no início do torneio (§16 — "revalidar no start").
function validarElegibilidade({ torneio, personagem, totalInscritos, jaInscrito }) {
  if (torneio.status !== "InscricoesAbertas") {
    throw new TournamentError("inscricoes-fechadas", "As inscrições deste torneio não estão abertas.", 409);
  }
  if (jaInscrito) {
    throw new TournamentError("ja-inscrito", "Você já está inscrito neste torneio.", 409);
  }
  if (personagem.nivel < torneio.level_min || personagem.nivel > torneio.level_max) {
    throw new TournamentError(
      "fora-da-faixa-de-nivel",
      `Este torneio é para personagens de nível ${torneio.level_min} a ${torneio.level_max}.`,
      403,
    );
  }
  if (totalInscritos >= torneio.max_participants) {
    throw new TournamentError("torneio-lotado", "Este torneio já está lotado.", 409);
  }
}

async function inscrever({ torneioId, personagem }) {
  return sequelize.transaction(async (transaction) => {
    const torneio = await Tournament.findByPk(torneioId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!torneio) throw new TournamentError("nao-encontrado", "Torneio não encontrado.", 404);

    const [totalInscritos, jaInscrito] = await Promise.all([
      TournamentParticipant.count({ where: { tournament_id: torneioId }, transaction }),
      TournamentParticipant.findOne({
        where: { tournament_id: torneioId, character_id: personagem.id },
        transaction,
      }),
    ]);

    validarElegibilidade({ torneio, personagem, totalInscritos, jaInscrito: Boolean(jaInscrito) });

    const participante = await TournamentParticipant.create(
      { tournament_id: torneioId, character_id: personagem.id },
      { transaction },
    );

    log("inscricao", { torneio: torneioId, personagem: personagem.id, total: totalInscritos + 1 });
    return participante;
  });
}

async function desinscrever({ torneioId, personagem }) {
  return sequelize.transaction(async (transaction) => {
    const torneio = await Tournament.findByPk(torneioId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!torneio) throw new TournamentError("nao-encontrado", "Torneio não encontrado.", 404);
    if (torneio.status !== "InscricoesAbertas") {
      throw new TournamentError(
        "inscricoes-fechadas",
        "Não dá mais para sair: as inscrições já foram encerradas.",
        409,
      );
    }

    const removidos = await TournamentParticipant.destroy({
      where: { tournament_id: torneioId, character_id: personagem.id },
      transaction,
    });
    if (removidos === 0) {
      throw new TournamentError("nao-inscrito", "Você não está inscrito neste torneio.", 404);
    }

    log("desinscricao", { torneio: torneioId, personagem: personagem.id });
    return true;
  });
}

// §16 — congela o loadout competitivo do participante. Nesta versão é
// o EQUIPAMENTO equipado (slot → item/instância): é o que muda o poder
// de combate entre jogos de uma mesma série. Habilidades/atributos
// distribuídos NÃO são congelados: trocar ponto de atributo exige
// recursos próprios do jogo e não é um swap instantâneo entre jogos.
async function snapshotLoadout(characterId, transaction) {
  const equipados = await CharacterEquipment.findAll({
    where: { id_personagem: characterId },
    transaction,
  });
  return {
    travadoEm: new Date().toISOString(),
    equipamento: equipados.map((e) => ({
      slot: e.slot,
      id_item: e.id_item,
      id_instancia: e.id_instancia ?? null,
    })),
  };
}

// §16 — início do torneio: revalida elegibilidade de TODO mundo, sorteia
// o chaveamento, persiste séries e seeds. O chaveamento só é gerado se
// ainda não existir (bracket_seed nulo) — chamar start duas vezes nunca
// regera.
async function iniciar({ torneioId }) {
  return sequelize.transaction(async (transaction) => {
    const torneio = await Tournament.findByPk(torneioId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!torneio) throw new TournamentError("nao-encontrado", "Torneio não encontrado.", 404);

    if (torneio.bracket_seed) {
      throw new TournamentError(
        "ja-iniciado",
        "Este torneio já teve o chaveamento sorteado — ele nunca é regerado.",
        409,
      );
    }
    if (!["InscricoesAbertas", "InscricoesFechadas"].includes(torneio.status)) {
      throw new TournamentError(
        "status-invalido",
        `Não é possível iniciar um torneio com status ${torneio.status}.`,
        409,
      );
    }

    const participantes = await TournamentParticipant.findAll({
      where: { tournament_id: torneioId },
      include: [{ model: Character, as: "personagem", attributes: ["id", "nivel"] }],
      transaction,
    });

    if (participantes.length < MIN_PARTICIPANTES_PARA_INICIAR) {
      throw new TournamentError(
        "contagem-invalida",
        `Este torneio precisa de pelo menos ${MIN_PARTICIPANTES_PARA_INICIAR} participantes para começar (tem ${participantes.length}).`,
        409,
      );
    }

    // Revalidação no start (§16): nível pode ter mudado entre a
    // inscrição e agora.
    for (const participante of participantes) {
      const nivel = participante.personagem?.nivel ?? 0;
      if (nivel < torneio.level_min || nivel > torneio.level_max) {
        throw new TournamentError(
          "participante-inelegivel",
          `O personagem ${participante.character_id} está fora da faixa de nível (${torneio.level_min}-${torneio.level_max}) e precisa ser removido antes de iniciar.`,
          409,
        );
      }
    }

    const { bracketSeed, series } = tournamentBracketService.sortearChaveamento(
      participantes.map((p) => p.id),
    );

    // Persiste o seed sorteado em cada participante — a posição no
    // chaveamento vira dado, não recálculo.
    for (let i = 0; i < bracketSeed.ordem.length; i += 1) {
      await TournamentParticipant.update(
        { seed: i },
        { where: { id: bracketSeed.ordem[i] }, transaction },
      );
    }

    const criadas = [];
    for (const serie of series) {
      criadas.push(
        await TournamentSeries.create({ tournament_id: torneioId, ...serie }, { transaction }),
      );
    }

    // Bye (§16-bis): série da primeira rodada com só um lado preenchido
    // — ninguém pra enfrentar, então o presente avança sozinho por W.O.,
    // sem abrir ready check nenhum. Resolve aqui mesmo (as séries ainda
    // estão todas em memória em `criadas`, sem precisar reconsultar o
    // banco) e empurra o vencedor pra série seguinte via destinoDoVencedor
    // — se essa seguinte também ficar completa só de vencedores de bye
    // (dois byes adjacentes na rodada anterior), ela vira uma partida de
    // verdade entre os dois, tratada normalmente pelo loop de ready
    // check abaixo. Bye nunca tem perdedor: nada a mandar pro 3º lugar
    // (ver tournamentBracketService.montarEstrutura, que já nem cria a
    // série de 3º lugar quando ela seria estruturalmente inalcançável).
    for (const serie of criadas) {
      const ehPrimeiraRodada = serie.round === bracketSeed.primeiraRodada;
      const temBye = ehPrimeiraRodada && Boolean(serie.participant_a_id) !== Boolean(serie.participant_b_id);
      if (!temBye) continue;

      const vencedorId = serie.participant_a_id ?? serie.participant_b_id;
      await serie.update(
        {
          winner_participant_id: vencedorId,
          status: "WO",
          score_a: serie.participant_a_id ? 1 : 0,
          score_b: serie.participant_b_id ? 1 : 0,
        },
        { transaction },
      );
      log("serie:bye", { serie: serie.id, torneio: torneioId, round: serie.round, vencedor: vencedorId });

      const destino = tournamentBracketService.destinoDoVencedor(serie.round, serie.posicao);
      if (destino) {
        const alvo = criadas.find((s) => s.round === destino.round && s.posicao === destino.posicao);
        if (alvo) {
          const campo = destino.lado === "a" ? "participant_a_id" : "participant_b_id";
          await alvo.update({ [campo]: vencedorId }, { transaction });
        }
      }
    }

    // Toda série (de qualquer rodada) que ficou completa — de verdade ou
    // via bye em cascata — entra em ready check imediatamente. Antes só
    // checava a primeira rodada porque só ela podia nascer completa; com
    // bye, uma rodada seguinte também pode nascer completa (dois byes
    // adjacentes se enfrentando de verdade na rodada seguinte).
    const expiraEm = new Date(Date.now() + READY_CHECK_SEGUNDOS * 1000);
    for (const serie of criadas) {
      if (serie.status === "Aguardando" && serie.participant_a_id && serie.participant_b_id) {
        await serie.update({ status: "ReadyCheck", ready_check_expira_em: expiraEm }, { transaction });
        for (const participanteId of [serie.participant_a_id, serie.participant_b_id]) {
          const participante = participantes.find((p) => p.id === participanteId);
          if (participante) {
            await participante.update(
              { loadout_travado: await snapshotLoadout(participante.character_id, transaction) },
              { transaction },
            );
          }
        }
      }
    }

    await torneio.update(
      { status: "EmAndamento", bracket_seed: bracketSeed, bracket_gerado_em: new Date() },
      { transaction },
    );

    log("admin:iniciado", {
      id: torneioId,
      participantes: participantes.length,
      primeiraRodada: bracketSeed.primeiraRodada,
      // §18 — sorteio do chaveamento registrado na íntegra.
      ordemSorteada: bracketSeed.ordem,
    });

    return { torneio, series: criadas, bracketSeed };
  });
}

async function cancelar({ torneioId, motivo, adminUserId }) {
  const torneio = await Tournament.findByPk(torneioId);
  if (!torneio) throw new TournamentError("nao-encontrado", "Torneio não encontrado.", 404);
  if (torneio.status === "Finalizado") {
    throw new TournamentError("ja-finalizado", "Um torneio finalizado não pode ser cancelado.", 409);
  }
  await torneio.update({ status: "Cancelado" });
  log("admin:cancelado", { id: torneioId, admin: adminUserId, motivo: motivo ?? null });
  return torneio;
}

// §16 — marcador INFORMATIVO. O sistema nunca credita prêmio sozinho:
// isto só registra que um admin entregou.
async function marcarPremioEntregue({ torneioId, entregue, adminUserId }) {
  const torneio = await Tournament.findByPk(torneioId);
  if (!torneio) throw new TournamentError("nao-encontrado", "Torneio não encontrado.", 404);
  await torneio.update({ prize_delivered: entregue !== false });
  log("admin:premio-entregue", { id: torneioId, admin: adminUserId, entregue: torneio.prize_delivered });
  return torneio;
}

async function listar({ status } = {}) {
  const where = {};
  if (status) where.status = status;
  return Tournament.findAll({
    where,
    order: [
      ["starts_at", "DESC"],
      ["id", "DESC"],
    ],
    limit: 100,
  });
}

async function detalhar(torneioId) {
  const torneio = await Tournament.findByPk(torneioId, {
    include: [
      {
        model: TournamentParticipant,
        as: "participantes",
        include: [{ model: Character, as: "personagem", attributes: ["id", "nome", "nivel"] }],
      },
      { model: TournamentSeries, as: "series" },
    ],
    order: [
      [{ model: TournamentSeries, as: "series" }, "id", "ASC"],
    ],
  });
  if (!torneio) throw new TournamentError("nao-encontrado", "Torneio não encontrado.", 404);
  return torneio;
}

// §16 — exclusão mútua entre as três experiências: quem está numa série
// de torneio ativa não pode iniciar partida ranqueada nem entrar em
// outro duelo. A presença "em combate agora" continua sendo a de
// pvpLiveSocket (duelPorPersonagem); isto cobre o estado de torneio, que
// é persistido e sobrevive a restart.
async function emSerieAtiva(characterId) {
  const participacoes = await TournamentParticipant.findAll({
    where: { character_id: characterId, eliminated: false },
    attributes: ["id", "tournament_id"],
  });
  if (participacoes.length === 0) return false;

  const ids = participacoes.map((p) => p.id);
  const serie = await TournamentSeries.findOne({
    where: {
      status: { [Op.in]: ["ReadyCheck", "EmAndamento"] },
      [Op.or]: [{ participant_a_id: { [Op.in]: ids } }, { participant_b_id: { [Op.in]: ids } }],
    },
  });
  return Boolean(serie);
}

module.exports = {
  TournamentError,
  criar,
  inscrever,
  desinscrever,
  iniciar,
  cancelar,
  marcarPremioEntregue,
  listar,
  detalhar,
  snapshotLoadout,
  validarElegibilidade,
  emSerieAtiva,
};
