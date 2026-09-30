// Painel Administrativo de Pesca — Balanceamento (pedido do jogador: editar
// o XP necessário por nível de Pesca e o buff de Proficiência por nível).
// Mesmo padrão exato de forgeSettingsService.js: persiste SÓ dados
// validados em GameSetting (chaves fishing.progression/fishing.proficiency
// — nunca JavaScript/expressões arbitrárias), e aplica por cima dos
// defaults de fishingConfig.js via mutação em-lugar (ver
// fishingConfig.aplicarOverridesBalanceamento).
//
// O buff de Refinamento da vara de pesca NÃO tem grupo aqui de propósito:
// a vara reaproveita a MESMA tabela de bônus de refinamento de qualquer
// equipamento (BONUS_ATRIBUTO_REFINAMENTO_PCT, em forgeConfig.js/
// forgeSettingsService.js, grupo "forge.refinement") — editável em
// Forja → Balanceamento → Refinamento, nunca duplicada aqui.
const { sequelize } = require("../config/database");
const GameSetting = require("../models/GameSetting");
const fishingConfig = require("../config/fishingConfig");
const { registrarAcao } = require("./adminAuditService");

const GRUPOS = ["fishing.progression", "fishing.proficiency"];

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

// Snapshot dos defaults ORIGINAIS de fishingConfig, congelado no require
// (antes de qualquer override) — só pra exibir "valor padrão" no Admin e
// pra resetar; nunca usado em cálculo de gameplay.
const DEFAULTS_ORIGINAIS = {
  "fishing.progression": {
    XP_NECESSARIO_POR_ETAPA_PESCA: { ...fishingConfig.XP_NECESSARIO_POR_ETAPA_PESCA },
  },
  "fishing.proficiency": {
    PROFICIENCIA_PCT_POR_NIVEL: { ...fishingConfig.PROFICIENCIA_PCT_POR_NIVEL },
  },
};

function getDefaults(grupo) {
  return DEFAULTS_ORIGINAIS[grupo];
}

// Snapshot do que está REALMENTE em vigor agora (defaults + overrides já
// aplicados) — lido direto dos objetos de fishingConfig, então é
// impossível divergir do que o gameplay de verdade usa.
function getSnapshotAtual(grupo) {
  switch (grupo) {
    case "fishing.progression":
      return {
        XP_NECESSARIO_POR_ETAPA_PESCA: { ...fishingConfig.XP_NECESSARIO_POR_ETAPA_PESCA },
        XP_TOTAL_PARA_NIVEL_PESCA: { ...fishingConfig.XP_TOTAL_PARA_NIVEL_PESCA },
        NIVEL_MAXIMO_PESCA: fishingConfig.NIVEL_MAXIMO_PESCA,
      };
    case "fishing.proficiency":
      return {
        PROFICIENCIA_PCT_POR_NIVEL: { ...fishingConfig.PROFICIENCIA_PCT_POR_NIVEL },
      };
    default:
      throw erro(`Grupo de balanceamento desconhecido: ${grupo}.`);
  }
}

async function getBalanceamentoCompleto() {
  const out = {};
  for (const grupo of GRUPOS) {
    out[grupo] = { atual: getSnapshotAtual(grupo), padrao: getDefaults(grupo) };
  }
  return out;
}

function validarGrupo(grupo, valores) {
  if (!GRUPOS.includes(grupo)) throw erro(`Grupo de balanceamento desconhecido: ${grupo}.`);
  if (!valores || typeof valores !== "object") throw erro("Payload de balanceamento vazio.");

  if (grupo === "fishing.progression") {
    // V1 — editar a curva de XP exige confirmação explícita, mesmo
    // critério de forge.progression (§11.2 da spec de Forja): evita
    // salvar sem querer uma curva que quebra a progressão de quem já
    // está no meio do caminho.
    if (!valores.confirmado) {
      throw erro("Editar a curva de XP da Pesca exige confirmação explícita (confirmado: true) depois de revisar o impacto.");
    }
    if (valores.XP_NECESSARIO_POR_ETAPA_PESCA) {
      for (const [etapa, xp] of Object.entries(valores.XP_NECESSARIO_POR_ETAPA_PESCA)) {
        const etapaNum = Number(etapa);
        if (!Number.isInteger(etapaNum) || etapaNum < 1 || etapaNum >= fishingConfig.NIVEL_MAXIMO_PESCA) {
          throw erro(`XP_NECESSARIO_POR_ETAPA_PESCA[${etapa}] precisa ser uma etapa entre 1 e ${fishingConfig.NIVEL_MAXIMO_PESCA - 1}.`);
        }
        if (!Number.isInteger(xp) || xp <= 0) throw erro(`XP_NECESSARIO_POR_ETAPA_PESCA[${etapa}] precisa ser um inteiro positivo.`);
      }
    }
    return;
  }

  if (grupo === "fishing.proficiency") {
    if (valores.PROFICIENCIA_PCT_POR_NIVEL) {
      for (const [campo, pct] of Object.entries(valores.PROFICIENCIA_PCT_POR_NIVEL)) {
        if (!Object.prototype.hasOwnProperty.call(fishingConfig.PROFICIENCIA_PCT_POR_NIVEL, campo)) {
          throw erro(`PROFICIENCIA_PCT_POR_NIVEL não tem o campo "${campo}".`);
        }
        if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0 || pct > 0.1) {
          throw erro(`PROFICIENCIA_PCT_POR_NIVEL[${campo}] precisa estar entre 0 e 0.1 (0% a 10% por nível).`);
        }
      }
    }
    return;
  }
}

async function updateBalanceamento(grupo, valores, { idAdmin, req } = {}) {
  validarGrupo(grupo, valores);

  const resultado = await sequelize.transaction(async (transaction) => {
    const existente = await GameSetting.findByPk(grupo, { transaction, lock: transaction.LOCK.UPDATE });
    const dadosAntes = existente ? existente.toJSON() : null;
    const [registro] = await GameSetting.upsert(
      { chave: grupo, valor: valores, tipo: "json", editavel_admin: true, updated_by_admin_id: idAdmin },
      { transaction, returning: true },
    );
    await registrarAcao({
      idAdmin,
      acao: "UPDATE_FISHING_BALANCE",
      entidade: "GameSetting",
      idEntidade: null,
      dadosAntes,
      dadosDepois: { grupo, ...registro.toJSON() },
      req,
      transaction,
    });
    return registro;
  });

  fishingConfig.aplicarOverridesBalanceamento(grupo, valores);
  return { atual: getSnapshotAtual(grupo), padrao: getDefaults(grupo), atualizado_em: resultado.updatedAt };
}

// Recarrega TODOS os grupos persistidos e reaplica no fishingConfig —
// usado no boot (mesmo padrão de forgeSettingsService) pra sobreviver a
// restart.
async function aplicarPersistidosNoBoot() {
  const linhas = await GameSetting.findAll({ where: { chave: GRUPOS } });
  for (const linha of linhas) {
    try {
      fishingConfig.aplicarOverridesBalanceamento(linha.chave, linha.valor);
    } catch (error) {
      console.error(`[fishingSettingsService] falha ao aplicar overrides de "${linha.chave}" no boot:`, error);
    }
  }
}

module.exports = {
  GRUPOS,
  getBalanceamentoCompleto,
  getSnapshotAtual,
  getDefaults,
  validarGrupo,
  updateBalanceamento,
  aplicarPersistidosNoBoot,
};
