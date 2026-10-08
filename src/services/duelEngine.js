// src/services/duelEngine.js
//
// Resolve UMA ação de duelo (ataque básico ou poder) sobre o estado de
// dois lutadores. Usado tanto pelo PVP assíncrono (pvpController, que
// escolhe a ação sozinho a cada turno) quanto pelo PVP ao vivo
// (pvpLiveSocket, onde é o jogador de verdade que escolhe a ação),
// pra garantir que os dois modos usem exatamente a mesma matemática.

const statusEffectService = require("./statusEffectService");
const { resolverEfeitosDoUso } = require("./combatEffectResolver");
const { resolverEfeitosDeArmaNoHit } = require("./weaponEffectResolver");
const { resolverEfeitosDeMonstroNoHit } = require("./monsterEffectResolver");
const { definicaoDoStatus, ACTION_TYPE } = require("../config/statusEffectConfig");
const combatBuffService = require("./combatBuffService");
const combatModifierService = require("./combatModifierService");
const powerRuntime = require("./powerCombatRuntime");

const { resolveAction, resistiuAoStatus } = require("./combatActionEngine");

// A implementação real (incluindo o branch de "pass" — bug relatado:
// hard control sem nenhuma ação disponível travava o jogador
// infinitamente, ver statusEffectConfig.js) foi extraída literalmente
// pra combatActionEngine.resolveAction (Fase 2 — núcleo de ações
// incremental, docs/architecture/phase-2-action-engine.md). Esta
// função é só a fachada que traduz os nomes antigos (atacante/
// defensor/acao) e devolve o outcome no formato de sempre.
function aplicarAcao({ atacante, defensor, acao, ...options }) {
  return resolveAction({ actor: atacante, target: defensor, action: acao, battleContext: options }).outcome;
}

// Envolve aplicarAcao com o Motor de Status inteiro (Evolução do Motor
// de Status), pro PvP — ao vivo e assíncrono — passar a se comportar
// exatamente como o PvE em combatController.js: DoT no FIM do turno
// do atacante (depois da ação dele, não antes — bug reportado: o tick
// acontecia ANTES de agir, então ficava visualmente grudado no golpe
// anterior do oponente), bloqueio de ação por Freeze/Stun/Paralyze/
// Silêncio, efeitos "Self" de poder (sempre, mesmo sem acertar),
// Enfraquecimento reduzindo o dano de saída, quebra de Freeze por dano
// direto, e proc de status de arma/poder no alvo quando o golpe acerta.
// Cada instância
// de status carrega `sourceActorId` — por isso `casterActorId` (a
// chave "A"/"B" do atacante) é obrigatório aqui, diferente de
// aplicarAcao (que nunca precisou saber "de qual lado" veio o golpe).
//
// `statusAtacante`/`statusDefensor` são as listas ATUAIS (nunca
// mutadas — statusEffectService é todo funções puras); quem chama é
// responsável por persistir as listas devolvidas de volta no estado do
// duelo. `armaEfeitosAtacante` é a config de WeaponStatusEffect da arma
// equipada do atacante, pré-carregada uma vez no início do duelo (zero
// N+1 por hit, mesmo princípio do PvE).
async function resolverTurnoComStatus({
  atacante,
  defensor,
  acao,
  vidaMaxAtacante,
  manaMaxAtacante,
  statusAtacante,
  statusDefensor,
  // Buffs de combate ATUAIS (ConsumableEffect APPLY_COMBAT_BUFF — spec
  // Caldeirão §13), mesma convenção de statusAtacante/statusDefensor:
  // listas nunca mutadas, quem chama persiste de volta o que vier na
  // resposta. `buffsDefensor` default [] — nem todo chamador rastreia
  // isso ainda (ver partySocket.js/pvpLiveSocket.js).
  buffsAtacante = [],
  buffsDefensor = [],
  // Escudo ATUAL (GRANT_SHIELD — spec Caldeirão §13) de cada lado,
  // mesma convenção de buffsAtacante/buffsDefensor.
  escudoAtacante = null,
  escudoDefensor = null,
  turno,
  casterActorId,
  armaEfeitosAtacante,
  itemIdArmaAtacante,
  // Config de MonsterStatusEffect do atacante (Aventura em Grupo — único
  // chamador que passa isto hoje) — mesmo gatilho/formato do proc de
  // arma acima (ataque básico com dano>0), só que a fonte é o catálogo
  // do monstro em vez da arma equipada; nunca os dois ao mesmo tempo
  // (atacante é OU o monstro OU um personagem armado). PvP/duelo nunca
  // passam isto, então o comportamento deles fica idêntico a antes.
  efeitosDeStatusAtacante,
  nomeAtacante,
  nomeDefensor,
  // Habilidades V2.0 §7/§9/§11/§26 (Fase 5) — modificadores PASSIVOS de
  // Powers aprendidas, resolvidos uma vez por turno/ação por QUEM CHAMA
  // (combatModifierService.resolverModificadoresDoPersonagem, mesmo
  // contexto PVP_CASUAL/PARTY usado no tick de DoT abaixo) e passados
  // prontos. Map vazio default — nenhum chamador existente muda de
  // comportamento sem resolver e passar os modificadores de verdade.
  modificadoresAtacante = new Map(),
  modificadoresDefensor = new Map(),
  // Item 7 — mesma convenção de modificadoresAtacante: Map (por trigger)
  // resolvido uma vez por turno por quem chama
  // (combatModifierService.resolverGatilhosDoPersonagem).
  gatilhosAtacante = new Map(),
  gatilhosDefensor = new Map(),
  vidaMaxDefensor,
  manaMaxDefensor,
  runtime = null,
  contexto = "PVP_CASUAL",
}) {
  const log = [];
  let listaAtacante = statusAtacante;
  let listaDefensor = statusDefensor;
  runtime ??= [
    powerRuntime.participant(atacante, { key: atacante.id ?? casterActorId, team: atacante.id ?? casterActorId, triggers: gatilhosAtacante,
      modifiers: modificadoresAtacante, hpMax: vidaMaxAtacante ?? atacante.vida_atual,
      mpMax: manaMaxAtacante ?? atacante.mana_atual, status: listaAtacante ?? [], shield: escudoAtacante }),
    powerRuntime.participant(defensor, { key: defensor.id ?? "defender", team: defensor.id ?? "defender", triggers: gatilhosDefensor,
      modifiers: modificadoresDefensor, hpMax: vidaMaxDefensor ?? defensor.vida_atual,
      mpMax: manaMaxDefensor ?? defensor.mana_atual, status: listaDefensor ?? [], shield: escudoDefensor }),
  ];
  const [source, target] = runtime;
  powerRuntime.begin(source, target, runtime);
  listaAtacante = source.status;
  listaDefensor = target.status;

  // 1) Política central de bloqueio de ação — resolve de uma vez
  // (inclusive a única rolagem de Paralyze do turno) se o atacante
  // consegue executar o tipo de ação pedido.
  const tipoAcao =
    acao.tipo === "power"
      ? ACTION_TYPE.POWER
      : acao.tipo === "item"
        ? ACTION_TYPE.ITEM
        : acao.tipo === "pass"
          ? ACTION_TYPE.PASS
          : ACTION_TYPE.BASIC_ATTACK;
  const controle = statusEffectService.resolverAcoesBloqueadasDoTurno(listaAtacante, turno);
  listaAtacante = controle.lista;
  if (controle.bloqueadas.has(tipoAcao)) {
    // Bug real encontrado nesta revisão (crash, não só resultado
    // errado): motivoBloqueioTotal só é setado pelos hard controls
    // (FREEZE/STUN/PARALYZE, ver PRIORIDADE_BLOQUEIO_TOTAL em
    // statusEffectService.resolverAcoesBloqueadasDoTurno) — SILENCE
    // bloqueia ACTION_TYPE.POWER sem nunca setar motivo nenhum. Como
    // esta função (diferente de combatController.js, que só olha
    // BASIC_ATTACK — nunca bloqueado por Silêncio puro) checa
    // `tipoAcao` de verdade, tentar usar Power silenciado SEM nenhum
    // hard control junto derrubava com TypeError (`.nomeUi` de null) —
    // silêncio nunca chegava a aparecer no log, o turno inteiro
    // quebrava. A única forma de `bloqueadas` conter a ação tentada
    // sem motivoBloqueioTotal é justamente essa (Silêncio bloqueando
    // Power), então o fallback é seguro.
    const motivoBloqueio = controle.motivoBloqueioTotal ?? "SILENCE";
    log.push(`${nomeAtacante} está ${definicaoDoStatus(motivoBloqueio).nomeUi} e não conseguiu agir!`);
    source.status = listaAtacante;
    powerRuntime.end(source, target, runtime);
    listaAtacante = statusEffectService.decrementarDuracoes(source.status);
    return {
      nomeAcao: "Ação bloqueada",
      dano: 0,
      cura: 0,
      manaCurada: 0,
      esquivou: false,
      bloqueado: true,
      statusAtacante: listaAtacante,
      statusDefensor: target.status,
      escudoAtacante: source.shield,
      escudoDefensor: target.shield,
      buffsAtacante: combatBuffService.decrementarDuracoes(buffsAtacante),
      log,
    };
  }
  // Silêncio bloqueia só Power especificamente (ataque básico e item
  // continuam liberados) — já coberto por `controle.bloqueadas` acima,
  // então nenhum check adicional é necessário aqui.

  // "Passar o turno" — ação voluntária, nunca bloqueada (PASS não entra
  // em nenhum bloqueiaAcoes do catálogo, então nunca cai no bloco
  // acima). Log explícito aqui porque, diferente de um ataque/poder
  // normal, não há nenhum dano/cura pro chamador inferir uma frase da
  // ação a partir de nomeAcao/dano.
  if (tipoAcao === ACTION_TYPE.PASS) {
    log.push(`${nomeAtacante} optou por passar o turno.`);
  }

  // 2) Efeitos "Self" configurados no poder usado — aplicam sempre que
  // a Power é de fato usada, dano ou não (não existe "esquivar do
  // próprio buff"). Os de alvo "Enemy" só entram depois, se o golpe
  // acertar (passo 4).
  let efeitosNoInimigo = [];
  if (acao.tipo === "power" && acao.power) {
    const configurados = await resolverEfeitosDoUso({
      power: acao.power,
      personagemCaster: atacante,
      casterActorId,
      turno,
    });
    const efeitosEmSiMesmo = configurados.filter((e) => e.target === "Self");
    efeitosNoInimigo = configurados.filter((e) => e.target !== "Self");
    for (const efeito of efeitosEmSiMesmo) {
      listaAtacante = statusEffectService.aplicarStatus(listaAtacante, efeito);
      log.push(`${nomeAtacante} recebeu ${definicaoDoStatus(efeito.key).nomeUi} por ${efeito.remainingTurns} turno(s).`);
    }
  }

  // 3) Resolve a ação em si — Cegueira do atacante afeta o acerto,
  // Enfraquecimento do atacante reduz o dano de saída.
  source.status = listaAtacante;
  target.status = listaDefensor;
  const blindDoAtacante = listaAtacante.find((s) => s.key === "BLIND");
  const resultado = aplicarAcao({
    contexto,
    atacante,
    defensor,
    acao,
    vidaMaxAtacante,
    manaMaxAtacante,
    blindPotency: blindDoAtacante?.potency ?? 0,
    // DANO_SAIDA_PCT (ConsumableEffect APPLY_COMBAT_BUFF — spec
    // Caldeirão §13) soma no mesmo passo que Enfraquecimento e o
    // DAMAGE_DEALT_PCT passivo (Habilidades V2.0 §7/§9), igual ao PvE em
    // combatController.js.
    multiplicadorDano:
      statusEffectService.multiplicadorDeDanoDeSaida(listaAtacante) *
      combatBuffService.modificadorDeDanoSaida(buffsAtacante) *
      combatModifierService.multiplicadorDanoSaida(modificadoresAtacante),
    buffsAtacante,
    buffsDefensor,
    escudoAtacante,
    escudoDefensor,
    modificadoresAtacante,
    modificadoresDefensor,
    gatilhosAtacante,
    gatilhosDefensor,
    runtime,
  });
  listaAtacante = source.status;
  listaDefensor = target.status;
  modificadoresAtacante = powerRuntime.effective(source);
  modificadoresDefensor = powerRuntime.effective(target);
  let listaBuffsAtacante = resultado.novosBuffsAtacante ?? buffsAtacante;
  let escudoAtacanteAtual = resultado.novoEscudoAtacante;

  if (resultado.esquivou && resultado.motivoEsquiva === "BLIND_MISS") {
    log.push(`Cego, ${nomeAtacante} errou o golpe contra ${nomeDefensor}!`);
  }

  // 4) Dano DIRETO quebra Freeze existente no defensor (antes de
  // qualquer efeito novo deste mesmo golpe) e libera os efeitos de
  // status configurados (poder alvo Enemy + proc de arma em ataque
  // básico), só quando o golpe de fato acerta e causa dano.
  if (resultado.damageResolution && require("./combatTypingService").enabled(contexto) && !/PVP|RANKED|TOURNAMENT/i.test(contexto)) log.push(require("./combatTypingService").describe(resultado.damageResolution));
  if (resultado.dano > 0) {
    const quebraFreeze = statusEffectService.removerFreezeAoReceberDanoDireto(listaDefensor, resultado.dano);
    listaDefensor = quebraFreeze.lista;
    if (quebraFreeze.quebrou) log.push(`${nomeDefensor} descongelou com o impacto!`);

    // STATUS_RESISTANCE (spec Caldeirão §13) — ponto central único de
    // tentativa de status, igual ao PvE em combatController.js: resolve
    // ANTES de aplicar, nunca depois.
    for (const efeito of efeitosNoInimigo) {
      if (resistiuAoStatus(buffsDefensor, modificadoresDefensor)) {
        log.push(`${nomeDefensor} resistiu a ${definicaoDoStatus(efeito.key).nomeUi}!`);
        continue;
      }
      listaDefensor = statusEffectService.aplicarStatus(listaDefensor, efeito);
      log.push(`${nomeDefensor} recebeu ${definicaoDoStatus(efeito.key).nomeUi} por ${efeito.remainingTurns} turno(s).`);
    }

    if (acao.tipo === "attack" && armaEfeitosAtacante?.length > 0) {
      const novosEfeitosDeArma = resolverEfeitosDeArmaNoHit({
        efeitosDaArma: armaEfeitosAtacante,
        personagemCaster: atacante,
        casterActorId,
        itemId: itemIdArmaAtacante ?? null,
        turno,
      });
      for (const efeito of novosEfeitosDeArma) {
        if (resistiuAoStatus(buffsDefensor, modificadoresDefensor)) {
          log.push(`${nomeDefensor} resistiu ao efeito da arma de ${nomeAtacante}!`);
          continue;
        }
        listaDefensor = statusEffectService.aplicarStatus(listaDefensor, efeito);
        log.push(
          `A arma de ${nomeAtacante} aplicou ${definicaoDoStatus(efeito.key).nomeUi} em ${nomeDefensor} por ${efeito.remainingTurns} turno(s)!`,
        );
      }
    }

    // Mesmo gatilho do proc de arma acima, só que pra quando o ATACANTE é
    // um monstro com status configurado no admin (Aventura em Grupo —
    // mesmo princípio já usado no PvE solo em combatController.js, agora
    // generalizado pra cá em vez de duplicar a lógica lá).
    if (acao.tipo === "attack" && efeitosDeStatusAtacante?.length > 0) {
      const novosEfeitosDeMonstro = resolverEfeitosDeMonstroNoHit({
        efeitosDeStatus: efeitosDeStatusAtacante,
        turno,
      });
      for (const efeito of novosEfeitosDeMonstro) {
        if (resistiuAoStatus(buffsDefensor, modificadoresDefensor)) {
          log.push(`${nomeDefensor} resistiu ao efeito de ${nomeAtacante}!`);
          continue;
        }
        listaDefensor = statusEffectService.aplicarStatus(listaDefensor, efeito);
        log.push(
          `${nomeAtacante} aplicou ${definicaoDoStatus(efeito.key).nomeUi} em ${nomeDefensor} por ${efeito.remainingTurns} turno(s)!`,
        );
      }
    }
  }

  // 5) Fim do turno do atacante — Burn/Bleed/Poison que ele carrega
  // ticam AGORA, depois da própria ação (bug reportado: o tick
  // acontecia no início do turno, antes de agir, e ficava grudado
  // visualmente no golpe anterior do oponente). Duração decrementa
  // logo em seguida (nunca a do defensor, que ainda não jogou esta
  // rodada) — sempre depois do tick, pra um status no seu último turno
  // ainda ticar uma vez antes de expirar.
  const vidaAntesDoTick = atacante.vida_atual;
  atacante.vida_atual = statusEffectService.processarTicksDeInicio({
    vidaAtual: atacante.vida_atual,
    vidaMaxima: vidaMaxAtacante ?? atacante.vida_atual,
    defensor: atacante,
    lista: listaAtacante,
    log,
    nomeAlvo: nomeAtacante,
    // Modalidade informada pelo chamador (PvP casual, ranqueado, torneio ou grupo).
    contexto,
  });
  const morteAoFimDoTurno = vidaAntesDoTick > 0 && atacante.vida_atual <= 0;
  source.status = listaAtacante;
  target.status = listaDefensor;
  if (vidaAntesDoTick > atacante.vida_atual) powerRuntime.emit("ON_DAMAGE_TAKEN", source, target, runtime);
  if (morteAoFimDoTurno) powerRuntime.emit("ON_KILL", target, source, runtime);

  // REGEN_HP/REGEN_MANA (ConsumableEffect APPLY_COMBAT_BUFF — spec
  // Caldeirão §13) — mesmo ponto do tick de DoT acima (fim do PRÓPRIO
  // turno do atacante), lido ANTES do decremento de listaBuffsAtacante
  // logo abaixo.
  if (!morteAoFimDoTurno) {
    const vidaMaximaParaRegen = vidaMaxAtacante ?? atacante.vida_atual;
    const regenVida =
      combatBuffService.regenDeVidaDoTurno(listaBuffsAtacante, vidaMaximaParaRegen) +
      combatModifierService.regenVidaDoTurno(modificadoresAtacante, vidaMaximaParaRegen);
    if (regenVida > 0) {
      const vidaAntesDoRegen = atacante.vida_atual;
      const tetoVida = vidaMaxAtacante ?? atacante.vida_atual + regenVida;
      atacante.vida_atual = Math.min(tetoVida, atacante.vida_atual + regenVida);
      const curouDeFato = atacante.vida_atual - vidaAntesDoRegen;
      // Só loga o que realmente curou — já no teto, um log de "regenerou
      // 10" seria enganoso (mesmo critério de HEAL_HP_FLAT/PERCENT).
      if (curouDeFato > 0) {
        log.push(`${nomeAtacante} regenerou ${curouDeFato} de vida.`);
        powerRuntime.emit("ON_HEAL", source, target, runtime);
      }
    }
    const manaMaximaParaRegen = manaMaxAtacante ?? atacante.mana_atual;
    const regenMana =
      combatBuffService.regenDeManaDoTurno(listaBuffsAtacante, manaMaximaParaRegen) +
      combatModifierService.regenManaDoTurno(modificadoresAtacante, manaMaximaParaRegen);
    if (regenMana > 0) {
      const manaAntesDoRegen = atacante.mana_atual;
      const tetoMana = manaMaxAtacante ?? atacante.mana_atual + regenMana;
      atacante.mana_atual = Math.min(tetoMana, atacante.mana_atual + regenMana);
      const curouDeFato = atacante.mana_atual - manaAntesDoRegen;
      if (curouDeFato > 0) log.push(`${nomeAtacante} regenerou ${curouDeFato} de mana.`);
    }
  }

  powerRuntime.end(source, target, runtime);
  listaAtacante = statusEffectService.decrementarDuracoes(source.status);
  listaDefensor = target.status;
  escudoAtacanteAtual = source.shield;
  listaBuffsAtacante = combatBuffService.decrementarDuracoes(listaBuffsAtacante);
  if (atacante.powerCombatState.shieldExpiresAfterTurn == null) {
    escudoAtacanteAtual = combatBuffService.decrementarDuracaoDoEscudo(escudoAtacanteAtual);
  }
  atacante.powerCombatState.shield = escudoAtacanteAtual;

  return {
    ...resultado,
    morteAoFimDoTurno,
    statusAtacante: listaAtacante,
    statusDefensor: listaDefensor,
    buffsAtacante: listaBuffsAtacante,
    escudoAtacante: escudoAtacanteAtual,
    escudoDefensor: target.shield,
    log,
  };
}

module.exports = { aplicarAcao, resolverTurnoComStatus };
