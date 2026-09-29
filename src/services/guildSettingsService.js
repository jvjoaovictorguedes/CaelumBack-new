// Painel Administrativo de Guilda — Balanceamento. Mesmo padrão já
// validado em expeditionSettingsService.js/forgeSettingsService.js:
// persiste só dados já validados em GameSetting (nunca JS/fórmula
// arbitrária), e aplica por cima dos defaults de guildConfig.js via
// mutação em-lugar (guildConfig.aplicarOverridesBalanceamento).
const { sequelize } = require("../config/database");
const GameSetting = require("../models/GameSetting");
const guildConfig = require("../config/guildConfig");
const gameSettingCache = require("./gameSettingCache");
const { registrarAcao } = require("./adminAuditService");

const GRUPOS = ["guild.ranks", "guild.carencia", "guild.buffs", "guild.contribuicao", "guild.boss"];

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

// Snapshot dos defaults ORIGINAIS, congelado no require (antes de
// qualquer override) — só pra exibir "valor padrão" no Admin.
const DEFAULTS_ORIGINAIS = {
  "guild.ranks": { ...guildConfig.REQUISITOS_RANK_GUILDA },
  "guild.carencia": { CARENCIA_NOVO_MEMBRO_MS: guildConfig.CARENCIA_NOVO_MEMBRO_MS },
  "guild.buffs": clonarBuffNiveis(guildConfig.BUFF_NIVEIS),
  "guild.contribuicao": {
    PONTOS_CONTRIBUICAO: { ...guildConfig.PONTOS_CONTRIBUICAO },
    XP_GUILDA_MISSAO_RANK_MIN: guildConfig.XP_GUILDA_MISSAO_RANK_MIN,
    XP_GUILDA_MISSAO_RANK_MAX: guildConfig.XP_GUILDA_MISSAO_RANK_MAX,
  },
  "guild.boss": {
    BOSS_FRACAO_IGUALITARIA: guildConfig.BOSS_FRACAO_IGUALITARIA,
    BOSS_FRACAO_PROPORCIONAL: guildConfig.BOSS_FRACAO_PROPORCIONAL,
    BOSS_AO_VIVO_TAMANHO_MAXIMO: guildConfig.BOSS_AO_VIVO_TAMANHO_MAXIMO,
    BOSS_AO_VIVO_TAMANHO_MINIMO: guildConfig.BOSS_AO_VIVO_TAMANHO_MINIMO,
    BOSS_AO_VIVO_PRAZO_TURNO_MS: guildConfig.BOSS_AO_VIVO_PRAZO_TURNO_MS,
    BOSS_AO_VIVO_FATOR_ESCALADA_DANO: guildConfig.BOSS_AO_VIVO_FATOR_ESCALADA_DANO,
    BOSS_AO_VIVO_MAX_RODADAS: guildConfig.BOSS_AO_VIVO_MAX_RODADAS,
  },
};

function clonarBuffNiveis(buffNiveis) {
  return Object.fromEntries(
    guildConfig.BUFF_TIPOS.map((tipo) => [
      tipo,
      Object.fromEntries(Object.entries(buffNiveis[tipo]).map(([nivel, tabela]) => [nivel, { ...tabela }])),
    ]),
  );
}

function getDefaults(grupo) {
  return DEFAULTS_ORIGINAIS[grupo];
}

// Lido direto do módulo de config (com overrides já aplicados) —
// impossível divergir do que o gameplay de verdade usa.
function getSnapshotAtual(grupo) {
  switch (grupo) {
    case "guild.ranks":
      return { ...guildConfig.REQUISITOS_RANK_GUILDA };
    case "guild.carencia":
      return { CARENCIA_NOVO_MEMBRO_MS: guildConfig.CARENCIA_NOVO_MEMBRO_MS };
    case "guild.buffs":
      return clonarBuffNiveis(guildConfig.BUFF_NIVEIS);
    case "guild.contribuicao":
      return {
        PONTOS_CONTRIBUICAO: { ...guildConfig.PONTOS_CONTRIBUICAO },
        XP_GUILDA_MISSAO_RANK_MIN: guildConfig.XP_GUILDA_MISSAO_RANK_MIN,
        XP_GUILDA_MISSAO_RANK_MAX: guildConfig.XP_GUILDA_MISSAO_RANK_MAX,
      };
    case "guild.boss":
      return {
        BOSS_FRACAO_IGUALITARIA: guildConfig.BOSS_FRACAO_IGUALITARIA,
        BOSS_FRACAO_PROPORCIONAL: guildConfig.BOSS_FRACAO_PROPORCIONAL,
        BOSS_AO_VIVO_TAMANHO_MAXIMO: guildConfig.BOSS_AO_VIVO_TAMANHO_MAXIMO,
        BOSS_AO_VIVO_TAMANHO_MINIMO: guildConfig.BOSS_AO_VIVO_TAMANHO_MINIMO,
        BOSS_AO_VIVO_PRAZO_TURNO_MS: guildConfig.BOSS_AO_VIVO_PRAZO_TURNO_MS,
        BOSS_AO_VIVO_FATOR_ESCALADA_DANO: guildConfig.BOSS_AO_VIVO_FATOR_ESCALADA_DANO,
        BOSS_AO_VIVO_MAX_RODADAS: guildConfig.BOSS_AO_VIVO_MAX_RODADAS,
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

function validarFracao01(nome, valor) {
  if (typeof valor !== "number" || valor < 0 || valor > 1) throw erro(`${nome} precisa ser um número entre 0 e 1.`);
}

function validarGrupo(grupo, valores) {
  if (!GRUPOS.includes(grupo)) throw erro(`Grupo de balanceamento desconhecido: ${grupo}.`);
  if (!valores || typeof valores !== "object") throw erro("Payload de balanceamento vazio.");

  if (grupo === "guild.ranks") {
    for (const [rank, requisito] of Object.entries(valores)) {
      if (!guildConfig.ehRankGuildaValido(rank) || rank === "S") {
        throw erro(`Rank inválido pra requisito de promoção: ${rank}.`);
      }
      validarInteiroPositivo(`REQUISITOS_RANK_GUILDA[${rank}]`, requisito);
    }
    return;
  }

  if (grupo === "guild.carencia") {
    if (valores.CARENCIA_NOVO_MEMBRO_MS !== undefined) {
      validarInteiroPositivo("CARENCIA_NOVO_MEMBRO_MS", valores.CARENCIA_NOVO_MEMBRO_MS);
    }
    return;
  }

  if (grupo === "guild.buffs") {
    for (const tipo of Object.keys(valores)) {
      if (!guildConfig.BUFF_TIPOS.includes(tipo)) throw erro(`Tipo de Buff inválido: ${tipo}.`);
      for (const [nivel, tabela] of Object.entries(valores[tipo])) {
        const nivelNum = Number(nivel);
        if (!Number.isInteger(nivelNum) || nivelNum < 1 || nivelNum > guildConfig.NIVEL_MAXIMO_BUFF) {
          throw erro(`Nível de Buff inválido: ${nivel}.`);
        }
        if (tabela.custo !== undefined) validarInteiroPositivo(`${tipo}[${nivel}].custo`, tabela.custo);
        if (tabela.nivelGuildaMinimo !== undefined) {
          validarInteiroPositivo(`${tipo}[${nivel}].nivelGuildaMinimo`, tabela.nivelGuildaMinimo);
        }
        if (tabela.bonusPercentual !== undefined) {
          if (typeof tabela.bonusPercentual !== "number" || tabela.bonusPercentual <= 0) {
            throw erro(`${tipo}[${nivel}].bonusPercentual precisa ser um número > 0.`);
          }
        }
        if (tabela.bonusPontosPercentuais !== undefined) {
          if (typeof tabela.bonusPontosPercentuais !== "number" || tabela.bonusPontosPercentuais <= 0) {
            throw erro(`${tipo}[${nivel}].bonusPontosPercentuais precisa ser um número > 0.`);
          }
        }
      }
    }
    return;
  }

  if (grupo === "guild.contribuicao") {
    if (valores.PONTOS_CONTRIBUICAO) {
      for (const [chave, valor] of Object.entries(valores.PONTOS_CONTRIBUICAO)) {
        if (typeof valor !== "number" || valor < 0) throw erro(`PONTOS_CONTRIBUICAO[${chave}] precisa ser um número >= 0.`);
      }
      const { MissaoRankMin, MissaoRankMax } = valores.PONTOS_CONTRIBUICAO;
      if (MissaoRankMin !== undefined && MissaoRankMax !== undefined && MissaoRankMax < MissaoRankMin) {
        throw erro("PONTOS_CONTRIBUICAO.MissaoRankMax precisa ser >= MissaoRankMin.");
      }
    }
    if (valores.XP_GUILDA_MISSAO_RANK_MIN !== undefined) {
      validarInteiroPositivo("XP_GUILDA_MISSAO_RANK_MIN", valores.XP_GUILDA_MISSAO_RANK_MIN);
    }
    if (valores.XP_GUILDA_MISSAO_RANK_MAX !== undefined) {
      validarInteiroPositivo("XP_GUILDA_MISSAO_RANK_MAX", valores.XP_GUILDA_MISSAO_RANK_MAX);
    }
    const min = valores.XP_GUILDA_MISSAO_RANK_MIN ?? guildConfig.XP_GUILDA_MISSAO_RANK_MIN;
    const max = valores.XP_GUILDA_MISSAO_RANK_MAX ?? guildConfig.XP_GUILDA_MISSAO_RANK_MAX;
    if (max < min) throw erro("XP_GUILDA_MISSAO_RANK_MAX precisa ser >= XP_GUILDA_MISSAO_RANK_MIN.");
    return;
  }

  if (grupo === "guild.boss") {
    if (valores.BOSS_FRACAO_IGUALITARIA !== undefined) validarFracao01("BOSS_FRACAO_IGUALITARIA", valores.BOSS_FRACAO_IGUALITARIA);
    if (valores.BOSS_FRACAO_PROPORCIONAL !== undefined) validarFracao01("BOSS_FRACAO_PROPORCIONAL", valores.BOSS_FRACAO_PROPORCIONAL);
    const igual = valores.BOSS_FRACAO_IGUALITARIA ?? guildConfig.BOSS_FRACAO_IGUALITARIA;
    const proporcional = valores.BOSS_FRACAO_PROPORCIONAL ?? guildConfig.BOSS_FRACAO_PROPORCIONAL;
    if (Math.abs(igual + proporcional - 1) > 1e-9) {
      throw erro("BOSS_FRACAO_IGUALITARIA + BOSS_FRACAO_PROPORCIONAL precisa somar exatamente 1.");
    }
    if (valores.BOSS_AO_VIVO_TAMANHO_MAXIMO !== undefined) {
      validarInteiroPositivo("BOSS_AO_VIVO_TAMANHO_MAXIMO", valores.BOSS_AO_VIVO_TAMANHO_MAXIMO);
    }
    if (valores.BOSS_AO_VIVO_TAMANHO_MINIMO !== undefined) {
      validarInteiroPositivo("BOSS_AO_VIVO_TAMANHO_MINIMO", valores.BOSS_AO_VIVO_TAMANHO_MINIMO);
    }
    const tamMax = valores.BOSS_AO_VIVO_TAMANHO_MAXIMO ?? guildConfig.BOSS_AO_VIVO_TAMANHO_MAXIMO;
    const tamMin = valores.BOSS_AO_VIVO_TAMANHO_MINIMO ?? guildConfig.BOSS_AO_VIVO_TAMANHO_MINIMO;
    if (tamMax < tamMin) throw erro("BOSS_AO_VIVO_TAMANHO_MAXIMO precisa ser >= BOSS_AO_VIVO_TAMANHO_MINIMO.");
    if (valores.BOSS_AO_VIVO_PRAZO_TURNO_MS !== undefined) {
      validarInteiroPositivo("BOSS_AO_VIVO_PRAZO_TURNO_MS", valores.BOSS_AO_VIVO_PRAZO_TURNO_MS);
    }
    if (valores.BOSS_AO_VIVO_FATOR_ESCALADA_DANO !== undefined) {
      const v = valores.BOSS_AO_VIVO_FATOR_ESCALADA_DANO;
      if (typeof v !== "number" || v < 0) throw erro("BOSS_AO_VIVO_FATOR_ESCALADA_DANO precisa ser um número >= 0.");
    }
    if (valores.BOSS_AO_VIVO_MAX_RODADAS !== undefined) {
      validarInteiroPositivo("BOSS_AO_VIVO_MAX_RODADAS", valores.BOSS_AO_VIVO_MAX_RODADAS);
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
      acao: "UPDATE_GUILD_BALANCE",
      entidade: "GameSetting",
      idEntidade: null,
      dadosAntes,
      dadosDepois: { grupo, ...registro.toJSON() },
      req,
      transaction,
    });
    return registro;
  });

  guildConfig.aplicarOverridesBalanceamento(grupo, valores);
  // Sem isso, só a instância que atendeu ESSE POST enxergava o valor
  // novo na hora — as outras réplicas do Railway só pegariam via o
  // polling periódico de gameSettingCache (até 60s de atraso). Mesmo
  // padrão de expeditionSettingsService.js/adminSpoilConfigService.js.
  await gameSettingCache.recarregar();
  return { atual: getSnapshotAtual(grupo), padrao: getDefaults(grupo), atualizado_em: resultado.updatedAt };
}

// Recarrega TODOS os grupos persistidos — chamado no boot E
// periodicamente (mesmo motivo de expeditionSettingsService.
// aplicarPersistidosNoBoot: Railway roda múltiplas réplicas, cada uma
// com sua própria cópia do config em memória).
async function aplicarPersistidosNoBoot() {
  const linhas = await GameSetting.findAll({ where: { chave: GRUPOS } });
  for (const linha of linhas) {
    try {
      guildConfig.aplicarOverridesBalanceamento(linha.chave, linha.valor);
    } catch (error) {
      console.error(`[guildSettingsService] falha ao aplicar overrides de "${linha.chave}":`, error);
    }
  }
}

const INTERVALO_SINCRONIZACAO_MS = 60_000;
let intervaloSincronizacao = null;

function iniciarSincronizacaoPeriodica() {
  if (intervaloSincronizacao) return;
  aplicarPersistidosNoBoot().catch((error) =>
    console.error("[guildSettingsService] falha ao aplicar overrides persistidos no boot:", error),
  );
  intervaloSincronizacao = setInterval(() => {
    aplicarPersistidosNoBoot().catch((error) =>
      console.error("[guildSettingsService] falha na sincronização periódica:", error),
    );
  }, INTERVALO_SINCRONIZACAO_MS);
  intervaloSincronizacao.unref?.();
}

module.exports = {
  GRUPOS,
  getBalanceamentoCompleto,
  getSnapshotAtual,
  getDefaults,
  validarGrupo,
  updateBalanceamento,
  aplicarPersistidosNoBoot,
  iniciarSincronizacaoPeriodica,
};
