const typing = require("./combatTypingService");
// Shared action resolution. Inputs are loaded by mode adapters; no transport,
// match persistence, timers, matchmaking or reward payout belongs here.
const {
  calcularDanoBasico,
  calcularEfeitoPoder,
  custoManaEfetivo,
  aplicarMitigacaoDeDefesa,
  resolverResultadoDeAcerto,
} = require("./combatFormulas");
const statusEffectService = require("./statusEffectService");
const { resolverEfeitosDoUso } = require("./combatEffectResolver");
const { resolverEfeitosDeArmaNoHit } = require("./weaponEffectResolver");
const { resolverEfeitosDeMonstroNoHit } = require("./monsterEffectResolver");
const { definicaoDoStatus, ACTION_TYPE } = require("../config/statusEffectConfig");
const {
  efeitoConhecido,
  executarEfeito,
  EFFECT_KEYS_DE_VIDA,
  EFFECT_KEYS_DE_MANA,
} = require("./consumableEffectRegistry");
const combatBuffService = require("./combatBuffService");
const combatModifierService = require("./combatModifierService");
const powerRuntime = require("./powerCombatRuntime");

// Habilidades V2.0 §7/§9/§26 (Fase 5) — combina a resistência a status
// do buff temporário (Caldeirão §13) com STATUS_RESISTANCE_PCT passivo
// (PowerCombatEffect), sob o MESMO teto global de 75%, exatamente como
// combatController.js (PvE) já faz pro jogador — nunca dois tetos
// independentes "empilhados" além do limite. `modificadoresDefensor`
// default vazio faz esta função se comportar como
// combatBuffService.resolverTentativaDeStatus de sempre pra quem ainda
// não resolveu modificadores (nenhum chamador existente muda de
// comportamento sem passar o Map).
function resistiuAoStatus(buffsDefensor, modificadoresDefensor) {
  const chance = Math.min(
    combatBuffService.STATUS_RESISTANCE_MAXIMA,
    combatBuffService.somaDeAtributo(buffsDefensor, "STATUS_RESISTANCE_PCT") +
      combatModifierService.resistenciaStatusPct(modificadoresDefensor ?? new Map()),
  );
  if (chance <= 0) return false;
  return Math.random() * 100 < chance;
}

// acao: { tipo: "attack" }, { tipo: "power", power: <Power> } ou
// { tipo: "item", item: <Item>, efeito: <ConsumableProperties>,
// efeitosConsumiveisModernos?: <ConsumableEffect[]> }. Quando o poder
// vem de buscarPoderesDoPersonagem (pvpController.js) ele já traz
// `power.nivel_habilidade` grudado — sem isso o duelo assíncrono e o
// PVP ao vivo ignorariam totalmente o nível investido na habilidade.
//
// `efeitosConsumiveisModernos` (spec Caldeirão §6.5) é a lista de
// ConsumableEffect ATIVOS do item, já carregada do banco por quem monta
// a ação (partySocket.js/pvpLiveSocket.js — este arquivo nunca faz
// query nenhuma, aplicarAcao é síncrono/puro de propósito). Resolvida
// aqui, sem passar por consumableEffectService.aplicarEfeitosDoItem
// (que é async), com os MESMOS handlers do registry — garante que
// HEAL_HP_*/RESTORE_MANA_* curem exatamente igual em PvE/PvP/Grupo/fora
// de combate.
//
// `blindPotency`/`multiplicadorDano` vêm de quem chama (resolverTurnoComStatus,
// abaixo) — esta função nunca lê status effect nenhum sozinha, pra não
// duplicar a fonte de verdade de statusEffectService (Evolução do Motor
// de Status §17/§45, mesmo critério do PvE em combatController.js).
function aplicarAcao({
  atacante,
  defensor,
  acao,
  vidaMaxAtacante,
  manaMaxAtacante,
  blindPotency = 0,
  multiplicadorDano = 1,
  // Buffs de combate ATUAIS (spec Caldeirão §13) — `buffsAtacante` é só
  // lido aqui pra resolver um NOVO APPLY_COMBAT_BUFF de item (devolvido
  // em `novosBuffsAtacante`; nunca afeta o dano DESTE turno, só dos
  // seguintes — mesmo critério de statusEffectService pros efeitos
  // "Self"). `buffsDefensor` só entra na mitigação de Defesa do golpe
  // RECEBIDO, nunca muda.
  buffsAtacante = [],
  buffsDefensor = [],
  // Escudo ATUAL (GRANT_SHIELD — spec Caldeirão §13) de cada lado —
  // `escudoAtacante` só é lido pra resolver um NOVO GRANT_SHIELD de
  // item (devolvido em `novoEscudoAtacante`); `escudoDefensor` absorve
  // o dano deste golpe ANTES da Vida (devolvido em
  // `novoEscudoDefensor`, já descontado).
  escudoAtacante = null,
  escudoDefensor = null,
  // Habilidades V2.0 §7/§9/§26 (Fase 5) — modificadores PASSIVOS de
  // Powers aprendidas (PowerCombatEffect), resolvidos UMA vez por turno
  // por quem chama (resolverTurnoComStatus), mesma convenção de
  // combatController.js (PvE): Map vazio default faz esta função se
  // comportar EXATAMENTE como antes pra todo chamador que ainda não
  // resolveu modificadores (pvpController async legado, testes antigos).
  modificadoresAtacante = new Map(),
  modificadoresDefensor = new Map(),
  // Habilidades V2.0 §14/§26 (item 7) — gatilhos reativos ON_HIT/ON_KILL
  // do ATACANTE, resolvidos UMA vez por turno por quem chama (mesmo
  // princípio de modificadoresAtacante — nunca uma query por golpe).
  // Map vazio default = nenhum proc, comportamento idêntico a antes pra
  // quem ainda não resolveu gatilhos.
  gatilhosAtacante = new Map(),
  gatilhosDefensor = new Map(),
  vidaMaxDefensor,
  manaMaxDefensor,
  runtime = null,
  contexto = "PVP_CASUAL",
}) {
  const ownsRuntime = !runtime;
  runtime ??= [
    powerRuntime.participant(atacante, { key: atacante.id ?? "A", team: atacante.id ?? "A", triggers: gatilhosAtacante,
      modifiers: modificadoresAtacante, hpMax: vidaMaxAtacante ?? atacante.vida_atual,
      mpMax: manaMaxAtacante ?? atacante.mana_atual, shield: escudoAtacante }),
    powerRuntime.participant(defensor, { key: defensor.id ?? "B", team: defensor.id ?? "B", triggers: gatilhosDefensor,
      modifiers: modificadoresDefensor, hpMax: vidaMaxDefensor ?? defensor.vida_atual,
      mpMax: manaMaxDefensor ?? defensor.mana_atual, shield: escudoDefensor }),
  ];
  const [source, target] = runtime;
  if (ownsRuntime) powerRuntime.begin(source, target, runtime);
  if (acao.tipo === "power" && acao.power) {
    const custo = Math.round(custoManaEfetivo(acao.power, acao.power.nivel_habilidade ?? 1) *
      combatModifierService.multiplicadorCustoMana(powerRuntime.effective(source)));
    atacante.mana_atual = Math.max(0, atacante.mana_atual - custo);
    powerRuntime.emit("ON_CAST", source, target, runtime);
    // Rebalanceamento de Powers: efeito intrínseco da PRÓPRIA Power
    // usada (ex.: Fúria de Aço se buffando ao ser lançada) — depois de
    // Mana já descontada, antes do cálculo principal (calcularEfeitoPoder
    // mais abaixo), pra valer na própria ação quando o efeito precisar.
    powerRuntime.emit("ON_POWER_CAST", source, target, runtime, Math.random, acao.power.id);
  }
  const beforeModifiers = combatModifierService.multiplicadorDanoSaida(modificadoresAtacante);
  modificadoresAtacante = powerRuntime.effective(source);
  modificadoresDefensor = powerRuntime.effective(target);
  // Caller already includes passive damage. Only apply the reactive delta here.
  multiplicadorDano *= beforeModifiers === 0 ? 1 :
    combatModifierService.multiplicadorDanoSaida(modificadoresAtacante) / beforeModifiers;
  escudoAtacante = source.shield;
  escudoDefensor = target.shield;
  const vidaAtacanteAntes = atacante.vida_atual;
  let dano = 0;
  let damageResolution = null;
  let cura = 0;
  let manaCurada = 0;
  let esquivou = false;
  let motivoEsquiva = null;
  let nomeAcao = "Ataque básico";
  let novosBuffsAtacante = buffsAtacante;
  let novoEscudoAtacante = escudoAtacante;
  let novoEscudoDefensor = escudoDefensor;
  const bonusDefesaDefensor =
    combatBuffService.bonusDeDefesa(buffsDefensor) + combatModifierService.bonusDefesa(modificadoresDefensor);
  const defensorComBuffs = bonusDefesaDefensor
    ? { ...defensor, defesa: (defensor.defesa || 0) + bonusDefesaDefensor }
    : defensor;
  const multiplicadorDanoRecebido = combatModifierService.multiplicadorDanoRecebido(modificadoresDefensor);
  // Precisão/Crítico (Velocidade) — mesmo `contexto` opcional de
  // combatFormulas.calcularDanoBasico/calcularEfeitoPoder, pra quem
  // chama (resolverTurnoComStatus, abaixo, e por tabela pvpController/
  // pvpLiveSocket) saber se ESTE golpe saiu crítico e mostrar "ACERTO
  // CRÍTICO!" pro jogador.
  let critico = false;

  if (acao.tipo === "power" && acao.power) {
    const nivelHabilidade = acao.power.nivel_habilidade ?? 1;
    nomeAcao = acao.power.nome;
    const contextoCritico = {};
    const efeito = calcularEfeitoPoder(acao.power, atacante, nivelHabilidade, contextoCritico, modificadoresAtacante);
    dano = Math.round(efeito.dano * multiplicadorDano);
    // HEALING_DONE_PCT passivo (Habilidades V2.0 §8/§15) — mesmo ponto
    // de combatController.js (PvE): só a cura de Power, nunca a de item
    // (resolvida fora daqui, no registry).
    cura = Math.round(efeito.cura * combatModifierService.multiplicadorCuraFeita(modificadoresAtacante) * combatModifierService.multiplicadorCuraRecebida(modificadoresAtacante));
    critico = Boolean(contextoCritico.critico);
  } else if (acao.tipo === "pass") {
    // "Passar o turno" — ação explícita e NUNCA bloqueada por nenhum
    // status (ACTION_TYPE.PASS não entra em nenhum bloqueiaAcoes do
    // catálogo), pro atacante sempre ter uma ação disponível mesmo sob
    // hard control (bug relatado: travava o turno infinitamente quando
    // Stun/Freeze/Paralyze bloqueava ataque/poder E item). dano/cura
    // continuam 0 — nenhum efeito além de consumir o turno.
    nomeAcao = "Passar o turno";
  } else if (acao.tipo === "item" && acao.efeito) {
    // Consumível como ação de duelo — consome o turno igual um ataque ou
    // poder (o oponente ainda age depois) e usa a MESMA fórmula percentual
    // (não pontos fixos) do PvE (combatController.js) e do uso fora de
    // combate (characterInventoryController.js): sempre % da vida/mana
    // MÁXIMA, nunca da atual.
    nomeAcao = acao.item?.nome ?? "Usar item";

    // Motor moderno primeiro — mesma regra de precedência do PvE: um
    // item com HEAL_HP_*/RESTORE_MANA_* moderno configurado nunca soma
    // também o legado efeito_vida/efeito_mana (nunca os dois juntos).
    let vidaSimulada = atacante.vida_atual;
    let manaSimulada = atacante.mana_atual;
    let temCuraModerna = false;
    let temManaModerna = false;
    for (const efeito of acao.efeitosConsumiveisModernos ?? []) {
      if (!efeitoConhecido(efeito.effect_key)) continue;
      const ehVida = EFFECT_KEYS_DE_VIDA.includes(efeito.effect_key);
      const ehMana = EFFECT_KEYS_DE_MANA.includes(efeito.effect_key);
      // APPLY_COMBAT_BUFF cobre DANO_SAIDA_PCT/DEFESA_FLAT/REGEN_HP_*/
      // REGEN_MANA_*/STATUS_RESISTANCE_PCT — todos atributos da mesma
      // lista, nenhum handler extra necessário (ver combatBuffService).
      const ehBuff = efeito.effect_key === "APPLY_COMBAT_BUFF";
      const ehEscudo = efeito.effect_key === "GRANT_SHIELD";
      if (!ehVida && !ehMana && !ehBuff && !ehEscudo) continue; // cleanse etc. não se aplicam em PvP/Grupo ainda
      const resultado = executarEfeito(efeito.effect_key, {
        combatBuffs: novosBuffsAtacante,
        escudoAtual: novoEscudoAtacante,
        config: efeito.config,
        magnitude: efeito.magnitude,
        duration_turns: efeito.duration_turns,
        sourceItemId: acao.item?.id ?? null,
        vidaAtual: vidaSimulada,
        vidaMaxima: vidaMaxAtacante ?? vidaSimulada,
        manaAtual: manaSimulada,
        manaMaxima: manaMaxAtacante ?? manaSimulada,
      });
      if (ehVida) {
        temCuraModerna = true;
        vidaSimulada = resultado.vidaAtual;
        cura += resultado.curou ?? 0;
      }
      if (ehMana) {
        temManaModerna = true;
        manaSimulada = resultado.manaAtual;
        manaCurada += resultado.curou ?? 0;
      }
      if (ehBuff) {
        novosBuffsAtacante = resultado.combatBuffs;
      }
      if (ehEscudo) {
        novoEscudoAtacante = resultado.escudo;
      }
    }

    if (!temCuraModerna && acao.efeito.efeito_vida) {
      cura = Math.round((vidaMaxAtacante ?? atacante.vida_atual) * (acao.efeito.efeito_vida / 100));
    }
    if (!temManaModerna && acao.efeito.efeito_mana) {
      manaCurada = Math.round((manaMaxAtacante ?? atacante.mana_atual) * (acao.efeito.efeito_mana / 100));
    }
  }

  // LIFESTEAL_PCT (Habilidades V2.0 §9/§15, item 7/8) — mede a redução
  // REAL de Vida do defensor (depois de Defesa e escudo, nunca o dano
  // bruto/absorvido — ver combatModifierService.curaPorLifesteal), por
  // isso compara a Vida antes/depois do bloco inteiro em vez de tentar
  // capturar `danoResidual` de dentro de cada branch.
  const vidaDefensorAntes = defensor.vida_atual;

  if (dano > 0 || acao.tipo === "attack") {
    // Cegueira (§17) unifica com a esquiva num único resultado de
    // acerto — precisa rolar mesmo em ataque básico sem dano "pré-
    // calculado" (dano vira 0 aqui e o cálculo de verdade só acontece
    // se acertar, no branch `acao.tipo === "attack"` abaixo).
    const resultadoAcerto = resolverResultadoDeAcerto({
      atacante,
      defensor,
      blindPotency,
      modificadoresAtacante,
      modificadoresDefensor,
    });
    if (!resultadoAcerto.hit) {
      esquivou = true;
      motivoEsquiva = resultadoAcerto.reason;
      dano = 0;
      // Um golpe que a esquiva/cegueira já barrou nunca é "crítico" —
      // mesmo quando o crítico do poder foi rolado ANTES desta checagem
      // (calcularEfeitoPoder acima, por causa de dano/cura virem juntos
      // no mesmo retorno), zera aqui pra nunca reportar "ACERTO
      // CRÍTICO!" sobre um ataque que não acertou.
      critico = false;
    } else if (acao.tipo === "attack") {
      // Mitigação pela defesa do alvo — sem isso, equipar armadura não
      // tinha efeito nenhum no dano recebido (a defesa era somada em
      // equipmentBonusService.js mas nunca lida por nenhum código de
      // combate). Aplica tanto no ataque básico quanto em poder que causa
      // dano (branch abaixo), já que o jogo só tem um stat de defesa
      // (sem resistência mágica separada).
      const contextoCritico = {};
      const danoBase = Math.round(
        typing.basicDamage(atacante, contextoCritico, modificadoresAtacante, contexto) * multiplicadorDano,
      );
      critico = Boolean(contextoCritico.critico);
      damageResolution = typing.resolveDamage({amount:danoBase,actor:atacante,target:defensorComBuffs,context:contexto,finalMultiplier:multiplicadorDanoRecebido,buffs:buffsAtacante,defenderBuffs:buffsDefensor});
      dano=damageResolution.totalDamage;
      const absorcao1 = combatBuffService.absorverDano(novoEscudoDefensor, dano);
      novoEscudoDefensor = absorcao1.escudo;
      defensor.vida_atual = Math.max(0, defensor.vida_atual - absorcao1.danoResidual);
    } else {
      damageResolution = typing.resolveDamage({amount:dano,actor:atacante,target:defensorComBuffs,power:acao.power,context:contexto,finalMultiplier:multiplicadorDanoRecebido,buffs:buffsAtacante,defenderBuffs:buffsDefensor});
      dano=damageResolution.totalDamage;
      const absorcao2 = combatBuffService.absorverDano(novoEscudoDefensor, dano);
      novoEscudoDefensor = absorcao2.escudo;
      defensor.vida_atual = Math.max(0, defensor.vida_atual - absorcao2.danoResidual);
    }
  }

  const danoEfetivoNaVida = Math.max(0, vidaDefensorAntes - defensor.vida_atual);
  if (danoEfetivoNaVida > 0) {
    const curaPorRoubo = combatModifierService.curaPorLifesteal(modificadoresAtacante, danoEfetivoNaVida);
    if (curaPorRoubo > 0) {
      const tetoLifesteal = vidaMaxAtacante ?? atacante.vida_atual + curaPorRoubo;
      atacante.vida_atual = Math.min(tetoLifesteal, atacante.vida_atual + curaPorRoubo);
    }

  }

  // Mesmo critério do PvE (combatController.js): um poder com dano E
  // cura ("rouba vida") só cura se o golpe realmente acertou —
  // `esquivou` só fica true quando um golpe COM dano foi de fato
  // resolvido e errou; poder de cura pura (dano === 0) ou item nunca
  // passam pelo bloco de acerto acima, então continuam curando sempre.
  if (cura > 0 && !esquivou) {
    const teto = vidaMaxAtacante ?? atacante.vida_atual + cura;
    atacante.vida_atual = Math.min(teto, atacante.vida_atual + cura);
  }

  if (manaCurada > 0) {
    const tetoMana = manaMaxAtacante ?? atacante.mana_atual + manaCurada;
    atacante.mana_atual = Math.min(tetoMana, atacante.mana_atual + manaCurada);
  }

  if(typing.enabled(contexto))novosBuffsAtacante=typing.applyPowerBuffs(novosBuffsAtacante,acao.power);
  const curouNaAcao = atacante.vida_atual > vidaAtacanteAntes;
  source.shield = novoEscudoAtacante;
  target.shield = novoEscudoDefensor;
  if (!esquivou && (dano > 0 || acao.tipo === "attack")) {
    powerRuntime.emit("ON_HIT", source, target, runtime);
    // Só a PRÓPRIA Power usada (nunca ataque básico, nunca outra Power
    // do loadout) — já exclui dodge/miss (dentro do mesmo `!esquivou`).
    if (acao.tipo === "power" && acao.power) {
      powerRuntime.emit("ON_POWER_HIT", source, target, runtime, Math.random, acao.power.id);
    }
    if (critico) powerRuntime.emit("ON_CRIT", source, target, runtime);
  }
  if (danoEfetivoNaVida > 0) powerRuntime.emit("ON_DAMAGE_TAKEN", target, source, runtime);
  if (motivoEsquiva === "DODGE") powerRuntime.emit("ON_DODGE", target, source, runtime);
  if (vidaDefensorAntes > 0 && defensor.vida_atual <= 0) powerRuntime.emit("ON_KILL", source, target, runtime);
  if (curouNaAcao) powerRuntime.emit("ON_HEAL", source, target, runtime);
  if (ownsRuntime) powerRuntime.end(source, target, runtime);
  return {
    nomeAcao,
    damageResolution,
    dano,
    cura,
    manaCurada,
    esquivou,
    motivoEsquiva,
    critico,
    novosBuffsAtacante,
    novoEscudoAtacante: source.shield,
    novoEscudoDefensor: target.shield,
  };
}


/** Canonical boundary; state objects retain their existing in-place semantics. */
function resolveAction({ actor, target, action, battleContext = {}, state = {} }) {
  const outcome = aplicarAcao({ ...battleContext, ...state, atacante: actor, defensor: target, acao: action });
  return {
    outcome,
    actor,
    target,
    state: { actorShield: outcome.novoEscudoAtacante, targetShield: outcome.novoEscudoDefensor, newActorBuffs: outcome.novosBuffsAtacante },
    domainEvents: [{ type: "COMBAT_ACTION_RESOLVED", actorId: actor.id ?? null, targetId: target.id ?? null, damage: outcome.dano, healing: outcome.cura, manaRestored: outcome.manaCurada }],
  };
}
// PvE keeps its own action eligibility/turn lifecycle while using these exact
// formulas. Crit roll contexts remain caller-owned to preserve RNG order.
module.exports = { resolveAction, aplicarAcao, calcularDanoBasico, calcularEfeitoPoder, resistiuAoStatus };
