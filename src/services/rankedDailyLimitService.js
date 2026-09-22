// Limite diário de partidas ranqueadas (PvP v2 §11).
//
// Regras:
// - 10 partidas por dia por personagem (rankedConfig).
// - A tentativa só é consumida quando o servidor REALMENTE cria a
//   partida; tentativa que falhou antes disso não gasta nada.
// - Falha comprovada do servidor antes de um resultado válido devolve a
//   tentativa (decremento, também transacional). Desconexão do jogador
//   NÃO devolve.
// - Dois pedidos simultâneos nunca podem ambos conseguir a 10ª vaga:
//   por isso o consumo é um único UPDATE condicional
//   (matches_used < limite) com RETURNING, atômico no banco — nenhuma
//   leitura prévia participa da decisão.
const { sequelize } = require("../config/database");
const CharacterRankedDailyUsage = require("../models/CharacterRankedDailyUsage");
const {
  RANKED_LIMITE_PARTIDAS_DIA,
  RANKED_TIMEZONE_DIARIA,
} = require("../config/rankedConfig");

// "YYYY-MM-DD" no fuso configurado. en-CA porque é o único locale que
// já formata nessa ordem sem montagem manual de string.
function chaveDoDia(data = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: RANKED_TIMEZONE_DIARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);
}

async function garantirLinha(characterId, dateKey, transaction) {
  // ON CONFLICT DO NOTHING: se duas requisições criarem ao mesmo tempo,
  // uma perde a corrida e simplesmente segue — a linha existe de
  // qualquer jeito, que é tudo o que importa aqui.
  await sequelize.query(
    `INSERT INTO character_ranked_daily_usage
       (character_id, date_key, matches_used, "createdAt", "updatedAt")
     VALUES (:characterId, :dateKey, 0, NOW(), NOW())
     ON CONFLICT (character_id, date_key) DO NOTHING;`,
    { replacements: { characterId, dateKey }, transaction },
  );
}

// Consome UMA tentativa. Retorna { consumiu, usadas, limite, dateKey }.
// `consumiu:false` significa limite atingido — nada foi alterado.
async function consumirTentativa(characterId, { transaction, data } = {}) {
  const dateKey = chaveDoDia(data);

  const executar = async (trx) => {
    await garantirLinha(characterId, dateKey, trx);

    const [linhas] = await sequelize.query(
      `UPDATE character_ranked_daily_usage
          SET matches_used = matches_used + 1, "updatedAt" = NOW()
        WHERE character_id = :characterId
          AND date_key = :dateKey
          AND matches_used < :limite
      RETURNING matches_used;`,
      { replacements: { characterId, dateKey, limite: RANKED_LIMITE_PARTIDAS_DIA }, transaction: trx },
    );

    if (linhas.length === 0) {
      const atual = await CharacterRankedDailyUsage.findOne({
        where: { character_id: characterId, date_key: dateKey },
        transaction: trx,
      });
      return {
        consumiu: false,
        usadas: atual?.matches_used ?? RANKED_LIMITE_PARTIDAS_DIA,
        limite: RANKED_LIMITE_PARTIDAS_DIA,
        dateKey,
      };
    }

    return {
      consumiu: true,
      usadas: linhas[0].matches_used,
      limite: RANKED_LIMITE_PARTIDAS_DIA,
      dateKey,
    };
  };

  if (transaction) return executar(transaction);
  return sequelize.transaction(executar);
}

// Devolve uma tentativa (§11 — só em falha comprovada do servidor antes
// de um resultado válido). Nunca deixa o contador negativo.
async function devolverTentativa(characterId, { transaction, dateKey } = {}) {
  const chave = dateKey ?? chaveDoDia();

  const executar = async (trx) => {
    const [linhas] = await sequelize.query(
      `UPDATE character_ranked_daily_usage
          SET matches_used = GREATEST(0, matches_used - 1), "updatedAt" = NOW()
        WHERE character_id = :characterId AND date_key = :dateKey
      RETURNING matches_used;`,
      { replacements: { characterId, dateKey: chave }, transaction: trx },
    );
    return { devolveu: linhas.length > 0, usadas: linhas[0]?.matches_used ?? 0, dateKey: chave };
  };

  if (transaction) return executar(transaction);
  return sequelize.transaction(executar);
}

// Só leitura, pro GET /api/pvp/ranked/status (§15) — nunca cria linha.
async function consultarUso(characterId, { data } = {}) {
  const dateKey = chaveDoDia(data);
  const linha = await CharacterRankedDailyUsage.findOne({
    where: { character_id: characterId, date_key: dateKey },
  });
  const usadas = linha?.matches_used ?? 0;
  return {
    dateKey,
    usadas,
    limite: RANKED_LIMITE_PARTIDAS_DIA,
    restantes: Math.max(0, RANKED_LIMITE_PARTIDAS_DIA - usadas),
  };
}

module.exports = {
  chaveDoDia,
  consumirTentativa,
  devolverTentativa,
  consultarUso,
};
