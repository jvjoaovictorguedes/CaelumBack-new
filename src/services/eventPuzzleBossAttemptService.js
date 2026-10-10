// Evento "O Coração da Máquina Celestial" — Fase 13: ciclo de vida da
// tentativa contra o Custódio do Meridiano. Clone estrutural de
// templeBossAttemptService.js (Guardião do Templo) com duas diferenças
// deliberadas (ver eventPuzzleBossModels.js pro raciocínio completo):
//
// 1. O desbloqueio usa puzzleBlueprintService.personagemCompletouBlueprint
//    contra EventPuzzleBossConfig.id_blueprint_gatilho — nunca um campo
//    boss_unlocked_at paralelo (Puzzle já tem a fonte de verdade de
//    "o personagem terminou esta sala": PuzzleInstance.status COMPLETED).
// 2. Nenhum config_snapshot cacheado num Event pai (Puzzle não tem esse
//    conceito) — o snapshot do boss é composto FRESCO do banco a cada
//    criação de tentativa (EventPuzzleBossConfig + fases + resistências
//    + AdventureMonster, via Sequelize include), nunca de um cache
//    desatualizável.
//
// Criação de tentativa segue o padrão JÁ HARDENED do próprio Puzzle
// (ver puzzleInstanceService.criarOuObterInstancia): lock de verdade na
// linha ESTÁVEL (Character), nunca um SELECT FOR UPDATE sobre uma
// tentativa que ainda não existe — isso nunca serializa nada. A garantia
// final contra duplicata é a dupla: lock de Character + índice único
// parcial (id_event_edition, character_id) WHERE status='Ativa' na
// tabela (ver migration 20270214010003).
const { sequelize } = require("../config/database");
const EventEdition = require("../models/eventPuzzleModels").EventEdition;
const AdventureMonster = require("../models/AdventureMonster");
const Character = require("../models/Character");
const {
  EventPuzzleBossConfig,
  EventPuzzleBossPhase,
  EventPuzzleBossStatusResistance,
  EventPuzzleBossAttempt,
  EventPuzzleBossRewardGrant,
} = require("../models/eventPuzzleBossModels");
const puzzleBlueprintService = require("./puzzleBlueprintService");
const combatPowerService = require("./combatPowerService");
const templeBossScalingService = require("./templeBossScalingService");
const monsterCombatAdapter = require("./monsterCombatAdapter");
const rewardPayoutService = require("./rewardPayoutService");
const { CONTEXTO } = require("./eventPuzzleBossCombatService");

function erro(mensagem, statusCode = 400, code) {
  return Object.assign(new Error(mensagem), { statusCode, code });
}

function plano(valor) {
  return JSON.parse(JSON.stringify(valor));
}

async function obterConfigAtivo(idEventDefinition, transaction) {
  return EventPuzzleBossConfig.findOne({
    where: { id_event_definition: idEventDefinition, ativo: true },
    include: [
      { model: AdventureMonster, as: "monstroBase" },
      { model: EventPuzzleBossPhase, as: "fases", separate: true, order: [["ordem", "ASC"]] },
      { model: EventPuzzleBossStatusResistance, as: "resistencias" },
    ],
    transaction,
  });
}

// GET de status público — nunca cria tentativa, pode ser chamado fora
// de combate (mesmo papel de templeBossAttemptService.obterStatusPublico).
async function obterStatusPublico(characterId, idEventEdition) {
  const edicao = await EventEdition.findByPk(idEventEdition);
  if (!edicao) throw erro("Edição do evento não encontrada.", 404);

  const config = await obterConfigAtivo(edicao.id_event_definition);
  if (!config) return { status: "Nenhum" };

  const desbloqueado = config.id_blueprint_gatilho
    ? await puzzleBlueprintService.personagemCompletouBlueprint(characterId, edicao.id, config.id_blueprint_gatilho)
    : true;
  const poder = await combatPowerService.calcularPoderPersonagem(characterId);
  const tentativaAtiva = await EventPuzzleBossAttempt.findOne({
    where: { id_event_edition: edicao.id, character_id: characterId, status: "Ativa" },
  });
  const jaVenceu = await EventPuzzleBossRewardGrant.findOne({
    where: { id_event_edition: edicao.id, character_id: characterId },
  });

  return {
    status: "Disponivel",
    eventEditionId: edicao.id,
    nomeExibicao: config.nome_exibicao,
    lore: config.lore,
    imagemUrl: config.monstroBase?.imagem_url ?? null,
    desbloqueado,
    jaVenceu: Boolean(jaVenceu),
    tentativaEmAndamento: Boolean(tentativaAtiva),
    meuPoderDeCombate: poder?.combatPower ?? null,
  };
}

// Mesma composição do Templo (player_snapshot = build EFETIVA real via
// carregarLutador/calcularPoderPersonagem; boss_snapshot = identidade
// congelada + stats escalados pelo dpr/ehp REAL deste personagem agora).
// Diferença: habilidades/fases/resistências vêm FRESCAS do banco aqui
// (nunca de um cache), já que Puzzle não tem um Event singleton com
// config_snapshot pra cachear.
async function montarSnapshots(characterId, config, transaction) {
  const { carregarLutador } = require("../socket/pvpLiveSocket");
  const lutador = await carregarLutador(characterId, { vidaCheia: true, contexto: CONTEXTO });
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

  const bossBase = {
    vida_maxima: config.monstroBase.vida_maxima,
    dano_min: config.monstroBase.dano_min,
    dano_max: config.monstroBase.dano_max,
    defesa: config.monstroBase.defesa,
  };
  const scalingConfig = {
    target_turns_to_kill: config.target_turns_to_kill,
    target_boss_actions_survivable: config.target_boss_actions_survivable,
    scaling_min_multiplier: config.scaling_min_multiplier,
    scaling_max_multiplier: config.scaling_max_multiplier,
  };
  const statsEscalados = templeBossScalingService.calcularStatsEscaladosDoBoss({
    playerSnapshot: poder,
    bossBase,
    scaling: scalingConfig,
  });

  const habilidades = await monsterCombatAdapter.construirHabilidadesParaEncontro(config.id_monstro_base, { transaction });

  const bossSnapshot = plano({
    boss_config_id: config.id,
    nome_exibicao: config.nome_exibicao ?? config.monstroBase.nome,
    imagem_url: config.monstroBase.imagem_url,
    ai_profile: config.monstroBase.ai_profile,
    abilities: habilidades ?? [],
    phases: (config.fases ?? []).map((f) => ({
      ordem: f.ordem,
      hp_threshold_pct: f.hp_threshold_pct,
      nome_exibicao: f.nome_exibicao,
      dano_multiplicador: f.dano_multiplicador,
      defesa_multiplicador: f.defesa_multiplicador,
      enrage: f.enrage,
    })),
    // Cadastrado pro Admin já poder calibrar (ver migration de conteúdo
    // 20270214010004) mas, igual ao Guardião do Templo, ainda não
    // aplicado na resolução de turno — duelEngine.resolverTurnoComStatus
    // (o motor genérico compartilhado) não expõe um hook de resistência
    // de status pro defensor; wire-up real ficaria pra um motor de
    // combate dedicado (fora do escopo de "clone estrutural do Templo").
    status_resistances: (config.resistencias ?? []).map((r) => ({
      status_key: r.status_key,
      imune: r.imune,
      resistencia_pct: r.resistencia_pct,
    })),
    reward_ouro_primeira_vitoria: config.reward_ouro_primeira_vitoria,
    reward_xp_primeira_vitoria: config.reward_xp_primeira_vitoria,
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

// "Uma tentativa Ativa por personagem+edição" — lock real na linha de
// Character (sempre estável, igual ao padrão hardened de
// puzzleInstanceService.criarOuObterInstancia), nunca num SELECT FOR
// UPDATE sobre EventPuzzleBossAttempt (que pode não existir ainda).
async function entrarOuRetomar(characterId, idEventEdition, transaction) {
  const character = await Character.findByPk(characterId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!character) throw erro("Personagem não encontrado.", 404);

  const edicao = await EventEdition.findByPk(idEventEdition, { transaction });
  if (!edicao) throw erro("Edição do evento não encontrada.", 404);
  if (edicao.status !== "ACTIVE") throw erro("Esta edição do evento não está ativa.", 400);

  const config = await obterConfigAtivo(edicao.id_event_definition, transaction);
  if (!config) throw erro("O Custódio do Meridiano ainda não foi configurado para este evento.", 400);

  const existente = await EventPuzzleBossAttempt.findOne({
    where: { id_event_edition: edicao.id, character_id: characterId, status: "Ativa" },
    transaction,
  });
  if (existente) return { attempt: existente, retomada: true };

  if (config.id_blueprint_gatilho) {
    const completou = await puzzleBlueprintService.personagemCompletouBlueprint(
      characterId,
      edicao.id,
      config.id_blueprint_gatilho,
      transaction,
    );
    if (!completou) {
      throw erro("Resolva o Núcleo da Convergência antes de enfrentar o Custódio do Meridiano.", 403, "GATILHO_PENDENTE");
    }
  }

  const { playerSnapshot, bossSnapshot } = await montarSnapshots(characterId, config, transaction);
  const attempt = await EventPuzzleBossAttempt.create(
    {
      id_event_edition: edicao.id,
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

// Primeiro clear concede ouro+xp fixos (Fase 14 cuida de loot temático
// rico — ver eventPuzzleBossModels.js). UNIQUE(id_event_edition,
// character_id) em EventPuzzleBossRewardGrant garante idempotência real
// sob concorrência, igual ao Guardião do Templo.
async function finalizarVitoria(attempt, transaction) {
  attempt.status = "Vitoria";
  attempt.finished_at = new Date();
  attempt.cleared_at = new Date();
  await attempt.save({ transaction });

  const jaConcedido = await EventPuzzleBossRewardGrant.findOne({
    where: { id_event_edition: attempt.id_event_edition, character_id: attempt.character_id },
    transaction,
  });
  if (jaConcedido) return { ouroGanho: 0, xpGanho: 0, idempotente: true };

  const ouro = attempt.boss_snapshot.reward_ouro_primeira_vitoria ?? 0;
  const xp = attempt.boss_snapshot.reward_xp_primeira_vitoria ?? 0;
  if (ouro > 0 || xp > 0) {
    await rewardPayoutService.aplicarPacoteDeRecompensa(
      attempt.character_id,
      { ouro: ouro > 0 ? ouro : undefined, xp: xp > 0 ? xp : undefined },
      transaction,
    );
  }

  await EventPuzzleBossRewardGrant.create(
    {
      id_event_edition: attempt.id_event_edition,
      character_id: attempt.character_id,
      id_attempt: attempt.id,
      ouro_concedido: ouro,
      xp_concedido: xp,
    },
    { transaction },
  );

  attempt.reward_granted_at = new Date();
  await attempt.save({ transaction });

  return { ouroGanho: ouro, xpGanho: xp, idempotente: false };
}

async function finalizarDerrota(attempt, transaction) {
  attempt.status = "Derrota";
  attempt.finished_at = new Date();
  await attempt.save({ transaction });
  return attempt;
}

module.exports = {
  obterStatusPublico,
  obterConfigAtivo,
  entrarOuRetomar,
  persistirRuntimeState,
  finalizarVitoria,
  finalizarDerrota,
};
