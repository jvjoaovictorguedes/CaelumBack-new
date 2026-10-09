// Templo do Véu Celestial (templo_veu_celestial_v1_caelum.docx) — Fase
// 5: ciclo de vida da tentativa contra o Guardião (§8/§9.3/§10.1).
// Reaproveita pvpLiveSocket.carregarLutador (MESMA montagem de
// lutador usada por Duelo/Guild Boss) pro player_snapshot — nunca uma
// segunda forma de construir o personagem efetivo de combate.
const { sequelize } = require("../config/database");
const TempleEvent = require("../models/TempleEvent");
const CharacterTempleProgress = require("../models/CharacterTempleProgress");
const TempleBossAttempt = require("../models/TempleBossAttempt");
const TempleBossRewardGrant = require("../models/TempleBossRewardGrant");
const TempleBossRewardEntry = require("../models/TempleBossRewardEntry");
const Character = require("../models/Character");
const Item = require("../models/Item");
const combatPowerService = require("./combatPowerService");
const templeBossScalingService = require("./templeBossScalingService");
const inventoryService = require("./inventoryService");
const equipmentInstanceService = require("./equipmentInstanceService");
const { EVENT_STATUS_ABERTOS, GAME_SETTINGS_DEFAULT } = require("../config/templeConfig");
const gameSettingCache = require("./gameSettingCache");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

function plano(valor) {
  return JSON.parse(JSON.stringify(valor));
}

async function obterEventoComGuardiao(transaction) {
  return TempleEvent.findOne({ where: { status: EVENT_STATUS_ABERTOS }, transaction });
}

// GET /api/temple/boss/status — §13.3: lore, Poder ATUAL (nunca a
// fórmula de scaling), estado de desbloqueio/clear. Pode ser chamado
// fora de combate, sem criar nenhum attempt.
async function obterStatusPublico(characterId) {
  const evento = await obterEventoComGuardiao();
  if (!evento || !evento.config_snapshot?.boss) return { status: "Nenhum" };

  const boss = evento.config_snapshot.boss;
  const progresso = await CharacterTempleProgress.findOne({
    where: { id_event: evento.id, character_id: characterId },
  });
  const poder = await combatPowerService.calcularPoderPersonagem(characterId);
  const tentativaAtiva = await TempleBossAttempt.findOne({
    where: { id_event: evento.id, character_id: characterId, status: "Ativa" },
  });

  return {
    status: "Disponivel",
    event_id: evento.id,
    nome_exibicao: boss.nome_exibicao,
    lore: boss.lore,
    imagem_url: boss.imagem_url,
    desbloqueado: Boolean(progresso?.boss_unlocked_at),
    ja_venceu: Boolean(progresso?.boss_cleared_at),
    tentativa_em_andamento: Boolean(tentativaAtiva),
    meu_poder_de_combate: poder?.combatPower ?? null,
  };
}

// §9.1/§9.3 — monta o player_snapshot (build EFETIVA real, igual
// carregarLutador já monta pra Duelo/Guild Boss) e o boss_snapshot
// (identidade congelada do evento + stats escalados pelo dpr/ehp REAL
// deste personagem agora). Nunca recalculado depois disso — a
// tentativa já nasce com os dois congelados.
async function montarSnapshots(characterId, evento, transaction) {
  const { carregarLutador } = require("../socket/pvpLiveSocket");
  const lutador = await carregarLutador(characterId, { vidaCheia: true, contexto: "TEMPLE_BOSS" });
  if (!lutador) throw erro("Não foi possível carregar seu personagem.", 404);

  const poder = await combatPowerService.calcularPoderPersonagem(characterId);
  if (!poder) throw erro("Não foi possível calcular seu Poder de Combate.", 500);

  const playerSnapshot = plano({
    id: lutador.id,
    nome: lutador.nome,
    genero: lutador.genero,
    classe: lutador.classe,
    poderes: lutador.poderes,
    armaEfeitos: lutador.armaEfeitos,
    estado: lutador.estado,
    vidaMax: lutador.vidaMax,
    manaMax: lutador.manaMax,
    combatPower: poder.combatPower,
    dpr: poder.dpr,
    ehp: poder.ehp,
  });

  const bossConfigSnapshot = evento.config_snapshot.boss;
  const scalingConfig = {
    target_turns_to_kill:
      bossConfigSnapshot.scaling.target_turns_to_kill ?? gameSettingCache.obter(
        "temple.boss.target_turns_to_kill",
        GAME_SETTINGS_DEFAULT["temple.boss.target_turns_to_kill"],
      ),
    target_boss_actions_survivable:
      bossConfigSnapshot.scaling.target_boss_actions_survivable ?? gameSettingCache.obter(
        "temple.boss.target_boss_actions_survivable",
        GAME_SETTINGS_DEFAULT["temple.boss.target_boss_actions_survivable"],
      ),
    scaling_min_multiplier:
      bossConfigSnapshot.scaling.scaling_min_multiplier ?? gameSettingCache.obter(
        "temple.boss.scaling_min_multiplier",
        GAME_SETTINGS_DEFAULT["temple.boss.scaling_min_multiplier"],
      ),
    scaling_max_multiplier:
      bossConfigSnapshot.scaling.scaling_max_multiplier ?? gameSettingCache.obter(
        "temple.boss.scaling_max_multiplier",
        GAME_SETTINGS_DEFAULT["temple.boss.scaling_max_multiplier"],
      ),
  };
  const statsEscalados = templeBossScalingService.calcularStatsEscaladosDoBoss({
    playerSnapshot: poder,
    bossBase: bossConfigSnapshot.base,
    scaling: scalingConfig,
  });

  const bossSnapshot = plano({
    boss_config_id: bossConfigSnapshot.boss_config_id,
    nome_exibicao: bossConfigSnapshot.nome_exibicao,
    imagem_url: bossConfigSnapshot.imagem_url,
    ai_profile: bossConfigSnapshot.ai_profile,
    abilities: bossConfigSnapshot.abilities,
    phases: bossConfigSnapshot.phases,
    status_resistances: bossConfigSnapshot.status_resistances,
    reward_sigils_primeira_vitoria: bossConfigSnapshot.reward_sigils_primeira_vitoria,
    stats: statsEscalados,
  });

  return { playerSnapshot, bossSnapshot };
}

function runtimeInicial(playerSnapshot, bossSnapshot) {
  return {
    combat_turn: 1,
    vida_atual_jogador: playerSnapshot.estado.vida_atual,
    mana_atual_jogador: playerSnapshot.estado.mana_atual,
    vida_atual_boss: bossSnapshot.stats.vida_maxima,
    status_jogador: [],
    status_boss: [],
    buffs_jogador: [],
    buffs_boss: [],
    escudo_jogador: null,
    escudo_boss: null,
    cooldowns_jogador: {},
    cooldowns_boss: {},
    fase_atual_ordem: null,
    log_recente: [],
  };
}

// §8.1 "uma instância por personagem" — resume a Ativa se já existe
// (resync, nunca duplica); senão exige boss_unlocked_at e cria uma nova
// já com os dois snapshots congelados e vida cheia dos dois lados.
async function entrarOuRetomar(characterId, transaction) {
  const evento = await obterEventoComGuardiao(transaction);
  if (!evento) throw erro("Não há Convergência com o Guardião disponível agora.", 400);
  if (!evento.config_snapshot?.boss) throw erro("O Guardião desta Convergência ainda não foi configurado.", 400);

  const existente = await TempleBossAttempt.findOne({
    where: { id_event: evento.id, character_id: characterId, status: "Ativa" },
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
  if (existente) return { attempt: existente, retomada: true };

  const progresso = await CharacterTempleProgress.findOne({
    where: { id_event: evento.id, character_id: characterId },
    transaction,
  });
  if (!progresso?.boss_unlocked_at) {
    throw erro("Você ainda não desbloqueou o Guardião — conclua as Provações Principais primeiro.", 403);
  }

  const { playerSnapshot, bossSnapshot } = await montarSnapshots(characterId, evento, transaction);
  const attempt = await TempleBossAttempt.create(
    {
      id_event: evento.id,
      character_id: characterId,
      status: "Ativa",
      player_snapshot: playerSnapshot,
      boss_snapshot: bossSnapshot,
      runtime_state: runtimeInicial(playerSnapshot, bossSnapshot),
    },
    { transaction },
  );
  return { attempt, retomada: false };
}

async function persistirRuntimeState(attempt, runtimeState, transaction) {
  attempt.runtime_state = plano(runtimeState);
  await attempt.save({ transaction });
  return attempt;
}

// §10.1 — primeiro clear concede Sigilos fixos + um roll de loot
// exclusivo, marcado na MESMA transaction que cleared_at/
// reward_granted_at. UNIQUE (id_event, character_id) em
// TempleBossRewardGrant garante que nunca paga duas vezes mesmo sob
// concorrência — retry depois de já concedido só confirma idempotente.
async function finalizarVitoria(attempt, transaction) {
  attempt.status = "Vitoria";
  attempt.finished_at = new Date();
  attempt.cleared_at = new Date();
  await attempt.save({ transaction });

  const [progresso] = await CharacterTempleProgress.findOrCreate({
    where: { id_event: attempt.id_event, character_id: attempt.character_id },
    defaults: { id_event: attempt.id_event, character_id: attempt.character_id },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const jaConcedido = await TempleBossRewardGrant.findOne({
    where: { id_event: attempt.id_event, character_id: attempt.character_id },
    transaction,
  });
  if (jaConcedido) {
    if (!progresso.boss_cleared_at) {
      progresso.boss_cleared_at = new Date();
      await progresso.save({ transaction });
    }
    return { sigilosGanhos: 0, idempotente: true, itensGanhos: [] };
  }

  const sigilos = attempt.boss_snapshot.reward_sigils_primeira_vitoria ?? 0;
  if (sigilos > 0) {
    const character = await Character.findByPk(attempt.character_id, { transaction });
    const evento = await TempleEvent.findByPk(attempt.id_event, { transaction });
    await inventoryService.addStack(character.id, evento.id_currency_item, sigilos, transaction);
  }

  const itensGanhos = await rolarLootDoGuardiao(attempt, transaction);

  await TempleBossRewardGrant.create(
    {
      id_event: attempt.id_event,
      character_id: attempt.character_id,
      id_attempt: attempt.id,
      sigilos_concedidos: sigilos,
      status: "Granted",
      detalhes: { itens: itensGanhos },
    },
    { transaction },
  );

  progresso.boss_cleared_at = new Date();
  progresso.reward_granted_at = new Date();
  await progresso.save({ transaction });

  return { sigilosGanhos: sigilos, idempotente: false, itensGanhos };
}

async function concederEntrada(character, entrada, transaction) {
  if (entrada.reward_kind === "EQUIPMENT") {
    await equipmentInstanceService.create(
      { idPersonagem: character.id, idItem: entrada.id_item, raridade: entrada.raridade_instancia },
      transaction,
    );
  } else {
    await inventoryService.addStack(character.id, entrada.id_item, entrada.quantidade, transaction);
  }
  const item = await Item.findByPk(entrada.id_item, { transaction });
  return { id_item: entrada.id_item, nome: item?.nome, quantidade: entrada.quantidade, reward_kind: entrada.reward_kind };
}

// §10.1/§10.2/§10.3 — loot exclusivo do primeiro clear tem duas partes
// independentes: (1) todo entry garantido=true elegível é SEMPRE
// concedido ("grant garantido de conclusão" — Baú/Fragmento/Item de
// evento); (2) as entries não-garantidas concorrem por um único roll
// ponderado ("Roll no loot exclusivo do Guardião"). Reward band por
// nível em ambas: fora da faixa do personagem sai da lista (nunca dá
// endgame gear a quem está começando). Sem nenhuma entry elegível em
// nenhuma das duas partes, o clear ainda paga Sigilos normalmente —
// loot é um bônus, não uma obrigação de configuração.
async function rolarLootDoGuardiao(attempt, transaction) {
  const character = await Character.findByPk(attempt.character_id, { transaction });
  const entradas = await TempleBossRewardEntry.findAll({
    where: { id_boss_config: attempt.boss_snapshot.boss_config_id ?? -1 },
    transaction,
  });
  // boss_config_id só existe se foi incluído no snapshot — ver nota no
  // caller; quando ausente, não há catálogo de loot pra conceder/rolar.
  const elegiveis = entradas.filter((e) => {
    if (!e.ativo) return false;
    if (e.nivel_minimo != null && character.nivel < e.nivel_minimo) return false;
    if (e.nivel_maximo != null && character.nivel > e.nivel_maximo) return false;
    return true;
  });

  const itensGanhos = [];

  const garantidas = elegiveis.filter((e) => e.garantido);
  for (const entrada of garantidas) {
    itensGanhos.push(await concederEntrada(character, entrada, transaction));
  }

  const sorteaveis = elegiveis.filter((e) => !e.garantido);
  const pesoTotal = sorteaveis.reduce((soma, e) => soma + e.weight, 0);
  if (sorteaveis.length > 0 && pesoTotal > 0) {
    const crypto = require("crypto");
    let alvo = crypto.randomInt(0, pesoTotal);
    let escolhida = sorteaveis[sorteaveis.length - 1];
    for (const entrada of sorteaveis) {
      if (alvo < entrada.weight) {
        escolhida = entrada;
        break;
      }
      alvo -= entrada.weight;
    }
    itensGanhos.push(await concederEntrada(character, escolhida, transaction));
  }

  return itensGanhos;
}

async function finalizarDerrota(attempt, transaction) {
  attempt.status = "Derrota";
  attempt.finished_at = new Date();
  await attempt.save({ transaction });
  return attempt;
}

module.exports = {
  obterStatusPublico,
  obterEventoComGuardiao,
  entrarOuRetomar,
  persistirRuntimeState,
  finalizarVitoria,
  finalizarDerrota,
};
