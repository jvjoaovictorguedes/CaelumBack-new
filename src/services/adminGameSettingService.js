// Painel Administrativo Fase 14 (§25) — GameSetting é só pra parâmetros
// operacionais deliberadamente administráveis (taxas, limites,
// parâmetros econômicos), nunca um banco de TODAS as constantes do
// jogo. Esse limite não é técnico (o service aceitaria qualquer
// chave/valor), é de processo: só cria aqui o que faz sentido mudar
// sem deploy.
const { sequelize } = require("../config/database");
const GameSetting = require("../models/GameSetting");
const { registrarAcao } = require("./adminAuditService");
const gameSettingCache = require("./gameSettingCache");

const TIPOS_VALIDOS = ["number", "boolean", "string", "json"];

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

// Valida que `valor` bate com o `tipo` declarado — sem isso a chave
// diz "number" mas qualquer JSON passa, e quem lê a configuração no
// código teria que se defender de tipo errado toda vez.
function validarValorPorTipo(valor, tipo) {
  switch (tipo) {
    case "number":
      if (typeof valor !== "number" || Number.isNaN(valor)) throw erro('valor precisa ser number pro tipo "number".');
      break;
    case "boolean":
      if (typeof valor !== "boolean") throw erro('valor precisa ser boolean pro tipo "boolean".');
      break;
    case "string":
      if (typeof valor !== "string") throw erro('valor precisa ser string pro tipo "string".');
      break;
    case "json":
      break;
    default:
      throw erro(`tipo precisa ser um de: ${TIPOS_VALIDOS.join(", ")}.`);
  }
}

async function listAdminGameSettings() {
  return GameSetting.findAll({ order: [["chave", "ASC"]] });
}

// Recarrega o cache em memória (gameSettingCache.js) depois de cada
// escrita bem-sucedida — sem isso, fórmulas de jogo
// (spoilReputationService.js/hunterReputationService.js) continuariam
// lendo o valor antigo até o próximo ciclo de 60s do cache.
async function upsertAdminGameSetting(chave, dados, { idAdmin, req }) {
  if (!chave || typeof chave !== "string") throw erro("chave é obrigatória.");
  const tipo = dados.tipo ?? "json";
  if (!TIPOS_VALIDOS.includes(tipo)) throw erro(`tipo precisa ser um de: ${TIPOS_VALIDOS.join(", ")}.`);
  if (dados.valor === undefined) throw erro("valor é obrigatório.");
  validarValorPorTipo(dados.valor, tipo);

  const registro = await sequelize.transaction(async (transaction) => {
    const existente = await GameSetting.findByPk(chave, { transaction, lock: transaction.LOCK.UPDATE });

    if (existente && !existente.editavel_admin) {
      throw erro(`"${chave}" não é editável pelo painel.`, 403);
    }

    const dadosAntes = existente ? existente.toJSON() : null;

    const [novoRegistro] = await GameSetting.upsert(
      {
        chave,
        valor: dados.valor,
        tipo,
        descricao: dados.descricao ?? existente?.descricao ?? null,
        editavel_admin: dados.editavel_admin ?? existente?.editavel_admin ?? true,
        updated_by_admin_id: idAdmin,
      },
      { transaction, returning: true },
    );

    await registrarAcao({
      idAdmin,
      acao: existente ? "editar" : "criar",
      entidade: "GameSetting",
      idEntidade: null,
      dadosAntes,
      dadosDepois: novoRegistro.toJSON(),
      req,
      transaction,
    });

    return novoRegistro;
  });

  // Fora da transação, só depois dela confirmar de verdade.
  await gameSettingCache.recarregar();
  return registro;
}

module.exports = {
  TIPOS_VALIDOS,
  listAdminGameSettings,
  upsertAdminGameSetting,
};
