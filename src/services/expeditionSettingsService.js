// Painel Administrativo de Expedição — Balanceamento. Cobre, na mesma
// tela, os 3 sistemas que o admin pediu pra balancear juntos (tempo/
// drops/progressão de Expedição, a chance de Emboscada que mora dentro
// dela, o perigo de Aventura e a escala de Aventura em Grupo), seguindo
// o MESMO padrão já validado em forgeSettingsService.js: persiste só
// dados já validados em GameSetting (nunca JS/fórmula arbitrária), e
// aplica por cima dos defaults dos respectivos arquivos de config via
// mutação em-lugar (aplicarOverridesBalanceamento de cada config).
const { sequelize } = require("../config/database");
const GameSetting = require("../models/GameSetting");
const expeditionConfig = require("../config/expeditionConfig");
const adventureConfig = require("../config/adventureConfig");
const partyBattleConfig = require("../config/partyBattleConfig");
const { registrarAcao } = require("./adminAuditService");

const GRUPOS = [
  "expedition.cooldown",
  "expedition.progression",
  "expedition.drops",
  "expedition.ambush",
  "adventure.danger",
  "party.balance",
];

const CONFIG_POR_GRUPO = {
  "expedition.cooldown": expeditionConfig,
  "expedition.progression": expeditionConfig,
  "expedition.drops": expeditionConfig,
  "expedition.ambush": expeditionConfig,
  "adventure.danger": adventureConfig,
  "party.balance": partyBattleConfig,
};

const QUALIDADES = ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"];

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

// Snapshot dos defaults ORIGINAIS, congelado no require (antes de
// qualquer override) — só pra exibir "valor padrão" no Admin.
const DEFAULTS_ORIGINAIS = {
  "expedition.cooldown": { TEMPO_COLETA_MS: expeditionConfig.TEMPO_COLETA_MS },
  "expedition.progression": {
    XP_NECESSARIO_POR_ETAPA: { ...expeditionConfig.XP_NECESSARIO_POR_ETAPA },
    XP_POR_RESULTADO: { ...expeditionConfig.XP_POR_RESULTADO },
  },
  "expedition.drops": {
    CHANCE_POR_NIVEL_PPM: Object.fromEntries(
      Object.entries(expeditionConfig.CHANCE_POR_NIVEL_PPM).map(([n, t]) => [n, { ...t }]),
    ),
    QUANTIDADE_POR_NIVEL: Object.fromEntries(
      Object.entries(expeditionConfig.QUANTIDADE_POR_NIVEL).map(([n, faixa]) => [n, [...faixa]]),
    ),
  },
  "expedition.ambush": { CHANCE_MONSTRO_PPM: expeditionConfig.CHANCE_MONSTRO_PPM },
  "adventure.danger": { ...adventureConfig.LIMIAR_PERIGO },
  "party.balance": {
    TAMANHO_MAXIMO_GRUPO: partyBattleConfig.TAMANHO_MAXIMO_GRUPO,
    TAMANHO_MINIMO_GRUPO: partyBattleConfig.TAMANHO_MINIMO_GRUPO,
    PRAZO_CONVITE_MS: partyBattleConfig.PRAZO_CONVITE_MS,
    PRAZO_TURNO_MS: partyBattleConfig.PRAZO_TURNO_MS,
    MAX_RODADAS: partyBattleConfig.MAX_RODADAS,
    FATOR_DIFICULDADE_VIDA_POR_EXTRA: partyBattleConfig.FATOR_DIFICULDADE_VIDA_POR_EXTRA,
    FATOR_DIFICULDADE_DANO_POR_EXTRA: partyBattleConfig.FATOR_DIFICULDADE_DANO_POR_EXTRA,
  },
};

function getDefaults(grupo) {
  return DEFAULTS_ORIGINAIS[grupo];
}

// Lido direto dos módulos de config (com overrides já aplicados) —
// impossível divergir do que o gameplay de verdade usa.
function getSnapshotAtual(grupo) {
  switch (grupo) {
    case "expedition.cooldown":
      return { TEMPO_COLETA_MS: expeditionConfig.TEMPO_COLETA_MS };
    case "expedition.progression":
      return {
        XP_NECESSARIO_POR_ETAPA: { ...expeditionConfig.XP_NECESSARIO_POR_ETAPA },
        XP_POR_RESULTADO: { ...expeditionConfig.XP_POR_RESULTADO },
      };
    case "expedition.drops":
      return {
        CHANCE_POR_NIVEL_PPM: Object.fromEntries(
          Object.entries(expeditionConfig.CHANCE_POR_NIVEL_PPM).map(([n, t]) => [n, { ...t }]),
        ),
        QUANTIDADE_POR_NIVEL: Object.fromEntries(
          Object.entries(expeditionConfig.QUANTIDADE_POR_NIVEL).map(([n, faixa]) => [n, [...faixa]]),
        ),
      };
    case "expedition.ambush":
      return { CHANCE_MONSTRO_PPM: expeditionConfig.CHANCE_MONSTRO_PPM };
    case "adventure.danger":
      return { ...adventureConfig.LIMIAR_PERIGO };
    case "party.balance":
      return {
        TAMANHO_MAXIMO_GRUPO: partyBattleConfig.TAMANHO_MAXIMO_GRUPO,
        TAMANHO_MINIMO_GRUPO: partyBattleConfig.TAMANHO_MINIMO_GRUPO,
        PRAZO_CONVITE_MS: partyBattleConfig.PRAZO_CONVITE_MS,
        PRAZO_TURNO_MS: partyBattleConfig.PRAZO_TURNO_MS,
        MAX_RODADAS: partyBattleConfig.MAX_RODADAS,
        FATOR_DIFICULDADE_VIDA_POR_EXTRA: partyBattleConfig.FATOR_DIFICULDADE_VIDA_POR_EXTRA,
        FATOR_DIFICULDADE_DANO_POR_EXTRA: partyBattleConfig.FATOR_DIFICULDADE_DANO_POR_EXTRA,
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

function validarInteiroPositivo(nome, valor) {
  if (!Number.isInteger(valor) || valor <= 0) throw erro(`${nome} precisa ser um inteiro positivo.`);
}

function validarPpm(nome, valor) {
  if (!Number.isInteger(valor) || valor < 0 || valor > 1_000_000) {
    throw erro(`${nome} precisa estar entre 0 e 1.000.000 PPM.`);
  }
}

function validarGrupo(grupo, valores) {
  if (!GRUPOS.includes(grupo)) throw erro(`Grupo de balanceamento desconhecido: ${grupo}.`);
  if (!valores || typeof valores !== "object") throw erro("Payload de balanceamento vazio.");

  if (grupo === "expedition.cooldown") {
    if (valores.TEMPO_COLETA_MS !== undefined) validarInteiroPositivo("TEMPO_COLETA_MS", valores.TEMPO_COLETA_MS);
    return;
  }

  if (grupo === "expedition.progression") {
    if (valores.XP_NECESSARIO_POR_ETAPA) {
      for (const [etapa, xp] of Object.entries(valores.XP_NECESSARIO_POR_ETAPA)) {
        validarInteiroPositivo(`XP_NECESSARIO_POR_ETAPA[${etapa}]`, xp);
      }
    }
    if (valores.XP_POR_RESULTADO) {
      for (const [resultado, xp] of Object.entries(valores.XP_POR_RESULTADO)) {
        if (!Number.isInteger(xp) || xp < 0) throw erro(`XP_POR_RESULTADO[${resultado}] precisa ser um inteiro >= 0.`);
      }
    }
    return;
  }

  if (grupo === "expedition.drops") {
    if (valores.CHANCE_POR_NIVEL_PPM) {
      for (const [nivel, tabela] of Object.entries(valores.CHANCE_POR_NIVEL_PPM)) {
        let soma = 0;
        for (const qualidade of QUALIDADES) {
          const valor = tabela[qualidade];
          if (valor === undefined) continue;
          validarPpm(`CHANCE_POR_NIVEL_PPM[${nivel}][${qualidade}]`, valor);
          soma += valor;
        }
        if (soma > 1_000_000) throw erro(`CHANCE_POR_NIVEL_PPM[${nivel}]: soma das chances (${soma}) não pode passar de 1.000.000 PPM.`);
      }
    }
    if (valores.QUANTIDADE_POR_NIVEL) {
      for (const [nivel, faixa] of Object.entries(valores.QUANTIDADE_POR_NIVEL)) {
        if (!Array.isArray(faixa) || faixa.length !== 2) throw erro(`QUANTIDADE_POR_NIVEL[${nivel}] precisa ser [min, max].`);
        const [minimo, maximo] = faixa;
        if (!Number.isInteger(minimo) || !Number.isInteger(maximo) || minimo < 1 || maximo < minimo) {
          throw erro(`QUANTIDADE_POR_NIVEL[${nivel}] precisa ter min >= 1 e max >= min.`);
        }
      }
    }
    return;
  }

  if (grupo === "expedition.ambush") {
    if (valores.CHANCE_MONSTRO_PPM !== undefined) validarPpm("CHANCE_MONSTRO_PPM", valores.CHANCE_MONSTRO_PPM);
    return;
  }

  if (grupo === "adventure.danger") {
    const medio = valores.MEDIO;
    const alto = valores.ALTO;
    if (medio !== undefined && (!Number.isInteger(medio) || medio < 0)) throw erro("MEDIO precisa ser um inteiro >= 0.");
    if (alto !== undefined && (!Number.isInteger(alto) || alto < 0)) throw erro("ALTO precisa ser um inteiro >= 0.");
    const medioFinal = medio ?? adventureConfig.LIMIAR_PERIGO.MEDIO;
    const altoFinal = alto ?? adventureConfig.LIMIAR_PERIGO.ALTO;
    if (altoFinal <= medioFinal) throw erro("ALTO precisa ser maior que MEDIO.");
    return;
  }

  if (grupo === "party.balance") {
    const max = valores.TAMANHO_MAXIMO_GRUPO ?? partyBattleConfig.TAMANHO_MAXIMO_GRUPO;
    const min = valores.TAMANHO_MINIMO_GRUPO ?? partyBattleConfig.TAMANHO_MINIMO_GRUPO;
    if (valores.TAMANHO_MAXIMO_GRUPO !== undefined) validarInteiroPositivo("TAMANHO_MAXIMO_GRUPO", valores.TAMANHO_MAXIMO_GRUPO);
    if (valores.TAMANHO_MINIMO_GRUPO !== undefined) validarInteiroPositivo("TAMANHO_MINIMO_GRUPO", valores.TAMANHO_MINIMO_GRUPO);
    if (min < 2) throw erro("TAMANHO_MINIMO_GRUPO precisa ser >= 2 (grupo de 1 não é grupo).");
    if (max < min) throw erro("TAMANHO_MAXIMO_GRUPO precisa ser >= TAMANHO_MINIMO_GRUPO.");
    if (valores.PRAZO_CONVITE_MS !== undefined) validarInteiroPositivo("PRAZO_CONVITE_MS", valores.PRAZO_CONVITE_MS);
    if (valores.PRAZO_TURNO_MS !== undefined) validarInteiroPositivo("PRAZO_TURNO_MS", valores.PRAZO_TURNO_MS);
    if (valores.MAX_RODADAS !== undefined) validarInteiroPositivo("MAX_RODADAS", valores.MAX_RODADAS);
    if (valores.FATOR_DIFICULDADE_VIDA_POR_EXTRA !== undefined) {
      const v = valores.FATOR_DIFICULDADE_VIDA_POR_EXTRA;
      if (typeof v !== "number" || v < 0) throw erro("FATOR_DIFICULDADE_VIDA_POR_EXTRA precisa ser um número >= 0 (fração, ex.: 0.12 = +12%).");
    }
    if (valores.FATOR_DIFICULDADE_DANO_POR_EXTRA !== undefined) {
      const v = valores.FATOR_DIFICULDADE_DANO_POR_EXTRA;
      if (typeof v !== "number" || v < 0) throw erro("FATOR_DIFICULDADE_DANO_POR_EXTRA precisa ser um número >= 0 (fração, ex.: 0.08 = +8%).");
    }
    return;
  }
}

async function updateBalanceamento(grupo, valores, { idAdmin, req } = {}) {
  validarGrupo(grupo, valores);
  const config = CONFIG_POR_GRUPO[grupo];

  const resultado = await sequelize.transaction(async (transaction) => {
    const existente = await GameSetting.findByPk(grupo, { transaction, lock: transaction.LOCK.UPDATE });
    const dadosAntes = existente ? existente.toJSON() : null;
    const [registro] = await GameSetting.upsert(
      { chave: grupo, valor: valores, tipo: "json", editavel_admin: true, updated_by_admin_id: idAdmin },
      { transaction, returning: true },
    );
    await registrarAcao({
      idAdmin,
      acao: "UPDATE_EXPEDITION_BALANCE",
      entidade: "GameSetting",
      idEntidade: null,
      dadosAntes,
      dadosDepois: { grupo, ...registro.toJSON() },
      req,
      transaction,
    });
    return registro;
  });

  config.aplicarOverridesBalanceamento(grupo, valores);
  return { atual: getSnapshotAtual(grupo), padrao: getDefaults(grupo), atualizado_em: resultado.updatedAt };
}

// Recarrega TODOS os grupos persistidos no boot — mesmo padrão do
// forgeSettingsService, pra sobreviver a restart.
async function aplicarPersistidosNoBoot() {
  const linhas = await GameSetting.findAll({ where: { chave: GRUPOS } });
  for (const linha of linhas) {
    try {
      CONFIG_POR_GRUPO[linha.chave].aplicarOverridesBalanceamento(linha.chave, linha.valor);
    } catch (error) {
      console.error(`[expeditionSettingsService] falha ao aplicar overrides de "${linha.chave}" no boot:`, error);
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
