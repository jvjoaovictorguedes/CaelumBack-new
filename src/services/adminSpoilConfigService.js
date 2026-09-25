// Painel Administrativo Fase 10 — Balcão de Espólios não tem uma
// tabela de catálogo/template (confirmado lendo
// spoilOrderRotationService.js: o conteúdo de cada encomenda é gerado
// em cima do catálogo de Item/AdventureMonsterLoot já existentes, não
// de linhas admin-autoradas). O que É administrável é a CONFIGURAÇÃO
// de Reputação Comercial e das faixas de quantidade por raridade —
// guardada em game_settings (mesma tabela da Fase 14), sob chaves
// próprias, lida pelos services de jogo com fallback via
// gameSettingCache.js (nunca quebra se a linha não existir).
//
// Rotas próprias (permissão spoils.manage) em vez de reusar
// /api/admin/settings (que exige economy.manage) — sem isso, um admin
// com spoils.manage mas sem economy.manage não conseguiria configurar
// o módulo que a própria permissão dele existe pra cobrir.
const { sequelize } = require("../config/database");
const GameSetting = require("../models/GameSetting");
const gameSettingCache = require("./gameSettingCache");
const { registrarAcao } = require("./adminAuditService");
const {
  SPOIL_REPUTATION_LEVELS: SPOIL_REPUTATION_LEVELS_PADRAO,
  SPOIL_ORDER_QUANTITY_RANGES: SPOIL_ORDER_QUANTITY_RANGES_PADRAO,
  SPOIL_ORDER_REPUTATION: SPOIL_ORDER_REPUTATION_PADRAO,
  SPOIL_ORDER_SET_BONUS_REPUTATION: SPOIL_ORDER_SET_BONUS_REPUTATION_PADRAO,
} = require("../config/adventureGuildConfig");

const RARIDADES_VALIDAS = ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"];

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function validarNiveisDeReputacao(niveis) {
  if (!Array.isArray(niveis) || niveis.length === 0) throw erro("reputationLevels precisa ser uma lista não vazia.");
  let minimoAnterior = -1;
  for (const nivel of niveis) {
    if (typeof nivel.nivel !== "number" || typeof nivel.roman !== "string" || typeof nivel.nome !== "string") {
      throw erro("Cada nível precisa de nivel (number), roman (string) e nome (string).");
    }
    if (!Number.isInteger(nivel.minimo) || nivel.minimo < 0) throw erro(`minimo do nível "${nivel.nome}" precisa ser um inteiro >= 0.`);
    if (nivel.minimo <= minimoAnterior) throw erro("minimo precisa ser estritamente crescente entre os níveis, na ordem enviada.");
    minimoAnterior = nivel.minimo;
    if (typeof nivel.multiplicador !== "number" || nivel.multiplicador <= 0) throw erro(`multiplicador do nível "${nivel.nome}" precisa ser um número positivo.`);
    if (
      !Array.isArray(nivel.bonusFaixa) ||
      nivel.bonusFaixa.length !== 2 ||
      typeof nivel.bonusFaixa[0] !== "number" ||
      typeof nivel.bonusFaixa[1] !== "number" ||
      nivel.bonusFaixa[0] < 0 ||
      nivel.bonusFaixa[0] > nivel.bonusFaixa[1]
    ) {
      throw erro(`bonusFaixa do nível "${nivel.nome}" precisa ser [minimo, maximo] com 0 <= minimo <= maximo.`);
    }
  }
}

function validarFaixasDeQuantidade(faixas) {
  if (!faixas || typeof faixas !== "object" || Array.isArray(faixas)) throw erro("orderQuantityRanges precisa ser um objeto.");
  for (const raridade of RARIDADES_VALIDAS) {
    const faixa = faixas[raridade];
    if (!Array.isArray(faixa) || faixa.length !== 2 || !Number.isInteger(faixa[0]) || !Number.isInteger(faixa[1]) || faixa[0] < 1 || faixa[0] > faixa[1]) {
      throw erro(`orderQuantityRanges.${raridade} precisa ser [minimo, maximo] com 1 <= minimo <= maximo.`);
    }
  }
}

async function getAdminSpoilConfig() {
  const linhas = await GameSetting.findAll({
    where: { chave: ["spoils.reputationLevels", "spoils.orderQuantityRanges", "spoils.orderReputationReward", "spoils.setBonusReputationReward"] },
  });
  const porChave = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  return {
    reputationLevels: porChave["spoils.reputationLevels"] ?? SPOIL_REPUTATION_LEVELS_PADRAO,
    orderQuantityRanges: porChave["spoils.orderQuantityRanges"] ?? SPOIL_ORDER_QUANTITY_RANGES_PADRAO,
    orderReputationReward: porChave["spoils.orderReputationReward"] ?? SPOIL_ORDER_REPUTATION_PADRAO,
    setBonusReputationReward: porChave["spoils.setBonusReputationReward"] ?? SPOIL_ORDER_SET_BONUS_REPUTATION_PADRAO,
  };
}

async function updateAdminSpoilConfig(payload, { idAdmin, req }) {
  const mudancas = [];
  if (payload.reputationLevels !== undefined) {
    validarNiveisDeReputacao(payload.reputationLevels);
    mudancas.push(["spoils.reputationLevels", payload.reputationLevels, "json", "Balcão de Espólios — níveis de Reputação Comercial."]);
  }
  if (payload.orderQuantityRanges !== undefined) {
    validarFaixasDeQuantidade(payload.orderQuantityRanges);
    mudancas.push(["spoils.orderQuantityRanges", payload.orderQuantityRanges, "json", "Balcão de Espólios — faixa de quantidade exigida por encomenda, por raridade."]);
  }
  if (payload.orderReputationReward !== undefined) {
    if (!Number.isInteger(payload.orderReputationReward) || payload.orderReputationReward <= 0) throw erro("orderReputationReward precisa ser um inteiro positivo.");
    mudancas.push(["spoils.orderReputationReward", payload.orderReputationReward, "number", "Balcão de Espólios — pontos de Reputação Comercial por encomenda entregue."]);
  }
  if (payload.setBonusReputationReward !== undefined) {
    if (!Number.isInteger(payload.setBonusReputationReward) || payload.setBonusReputationReward <= 0) throw erro("setBonusReputationReward precisa ser um inteiro positivo.");
    mudancas.push(["spoils.setBonusReputationReward", payload.setBonusReputationReward, "number", "Balcão de Espólios — pontos de Reputação Comercial extra pelo lote 5/5."]);
  }
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
  return getAdminSpoilConfig();
}

module.exports = { RARIDADES_VALIDAS, getAdminSpoilConfig, updateAdminSpoilConfig };
