// Evento "O Coração da Máquina Celestial" — Fase 13: resolução de UM
// turno contra o Custódio do Meridiano. Clone estrutural de
// templeBossCombatService.js (Guardião do Templo) — mesma ORQUESTRAÇÃO
// só reaproveitando motores genéricos já em produção, nunca um motor
// próprio: lado do jogador via duelEngine.resolverTurnoComStatus (mesmo
// motor de PvP/Party/Guild Boss/Templo), lado do Custódio via
// monsterCombatAdapter.decidirAcao/executarPoder ("IA de Combate PvE &
// Habilidades de Monstros V1", a mesma fundação que a Aventura solo
// usa). Contexto de combate reaproveita a string "TEMPLE_BOSS" — decisão
// deliberada (ver eventPuzzleBossAttemptService.js pro raciocínio
// completo): registrar um 9º contexto formal em combatContextConfig.js
// ondularia pra schema/admin/múltiplos consumidores pra um boss solo
// idêntico em formato ao do Templo.
const crypto = require("crypto");
const { ACTION_TYPE, definicaoDoStatus } = require("../config/statusEffectConfig");
const statusEffectService = require("./statusEffectService");
const combatBuffService = require("./combatBuffService");
const combatModifierService = require("./combatModifierService");
const monsterCombatAdapter = require("./monsterCombatAdapter");
const duelEngine = require("./duelEngine");
const combatFormulas = require("./combatFormulas");
const cooldownService = require("./cooldownService");
const combatTypingService = require("./combatTypingService");
const templeBossScalingService = require("./templeBossScalingService");

const CONTEXTO = "TEMPLE_BOSS";

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

// Mesma lógica de fase por %HP do Templo (templeBossScalingService.
// faseAtivaPara é puro/genérico, reaproveitado sem alteração).
function statsComFase(bossSnapshot, percentualVidaAtual) {
  const fase = templeBossScalingService.faseAtivaPara(bossSnapshot.phases ?? [], percentualVidaAtual);
  const stats = bossSnapshot.stats;
  if (!fase) return { stats, fase: null };
  return {
    stats: {
      vida_maxima: stats.vida_maxima,
      dano_min: Math.max(1, Math.round(stats.dano_min * fase.dano_multiplicador)),
      dano_max: Math.max(1, Math.round(stats.dano_max * fase.dano_multiplicador)),
      defesa: Math.max(0, Math.round(stats.defesa * fase.defesa_multiplicador)),
    },
    fase,
  };
}

function montarEstadoBoss(bossSnapshot, runtime) {
  const percentual = (runtime.vida_atual_boss / Math.max(1, bossSnapshot.stats.vida_maxima)) * 100;
  const { stats, fase } = statsComFase(bossSnapshot, percentual);
  return {
    estado: {
      nome: bossSnapshot.nome_exibicao,
      vida_atual: runtime.vida_atual_boss,
      vida_maxima: bossSnapshot.stats.vida_maxima,
      dano_min: stats.dano_min,
      dano_max: stats.dano_max,
      defesa: stats.defesa,
      agilidade: 0,
      velocidade: 0,
      ai_profile: bossSnapshot.ai_profile,
      habilidades: bossSnapshot.abilities ?? [],
    },
    fase,
  };
}

// Mesma validação do Templo (§4.2 do doc original — nunca aceitar
// consumível contra um boss solo) — defesa em profundidade: validado de
// novo aqui mesmo que o socket já filtre o payload antes de chamar.
function validarAcao(acaoJogador) {
  if (!acaoJogador || !["attack", "power"].includes(acaoJogador.tipo)) {
    throw erro("O Custódio não aceita consumíveis.", 400);
  }
}

async function resolverTurnoDoJogador({ playerSnapshot, runtime, bossEstado, acaoJogador }) {
  const atacante = { ...playerSnapshot.estado, vida_atual: runtime.vida_atual_jogador, mana_atual: runtime.mana_atual_jogador };

  let poderUsado = null;
  if (acaoJogador.tipo === "power") {
    if (statusEffectService.bloqueiaHabilidadesAtivas(runtime.status_jogador)) {
      throw erro("Você está silenciado e não pode usar habilidades.", 403);
    }
    poderUsado = (playerSnapshot.poderes ?? []).find((p) => p.id === Number(acaoJogador.idPoder));
    if (!poderUsado) throw erro("Poder inválido.", 404);
    if (poderUsado.tipo_poder !== "Ativo") throw erro("Este poder não pode ser usado manualmente em combate.", 403);
    if (!cooldownService.podeUsar(runtime.cooldowns_jogador ?? {}, poderUsado.id)) {
      throw erro(
        `Esta habilidade ainda está em cooldown (${cooldownService.turnosRestantes(runtime.cooldowns_jogador ?? {}, poderUsado.id)} turno(s)).`,
        400,
      );
    }
    const custo = combatFormulas.custoManaEfetivo(poderUsado, poderUsado.nivel_habilidade ?? 1);
    if (atacante.mana_atual < custo) throw erro("Mana insuficiente.", 400);
  }

  const modificadoresAtacante = await combatModifierService.resolverModificadoresDoPersonagem(atacante, CONTEXTO);
  const gatilhosAtacante = await combatModifierService.resolverGatilhosDoPersonagem(atacante, CONTEXTO);

  const resultado = await duelEngine.resolverTurnoComStatus({
    atacante,
    defensor: bossEstado,
    acao: poderUsado ? { tipo: "power", power: poderUsado } : { tipo: "attack" },
    vidaMaxAtacante: playerSnapshot.vidaMax,
    manaMaxAtacante: playerSnapshot.manaMax,
    vidaMaxDefensor: bossEstado.vida_maxima,
    statusAtacante: runtime.status_jogador,
    statusDefensor: runtime.status_boss,
    buffsAtacante: runtime.buffs_jogador,
    buffsDefensor: runtime.buffs_boss,
    escudoAtacante: runtime.escudo_jogador,
    escudoDefensor: runtime.escudo_boss,
    turno: runtime.combat_turn,
    casterActorId: "player",
    armaEfeitosAtacante: playerSnapshot.armaEfeitos,
    itemIdArmaAtacante: playerSnapshot.estado.arma_equipada?.id_item ?? null,
    nomeAtacante: playerSnapshot.nome,
    nomeDefensor: bossEstado.nome,
    modificadoresAtacante,
    gatilhosAtacante,
    contexto: CONTEXTO,
  });

  if (poderUsado && !resultado.bloqueado) {
    runtime.cooldowns_jogador = cooldownService.iniciarCooldown(
      runtime.cooldowns_jogador ?? {},
      poderUsado.id,
      Math.max(0, poderUsado.cooldown ?? 0),
    );
    runtime.cooldowns_jogador = cooldownService.decrementarCooldowns(
      runtime.cooldowns_jogador,
      new Set([cooldownService.chaveDoPoder(poderUsado.id)]),
    );
  } else {
    runtime.cooldowns_jogador = cooldownService.decrementarCooldowns(runtime.cooldowns_jogador ?? {});
  }

  runtime.vida_atual_jogador = atacante.vida_atual;
  runtime.mana_atual_jogador = atacante.mana_atual;
  runtime.status_jogador = resultado.statusAtacante;
  runtime.status_boss = resultado.statusDefensor;
  runtime.buffs_jogador = resultado.buffsAtacante;
  runtime.escudo_jogador = resultado.escudoAtacante;
  runtime.escudo_boss = resultado.escudoDefensor;
  runtime.vida_atual_boss = bossEstado.vida_atual;

  return resultado;
}

async function resolverTurnoDoBoss({ playerSnapshot, runtime, bossEstado, log }) {
  const personagemAtual = { ...playerSnapshot.estado, vida_atual: runtime.vida_atual_jogador, mana_atual: runtime.mana_atual_jogador };

  const controle = statusEffectService.resolverAcoesBloqueadasDoTurno(runtime.status_boss, runtime.combat_turn);
  runtime.status_boss = controle.lista;
  const bloqueado = controle.bloqueadas.has(ACTION_TYPE.BASIC_ATTACK);
  let habilidadeUsada = null;

  if (bloqueado) {
    log.push(`${bossEstado.nome} está ${definicaoDoStatus(controle.motivoBloqueioTotal).nomeUi} e não conseguiu agir!`);
  } else {
    const decisaoIA = monsterCombatAdapter.decidirAcao({
      inimigoAtual: bossEstado,
      personagemAtual,
      vidaMaximaJogador: playerSnapshot.vidaMax,
      statusEffects: { player: runtime.status_jogador, enemy: runtime.status_boss },
      combatBuffs: { player: runtime.buffs_jogador, enemy: runtime.buffs_boss },
      escudo: { player: runtime.escudo_jogador, enemy: runtime.escudo_boss },
      cooldowns: { player: runtime.cooldowns_jogador, enemy: runtime.cooldowns_boss },
      combatTurn: runtime.combat_turn,
    });
    const habilidadeEscolhida =
      decisaoIA.type === "power" ? (bossEstado.habilidades ?? []).find((h) => h.id === decisaoIA.abilityId) : null;

    if (habilidadeEscolhida) {
      runtime.cooldowns_boss = cooldownService.iniciarCooldown(
        runtime.cooldowns_boss ?? {},
        habilidadeEscolhida.powerId,
        habilidadeEscolhida.cooldownConfigurado,
      );
    }

    const blindDoBoss = runtime.status_boss.find((s) => s.key === "BLIND");
    const resultadoAcerto = combatFormulas.resolverResultadoDeAcerto({
      atacante: bossEstado,
      defensor: personagemAtual,
      blindPotency: blindDoBoss?.potency ?? 0,
    });

    if (!resultadoAcerto.hit) {
      log.push(
        resultadoAcerto.reason === "BLIND_MISS"
          ? `${bossEstado.nome}, cego, errou o ataque!`
          : `Você esquivou do ataque de ${bossEstado.nome}!`,
      );
    } else if (habilidadeEscolhida) {
      habilidadeUsada = habilidadeEscolhida;
      monsterCombatAdapter.executarPoder({
        habilidade: habilidadeEscolhida,
        inimigoAtual: bossEstado,
        personagemAtual,
        statusEffects: { player: runtime.status_jogador, enemy: runtime.status_boss },
        combatBuffs: { player: runtime.buffs_jogador, enemy: runtime.buffs_boss },
        escudo: { player: runtime.escudo_jogador, enemy: runtime.escudo_boss },
        modificadoresJogador: new Map(),
        multiplicadorDefesaTaverna: 1,
        combatTurn: runtime.combat_turn,
        log,
      });
    } else {
      const danoBruto =
        Number.isInteger(bossEstado.dano_min) && Number.isInteger(bossEstado.dano_max)
          ? crypto.randomInt(bossEstado.dano_min, bossEstado.dano_max + 1)
          : Math.max(1, bossEstado.dano_min ?? 1);
      const danoEnfraquecido = Math.round(danoBruto * statusEffectService.multiplicadorDeDanoDeSaida(runtime.status_boss));
      const critico = combatFormulas.rolarCritico(bossEstado);
      const danoComCritico = critico ? Math.round(danoEnfraquecido * combatFormulas.MULTIPLICADOR_DANO_CRITICO) : danoEnfraquecido;
      const bonusDefesaTotal = combatBuffService.bonusDeDefesa(runtime.buffs_jogador);
      const defensorComBuffs = bonusDefesaTotal
        ? { ...personagemAtual, defesa: (personagemAtual.defesa || 0) + bonusDefesaTotal }
        : personagemAtual;
      const resolucao = combatTypingService.resolveDamage({
        amount: danoComCritico,
        actor: bossEstado,
        target: defensorComBuffs,
        context: CONTEXTO,
        buffs: runtime.buffs_boss,
        defenderBuffs: runtime.buffs_jogador,
      });
      const danoFinal = resolucao.totalDamage;
      log.push(
        critico
          ? `${bossEstado.nome} atacou e causou ${danoFinal} de dano em você. ACERTO CRÍTICO!`
          : `${bossEstado.nome} atacou e causou ${danoFinal} de dano em você.`,
      );

      const absorcao = combatBuffService.absorverDano(runtime.escudo_jogador, danoFinal);
      runtime.escudo_jogador = absorcao.escudo;
      personagemAtual.vida_atual = Math.max(0, personagemAtual.vida_atual - absorcao.danoResidual);

      const quebraFreeze = statusEffectService.removerFreezeAoReceberDanoDireto(runtime.status_jogador, danoFinal);
      runtime.status_jogador = quebraFreeze.lista;
      if (quebraFreeze.quebrou) log.push("Você descongelou com o impacto!");
    }
  }

  const vidaAntesDoTick = bossEstado.vida_atual;
  bossEstado.vida_atual = statusEffectService.processarTicksDeInicio({
    vidaAtual: bossEstado.vida_atual,
    vidaMaxima: bossEstado.vida_maxima,
    defensor: bossEstado,
    lista: runtime.status_boss,
    log,
    nomeAlvo: bossEstado.nome,
    contexto: CONTEXTO,
  });
  const regenBoss = combatBuffService.regenDeVidaDoTurno(runtime.buffs_boss, bossEstado.vida_maxima);
  if (regenBoss > 0 && bossEstado.vida_atual > 0) {
    const antes = bossEstado.vida_atual;
    bossEstado.vida_atual = Math.min(bossEstado.vida_maxima, bossEstado.vida_atual + regenBoss);
    if (bossEstado.vida_atual > antes) log.push(`${bossEstado.nome} regenerou ${bossEstado.vida_atual - antes} de vida.`);
  }

  runtime.status_boss = statusEffectService.decrementarDuracoes(runtime.status_boss);
  runtime.buffs_boss = combatBuffService.decrementarDuracoes(runtime.buffs_boss);
  runtime.escudo_boss = combatBuffService.decrementarDuracaoDoEscudo(runtime.escudo_boss);
  runtime.vida_atual_jogador = personagemAtual.vida_atual;
  runtime.vida_atual_boss = bossEstado.vida_atual;
  const danoEfetivoNaVida = vidaAntesDoTick - bossEstado.vida_atual;
  return { danoEfetivoNaVida, habilidadeUsada };
}

async function resolverTurno(attempt, acaoJogador) {
  validarAcao(acaoJogador);
  const playerSnapshot = attempt.player_snapshot;
  const bossSnapshot = attempt.boss_snapshot;
  const runtime = JSON.parse(JSON.stringify(attempt.runtime_state));
  const log = [];

  const { estado: bossEstado, fase: faseAntes } = montarEstadoBoss(bossSnapshot, runtime);
  const resultadoJogador = await resolverTurnoDoJogador({ playerSnapshot, runtime, bossEstado, acaoJogador });
  log.push(...(resultadoJogador.log ?? []));

  if (runtime.vida_atual_boss <= 0) {
    return { log, runtime, concluido: "Vitoria", resultadoJogador, resultadoBoss: null, faseAlterada: false };
  }

  const resultadoBoss = await resolverTurnoDoBoss({ playerSnapshot, runtime, bossEstado, log });

  if (runtime.vida_atual_jogador <= 0) {
    return { log, runtime, concluido: "Derrota", resultadoJogador, resultadoBoss, faseAlterada: false };
  }

  const percentualDepois = (runtime.vida_atual_boss / Math.max(1, bossSnapshot.stats.vida_maxima)) * 100;
  const faseDepois = templeBossScalingService.faseAtivaPara(bossSnapshot.phases ?? [], percentualDepois);
  const faseAlterada = (faseAntes?.ordem ?? null) !== (faseDepois?.ordem ?? null);
  if (faseAlterada && faseDepois) log.push(`${bossEstado.nome} entrou em ${faseDepois.nome_exibicao ?? "uma nova fase"}!`);

  runtime.fase_atual_ordem = faseDepois?.ordem ?? null;
  runtime.combat_turn += 1;
  runtime.log_recente = log.slice(-10);

  return { log, runtime, concluido: null, resultadoJogador, resultadoBoss, faseAlterada, fase: faseDepois };
}

module.exports = { resolverTurno, montarEstadoBoss, statsComFase, CONTEXTO };
