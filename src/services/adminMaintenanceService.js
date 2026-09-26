// Modo Manutenção — kill-switch site-wide: quando ativo, só admin
// consegue jogar (ver maintenanceMiddleware.js). Guardado em
// game_settings sob "maintenance.enabled"/"maintenance.message", igual
// qualquer outra config administrável (adminHuntConfigService.js/
// adminSpoilConfigService.js), com o mesmo cuidado de recarregar
// gameSettingCache logo depois de escrever pra nunca deixar a mudança
// demorando até 60s pra valer.
const { sequelize } = require("../config/database");
const GameSetting = require("../models/GameSetting");
const gameSettingCache = require("./gameSettingCache");
const { registrarAcao } = require("./adminAuditService");

const MENSAGEM_PADRAO = "Estamos em manutenção para melhorar sua experiência. Voltamos em breve — obrigado pela paciência!";

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function getMaintenanceStatus() {
  return {
    enabled: gameSettingCache.obter("maintenance.enabled", false),
    message: gameSettingCache.obter("maintenance.message", MENSAGEM_PADRAO),
  };
}

async function setMaintenanceStatus(payload, { idAdmin, req }) {
  const { enabled, message } = payload;
  if (typeof enabled !== "boolean") throw erro("enabled precisa ser boolean.");
  if (message !== undefined && (typeof message !== "string" || !message.trim())) {
    throw erro("message, quando enviada, precisa ser uma string não vazia.");
  }

  const mensagemFinal = message !== undefined ? message.trim() : undefined;

  await sequelize.transaction(async (transaction) => {
    const existenteEnabled = await GameSetting.findByPk("maintenance.enabled", { transaction, lock: transaction.LOCK.UPDATE });
    const antesEnabled = existenteEnabled ? existenteEnabled.toJSON() : null;
    const [registroEnabled] = await GameSetting.upsert(
      {
        chave: "maintenance.enabled",
        valor: enabled,
        tipo: "boolean",
        descricao: "Modo Manutenção — só admins conseguem jogar quando ativo.",
        editavel_admin: true,
        updated_by_admin_id: idAdmin,
      },
      { transaction, returning: true },
    );
    await registrarAcao({
      idAdmin,
      acao: existenteEnabled ? "editar" : "criar",
      entidade: "GameSetting",
      idEntidade: null,
      dadosAntes: antesEnabled,
      dadosDepois: registroEnabled.toJSON(),
      req,
      transaction,
    });

    if (mensagemFinal !== undefined) {
      const existenteMsg = await GameSetting.findByPk("maintenance.message", { transaction, lock: transaction.LOCK.UPDATE });
      const antesMsg = existenteMsg ? existenteMsg.toJSON() : null;
      const [registroMsg] = await GameSetting.upsert(
        {
          chave: "maintenance.message",
          valor: mensagemFinal,
          tipo: "string",
          descricao: "Modo Manutenção — mensagem amigável mostrada ao jogador.",
          editavel_admin: true,
          updated_by_admin_id: idAdmin,
        },
        { transaction, returning: true },
      );
      await registrarAcao({
        idAdmin,
        acao: existenteMsg ? "editar" : "criar",
        entidade: "GameSetting",
        idEntidade: null,
        dadosAntes: antesMsg,
        dadosDepois: registroMsg.toJSON(),
        req,
        transaction,
      });
    }
  });

  await gameSettingCache.recarregar();
  return getMaintenanceStatus();
}

module.exports = { MENSAGEM_PADRAO, getMaintenanceStatus, setMaintenanceStatus };
