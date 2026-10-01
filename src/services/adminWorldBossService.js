// Painel Administrativo — Boss Global / Ameaça Mundial (permissão
// worldboss.manage). CRUD do CATÁLOGO (WorldBossConfig + fases +
// zonas elegíveis) — nunca toca no ciclo atual (evento em andamento),
// isso é adminWorldBossEventService.js (permissão events.manage,
// mesmo critério já usado pelo resto do painel: catálogo vs operação
// do ciclo vivo são responsabilidades separadas). Editar o catálogo
// NUNCA afeta um evento já em andamento — ele already carrega seu
// próprio config_snapshot congelado (§18/§19).
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const WorldBossConfig = require("../models/WorldBossConfig");
const WorldBossPhase = require("../models/WorldBossPhase");
const WorldBossConfigZone = require("../models/WorldBossConfigZone");
const WorldBossAbility = require("../models/WorldBossAbility");
const WorldBossStatusResistance = require("../models/WorldBossStatusResistance");
const WorldBossRankingReward = require("../models/WorldBossRankingReward");
const WorldBossActivityMetric = require("../models/WorldBossActivityMetric");
const WorldBossEvent = require("../models/WorldBossEvent");
const WorldBossCombatSession = require("../models/WorldBossCombatSession");
const WorldBossContribution = require("../models/WorldBossContribution");
const Power = require("../models/Power");
const Item = require("../models/Item");
const GameSetting = require("../models/GameSetting");
const gameSettingCache = require("./gameSettingCache");
const { registrarAcao } = require("./adminAuditService");
const { GAME_SETTINGS_DEFAULT, COMBAT_SESSION_STATUS } = require("../config/worldBossConfig");
const { CHAVES_VALIDAS: STATUS_KEYS_VALIDAS } = require("../config/statusEffectConfig");
const worldBossRuntimeService = require("./worldBossRuntimeService");
const { calcularEfeitoPoderEsperado, custoManaEfetivo } = require("./combatFormulas");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

const CAMPOS_CONFIG = [
  "nome",
  "descricao",
  "lore",
  "imagem_url",
  "fundo_url",
  "peso_selecao",
  "vida_base",
  "defesa",
  "mensagem_descoberta",
  "mensagem_convocacao",
  "mensagem_fase_final",
  "mensagem_derrota",
  "id_item_golpe_final",
  "gold_descoberta",
  "gold_participacao",
  "xp_participacao",
  "min_dano_participacao",
  // Ameaça Mundial V2 §4.1/§13.2 — Atributos.
  "nivel",
  "forca",
  "vitalidade",
  "agilidade",
  "inteligencia",
  "velocidade",
  "mana_maxima",
  // §3.2/§13.2 — Combate em Tempo Real.
  "regeneracao_mana_por_acao",
  "intervalo_acao_ms",
  // §8.2/§13.2 — regras de reentrada.
  "reentrada_permitida",
  "cooldown_reentrada_segundos",
];

function camposConfig(dados) {
  const out = {};
  for (const campo of CAMPOS_CONFIG) {
    if (dados[campo] !== undefined) out[campo] = dados[campo];
  }
  return out;
}

async function validarConfig(dados, { parcial = false, transaction } = {}) {
  const erros = [];
  if (!parcial || dados.nome !== undefined) {
    if (!dados.nome || typeof dados.nome !== "string") erros.push("nome é obrigatório.");
  }
  if (!parcial || dados.descricao !== undefined) {
    if (!dados.descricao || typeof dados.descricao !== "string") erros.push("descricao é obrigatória.");
  }
  if (!parcial || dados.mensagem_descoberta !== undefined) {
    if (!dados.mensagem_descoberta) erros.push("mensagem_descoberta é obrigatória.");
  }
  if (!parcial || dados.mensagem_convocacao !== undefined) {
    if (!dados.mensagem_convocacao) erros.push("mensagem_convocacao é obrigatória.");
  }
  if (!parcial || dados.vida_base !== undefined) {
    if (!Number.isInteger(dados.vida_base) || dados.vida_base <= 0) erros.push("vida_base precisa ser um inteiro positivo.");
  }
  if (!parcial || dados.defesa !== undefined) {
    if (dados.defesa !== undefined && (!Number.isInteger(dados.defesa) || dados.defesa < 0)) erros.push("defesa precisa ser um inteiro >= 0.");
  }
  if (!parcial || dados.peso_selecao !== undefined) {
    if (dados.peso_selecao !== undefined && (!Number.isInteger(dados.peso_selecao) || dados.peso_selecao <= 0)) erros.push("peso_selecao precisa ser um inteiro positivo.");
  }
  for (const campoGold of ["gold_descoberta", "gold_participacao", "xp_participacao"]) {
    if (dados[campoGold] !== undefined && (!Number.isInteger(dados[campoGold]) || dados[campoGold] < 0)) {
      erros.push(`${campoGold} precisa ser um inteiro >= 0.`);
    }
  }
  if (dados.min_dano_participacao !== undefined && dados.min_dano_participacao !== null) {
    if (!Number.isInteger(dados.min_dano_participacao) || dados.min_dano_participacao < 0) {
      erros.push("min_dano_participacao precisa ser um inteiro >= 0 (ou null).");
    }
  }
  if (!parcial || dados.id_item_golpe_final !== undefined) {
    if (!dados.id_item_golpe_final) {
      erros.push("id_item_golpe_final é obrigatório.");
    } else {
      const item = await Item.findByPk(dados.id_item_golpe_final, { transaction });
      if (!item) erros.push("id_item_golpe_final não aponta pra nenhum Item existente.");
    }
  }
  if (dados.fases !== undefined) {
    if (!Array.isArray(dados.fases) || dados.fases.length === 0) {
      erros.push("fases precisa ser uma lista com pelo menos uma fase.");
    } else {
      for (const fase of dados.fases) {
        if (!fase.nome_fase || !Number.isInteger(fase.ordem) || !Number.isInteger(fase.hp_percentual_max)) {
          erros.push("cada fase precisa de nome_fase, ordem e hp_percentual_max (inteiros).");
          break;
        }
        // §5.1/§13.3 — modelo híbrido dano min/max + Fúria por fase.
        if (fase.dano_min !== undefined && fase.dano_max !== undefined) {
          if (!Number.isInteger(fase.dano_min) || fase.dano_min < 0 || !Number.isInteger(fase.dano_max) || fase.dano_max < fase.dano_min) {
            erros.push(`fase "${fase.nome_fase}": dano_max precisa ser >= dano_min, os dois inteiros >= 0.`);
          }
        }
        if (fase.furia_por_acao_pct !== undefined && Number(fase.furia_por_acao_pct) < 0) {
          erros.push(`fase "${fase.nome_fase}": furia_por_acao_pct precisa ser >= 0.`);
        }
        if (fase.limite_furia_pct !== undefined && fase.limite_furia_pct !== null && Number(fase.limite_furia_pct) < 0) {
          erros.push(`fase "${fase.nome_fase}": limite_furia_pct precisa ser >= 0 (ou null pra soft-enrage sem limite).`);
        }
        if (fase.intervalo_acao_ms !== undefined && fase.intervalo_acao_ms !== null && (!Number.isInteger(fase.intervalo_acao_ms) || fase.intervalo_acao_ms < 1)) {
          erros.push(`fase "${fase.nome_fase}": intervalo_acao_ms precisa ser um inteiro >= 1 (ou null pra usar o intervalo base).`);
        }
      }
    }
  }
  if (dados.zonas !== undefined && !Array.isArray(dados.zonas)) {
    erros.push("zonas precisa ser uma lista de IDs de AdventureZone.");
  }

  // Ameaça Mundial V2 §4.1 — atributos de combate do Boss (mesmas
  // fórmulas de PvE/PvP, combatFormulas.js).
  for (const campoAtributo of ["nivel", "forca", "vitalidade", "agilidade", "inteligencia", "velocidade", "mana_maxima", "regeneracao_mana_por_acao"]) {
    if (dados[campoAtributo] === undefined) continue;
    const minimo = campoAtributo === "nivel" ? 1 : 0;
    if (!Number.isInteger(dados[campoAtributo]) || dados[campoAtributo] < minimo) {
      erros.push(`${campoAtributo} precisa ser um inteiro >= ${minimo}.`);
    }
  }
  if (dados.intervalo_acao_ms !== undefined) {
    if (!Number.isInteger(dados.intervalo_acao_ms) || dados.intervalo_acao_ms < 1) {
      erros.push("intervalo_acao_ms precisa ser um inteiro >= 1.");
    }
  }
  if (dados.reentrada_permitida !== undefined && typeof dados.reentrada_permitida !== "boolean") {
    erros.push("reentrada_permitida precisa ser boolean.");
  }
  if (dados.cooldown_reentrada_segundos !== undefined) {
    if (!Number.isInteger(dados.cooldown_reentrada_segundos) || dados.cooldown_reentrada_segundos < 0) {
      erros.push("cooldown_reentrada_segundos precisa ser um inteiro >= 0.");
    }
  }

  if (erros.length > 0) throw erro(erros.join(" "));
}

async function substituirFasesEZonas(config, dados, transaction) {
  if (dados.fases !== undefined) {
    await WorldBossPhase.destroy({ where: { id_world_boss_config: config.id }, transaction });
    for (const fase of dados.fases) {
      await WorldBossPhase.create(
        {
          id_world_boss_config: config.id,
          ordem: fase.ordem,
          nome_fase: fase.nome_fase,
          hp_percentual_max: fase.hp_percentual_max,
          modificador_dano_percentual: fase.modificador_dano_percentual ?? 0,
          texto_alerta: fase.texto_alerta ?? null,
          // Ameaça Mundial V2 §5.1/§13.3.
          dano_min: fase.dano_min ?? 0,
          dano_max: fase.dano_max ?? 0,
          furia_por_acao_pct: fase.furia_por_acao_pct ?? 0,
          limite_furia_pct: fase.limite_furia_pct ?? null,
          intervalo_acao_ms: fase.intervalo_acao_ms ?? null,
          mana_ao_entrar: fase.mana_ao_entrar ?? null,
        },
        { transaction },
      );
    }
  }
  if (dados.zonas !== undefined) {
    await WorldBossConfigZone.destroy({ where: { id_world_boss_config: config.id }, transaction });
    for (const idZone of dados.zonas) {
      await WorldBossConfigZone.create({ id_world_boss_config: config.id, id_zone: idZone }, { transaction });
    }
  }
}

async function carregarComDetalhes(id, transaction) {
  const config = await WorldBossConfig.findByPk(id, { transaction });
  if (!config) return null;
  const [fases, zonas, habilidades, resistencias, recompensasRanking] = await Promise.all([
    WorldBossPhase.findAll({ where: { id_world_boss_config: id }, order: [["ordem", "ASC"]], transaction }),
    WorldBossConfigZone.findAll({ where: { id_world_boss_config: id }, transaction }),
    WorldBossAbility.findAll({ where: { id_world_boss_config: id }, include: [{ model: Power }], order: [["prioridade", "DESC"]], transaction }),
    WorldBossStatusResistance.findAll({ where: { id_world_boss_config: id }, transaction }),
    WorldBossRankingReward.findAll({ where: { id_world_boss_config: id }, order: [["posicao_inicio", "ASC"]], transaction }),
  ]);
  return {
    ...config.toJSON(),
    fases,
    zonas: zonas.map((z) => z.id_zone),
    habilidades,
    resistencias,
    recompensas_ranking: recompensasRanking,
  };
}

async function listAdminWorldBossConfigs({ pagina = 1, porPagina = 20, ativo, nome } = {}) {
  const where = {};
  if (ativo !== undefined && ativo !== "") where.ativo = ativo === true || ativo === "true";
  if (nome) where.nome = { [Op.iLike]: `%${nome}%` };

  const limite = Math.min(100, Math.max(1, Number(porPagina) || 20));
  const paginaAtual = Math.max(1, Number(pagina) || 1);
  const offset = (paginaAtual - 1) * limite;

  const { count, rows } = await WorldBossConfig.findAndCountAll({
    where,
    order: [["id", "DESC"]],
    limit: limite,
    offset,
  });

  // A listagem NUNCA carrega fases/zonas completas (evitaria N+1) —
  // só a contagem, que é tudo que a tabela do painel precisa. Quem
  // quiser o conteúdo de verdade usa GET /configs/:id
  // (carregarComDetalhes), que já existe pra isso.
  const idsDaPagina = rows.map((r) => r.id);
  const [fasesPorConfig, zonasPorConfig] = await Promise.all([
    WorldBossPhase.findAll({ where: { id_world_boss_config: idsDaPagina }, attributes: ["id_world_boss_config"] }),
    WorldBossConfigZone.findAll({ where: { id_world_boss_config: idsDaPagina }, attributes: ["id_world_boss_config"] }),
  ]);
  const contarPor = (linhas) => {
    const mapa = new Map();
    for (const linha of linhas) mapa.set(linha.id_world_boss_config, (mapa.get(linha.id_world_boss_config) ?? 0) + 1);
    return mapa;
  };
  const contagemFases = contarPor(fasesPorConfig);
  const contagemZonas = contarPor(zonasPorConfig);

  const itens = rows.map((config) => ({
    ...config.toJSON(),
    fases_count: contagemFases.get(config.id) ?? 0,
    zonas_count: contagemZonas.get(config.id) ?? 0,
  }));

  return { total: count, pagina: paginaAtual, porPagina: limite, itens };
}

async function getAdminWorldBossConfig(id) {
  const detalhes = await carregarComDetalhes(id);
  if (!detalhes) throw erro("Ameaça Mundial não encontrada.", 404);
  return detalhes;
}

async function createAdminWorldBossConfig(dados, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    await validarConfig(dados, { transaction });
    const config = await WorldBossConfig.create(
      { ...camposConfig(dados), ativo: dados.ativo ?? true },
      { transaction },
    );
    await substituirFasesEZonas(config, dados, transaction);
    const completo = await carregarComDetalhes(config.id, transaction);
    await registrarAcao({ idAdmin, acao: "criar", entidade: "WorldBossConfig", idEntidade: config.id, dadosDepois: completo, req, transaction });
    return completo;
  });
}

async function updateAdminWorldBossConfig(id, dados, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const config = await WorldBossConfig.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!config) throw erro("Ameaça Mundial não encontrada.", 404);
    await validarConfig(dados, { parcial: true, transaction });
    const antes = await carregarComDetalhes(id, transaction);
    await config.update(camposConfig(dados), { transaction });
    await substituirFasesEZonas(config, dados, transaction);
    const depois = await carregarComDetalhes(id, transaction);
    await registrarAcao({ idAdmin, acao: "editar", entidade: "WorldBossConfig", idEntidade: config.id, dadosAntes: antes, dadosDepois: depois, req, transaction });
    return depois;
  });
}

async function duplicateAdminWorldBossConfig(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const original = await carregarComDetalhes(id, transaction);
    if (!original) throw erro("Ameaça Mundial não encontrada.", 404);
    const copia = await WorldBossConfig.create(
      {
        nome: `${original.nome} (cópia)`,
        descricao: original.descricao,
        lore: original.lore,
        imagem_url: original.imagem_url,
        fundo_url: original.fundo_url,
        peso_selecao: original.peso_selecao,
        vida_base: original.vida_base,
        defesa: original.defesa,
        mensagem_descoberta: original.mensagem_descoberta,
        mensagem_convocacao: original.mensagem_convocacao,
        mensagem_fase_final: original.mensagem_fase_final,
        mensagem_derrota: original.mensagem_derrota,
        id_item_golpe_final: original.id_item_golpe_final,
        gold_descoberta: original.gold_descoberta,
        gold_participacao: original.gold_participacao,
        xp_participacao: original.xp_participacao,
        min_dano_participacao: original.min_dano_participacao,
        nivel: original.nivel,
        forca: original.forca,
        vitalidade: original.vitalidade,
        agilidade: original.agilidade,
        inteligencia: original.inteligencia,
        velocidade: original.velocidade,
        mana_maxima: original.mana_maxima,
        regeneracao_mana_por_acao: original.regeneracao_mana_por_acao,
        intervalo_acao_ms: original.intervalo_acao_ms,
        reentrada_permitida: original.reentrada_permitida,
        cooldown_reentrada_segundos: original.cooldown_reentrada_segundos,
        ativo: false,
      },
      { transaction },
    );
    await substituirFasesEZonas(copia, { fases: original.fases, zonas: original.zonas }, transaction);
    // Habilidades/resistências/recompensas de ranking também são
    // duplicadas — sem isso, "duplicar" devolvia um Boss sem IA nenhuma
    // (§16/§17 do painel — transversal a todo o resto do catálogo).
    for (const habilidade of original.habilidades) {
      await WorldBossAbility.create(
        {
          id_world_boss_config: copia.id,
          id_power: habilidade.id_power,
          peso_uso: habilidade.peso_uso,
          prioridade: habilidade.prioridade,
          fases_permitidas: habilidade.fases_permitidas,
          tipo_alvo: habilidade.tipo_alvo,
          quantidade_alvos: habilidade.quantidade_alvos,
          tempo_conjuracao_ms: habilidade.tempo_conjuracao_ms,
          cooldown_override: habilidade.cooldown_override,
          custo_mana_override: habilidade.custo_mana_override,
          escala_com_furia: habilidade.escala_com_furia,
          ativo: habilidade.ativo,
        },
        { transaction },
      );
    }
    for (const resistencia of original.resistencias) {
      await WorldBossStatusResistance.create(
        { id_world_boss_config: copia.id, status_key: resistencia.status_key, imune: resistencia.imune, resistencia_pct: resistencia.resistencia_pct, ativo: resistencia.ativo },
        { transaction },
      );
    }
    for (const faixa of original.recompensas_ranking) {
      await WorldBossRankingReward.create(
        {
          id_world_boss_config: copia.id,
          posicao_inicio: faixa.posicao_inicio,
          posicao_fim: faixa.posicao_fim,
          id_item: faixa.id_item,
          quantidade: faixa.quantidade,
          gold: faixa.gold,
          xp: faixa.xp,
          ativo: faixa.ativo,
        },
        { transaction },
      );
    }
    const completo = await carregarComDetalhes(copia.id, transaction);
    await registrarAcao({ idAdmin, acao: "duplicar", entidade: "WorldBossConfig", idEntidade: copia.id, dadosAntes: { origemId: original.id }, dadosDepois: completo, req, transaction });
    return completo;
  });
}

async function setAtivoAdminWorldBossConfig(id, ativo, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const config = await WorldBossConfig.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!config) throw erro("Ameaça Mundial não encontrada.", 404);
    const antes = config.toJSON();
    await config.update({ ativo }, { transaction });
    await registrarAcao({ idAdmin, acao: ativo ? "reativar" : "desativar", entidade: "WorldBossConfig", idEntidade: config.id, dadosAntes: antes, dadosDepois: config.toJSON(), req, transaction });
    return config;
  });
}

// ---------------------------------------------------------------------
// Configurações operacionais (GameSetting: worldboss.*)
// ---------------------------------------------------------------------

const CHAVES_CONFIG = Object.keys(GAME_SETTINGS_DEFAULT);

async function getAdminWorldBossSettings() {
  const linhas = await GameSetting.findAll({ where: { chave: CHAVES_CONFIG } });
  const porChave = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  const out = {};
  for (const chave of CHAVES_CONFIG) out[chave] = porChave[chave] ?? GAME_SETTINGS_DEFAULT[chave];
  return out;
}

function validarValorDeConfig(chave, valor) {
  if (chave === "worldboss.enabled" || chave === "worldboss.participation_rewards_enabled") {
    if (typeof valor !== "boolean") throw erro(`${chave} precisa ser boolean.`);
    return;
  }
  if (!Number.isInteger(valor) || valor < 0) throw erro(`${chave} precisa ser um inteiro >= 0.`);
  if (chave === "worldboss.discovery_threshold_min" || chave === "worldboss.discovery_threshold_max") {
    if (valor <= 0) throw erro(`${chave} precisa ser positivo.`);
  }
  if (chave === "worldboss.cooldown_hours" && valor > 24 * 30) throw erro(`${chave} fora de uma faixa segura.`);
}

async function updateAdminWorldBossSettings(payload, { idAdmin, req }) {
  const mudancas = [];
  for (const [chave, valor] of Object.entries(payload ?? {})) {
    if (!CHAVES_CONFIG.includes(chave)) throw erro(`Chave desconhecida: ${chave}.`);
    validarValorDeConfig(chave, valor);
    mudancas.push([chave, valor, typeof valor === "boolean" ? "boolean" : "number"]);
  }
  if (mudancas.length === 0) throw erro("Nada pra salvar — envie ao menos uma configuração.");

  const min = payload["worldboss.discovery_threshold_min"];
  const max = payload["worldboss.discovery_threshold_max"];
  if (min !== undefined && max !== undefined && min > max) {
    throw erro("worldboss.discovery_threshold_min não pode ser maior que worldboss.discovery_threshold_max.");
  }

  await sequelize.transaction(async (transaction) => {
    for (const [chave, valor, tipo] of mudancas) {
      const existente = await GameSetting.findByPk(chave, { transaction, lock: transaction.LOCK.UPDATE });
      const dadosAntes = existente ? existente.toJSON() : null;
      const [registro] = await GameSetting.upsert(
        { chave, valor, tipo, editavel_admin: true, updated_by_admin_id: idAdmin },
        { transaction, returning: true },
      );
      await registrarAcao({ idAdmin, acao: existente ? "editar" : "criar", entidade: "GameSetting", idEntidade: null, dadosAntes, dadosDepois: registro.toJSON(), req, transaction });
    }
  });

  await gameSettingCache.recarregar();
  return getAdminWorldBossSettings();
}

// ---------------------------------------------------------------------
// Métricas (somente leitura)
// ---------------------------------------------------------------------

// Ameaça Mundial V2 — Etapa 12 (§14.1): métricas pós-evento — nunca
// recalcula dano/Furia (esses valores vêm PRONTOS de runtime_state,
// acumulados ação a ação pelo motor real em worldBossRuntimeService.
// mesclarMetricasDeAcao); aqui só agrega o que É simples derivar de
// dados já existentes (duração, participantes, DPS agregado) e resolve
// nomes pra exibição (habilidade com mais derrotas, tempo por fase).
function resolverNomeHabilidade(chave, abilitiesSnapshot) {
  if (chave === "basico") return "Ataque básico";
  const ability = (abilitiesSnapshot || []).find((a) => String(a.id_ability) === chave);
  return ability?.power_snapshot?.nome ?? `Habilidade #${chave}`;
}

function tempoPorFase(evento) {
  const timestamps = evento.runtime_state?.fase_timestamps ?? {};
  const fases = (evento.config_snapshot?.fases ?? []).slice().sort((a, b) => a.ordem - b.ordem);
  const entradas = fases
    .map((f) => ({ ordem: f.ordem, nome_fase: f.nome_fase, entrada: timestamps[String(f.ordem)] ? new Date(timestamps[String(f.ordem)]) : null }))
    .filter((f) => f.entrada);
  const fimDoEvento = evento.defeated_at ? new Date(evento.defeated_at) : null;
  return entradas.map((f, i) => {
    const proximaEntrada = entradas[i + 1]?.entrada ?? fimDoEvento;
    const duracaoMs = proximaEntrada ? proximaEntrada.getTime() - f.entrada.getTime() : null;
    return { ordem: f.ordem, nome_fase: f.nome_fase, duracao_segundos: duracaoMs !== null ? Math.round(duracaoMs / 1000) : null };
  });
}

async function metricasDoEvento(evento) {
  const inicio = evento.activated_at ? new Date(evento.activated_at) : null;
  const fim = evento.defeated_at ? new Date(evento.defeated_at) : null;
  const duracaoSegundos = inicio && fim ? Math.round((fim.getTime() - inicio.getTime()) / 1000) : null;

  // Participantes conta TODA sessão do evento, não só as ainda "Ativo"
  // (um evento DEFEATED normalmente não tem mais nenhuma — o Golpe
  // Final encerra a sessão de quem o deu, e o resto fica Ativo/
  // Derrotado até o processamento de recompensas rodar por cima).
  const [participantes, derrotados, contribuicoes] = await Promise.all([
    WorldBossCombatSession.count({ where: { event_id: evento.id } }),
    WorldBossCombatSession.count({ where: { event_id: evento.id, status: COMBAT_SESSION_STATUS.DERROTADO } }),
    WorldBossContribution.findAll({ where: { event_id: evento.id }, attributes: ["damage_total"] }),
  ]);
  const danoTotalJogadores = contribuicoes.reduce((soma, c) => soma + Number(c.damage_total), 0);

  const habilidadeDerrotas = evento.runtime_state?.habilidade_derrotas ?? {};
  const habilidadesMaisLetais = Object.entries(habilidadeDerrotas).sort((a, b) => b[1] - a[1]);
  const habilidadeMaisDerrotas = habilidadesMaisLetais.length > 0
    ? { nome: resolverNomeHabilidade(habilidadesMaisLetais[0][0], evento.config_snapshot?.abilities), derrotas: habilidadesMaisLetais[0][1] }
    : null;

  return {
    duracao_segundos: duracaoSegundos,
    participantes,
    derrotados,
    taxa_sobrevivencia_pct: participantes > 0 ? Math.round(((participantes - derrotados) / participantes) * 10000) / 100 : null,
    boss_action_seq_final: evento.boss_action_seq,
    furia_maxima_pct: evento.runtime_state?.furia_maxima_pct !== undefined ? Number(evento.runtime_state.furia_maxima_pct) : null,
    dano_medio_recebido_por_jogador: participantes > 0 ? Math.round(Number(evento.runtime_state?.dano_total_recebido_jogadores || 0) / participantes) : null,
    habilidade_mais_derrotas: habilidadeMaisDerrotas,
    dps_agregado_jogadores: duracaoSegundos && duracaoSegundos > 0 ? Math.round(danoTotalJogadores / duracaoSegundos) : null,
    tempo_por_fase: tempoPorFase(evento),
    top_damage_character_id: evento.top_damage_character_id,
  };
}

async function getAdminWorldBossMetrics() {
  const metricas = await WorldBossActivityMetric.findAll({
    order: [["window_start", "DESC"]],
    limit: 48,
  });
  const historico = await WorldBossEvent.findAll({
    where: { status: ["DEFEATED", "CANCELLED"] },
    order: [["id", "DESC"]],
    limit: 20,
  });
  const historicoComMetricas = await Promise.all(
    historico.map(async (e) => ({
      id: e.id,
      status: e.status,
      nome: e.config_snapshot?.nome ?? null,
      discovered_at: e.discovered_at,
      activated_at: e.activated_at,
      defeated_at: e.defeated_at,
      discoverer_character_id: e.discoverer_character_id,
      final_blow_character_id: e.final_blow_character_id,
      participation_rewards_status: e.participation_rewards_status,
      // §14.1 — só faz sentido pra um evento que chegou a ser lutado
      // (DEFEATED); um CANCELLED nunca ativou o relógio de combate.
      metricas: e.status === "DEFEATED" ? await metricasDoEvento(e) : null,
    })),
  );
  return {
    encontrosElegiveisPorHora: metricas.reverse().map((m) => ({
      window_start: m.window_start,
      encontros_elegiveis: Number(m.encontros_elegiveis),
    })),
    historico: historicoComMetricas,
  };
}

// ---------------------------------------------------------------------
// Ameaça Mundial V2 — Etapa 11 (§13.2/§13.5): Habilidades (WorldBossAbility)
// ---------------------------------------------------------------------

const TIPOS_ALVO_VALIDOS = ["ALEATORIO", "MAIOR_DANO", "MENOR_VIDA", "N_ALEATORIOS", "TODOS", "SELF"];

async function validarHabilidade(dados, { transaction } = {}) {
  const erros = [];
  if (dados.id_power !== undefined) {
    if (!Number.isInteger(dados.id_power)) {
      erros.push("id_power é obrigatório.");
    } else {
      const power = await Power.findByPk(dados.id_power, { transaction });
      if (!power) erros.push("id_power não aponta pra nenhum Power existente.");
    }
  }
  if (dados.tipo_alvo !== undefined && !TIPOS_ALVO_VALIDOS.includes(dados.tipo_alvo)) {
    erros.push(`tipo_alvo precisa ser um de: ${TIPOS_ALVO_VALIDOS.join(", ")}.`);
  }
  if (dados.tipo_alvo === "N_ALEATORIOS" && !(Number.isInteger(dados.quantidade_alvos) && dados.quantidade_alvos >= 1)) {
    erros.push("quantidade_alvos é obrigatório (inteiro >= 1) quando tipo_alvo é N_ALEATORIOS.");
  }
  if (dados.peso_uso !== undefined && (!Number.isInteger(dados.peso_uso) || dados.peso_uso < 0)) {
    erros.push("peso_uso precisa ser um inteiro >= 0.");
  }
  if (dados.prioridade !== undefined && !Number.isInteger(dados.prioridade)) erros.push("prioridade precisa ser um inteiro.");
  if (dados.tempo_conjuracao_ms !== undefined && (!Number.isInteger(dados.tempo_conjuracao_ms) || dados.tempo_conjuracao_ms < 0)) {
    erros.push("tempo_conjuracao_ms precisa ser um inteiro >= 0.");
  }
  if (dados.fases_permitidas !== undefined && dados.fases_permitidas !== null && !Array.isArray(dados.fases_permitidas)) {
    erros.push("fases_permitidas precisa ser uma lista de ids de WorldBossPhase (ou null pra elegível em toda fase).");
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

async function listAdminWorldBossAbilities(idConfig) {
  return WorldBossAbility.findAll({
    where: { id_world_boss_config: idConfig },
    include: [{ model: Power }],
    order: [["prioridade", "DESC"]],
  });
}

async function createAdminWorldBossAbility(idConfig, dados, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const config = await WorldBossConfig.findByPk(idConfig, { transaction });
    if (!config) throw erro("Ameaça Mundial não encontrada.", 404);
    if (!Number.isInteger(dados.id_power)) throw erro("id_power é obrigatório.");
    await validarHabilidade(dados, { transaction });
    const habilidade = await WorldBossAbility.create(
      {
        id_world_boss_config: idConfig,
        id_power: dados.id_power,
        peso_uso: dados.peso_uso ?? 1,
        prioridade: dados.prioridade ?? 0,
        fases_permitidas: dados.fases_permitidas ?? null,
        tipo_alvo: dados.tipo_alvo ?? "ALEATORIO",
        quantidade_alvos: dados.quantidade_alvos ?? null,
        tempo_conjuracao_ms: dados.tempo_conjuracao_ms ?? 0,
        cooldown_override: dados.cooldown_override ?? null,
        custo_mana_override: dados.custo_mana_override ?? null,
        escala_com_furia: dados.escala_com_furia ?? true,
        ativo: dados.ativo ?? true,
      },
      { transaction },
    );
    await registrarAcao({ idAdmin, acao: "criar", entidade: "WorldBossAbility", idEntidade: habilidade.id, dadosDepois: habilidade.toJSON(), req, transaction });
    return habilidade;
  });
}

async function updateAdminWorldBossAbility(idConfig, idAbility, dados, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const habilidade = await WorldBossAbility.findOne({
      where: { id: idAbility, id_world_boss_config: idConfig },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!habilidade) throw erro("Habilidade não encontrada.", 404);
    await validarHabilidade(dados, { transaction });
    const antes = habilidade.toJSON();
    await habilidade.update(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "WorldBossAbility", idEntidade: habilidade.id, dadosAntes: antes, dadosDepois: habilidade.toJSON(), req, transaction });
    return habilidade;
  });
}

async function deleteAdminWorldBossAbility(idConfig, idAbility, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const habilidade = await WorldBossAbility.findOne({
      where: { id: idAbility, id_world_boss_config: idConfig },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!habilidade) throw erro("Habilidade não encontrada.", 404);
    const antes = habilidade.toJSON();
    await habilidade.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "excluir", entidade: "WorldBossAbility", idEntidade: idAbility, dadosAntes: antes, req, transaction });
  });
}

// ---------------------------------------------------------------------
// Resistências (WorldBossStatusResistance) — §7.1/§13.2
// ---------------------------------------------------------------------

async function validarResistencia(dados, { parcial = false } = {}) {
  const erros = [];
  if (!parcial || dados.status_key !== undefined) {
    if (!STATUS_KEYS_VALIDAS.includes(dados.status_key)) {
      erros.push(`status_key precisa ser um de: ${STATUS_KEYS_VALIDAS.join(", ")}.`);
    }
  }
  if (dados.resistencia_pct !== undefined) {
    if (!Number.isInteger(dados.resistencia_pct) || dados.resistencia_pct < 0 || dados.resistencia_pct > 100) {
      erros.push("resistencia_pct precisa ser um inteiro entre 0 e 100.");
    }
  }
  if (dados.imune !== undefined && typeof dados.imune !== "boolean") erros.push("imune precisa ser boolean.");
  if (erros.length > 0) throw erro(erros.join(" "));
}

async function listAdminWorldBossResistances(idConfig) {
  return WorldBossStatusResistance.findAll({ where: { id_world_boss_config: idConfig } });
}

async function createAdminWorldBossResistance(idConfig, dados, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const config = await WorldBossConfig.findByPk(idConfig, { transaction });
    if (!config) throw erro("Ameaça Mundial não encontrada.", 404);
    await validarResistencia(dados);
    const existente = await WorldBossStatusResistance.findOne({
      where: { id_world_boss_config: idConfig, status_key: dados.status_key },
      transaction,
    });
    if (existente) throw erro(`Já existe uma resistência cadastrada pra ${dados.status_key} neste catálogo — edite a existente.`);
    const resistencia = await WorldBossStatusResistance.create(
      {
        id_world_boss_config: idConfig,
        status_key: dados.status_key,
        imune: dados.imune ?? false,
        resistencia_pct: dados.resistencia_pct ?? 0,
        ativo: dados.ativo ?? true,
      },
      { transaction },
    );
    await registrarAcao({ idAdmin, acao: "criar", entidade: "WorldBossStatusResistance", idEntidade: resistencia.id, dadosDepois: resistencia.toJSON(), req, transaction });
    return resistencia;
  });
}

async function updateAdminWorldBossResistance(idConfig, idResistencia, dados, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const resistencia = await WorldBossStatusResistance.findOne({
      where: { id: idResistencia, id_world_boss_config: idConfig },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!resistencia) throw erro("Resistência não encontrada.", 404);
    await validarResistencia(dados, { parcial: true });
    const antes = resistencia.toJSON();
    await resistencia.update(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "WorldBossStatusResistance", idEntidade: resistencia.id, dadosAntes: antes, dadosDepois: resistencia.toJSON(), req, transaction });
    return resistencia;
  });
}

async function deleteAdminWorldBossResistance(idConfig, idResistencia, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const resistencia = await WorldBossStatusResistance.findOne({
      where: { id: idResistencia, id_world_boss_config: idConfig },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!resistencia) throw erro("Resistência não encontrada.", 404);
    const antes = resistencia.toJSON();
    await resistencia.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "excluir", entidade: "WorldBossStatusResistance", idEntidade: idResistencia, dadosAntes: antes, req, transaction });
  });
}

// ---------------------------------------------------------------------
// Recompensas de ranking (WorldBossRankingReward) — §11.3/§13.6
// ---------------------------------------------------------------------

async function validarFaixaRanking(dados, { parcial = false, transaction } = {}) {
  const erros = [];
  if (!parcial || dados.posicao_inicio !== undefined) {
    if (!Number.isInteger(dados.posicao_inicio) || dados.posicao_inicio < 1) erros.push("posicao_inicio precisa ser um inteiro >= 1.");
  }
  if (!parcial || dados.posicao_fim !== undefined) {
    if (!Number.isInteger(dados.posicao_fim) || dados.posicao_fim < (dados.posicao_inicio ?? 1)) {
      erros.push("posicao_fim precisa ser um inteiro >= posicao_inicio.");
    }
  }
  if (dados.quantidade !== undefined && (!Number.isInteger(dados.quantidade) || dados.quantidade < 0)) erros.push("quantidade precisa ser um inteiro >= 0.");
  if (dados.gold !== undefined && (!Number.isInteger(dados.gold) || dados.gold < 0)) erros.push("gold precisa ser um inteiro >= 0.");
  if (dados.xp !== undefined && (!Number.isInteger(dados.xp) || dados.xp < 0)) erros.push("xp precisa ser um inteiro >= 0.");
  if (dados.id_item !== undefined && dados.id_item !== null) {
    const item = await Item.findByPk(dados.id_item, { transaction });
    if (!item) erros.push("id_item não aponta pra nenhum Item existente.");
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

async function listAdminWorldBossRankingRewards(idConfig) {
  return WorldBossRankingReward.findAll({ where: { id_world_boss_config: idConfig }, order: [["posicao_inicio", "ASC"]] });
}

async function createAdminWorldBossRankingReward(idConfig, dados, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const config = await WorldBossConfig.findByPk(idConfig, { transaction });
    if (!config) throw erro("Ameaça Mundial não encontrada.", 404);
    await validarFaixaRanking(dados, { transaction });
    const faixa = await WorldBossRankingReward.create(
      {
        id_world_boss_config: idConfig,
        posicao_inicio: dados.posicao_inicio,
        posicao_fim: dados.posicao_fim,
        id_item: dados.id_item ?? null,
        quantidade: dados.quantidade ?? 0,
        gold: dados.gold ?? 0,
        xp: dados.xp ?? 0,
        ativo: dados.ativo ?? true,
      },
      { transaction },
    );
    await registrarAcao({ idAdmin, acao: "criar", entidade: "WorldBossRankingReward", idEntidade: faixa.id, dadosDepois: faixa.toJSON(), req, transaction });
    return faixa;
  });
}

async function updateAdminWorldBossRankingReward(idConfig, idFaixa, dados, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const faixa = await WorldBossRankingReward.findOne({
      where: { id: idFaixa, id_world_boss_config: idConfig },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!faixa) throw erro("Faixa de recompensa não encontrada.", 404);
    await validarFaixaRanking(dados, { parcial: true, transaction });
    const antes = faixa.toJSON();
    await faixa.update(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "WorldBossRankingReward", idEntidade: faixa.id, dadosAntes: antes, dadosDepois: faixa.toJSON(), req, transaction });
    return faixa;
  });
}

async function deleteAdminWorldBossRankingReward(idConfig, idFaixa, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const faixa = await WorldBossRankingReward.findOne({
      where: { id: idFaixa, id_world_boss_config: idConfig },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!faixa) throw erro("Faixa de recompensa não encontrada.", 404);
    const antes = faixa.toJSON();
    await faixa.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "excluir", entidade: "WorldBossRankingReward", idEntidade: idFaixa, dadosAntes: antes, req, transaction });
  });
}

// ---------------------------------------------------------------------
// Preview de dano server-side (§13.4) — reutiliza worldBossRuntimeService.
// furiaPctDe (a MESMA função usada pelo relógio de combate de verdade,
// Etapa 3/5); o frontend NUNCA duplica esse cálculo, só exibe o
// resultado. Sem mitigação de defesa (isso depende do ALVO, que aqui
// não existe) — é uma estimativa da SAÍDA de dano do Boss, igual à
// tabela ilustrativa do §13.4.
async function previewDanoAdminWorldBoss(idConfig, { faseOrdem, acoes } = {}) {
  const config = await WorldBossConfig.findByPk(idConfig);
  if (!config) throw erro("Ameaça Mundial não encontrada.", 404);

  const fases = await WorldBossPhase.findAll({ where: { id_world_boss_config: idConfig }, order: [["ordem", "ASC"]] });
  if (fases.length === 0) throw erro("Este catálogo ainda não tem nenhuma fase cadastrada.");
  const fase = faseOrdem !== undefined && faseOrdem !== null ? fases.find((f) => f.ordem === Number(faseOrdem)) : fases[0];
  if (!fase) throw erro("Fase não encontrada pra esse catálogo.");

  const listaAcoes = Array.isArray(acoes) && acoes.length > 0 ? acoes : [1, 5, 10, 20, 50];
  const modificadorFase = 1 + Number(fase.modificador_dano_percentual || 0) / 100;

  return {
    fase: { ordem: fase.ordem, nome_fase: fase.nome_fase, limite_furia_pct: fase.limite_furia_pct !== null ? Number(fase.limite_furia_pct) : null },
    estimativas: listaAcoes.map((numeroAcao) => {
      const furiaPct = worldBossRuntimeService.furiaPctDe(Number(numeroAcao), {
        furia_por_acao_pct: Number(fase.furia_por_acao_pct),
        limite_furia_pct: fase.limite_furia_pct !== null ? Number(fase.limite_furia_pct) : null,
      });
      const escalaFuria = 1 + furiaPct / 100;
      return {
        acao: Number(numeroAcao),
        furia_pct: furiaPct,
        dano_min: Math.round(fase.dano_min * modificadorFase * escalaFuria),
        dano_max: Math.round(fase.dano_max * modificadorFase * escalaFuria),
      };
    }),
  };
}

// Preview de dano de UMA habilidade (§13.5) — mesma fórmula DETERMINÍSTICA
// do Power Score (calcularEfeitoPoderEsperado, sem RNG), com os atributos
// ATUAIS do Boss cadastrados no catálogo; dano ainda passa pelo
// modificador_dano_percentual da fase + escala de Fúria (igual ao runtime
// real, worldBossRuntimeService.resolverEfeitoDeHabilidade) quando
// escala_com_furia é true. Cura nunca escala com fase/Fúria (§5.5) — só
// prossegue igual ao runtime. Sem hit-chance/mitigação (não há alvo real
// aqui) — é uma estimativa da SAÍDA de efeito da habilidade, mesmo
// critério ilustrativo do preview de dano de fase.
async function previewHabilidadeAdminWorldBoss(idConfig, { idAbility, faseOrdem, acoes } = {}) {
  const config = await WorldBossConfig.findByPk(idConfig);
  if (!config) throw erro("Ameaça Mundial não encontrada.", 404);

  if (!Number.isInteger(idAbility)) throw erro("idAbility é obrigatório.");
  const habilidade = await WorldBossAbility.findOne({
    where: { id: idAbility, id_world_boss_config: idConfig },
    include: [{ model: Power }],
  });
  if (!habilidade) throw erro("Habilidade não encontrada.", 404);
  if (!habilidade.Power) throw erro("Esta habilidade não tem nenhum Power vinculado.");

  const fases = await WorldBossPhase.findAll({ where: { id_world_boss_config: idConfig }, order: [["ordem", "ASC"]] });
  if (fases.length === 0) throw erro("Este catálogo ainda não tem nenhuma fase cadastrada.");
  const fase = faseOrdem !== undefined && faseOrdem !== null ? fases.find((f) => f.ordem === Number(faseOrdem)) : fases[0];
  if (!fase) throw erro("Fase não encontrada pra esse catálogo.");

  const atacante = {
    forca: config.forca,
    vitalidade: config.vitalidade,
    agilidade: config.agilidade,
    inteligencia: config.inteligencia,
    velocidade: config.velocidade,
    nivel: config.nivel,
  };
  const listaAcoes = Array.isArray(acoes) && acoes.length > 0 ? acoes : [1, 5, 10, 20, 50];
  const modificadorFase = 1 + Number(fase.modificador_dano_percentual || 0) / 100;
  const efeito = calcularEfeitoPoderEsperado(habilidade.Power, atacante, 1);

  return {
    habilidade: {
      id: habilidade.id,
      tipo_alvo: habilidade.tipo_alvo,
      tempo_conjuracao_ms: habilidade.tempo_conjuracao_ms,
      escala_com_furia: habilidade.escala_com_furia,
      cooldown: habilidade.cooldown_override ?? habilidade.Power.cooldown ?? 0,
    },
    power: {
      id: habilidade.Power.id,
      nome: habilidade.Power.nome,
      escala_atributo: habilidade.Power.escala_atributo,
      valor_escala: habilidade.Power.valor_escala,
      custo_mana: custoManaEfetivo(habilidade.Power, 1),
    },
    fase: { ordem: fase.ordem, nome_fase: fase.nome_fase, limite_furia_pct: fase.limite_furia_pct !== null ? Number(fase.limite_furia_pct) : null },
    estimativas: listaAcoes.map((numeroAcao) => {
      const furiaPct = worldBossRuntimeService.furiaPctDe(Number(numeroAcao), {
        furia_por_acao_pct: Number(fase.furia_por_acao_pct),
        limite_furia_pct: fase.limite_furia_pct !== null ? Number(fase.limite_furia_pct) : null,
      });
      const escalaFuria = habilidade.escala_com_furia ? 1 + furiaPct / 100 : 1;
      return {
        acao: Number(numeroAcao),
        furia_pct: furiaPct,
        dano: efeito.dano > 0 ? Math.round(efeito.dano * modificadorFase * escalaFuria) : 0,
        cura: efeito.cura,
      };
    }),
  };
}

module.exports = {
  listAdminWorldBossConfigs,
  getAdminWorldBossConfig,
  createAdminWorldBossConfig,
  updateAdminWorldBossConfig,
  duplicateAdminWorldBossConfig,
  setAtivoAdminWorldBossConfig,
  getAdminWorldBossSettings,
  updateAdminWorldBossSettings,
  getAdminWorldBossMetrics,
  listAdminWorldBossAbilities,
  createAdminWorldBossAbility,
  updateAdminWorldBossAbility,
  deleteAdminWorldBossAbility,
  listAdminWorldBossResistances,
  createAdminWorldBossResistance,
  updateAdminWorldBossResistance,
  deleteAdminWorldBossResistance,
  listAdminWorldBossRankingRewards,
  createAdminWorldBossRankingReward,
  updateAdminWorldBossRankingReward,
  deleteAdminWorldBossRankingReward,
  previewDanoAdminWorldBoss,
  previewHabilidadeAdminWorldBoss,
};
