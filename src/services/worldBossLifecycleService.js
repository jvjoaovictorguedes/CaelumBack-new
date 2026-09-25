// Boss Global — ciclo COOLDOWN -> DORMANT (§6/§20). Quem consome
// discovery_progress/discovery_threshold é worldBossDiscoveryService;
// aqui só a criação/ativação das linhas do ciclo, chamado
// periodicamente pelo worldBossScheduler (Fase 3).
const crypto = require("crypto");
const WorldBossConfig = require("../models/WorldBossConfig");
const WorldBossPhase = require("../models/WorldBossPhase");
const WorldBossConfigZone = require("../models/WorldBossConfigZone");
const WorldBossEvent = require("../models/WorldBossEvent");
const gameSettingCache = require("./gameSettingCache");
const { EVENT_STATUS, EVENT_STATUS_ABERTOS, GAME_SETTINGS_DEFAULT } = require("../config/worldBossConfig");

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

// §18/§19 — snapshot congelado no início do ciclo. Editar o catálogo
// depois NUNCA muda um evento já em andamento.
async function montarSnapshot(config, transaction) {
  const fases = await WorldBossPhase.findAll({
    where: { id_world_boss_config: config.id },
    order: [["ordem", "ASC"]],
    transaction,
  });
  const zonas = await WorldBossConfigZone.findAll({ where: { id_world_boss_config: config.id }, transaction });
  return {
    nome: config.nome,
    descricao: config.descricao,
    lore: config.lore,
    imagem_url: config.imagem_url,
    vida_base: Number(config.vida_base),
    defesa: config.defesa,
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
      ordem: fase.ordem,
      nome_fase: fase.nome_fase,
      hp_percentual_max: fase.hp_percentual_max,
      modificador_dano_percentual: fase.modificador_dano_percentual,
      texto_alerta: fase.texto_alerta,
    })),
    zonas: zonas.map((zona) => zona.id_zone),
  };
}

// Cria a PRÓXIMA linha do ciclo em COOLDOWN — chamada depois de um
// DEFEATED (com atraso de cooldown_hours a partir da derrota) ou na
// primeira inicialização do servidor (apartirDe = agora, sem nenhum
// evento ainda cadastrado). Nunca cria uma segunda se já existe um
// evento aberto OU uma linha em COOLDOWN esperando (idempotente).
async function agendarProximoCiclo(transaction, { apartirDe = new Date() } = {}) {
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

// Transição COOLDOWN -> DORMANT quando next_eligible_at já passou —
// sorteia o discovery_threshold AQUI (§5.3, fallback simples), nunca
// antes: o valor secreto não pode existir mais tempo do que precisa.
async function ativarSeElegivel(transaction) {
  const evento = await WorldBossEvent.findOne({
    where: { status: EVENT_STATUS.COOLDOWN },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!evento) return null;
  if (evento.next_eligible_at && new Date(evento.next_eligible_at).getTime() > Date.now()) return null;

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

module.exports = { existeEventoAberto, selecionarConfig, agendarProximoCiclo, ativarSeElegivel };
