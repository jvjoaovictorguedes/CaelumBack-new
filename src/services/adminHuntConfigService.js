// Painel Administrativo Fase 11 — mesmo raciocínio de
// adminSpoilConfigService.js: Caçadas não tem tabela de catálogo (o
// alvo de cada caçada vem do catálogo de AdventureZone/AdventureMonster
// já existente, gerado em cima de config hardcoded em huntConfig.js).
// O que é administrável é a dificuldade/reputação/pesos de sorteio —
// guardado em game_settings sob chaves próprias, lido pelos services
// de jogo com fallback via gameSettingCache.js.
const { sequelize } = require("../config/database");
const GameSetting = require("../models/GameSetting");
const gameSettingCache = require("./gameSettingCache");
const { registrarAcao } = require("./adminAuditService");
const {
  HUNT_DIFFICULTIES: HUNT_DIFFICULTIES_PADRAO,
  HUNT_REPUTATION_LEVELS: HUNT_REPUTATION_LEVELS_PADRAO,
  HUNT_DIFFICULTY_WEIGHTS_BY_REPUTATION: HUNT_DIFFICULTY_WEIGHTS_BY_REPUTATION_PADRAO,
} = require("../config/huntConfig");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function chavesDeDificuldade(dificuldades) {
  return Object.keys(dificuldades ?? {});
}

function validarDificuldades(dificuldades) {
  if (!dificuldades || typeof dificuldades !== "object" || Array.isArray(dificuldades)) throw erro("difficulties precisa ser um objeto.");
  const chaves = Object.keys(dificuldades);
  if (chaves.length === 0) throw erro("difficulties precisa ter ao menos uma dificuldade.");
  for (const chave of chaves) {
    const d = dificuldades[chave];
    if (typeof d.nome !== "string" || !d.nome) throw erro(`nome da dificuldade "${chave}" é obrigatório.`);
    if (typeof d.ordem !== "number") throw erro(`ordem da dificuldade "${chave}" precisa ser number.`);
    if (typeof d.hpMultiplier !== "number" || d.hpMultiplier < 0) throw erro(`hpMultiplier de "${chave}" precisa ser >= 0.`);
    if (typeof d.damageMultiplier !== "number" || d.damageMultiplier < 0) throw erro(`damageMultiplier de "${chave}" precisa ser >= 0.`);
    if (typeof d.rewardMultiplier !== "number" || d.rewardMultiplier <= 0) throw erro(`rewardMultiplier de "${chave}" precisa ser > 0.`);
    if (!Number.isInteger(d.reputationReward) || d.reputationReward < 0) throw erro(`reputationReward de "${chave}" precisa ser um inteiro >= 0.`);
    if (
      !Array.isArray(d.quantityRange) ||
      d.quantityRange.length !== 2 ||
      !Number.isInteger(d.quantityRange[0]) ||
      !Number.isInteger(d.quantityRange[1]) ||
      d.quantityRange[0] < 1 ||
      d.quantityRange[0] > d.quantityRange[1]
    ) {
      throw erro(`quantityRange de "${chave}" precisa ser [minimo, maximo] com 1 <= minimo <= maximo.`);
    }
  }
}

function validarNiveisDeReputacao(niveis, chavesValidasDeDificuldade) {
  if (!Array.isArray(niveis) || niveis.length === 0) throw erro("reputationLevels precisa ser uma lista não vazia.");
  let minimoAnterior = -1;
  for (const nivel of niveis) {
    if (typeof nivel.nivel !== "number" || typeof nivel.roman !== "string" || typeof nivel.titulo !== "string") {
      throw erro("Cada nível precisa de nivel (number), roman (string) e titulo (string).");
    }
    if (!Number.isInteger(nivel.minimo) || nivel.minimo < 0) throw erro(`minimo do nível "${nivel.titulo}" precisa ser um inteiro >= 0.`);
    if (nivel.minimo <= minimoAnterior) throw erro("minimo precisa ser estritamente crescente entre os níveis, na ordem enviada.");
    minimoAnterior = nivel.minimo;
    if (!Array.isArray(nivel.pool) || nivel.pool.length === 0) throw erro(`pool do nível "${nivel.titulo}" precisa ser uma lista não vazia.`);
    for (const dificuldade of nivel.pool) {
      if (!chavesValidasDeDificuldade.includes(dificuldade)) {
        throw erro(`pool do nível "${nivel.titulo}" cita "${dificuldade}", que não existe em difficulties.`);
      }
    }
  }
}

function validarPesos(pesos, niveis, chavesValidasDeDificuldade) {
  if (!pesos || typeof pesos !== "object" || Array.isArray(pesos)) throw erro("difficultyWeightsByReputation precisa ser um objeto.");
  for (const nivel of niveis) {
    const pesosDoNivel = pesos[nivel.nivel];
    if (!pesosDoNivel || typeof pesosDoNivel !== "object") throw erro(`difficultyWeightsByReputation precisa ter pesos pro nível ${nivel.nivel}.`);
    for (const dificuldade of Object.keys(pesosDoNivel)) {
      if (!chavesValidasDeDificuldade.includes(dificuldade)) throw erro(`Peso pra "${dificuldade}" no nível ${nivel.nivel} não existe em difficulties.`);
      if (typeof pesosDoNivel[dificuldade] !== "number" || pesosDoNivel[dificuldade] < 0) throw erro(`Peso de "${dificuldade}" no nível ${nivel.nivel} precisa ser um número >= 0.`);
    }
  }
}

async function getAdminHuntConfig() {
  const linhas = await GameSetting.findAll({
    where: { chave: ["hunts.difficulties", "hunts.reputationLevels", "hunts.difficultyWeightsByReputation"] },
  });
  const porChave = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  return {
    difficulties: porChave["hunts.difficulties"] ?? HUNT_DIFFICULTIES_PADRAO,
    reputationLevels: porChave["hunts.reputationLevels"] ?? HUNT_REPUTATION_LEVELS_PADRAO,
    difficultyWeightsByReputation: porChave["hunts.difficultyWeightsByReputation"] ?? HUNT_DIFFICULTY_WEIGHTS_BY_REPUTATION_PADRAO,
  };
}

async function updateAdminHuntConfig(payload, { idAdmin, req }) {
  // As três chaves são validadas cruzadas entre si (pool/pesos citam
  // chaves de difficulties), então sempre valida contra o estado FINAL
  // (payload novo, se enviado; senão o que já está salvo) — nunca só o
  // que veio nesta chamada, senão uma edição parcial que só muda
  // reputationLevels reprovaria por citar dificuldades que já existiam.
  const atual = await getAdminHuntConfig();
  const dificuldadesFinais = payload.difficulties !== undefined ? payload.difficulties : atual.difficulties;
  const niveisFinais = payload.reputationLevels !== undefined ? payload.reputationLevels : atual.reputationLevels;
  const pesosFinais = payload.difficultyWeightsByReputation !== undefined ? payload.difficultyWeightsByReputation : atual.difficultyWeightsByReputation;

  validarDificuldades(dificuldadesFinais);
  const chavesValidas = chavesDeDificuldade(dificuldadesFinais);
  validarNiveisDeReputacao(niveisFinais, chavesValidas);
  validarPesos(pesosFinais, niveisFinais, chavesValidas);

  const mudancas = [];
  if (payload.difficulties !== undefined) mudancas.push(["hunts.difficulties", dificuldadesFinais, "json", "Caçadas — tiers de dificuldade (multiplicadores/quantidade/recompensa)."]);
  if (payload.reputationLevels !== undefined) mudancas.push(["hunts.reputationLevels", niveisFinais, "json", "Caçadas — níveis de Reputação de Caçador."]);
  if (payload.difficultyWeightsByReputation !== undefined) mudancas.push(["hunts.difficultyWeightsByReputation", pesosFinais, "json", "Caçadas — pesos de sorteio de dificuldade por nível de Reputação."]);
  if (mudancas.length === 0) throw erro("Nada pra salvar — envie ao menos um campo.");

  await sequelize.transaction(async (transaction) => {
    for (const [chave, valor, tipo, descricao] of mudancas) {
      const existente = await GameSetting.findByPk(chave, { transaction, lock: transaction.LOCK.UPDATE });
      const dadosAntes = existente ? existente.toJSON() : null;
      const [registro] = await GameSetting.upsert(
        { chave, valor, tipo, descricao, editavel_admin: true, updated_by_admin_id: idAdmin },
        { transaction, returning: true },
      );
      await registrarAcao({ idAdmin, acao: existente ? "editar" : "criar", entidade: "GameSetting", idEntidade: null, dadosAntes, dadosDepois: registro.toJSON(), req, transaction });
    }
  });

  await gameSettingCache.recarregar();
  return getAdminHuntConfig();
}

module.exports = { getAdminHuntConfig, updateAdminHuntConfig };
