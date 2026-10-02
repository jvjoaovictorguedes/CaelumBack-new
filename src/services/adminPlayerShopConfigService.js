// Painel Administrativo — Loja do Aventureiro V2 §9/§18/§19: taxas,
// limites de preço/quantidade, prazos de negociação/entrega e
// kill-switch, guardados em game_settings (mesmo padrão de
// adminSpoilConfigService.js/adminHuntConfigService.js), lidos pelos
// services de jogo via gameSettingCache (nunca quebra se a linha não
// existir — cai no mesmo valor hardcoded que já existia antes desta
// configuração existir).
const { sequelize } = require("../config/database");
const GameSetting = require("../models/GameSetting");
const gameSettingCache = require("./gameSettingCache");
const { registrarAcao } = require("./adminAuditService");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

// Valores padrão — idênticos aos hardcoded que existiam nas Fases 5/6/7
// antes desta configuração existir, pra uma linha nunca mudar
// comportamento até um admin editar de propósito.
const PADRAO = {
  "playershop.ativo": true,
  "playershop.taxaEncomenda": 0.08,
  "playershop.precoMinimoUnitario": 1,
  "playershop.precoMaximoUnitario": 1_000_000,
  "playershop.quantidadeMaxima": 999_999,
  "playershop.prazoEntregaMinimoDias": 1,
  "playershop.prazoEntregaMaximoDias": 60,
  "playershop.prazoNegociacaoDias": 3,
  "playershop.prazoDemandaMinimoDias": 1,
  "playershop.prazoDemandaMaximoDias": 30,
  "playershop.prazoDemandaPadraoDias": 7,
};

const CHAVES = Object.keys(PADRAO);

function obter(chave) {
  return gameSettingCache.obter(chave, PADRAO[chave]);
}

async function getAdminPlayerShopConfig() {
  const linhas = await GameSetting.findAll({ where: { chave: CHAVES } });
  const porChave = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  const config = {};
  for (const chave of CHAVES) config[chave] = porChave[chave] ?? PADRAO[chave];
  return config;
}

function validarNumeroPositivo(valor, nomeCampo, { inteiro = true } = {}) {
  if (typeof valor !== "number" || Number.isNaN(valor) || valor <= 0) {
    throw erro(`${nomeCampo} precisa ser um número positivo.`);
  }
  if (inteiro && !Number.isInteger(valor)) throw erro(`${nomeCampo} precisa ser um inteiro.`);
}

async function updateAdminPlayerShopConfig(payload, { idAdmin, req }) {
  const mudancas = [];

  if (payload["playershop.ativo"] !== undefined) {
    if (typeof payload["playershop.ativo"] !== "boolean") throw erro("playershop.ativo precisa ser um boolean.");
    mudancas.push(["playershop.ativo", payload["playershop.ativo"], "boolean", "Loja do Aventureiro — kill-switch (desligar publicação de produtos/demandas/encomendas novas)."]);
  }
  if (payload["playershop.taxaEncomenda"] !== undefined) {
    const taxa = Number(payload["playershop.taxaEncomenda"]);
    if (Number.isNaN(taxa) || taxa < 0 || taxa > 1) throw erro("playershop.taxaEncomenda precisa ser entre 0 e 1 (ex.: 0.08 = 8%).");
    mudancas.push(["playershop.taxaEncomenda", taxa, "number", "Loja do Aventureiro — taxa cobrada na entrega de uma Encomenda."]);
  }
  if (payload["playershop.precoMinimoUnitario"] !== undefined) {
    validarNumeroPositivo(payload["playershop.precoMinimoUnitario"], "playershop.precoMinimoUnitario");
    mudancas.push(["playershop.precoMinimoUnitario", payload["playershop.precoMinimoUnitario"], "number", "Loja do Aventureiro — preço unitário mínimo (produtos/demandas/encomendas)."]);
  }
  if (payload["playershop.precoMaximoUnitario"] !== undefined) {
    validarNumeroPositivo(payload["playershop.precoMaximoUnitario"], "playershop.precoMaximoUnitario");
    mudancas.push(["playershop.precoMaximoUnitario", payload["playershop.precoMaximoUnitario"], "number", "Loja do Aventureiro — preço unitário máximo (produtos/demandas/encomendas)."]);
  }
  if (payload["playershop.quantidadeMaxima"] !== undefined) {
    validarNumeroPositivo(payload["playershop.quantidadeMaxima"], "playershop.quantidadeMaxima");
    mudancas.push(["playershop.quantidadeMaxima", payload["playershop.quantidadeMaxima"], "number", "Loja do Aventureiro — quantidade máxima por demanda/encomenda."]);
  }
  if (payload["playershop.prazoEntregaMinimoDias"] !== undefined) {
    validarNumeroPositivo(payload["playershop.prazoEntregaMinimoDias"], "playershop.prazoEntregaMinimoDias");
    mudancas.push(["playershop.prazoEntregaMinimoDias", payload["playershop.prazoEntregaMinimoDias"], "number", "Loja do Aventureiro — prazo de entrega mínimo (dias) numa Encomenda."]);
  }
  if (payload["playershop.prazoEntregaMaximoDias"] !== undefined) {
    validarNumeroPositivo(payload["playershop.prazoEntregaMaximoDias"], "playershop.prazoEntregaMaximoDias");
    mudancas.push(["playershop.prazoEntregaMaximoDias", payload["playershop.prazoEntregaMaximoDias"], "number", "Loja do Aventureiro — prazo de entrega máximo (dias) numa Encomenda."]);
  }
  if (payload["playershop.prazoNegociacaoDias"] !== undefined) {
    validarNumeroPositivo(payload["playershop.prazoNegociacaoDias"], "playershop.prazoNegociacaoDias");
    mudancas.push(["playershop.prazoNegociacaoDias", payload["playershop.prazoNegociacaoDias"], "number", "Loja do Aventureiro — prazo (dias) pra negociação de uma Encomenda expirar."]);
  }
  if (payload["playershop.prazoDemandaMinimoDias"] !== undefined) {
    validarNumeroPositivo(payload["playershop.prazoDemandaMinimoDias"], "playershop.prazoDemandaMinimoDias");
    mudancas.push(["playershop.prazoDemandaMinimoDias", payload["playershop.prazoDemandaMinimoDias"], "number", "Loja do Aventureiro — prazo mínimo (dias) de uma Demanda."]);
  }
  if (payload["playershop.prazoDemandaMaximoDias"] !== undefined) {
    validarNumeroPositivo(payload["playershop.prazoDemandaMaximoDias"], "playershop.prazoDemandaMaximoDias");
    mudancas.push(["playershop.prazoDemandaMaximoDias", payload["playershop.prazoDemandaMaximoDias"], "number", "Loja do Aventureiro — prazo máximo (dias) de uma Demanda."]);
  }
  if (payload["playershop.prazoDemandaPadraoDias"] !== undefined) {
    validarNumeroPositivo(payload["playershop.prazoDemandaPadraoDias"], "playershop.prazoDemandaPadraoDias");
    mudancas.push(["playershop.prazoDemandaPadraoDias", payload["playershop.prazoDemandaPadraoDias"], "number", "Loja do Aventureiro — prazo padrão (dias) de uma Demanda quando o jogador não escolhe."]);
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
  return getAdminPlayerShopConfig();
}

function verificarAtivo() {
  if (!obter("playershop.ativo")) {
    throw erro("A Loja do Aventureiro está temporariamente desativada pela administração.", 503);
  }
}

module.exports = {
  PADRAO,
  obter,
  verificarAtivo,
  getAdminPlayerShopConfig,
  updateAdminPlayerShopConfig,
};
