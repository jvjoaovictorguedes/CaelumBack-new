// Boss Global — ciclo COOLDOWN -> DORMANT (§6/§20). Quem consome
// discovery_progress/discovery_threshold é worldBossDiscoveryService;
// aqui só a criação/ativação das linhas do ciclo, chamado
// periodicamente pelo worldBossScheduler (Fase 3).
const crypto = require("crypto");
const WorldBossConfig = require("../models/WorldBossConfig");
const WorldBossPhase = require("../models/WorldBossPhase");
const WorldBossConfigZone = require("../models/WorldBossConfigZone");
const WorldBossEvent = require("../models/WorldBossEvent");
const WorldBossAbility = require("../models/WorldBossAbility");
const WorldBossStatusResistance = require("../models/WorldBossStatusResistance");
const WorldBossRankingReward = require("../models/WorldBossRankingReward");
const Power = require("../models/Power");
const gameSettingCache = require("./gameSettingCache");
const { EVENT_STATUS, EVENT_STATUS_ABERTOS, GAME_SETTINGS_DEFAULT } = require("../config/worldBossConfig");

// Versão do formato do snapshot (Ameaça Mundial V2 §9.3/Anexo A) — usada
// só pra diagnóstico/telemetria; a leitura do snapshot NUNCA deve travar
// num schema_version específico, porque eventos antigos (V1, sem essa
// chave) continuam existindo no banco e precisam continuar legíveis.
const SNAPSHOT_SCHEMA_VERSION = 3;

async function existeEventoAberto(transaction) {
  const evento = await WorldBossEvent.findOne({ where: { status: EVENT_STATUS_ABERTOS }, transaction });
  return Boolean(evento);
}

// §20 — seleção ponderada entre WorldBossConfig ativos, por
// peso_selecao (peso <= 0 tratado como 1, nunca elimina o config da
// roleta por engano de cadastro).
async function selecionarConfig(transaction) {
  const configs = await WorldBossConfig.findAll({ where: { ativo: true }, transaction });
  if (configs.length === 0) return null;
  const pesos = configs.map((config) => Math.max(1, config.peso_selecao));
  const pesoTotal = pesos.reduce((soma, peso) => soma + peso, 0);
  let alvo = crypto.randomInt(0, pesoTotal);
  for (let i = 0; i < configs.length; i++) {
    alvo -= pesos[i];
    if (alvo < 0) return configs[i];
  }
  return configs[configs.length - 1];
}

// §9.3/§23.1 — snapshot PROFUNDO: nunca salvar só id_power (uma edição
// de Power no meio da raid mudaria o evento ativo). Todo valor efetivo
// usado pelo runtime da Etapa 3+ (dano/cura base, custo, cooldown,
// escala) é copiado pro snapshot aqui, junto da config específica de
// raid (peso/prioridade/alvo/cast/overrides).
async function montarSnapshotHabilidades(idConfig, transaction) {
  const habilidades = await WorldBossAbility.findAll({
    where: { id_world_boss_config: idConfig, ativo: true },
    include: [{ model: Power }],
    order: [["prioridade", "DESC"]],
    transaction,
  });
  return habilidades.map((hab) => ({
    id_ability: hab.id,
    power_snapshot: hab.Power
      ? {
          id: hab.Power.id,
          tipo_dano:hab.Power.tipo_dano,
          ...Object.fromEntries(Object.keys(require("../models/combatTypingModels").fields.power).map(k=>[k,hab.Power[k]])),
          nome: hab.Power.nome,
          imagem_url: hab.Power.imagem_url,
          dano_base: hab.Power.dano_base,
          cura_base: hab.Power.cura_base,
          custo_mana: hab.Power.custo_mana,
          cooldown: hab.Power.cooldown,
          escala_atributo: hab.Power.escala_atributo,
          valor_escala: hab.Power.valor_escala,
        }
      : null,
    peso_uso: hab.peso_uso,
    prioridade: hab.prioridade,
    fases_permitidas: hab.fases_permitidas,
    tipo_alvo: hab.tipo_alvo,
    quantidade_alvos: hab.quantidade_alvos,
    tempo_conjuracao_ms: hab.tempo_conjuracao_ms,
    cooldown_override: hab.cooldown_override,
    custo_mana_override: hab.custo_mana_override,
    escala_com_furia: hab.escala_com_furia,
  }));
}

// §18/§19/§9.3 — snapshot congelado no início do ciclo. Editar o
// catálogo depois NUNCA muda um evento já em andamento.
async function montarSnapshot(config, transaction) {
  const fases = await WorldBossPhase.findAll({
    where: { id_world_boss_config: config.id },
    order: [["ordem", "ASC"]],
    transaction,
  });
  const zonas = await WorldBossConfigZone.findAll({ where: { id_world_boss_config: config.id }, transaction });
  const resistencias = await WorldBossStatusResistance.findAll({
    where: { id_world_boss_config: config.id, ativo: true },
    transaction,
  });
  const recompensasRanking = await WorldBossRankingReward.findAll({
    where: { id_world_boss_config: config.id, ativo: true },
    order: [["posicao_inicio", "ASC"]],
    transaction,
  });
  const habilidades = await montarSnapshotHabilidades(config.id, transaction);
  await require("./combatTypingService").catalog();

  return {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    combat_duration_seconds: config.combat_duration_seconds,
    failure_crisis_snapshot: gameSettingCache.obter("worldcrisis.enabled",false) ? await require("./worldCrisisConfigService").snapshot(config.id_failure_crisis_config,transaction) : null,
    combatTyping:require("./combatTypingService").monsterProfile(config),
    nome: config.nome,
    descricao: config.descricao,
    lore: config.lore,
    imagem_url: config.imagem_url,
    fundo_url: config.fundo_url,
    vida_base: Number(config.vida_base),
    defesa: config.defesa,
    ...Object.fromEntries(Object.keys(require("../models/combatTypingModels").fields.monster).map(k=>[k,config[k]])),
    // §4.1 — atributos de combate/raid do Boss.
    nivel: config.nivel,
    forca: config.forca,
    vitalidade: config.vitalidade,
    agilidade: config.agilidade,
    inteligencia: config.inteligencia,
    velocidade: config.velocidade,
    mana_maxima: config.mana_maxima,
    regeneracao_mana_por_acao: config.regeneracao_mana_por_acao,
    intervalo_acao_ms: config.intervalo_acao_ms,
    reentrada_permitida: config.reentrada_permitida,
    cooldown_reentrada_segundos: config.cooldown_reentrada_segundos,
    mensagem_descoberta: config.mensagem_descoberta,
    mensagem_convocacao: config.mensagem_convocacao,
    mensagem_fase_final: config.mensagem_fase_final,
    mensagem_derrota: config.mensagem_derrota,
    id_item_golpe_final: config.id_item_golpe_final,
    gold_descoberta: config.gold_descoberta,
    gold_participacao: config.gold_participacao,
    xp_participacao: config.xp_participacao,
    min_dano_participacao: config.min_dano_participacao !== null ? Number(config.min_dano_participacao) : null,
    cooldown_hours: gameSettingCache.obter(
      "worldboss.cooldown_hours",
      GAME_SETTINGS_DEFAULT["worldboss.cooldown_hours"],
    ),
    fases: fases.map((fase) => ({
      // Etapa 5 (§6.2) — WorldBossAbility.fases_permitidas guarda id de
      // WorldBossPhase, não ordem; sem congelar esse id aqui a IA nunca
      // conseguiria bater fase_atual contra fases_permitidas depois que
      // o evento já congelou o snapshot.
      id: fase.id,
      ordem: fase.ordem,
      nome_fase: fase.nome_fase,
      hp_percentual_max: fase.hp_percentual_max,
      modificador_dano_percentual: fase.modificador_dano_percentual,
      texto_alerta: fase.texto_alerta,
      // §5.1 — modelo híbrido dano min/max + curva de Fúria por fase.
      dano_min: fase.dano_min,
      dano_max: fase.dano_max,
      furia_por_acao_pct: Number(fase.furia_por_acao_pct),
      limite_furia_pct: fase.limite_furia_pct !== null ? Number(fase.limite_furia_pct) : null,
      intervalo_acao_ms: fase.intervalo_acao_ms,
      mana_ao_entrar: fase.mana_ao_entrar,
    })),
    zonas: zonas.map((zona) => zona.id_zone),
    // §6.2/§9.3 — valores EFETIVOS congelados, não só id_power.
    abilities: habilidades,
    // §7.1 — resistência/imunidade a status, reaproveitando o motor
    // existente; a camada de World Boss só decide se entra e com que
    // resistência.
    status_resistances: resistencias.map((r) => ({
      status_key: r.status_key,
      imune: r.imune,
      resistencia_pct: r.resistencia_pct,
    })),
    // §11.3 — faixas de recompensa por colocação no ranking final.
    ranking_rewards: recompensasRanking.map((r) => ({
      posicao_inicio: r.posicao_inicio,
      posicao_fim: r.posicao_fim,
      id_item: r.id_item,
      quantidade: r.quantidade,
      gold: r.gold,
      xp: r.xp,
    })),
  };
}

// Cria a PRÓXIMA linha do ciclo em COOLDOWN — chamada depois de um
// DEFEATED (com atraso de cooldown_hours a partir da derrota) ou na
// primeira inicialização do servidor (apartirDe = agora, sem nenhum
// evento ainda cadastrado). Nunca cria uma segunda se já existe um
// evento aberto OU uma linha em COOLDOWN esperando (idempotente).
async function agendarProximoCiclo(transaction, { apartirDe = new Date() } = {}) {
  if (gameSettingCache.obter("worldcrisis.pause_worldboss_during_active_crisis",true) && await require("./worldCrisisService").current(transaction)) return null;
  if (await existeEventoAberto(transaction)) return null;

  const jaEmCooldown = await WorldBossEvent.findOne({ where: { status: EVENT_STATUS.COOLDOWN }, transaction });
  if (jaEmCooldown) return jaEmCooldown;

  const config = await selecionarConfig(transaction);
  if (!config) return null;

  const cooldownHoras = gameSettingCache.obter(
    "worldboss.cooldown_hours",
    GAME_SETTINGS_DEFAULT["worldboss.cooldown_hours"],
  );
  const snapshot = await montarSnapshot(config, transaction);
  const proximaElegibilidade = new Date(apartirDe.getTime() + cooldownHoras * 60 * 60 * 1000);

  return WorldBossEvent.create(
    {
      id_world_boss_config: config.id,
      status: EVENT_STATUS.COOLDOWN,
      hp_max: config.vida_base,
      hp_current: config.vida_base,
      config_snapshot: snapshot,
      next_eligible_at: proximaElegibilidade,
      discovery_progress: 0,
      participation_rewards_status: "Pending",
    },
    { transaction },
  );
}

// Transição COOLDOWN -> DORMANT em si — sorteia o discovery_threshold
// AQUI (§5.3, fallback simples), nunca antes: o valor secreto não pode
// existir mais tempo do que precisa. Extraído de ativarSeElegivel pra
// o Admin (adminWorldBossEventService.forcarDescoberta) poder reusar a
// MESMA regra de sorteio ao pular o cooldown pra teste de
// balanceamento, em vez de duplicar o cálculo do threshold.
async function ativarEvento(evento, transaction) {
  const min = gameSettingCache.obter(
    "worldboss.discovery_threshold_min",
    GAME_SETTINGS_DEFAULT["worldboss.discovery_threshold_min"],
  );
  const max = gameSettingCache.obter(
    "worldboss.discovery_threshold_max",
    GAME_SETTINGS_DEFAULT["worldboss.discovery_threshold_max"],
  );
  const minSeguro = Math.min(min, max);
  const maxSeguro = Math.max(min, max);
  const threshold = crypto.randomInt(minSeguro, maxSeguro + 1);

  evento.status = EVENT_STATUS.DORMANT;
  evento.discovery_threshold = threshold;
  evento.discovery_progress = 0;
  await evento.save({ transaction });
  return evento;
}

// Transição COOLDOWN -> DORMANT quando next_eligible_at já passou —
// chamada periodicamente pelo scheduler (nunca pelo Admin, que usa
// ativarEvento direto pra pular a espera).
async function ativarSeElegivel(transaction) {
  if (gameSettingCache.obter("worldcrisis.pause_worldboss_during_active_crisis",true) && await require("./worldCrisisService").current(transaction)) return null;
  const evento = await WorldBossEvent.findOne({
    where: { status: EVENT_STATUS.COOLDOWN },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!evento) return null;
  if (evento.next_eligible_at && new Date(evento.next_eligible_at).getTime() > Date.now()) return null;

  return ativarEvento(evento, transaction);
}

module.exports = {
  existeEventoAberto,
  selecionarConfig,
  agendarProximoCiclo,
  ativarEvento,
  ativarSeElegivel,
  montarSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
};
