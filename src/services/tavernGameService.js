// Sistema de Taverna §7.3/§7.4/§8.2/§9/§16/§17 — jogos 50/50. TODOS os
// jogos correm no MESMO motor (a apresentação/escolhas mudam, a
// economia/RNG nunca muda por jogo). Dano/resultado 100%
// server-authoritative: o cliente nunca informa chance, payout ou
// resultado, só a escolha (choice_key) e um request_id de idempotência.
const { QueryTypes } = require("sequelize");
const crypto = require("crypto");
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const TavernGame = require("../models/TavernGame");
const TavernGameBet = require("../models/TavernGameBet");
const { concederOuro } = require("./goldService");
const gameSettingCache = require("./gameSettingCache");
const { CHOICES_POR_PRESENTATION, ESCALA_PPM, GAME_SETTINGS_DEFAULT } = require("../config/tavernConfig");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

// GET /api/tavern/games
async function listarJogosAtivos() {
  return TavernGame.findAll({ where: { ativo: true }, order: [["ordem", "ASC"]] });
}

// GET /api/tavern/games/history
async function historicoDoPersonagem(characterId, limite = 20) {
  return TavernGameBet.findAll({
    where: { id_personagem: characterId },
    order: [["createdAt", "DESC"]],
    limit: Math.min(100, Math.max(1, Number(limite) || 20)),
    include: [{ model: TavernGame, as: "jogo", attributes: ["id", "nome", "key", "presentation_key"] }],
  });
}

function formatarResposta(bet, saldoAtual) {
  return {
    outcome: bet.outcome,
    bet_amount: bet.bet_amount,
    payout_amount: bet.payout_amount,
    net_change: bet.net_change,
    choice_key: bet.choice_key,
    dinheiro: saldoAtual,
  };
}

// POST /api/tavern/games/:id/play — §8.2, idempotente por
// (id_personagem, request_id): o MESMO request_id pro MESMO personagem
// nunca gera um segundo roll, mesmo em retry/duplo clique.
async function apostar(characterId, gameId, { requestId, betAmount, choiceKey }) {
  if (!requestId || typeof requestId !== "string") throw erro("request_id é obrigatório.");
  const valorAposta = Number(betAmount);
  if (!Number.isInteger(valorAposta) || valorAposta <= 0) throw erro("bet_amount precisa ser um inteiro positivo.");
  if (!choiceKey || typeof choiceKey !== "string") throw erro("choice_key é obrigatório.");

  return sequelize.transaction(async (transaction) => {
    // Passo 1 (§8.2): idempotência ANTES de qualquer débito/roll — se
    // já existe uma aposta com este request_id pro personagem, devolve
    // o MESMO resultado, nunca cria um segundo TavernGameBet.
    const existente = await TavernGameBet.findOne({
      where: { id_personagem: characterId, request_id: requestId },
      transaction,
    });
    if (existente) {
      const personagemAtual = await Character.findByPk(characterId, { transaction, attributes: ["dinheiro"] });
      return formatarResposta(existente, personagemAtual?.dinheiro ?? 0);
    }

    const character = await Character.findByPk(characterId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!character) throw erro("Personagem não encontrado.", 404);

    const jogo = await TavernGame.findByPk(gameId, { transaction });
    if (!jogo || !jogo.ativo) throw erro("Jogo indisponível.", 404);

    const escolhasValidas = CHOICES_POR_PRESENTATION[jogo.presentation_key] ?? [];
    if (!escolhasValidas.includes(choiceKey)) {
      throw erro(`choice_key inválida — use uma de: ${escolhasValidas.join(", ")}.`);
    }

    const maxBetGlobal = gameSettingCache.obter(
      "tavern.games.max_bet_global",
      GAME_SETTINGS_DEFAULT["tavern.games.max_bet_global"],
    );
    const tetoEfetivo = Math.min(jogo.max_bet, maxBetGlobal);
    if (valorAposta < jogo.min_bet || valorAposta > tetoEfetivo) {
      throw erro(`bet_amount precisa estar entre ${jogo.min_bet} e ${tetoEfetivo}.`);
    }

    const limiteDiario = gameSettingCache.obter(
      "tavern.games.daily_wager_limit",
      GAME_SETTINGS_DEFAULT["tavern.games.daily_wager_limit"],
    );
    if (limiteDiario > 0) {
      const inicioDoDia = new Date();
      inicioDoDia.setUTCHours(0, 0, 0, 0);
      const [{ total }] = await sequelize.query(
        `SELECT COALESCE(SUM(bet_amount), 0) AS total FROM tavern_game_bets
         WHERE id_personagem = :characterId AND "createdAt" >= :inicioDoDia;`,
        { replacements: { characterId, inicioDoDia }, type: QueryTypes.SELECT, transaction },
      );
      if (Number(total) + valorAposta > limiteDiario) {
        throw erro("Limite diário de apostas da Taverna atingido.", 400);
      }
    }

    if (character.dinheiro < valorAposta) throw erro("Gold insuficiente para essa aposta.", 400);

    character.dinheiro -= valorAposta;

    // Passo 7/8 (§8.2) — RNG e decisão SEMPRE no servidor, nunca
    // Math.random() (previsível/manipulável), sempre dentro da mesma
    // transaction que já debitou a aposta.
    const rollPpm = crypto.randomInt(0, ESCALA_PPM);
    const venceu = rollPpm < jogo.win_chance_ppm;

    let payoutAmount = 0;
    if (venceu) {
      payoutAmount = Math.floor(valorAposta * jogo.payout_multiplier);
      concederOuro(character, payoutAmount);
    }

    await character.save({ transaction });

    const bet = await TavernGameBet.create(
      {
        request_id: requestId,
        id_personagem: characterId,
        id_game: jogo.id,
        bet_amount: valorAposta,
        choice_key: choiceKey,
        outcome: venceu ? "Win" : "Lose",
        payout_amount: payoutAmount,
        net_change: payoutAmount - valorAposta,
        roll_ppm: rollPpm,
      },
      { transaction },
    );

    return formatarResposta(bet, character.dinheiro);
  });
}

module.exports = { listarJogosAtivos, historicoDoPersonagem, apostar };
