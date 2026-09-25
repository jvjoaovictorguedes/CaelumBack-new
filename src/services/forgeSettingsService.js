// Painel Administrativo da Forja — Balanceamento (spec §9/§10/§19 fase
// 5). Persiste SÓ dados validados em GameSetting (chaves forge.smelting/
// forge.crafting/forge.refinement/forge.progression — §10: "NUNCA
// persistir JavaScript/expressões/fórmulas arbitrárias"), e aplica por
// cima dos defaults de forgeConfig.js via mutação em-lugar (nunca
// reatribuição do binding — ver forgeConfig.aplicarOverridesBalanceamento).
// Mesmo padrão de cache "morno" do gameSettingCache: recarrega sozinho
// periodicamente e sempre que um admin salva.
const { sequelize } = require("../config/database");
const GameSetting = require("../models/GameSetting");
const forgeConfig = require("../config/forgeConfig");
const { registrarAcao } = require("./adminAuditService");

const GRUPOS = ["forge.smelting", "forge.crafting", "forge.refinement", "forge.progression"];

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

// Snapshot dos defaults ORIGINAIS de forgeConfig, congelado no require
// (antes de qualquer override ser aplicado) — usado só pra exibir "valor
// padrão" no Admin e pra resetar; nunca usado em cálculo de gameplay.
const DEFAULTS_ORIGINAIS = {
  "forge.smelting": {
    FRAGMENTOS_POR_BARRA: { ...forgeConfig.FRAGMENTOS_POR_BARRA },
    QUALIDADE_MAXIMA_FUNDICAO_POR_NIVEL: { ...forgeConfig.QUALIDADE_MAXIMA_FUNDICAO_POR_NIVEL },
    CHANCE_BARRA_BONUS_PPM_POR_NIVEL: { ...forgeConfig.CHANCE_BARRA_BONUS_PPM_POR_NIVEL },
    XP_FUNDICAO_POR_QUALIDADE_BARRA: { ...forgeConfig.XP_FUNDICAO_POR_QUALIDADE_BARRA },
  },
  "forge.crafting": {
    CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL: Object.fromEntries(
      Object.entries(forgeConfig.CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL).map(([n, t]) => [n, { ...t }]),
    ),
    XP_FABRICACAO_POR_QUALIDADE_EQUIPAMENTO: { ...forgeConfig.XP_FABRICACAO_POR_QUALIDADE_EQUIPAMENTO },
    TEMPO_BASE_FABRICACAO_MS_POR_QUALIDADE: { ...forgeConfig.TEMPO_BASE_FABRICACAO_MS_POR_QUALIDADE },
  },
  "forge.refinement": {
    CHANCE_BASE_REFINAMENTO_PPM_POR_ALVO: { ...forgeConfig.CHANCE_BASE_REFINAMENTO_PPM_POR_ALVO },
    BONUS_FORJA_REFINAMENTO_PPM_POR_NIVEL: { ...forgeConfig.BONUS_FORJA_REFINAMENTO_PPM_POR_NIVEL },
    BONUS_ATRIBUTO_REFINAMENTO_PCT: { ...forgeConfig.BONUS_ATRIBUTO_REFINAMENTO_PCT },
    UNIDADES_MATERIAL_REFINAMENTO_POR_ALVO: { ...forgeConfig.UNIDADES_MATERIAL_REFINAMENTO_POR_ALVO },
    MATERIAIS_BASE_REFINAMENTO_POR_CATEGORIA: Object.fromEntries(
      Object.entries(forgeConfig.MATERIAIS_BASE_REFINAMENTO_POR_CATEGORIA).map(([c, b]) => [c, { ...b }]),
    ),
    OURO_BASE_REFINAMENTO_POR_QUALIDADE: { ...forgeConfig.OURO_BASE_REFINAMENTO_POR_QUALIDADE },
    XP_REFINAMENTO_POR_ALVO: { ...forgeConfig.XP_REFINAMENTO_POR_ALVO },
    CAP_CHANCE_REFINAMENTO_PPM: forgeConfig.CAP_CHANCE_REFINAMENTO_PPM,
    FATOR_XP_REFINAMENTO_FALHA: forgeConfig.FATOR_XP_REFINAMENTO_FALHA,
  },
  "forge.progression": {
    XP_NECESSARIO_POR_ETAPA: { ...forgeConfig.XP_NECESSARIO_POR_ETAPA },
  },
};

function getDefaults(grupo) {
  return DEFAULTS_ORIGINAIS[grupo];
}

// Snapshot do que está REALMENTE em vigor agora (defaults + overrides já
// aplicados) — lido direto dos objetos de forgeConfig, então é
// impossível divergir do que o gameplay de verdade usa.
function getSnapshotAtual(grupo) {
  switch (grupo) {
    case "forge.smelting":
      return {
        FRAGMENTOS_POR_BARRA: { ...forgeConfig.FRAGMENTOS_POR_BARRA },
        QUALIDADE_MAXIMA_FUNDICAO_POR_NIVEL: { ...forgeConfig.QUALIDADE_MAXIMA_FUNDICAO_POR_NIVEL },
        CHANCE_BARRA_BONUS_PPM_POR_NIVEL: { ...forgeConfig.CHANCE_BARRA_BONUS_PPM_POR_NIVEL },
        XP_FUNDICAO_POR_QUALIDADE_BARRA: { ...forgeConfig.XP_FUNDICAO_POR_QUALIDADE_BARRA },
      };
    case "forge.crafting":
      return {
        CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL: Object.fromEntries(
          Object.entries(forgeConfig.CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL).map(([n, t]) => [n, { ...t }]),
        ),
        XP_FABRICACAO_POR_QUALIDADE_EQUIPAMENTO: { ...forgeConfig.XP_FABRICACAO_POR_QUALIDADE_EQUIPAMENTO },
        TEMPO_BASE_FABRICACAO_MS_POR_QUALIDADE: { ...forgeConfig.TEMPO_BASE_FABRICACAO_MS_POR_QUALIDADE },
      };
    case "forge.refinement":
      return {
        CHANCE_BASE_REFINAMENTO_PPM_POR_ALVO: { ...forgeConfig.CHANCE_BASE_REFINAMENTO_PPM_POR_ALVO },
        BONUS_FORJA_REFINAMENTO_PPM_POR_NIVEL: { ...forgeConfig.BONUS_FORJA_REFINAMENTO_PPM_POR_NIVEL },
        BONUS_ATRIBUTO_REFINAMENTO_PCT: { ...forgeConfig.BONUS_ATRIBUTO_REFINAMENTO_PCT },
        UNIDADES_MATERIAL_REFINAMENTO_POR_ALVO: { ...forgeConfig.UNIDADES_MATERIAL_REFINAMENTO_POR_ALVO },
        MATERIAIS_BASE_REFINAMENTO_POR_CATEGORIA: Object.fromEntries(
          Object.entries(forgeConfig.MATERIAIS_BASE_REFINAMENTO_POR_CATEGORIA).map(([c, b]) => [c, { ...b }]),
        ),
        OURO_BASE_REFINAMENTO_POR_QUALIDADE: { ...forgeConfig.OURO_BASE_REFINAMENTO_POR_QUALIDADE },
        XP_REFINAMENTO_POR_ALVO: { ...forgeConfig.XP_REFINAMENTO_POR_ALVO },
        CAP_CHANCE_REFINAMENTO_PPM: forgeConfig.CAP_CHANCE_REFINAMENTO_PPM,
        FATOR_XP_REFINAMENTO_FALHA: forgeConfig.FATOR_XP_REFINAMENTO_FALHA,
      };
    case "forge.progression":
      return {
        XP_NECESSARIO_POR_ETAPA: { ...forgeConfig.XP_NECESSARIO_POR_ETAPA },
        XP_TOTAL_PARA_NIVEL: { ...forgeConfig.XP_TOTAL_PARA_NIVEL },
        NIVEL_MAXIMO: forgeConfig.NIVEL_MAXIMO,
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

// §11.1 — soma das 6 chances de cada nível de fabricação precisa fechar
// EXATAMENTE 1.000.000 PPM, nenhum valor negativo. Bloqueia salvar se
// não fechar.
function validarSomaPpmFabricacao(tabelaPorNivel) {
  const erros = [];
  for (const [nivel, chances] of Object.entries(tabelaPorNivel)) {
    const chaves = ["mesma", "mais1", "mais2", "mais3", "mais4", "mais5"];
    let soma = 0;
    for (const chave of chaves) {
      const valor = chances[chave];
      if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) {
        erros.push(`Nível ${nivel}: "${chave}" precisa ser um número >= 0.`);
        continue;
      }
      soma += valor;
    }
    if (soma !== 1_000_000) {
      erros.push(`Nível ${nivel}: soma das chances é ${soma} PPM, precisa ser exatamente 1.000.000.`);
    }
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

function validarTabelaPercentual0a100(nome, tabela) {
  const erros = [];
  for (const [chave, valor] of Object.entries(tabela)) {
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > 100) {
      erros.push(`${nome}[${chave}] precisa estar entre 0 e 100.`);
    }
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

function validarTabelaInteiraNaoNegativa(nome, tabela) {
  const erros = [];
  for (const [chave, valor] of Object.entries(tabela)) {
    if (!Number.isInteger(valor) || valor < 0) erros.push(`${nome}[${chave}] precisa ser um inteiro >= 0.`);
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

function validarGrupo(grupo, valores) {
  if (!GRUPOS.includes(grupo)) throw erro(`Grupo de balanceamento desconhecido: ${grupo}.`);
  if (!valores || typeof valores !== "object") throw erro("Payload de balanceamento vazio.");

  if (grupo === "forge.smelting") {
    if (valores.FRAGMENTOS_POR_BARRA) validarTabelaInteiraNaoNegativa("FRAGMENTOS_POR_BARRA", valores.FRAGMENTOS_POR_BARRA);
    if (valores.CHANCE_BARRA_BONUS_PPM_POR_NIVEL) {
      for (const [nivel, ppm] of Object.entries(valores.CHANCE_BARRA_BONUS_PPM_POR_NIVEL)) {
        if (!Number.isInteger(ppm) || ppm < 0 || ppm > 1_000_000) {
          throw erro(`CHANCE_BARRA_BONUS_PPM_POR_NIVEL[${nivel}] precisa estar entre 0 e 1.000.000 PPM.`);
        }
      }
    }
    if (valores.QUALIDADE_MAXIMA_FUNDICAO_POR_NIVEL) {
      for (const [nivel, qualidade] of Object.entries(valores.QUALIDADE_MAXIMA_FUNDICAO_POR_NIVEL)) {
        if (!forgeConfig.ORDEM_QUALIDADE.includes(qualidade)) {
          throw erro(`QUALIDADE_MAXIMA_FUNDICAO_POR_NIVEL[${nivel}] precisa ser uma qualidade válida.`);
        }
      }
    }
    if (valores.XP_FUNDICAO_POR_QUALIDADE_BARRA) validarTabelaInteiraNaoNegativa("XP_FUNDICAO_POR_QUALIDADE_BARRA", valores.XP_FUNDICAO_POR_QUALIDADE_BARRA);
    return;
  }

  if (grupo === "forge.crafting") {
    if (valores.CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL) {
      validarSomaPpmFabricacao(valores.CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL);
    }
    if (valores.XP_FABRICACAO_POR_QUALIDADE_EQUIPAMENTO) validarTabelaInteiraNaoNegativa("XP_FABRICACAO_POR_QUALIDADE_EQUIPAMENTO", valores.XP_FABRICACAO_POR_QUALIDADE_EQUIPAMENTO);
    if (valores.TEMPO_BASE_FABRICACAO_MS_POR_QUALIDADE) validarTabelaInteiraNaoNegativa("TEMPO_BASE_FABRICACAO_MS_POR_QUALIDADE", valores.TEMPO_BASE_FABRICACAO_MS_POR_QUALIDADE);
    return;
  }

  if (grupo === "forge.refinement") {
    if (valores.CHANCE_BASE_REFINAMENTO_PPM_POR_ALVO) {
      for (const [alvo, ppm] of Object.entries(valores.CHANCE_BASE_REFINAMENTO_PPM_POR_ALVO)) {
        if (!Number.isInteger(ppm) || ppm < 0 || ppm > 1_000_000) {
          throw erro(`CHANCE_BASE_REFINAMENTO_PPM_POR_ALVO[${alvo}] precisa estar entre 0 e 1.000.000 PPM.`);
        }
      }
    }
    if (valores.BONUS_FORJA_REFINAMENTO_PPM_POR_NIVEL) {
      for (const [nivel, ppm] of Object.entries(valores.BONUS_FORJA_REFINAMENTO_PPM_POR_NIVEL)) {
        if (!Number.isInteger(ppm) || ppm < 0) throw erro(`BONUS_FORJA_REFINAMENTO_PPM_POR_NIVEL[${nivel}] precisa ser um inteiro >= 0.`);
      }
    }
    if (valores.BONUS_ATRIBUTO_REFINAMENTO_PCT) validarTabelaPercentual0a100("BONUS_ATRIBUTO_REFINAMENTO_PCT", valores.BONUS_ATRIBUTO_REFINAMENTO_PCT);
    if (valores.UNIDADES_MATERIAL_REFINAMENTO_POR_ALVO) {
      for (const [alvo, un] of Object.entries(valores.UNIDADES_MATERIAL_REFINAMENTO_POR_ALVO)) {
        if (!Number.isInteger(un) || un < 1) throw erro(`UNIDADES_MATERIAL_REFINAMENTO_POR_ALVO[${alvo}] precisa ser um inteiro >= 1.`);
      }
    }
    if (valores.MATERIAIS_BASE_REFINAMENTO_POR_CATEGORIA) {
      for (const [categoria, base] of Object.entries(valores.MATERIAIS_BASE_REFINAMENTO_POR_CATEGORIA)) {
        if (!Number.isInteger(base.barras) || base.barras < 0 || !Number.isInteger(base.troncos) || base.troncos < 0) {
          throw erro(`MATERIAIS_BASE_REFINAMENTO_POR_CATEGORIA[${categoria}] precisa ter barras/troncos inteiros >= 0.`);
        }
      }
    }
    if (valores.OURO_BASE_REFINAMENTO_POR_QUALIDADE) validarTabelaInteiraNaoNegativa("OURO_BASE_REFINAMENTO_POR_QUALIDADE", valores.OURO_BASE_REFINAMENTO_POR_QUALIDADE);
    if (valores.XP_REFINAMENTO_POR_ALVO) validarTabelaInteiraNaoNegativa("XP_REFINAMENTO_POR_ALVO", valores.XP_REFINAMENTO_POR_ALVO);
    if (valores.CAP_CHANCE_REFINAMENTO_PPM !== undefined) {
      const cap = valores.CAP_CHANCE_REFINAMENTO_PPM;
      if (!Number.isInteger(cap) || cap < 0 || cap > 1_000_000) throw erro("CAP_CHANCE_REFINAMENTO_PPM precisa estar entre 0 e 1.000.000 PPM.");
    }
    if (valores.FATOR_XP_REFINAMENTO_FALHA !== undefined) {
      const fator = valores.FATOR_XP_REFINAMENTO_FALHA;
      if (typeof fator !== "number" || fator < 0 || fator > 1) throw erro("FATOR_XP_REFINAMENTO_FALHA precisa estar entre 0 e 1 (fração, ex.: 0.25 = 25%).");
    }
    return;
  }

  if (grupo === "forge.progression") {
    // V1 (§11.2) — editar a curva de XP exige o preview de impacto ANTES
    // (endpoint separado, previewImpactoProgressao) + confirmação forte;
    // NIVEL_MAXIMO nunca é editável.
    if (!valores.confirmado) {
      throw erro("Editar a curva de XP da Forja exige confirmação explícita (confirmado: true) depois de revisar o preview de impacto.");
    }
    if (valores.XP_NECESSARIO_POR_ETAPA) {
      for (const [etapa, xp] of Object.entries(valores.XP_NECESSARIO_POR_ETAPA)) {
        if (!Number.isInteger(xp) || xp <= 0) throw erro(`XP_NECESSARIO_POR_ETAPA[${etapa}] precisa ser um inteiro positivo.`);
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
      acao: "UPDATE_FORGE_BALANCE",
      entidade: "GameSetting",
      idEntidade: null,
      dadosAntes,
      dadosDepois: { grupo, ...registro.toJSON() },
      req,
      transaction,
    });
    return registro;
  });

  forgeConfig.aplicarOverridesBalanceamento(grupo, valores);
  return { atual: getSnapshotAtual(grupo), padrao: getDefaults(grupo), atualizado_em: resultado.updatedAt };
}

// Recarrega TODOS os grupos persistidos e reaplica no forgeConfig — usado
// no boot (mesmo padrão do gameSettingCache) pra sobreviver a restart.
async function aplicarPersistidosNoBoot() {
  const linhas = await GameSetting.findAll({ where: { chave: GRUPOS } });
  for (const linha of linhas) {
    try {
      forgeConfig.aplicarOverridesBalanceamento(linha.chave, linha.valor);
    } catch (error) {
      console.error(`[forgeSettingsService] falha ao aplicar overrides de "${linha.chave}" no boot:`, error);
    }
  }
}

module.exports = {
  GRUPOS,
  getBalanceamentoCompleto,
  getSnapshotAtual,
  getDefaults,
  validarGrupo,
  validarSomaPpmFabricacao,
  updateBalanceamento,
  aplicarPersistidosNoBoot,
};
