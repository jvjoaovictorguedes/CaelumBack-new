// IA de Combate PvE & Habilidades de Monstros V1 (§5/§6) — motor PURO de
// decisão: "Combat AI: pontuar e escolher uma ação válida; não deve
// recalcular fórmulas de dano/Status" (§3.1). Não toca banco, não
// executa combate — recebe um snapshot já montado (actor/opponents/
// abilities/...) e devolve { type, abilityId|null, targetIds, debug }.
// Quem chama (adapter de cada modo) resolve o resultado no motor real.
const crypto = require("crypto");
const { capacidadePermitidaNoContexto } = require("./combatContextPolicyService");
const { jitterMaximoDoPerfil } = require("../config/monsterAbilityConfig");

const ACTION_BASIC_ATTACK = { id: "basic_attack", type: "attack" };

function porcentagem(atual, maxima) {
  if (!maxima) return 0;
  return (atual / maxima) * 100;
}

// §6.1 — avalia UMA condição (sempre contra estado VISÍVEL da batalha,
// nunca loadout oculto do jogador). TARGET_* é existencial (§5.2 passo 5
// pontua ANTES de escolher alvo no passo 7 — "existe pelo menos um
// oponente que satisfaz" é a única leitura possível nesse ponto do
// pipeline; o alvo de verdade só é fixado depois, por target_policy).
function avaliarCondicao(condicao, { actor, opponents, turn, phase, history }) {
  const vivos = opponents.filter((o) => o.alive !== false);
  const config = condicao.config ?? {};
  switch (condicao.key) {
    case "SELF_HP_BELOW_PCT":
      return porcentagem(actor.hpAtual, actor.hpMaxima) < config.thresholdPct;
    case "SELF_HP_ABOVE_PCT":
      return porcentagem(actor.hpAtual, actor.hpMaxima) > config.thresholdPct;
    case "TARGET_HP_BELOW_PCT":
      return vivos.some((o) => porcentagem(o.hpAtual, o.hpMaxima) < config.thresholdPct);
    case "TARGET_HP_ABOVE_PCT":
      return vivos.some((o) => porcentagem(o.hpAtual, o.hpMaxima) > config.thresholdPct);
    case "SELF_HAS_STATUS":
      return (actor.statuses ?? []).includes(config.statusKey);
    case "TARGET_HAS_STATUS":
      return vivos.some((o) => (o.statuses ?? []).includes(config.statusKey));
    case "SELF_HAS_BUFF":
      return (actor.buffs ?? []).includes(config.effectKey);
    case "TARGET_HAS_BUFF":
      return vivos.some((o) => (o.buffs ?? []).includes(config.effectKey));
    case "SELF_MANA_BELOW_PCT":
      return porcentagem(actor.manaAtual, actor.manaMaxima) < config.thresholdPct;
    case "TURN_AT_LEAST":
      return (turn ?? 0) >= config.turn;
    case "PHASE_IS":
      return phase === config.phase;
    case "PREVIOUS_ACTION_WAS": {
      const ultima = history?.[history.length - 1];
      if (!ultima) return false;
      if (ultima.type !== config.actionType) return false;
      if (config.abilityId != null && ultima.abilityId !== config.abilityId) return false;
      return true;
    }
    default:
      return false;
  }
}

// §5.3 — heurísticas anti-desperdício, aplicadas como EXCLUSÃO (uma
// Power 100% desperdiçada não é "candidata fraca", é inelegível). Usa só
// as capabilities da ability (já classificadas por powerCapabilityService
// antes de chegar aqui) e o estado visível do ator/oponentes.
function desperdicaria(ability, { actor, opponents }) {
  const vivos = opponents.filter((o) => o.alive !== false);
  const capabilities = ability.capabilities ?? new Set();

  if (capabilities.has("HEAL_HP") && actor.hpAtual >= actor.hpMaxima) return true;
  if (capabilities.has("SHIELD") && actor.hasShield) return true;
  if (capabilities.has("CLEANSE_SELF") && (actor.statuses ?? []).length === 0) return true;
  if (capabilities.has("DISPEL_TARGET") && !vivos.some((o) => (o.buffs ?? []).length > 0)) return true;

  return false;
}

// §5.2 passos 2/3 — elegibilidade: policy de contexto, Mana, cooldown,
// fase e condition.required. Basic attack nunca é filtrado aqui (sempre
// elegível, é o fallback garantido do pipeline — §12.1 "monstro sem
// MonsterAbility mantém comportamento atual").
function elegivel(ability, { context, actor, opponents, turn, phase, history }) {
  if (ability.isPassive) return false;
  if ((ability.cooldownAtual ?? 0) > 0) return false;
  if ((ability.manaCost ?? 0) > (actor.manaAtual ?? 0)) return false;
  if (ability.allowedPhases && phase != null && !ability.allowedPhases.includes(phase)) return false;

  for (const capability of ability.capabilities ?? []) {
    if (!capacidadePermitidaNoContexto(capability, context, { explicitlyAllowed: ability.explicitlyAllowed })) {
      return false;
    }
  }

  for (const condicao of ability.conditions ?? []) {
    if (condicao.ativo === false) continue;
    const satisfeita = avaliarCondicao(condicao, { actor, opponents, turn, phase, history });
    if (condicao.required && !satisfeita) return false;
  }

  if (desperdicaria(ability, { actor, opponents })) return false;

  return true;
}

// §6.2 — score = prioridade_base + soma dos score_bonus das condições
// SATISFEITAS (o bônus conta sempre que a condição bate, required ou
// não — required só decide ELEGIBILIDADE quando falha, ver `elegivel`).
function calcularScore(ability, contexto) {
  let score = ability.prioridadeBase ?? 0;
  for (const condicao of ability.conditions ?? []) {
    if (condicao.ativo === false) continue;
    if (avaliarCondicao(condicao, contexto)) score += condicao.scoreBonus ?? 0;
  }
  return score;
}

// §5.4 — "ações com diferença grande de score permanecem praticamente
// determinísticas; diferença pequena pode variar". Implementado como uma
// banda de contenção: só concorrem ao sorteio as ações cujo score está a
// no máximo `jitterMaximo` pontos da melhor (fora da banda = não vence
// nunca, dentro da banda = sorteio ponderado por peso_uso). Reproduz os
// dois exemplos do documento: Shield 112 vs Dispel 78 (gap 34 > 18) vence
// sozinho; Poison 73 vs Attack 69 vs Weaken 67 (gaps <=18) sorteiam entre
// si. peso_uso só desempata DENTRO da banda — nunca faz um score fora
// dela vencer (§6.2 "não deixar peso aleatório superar uma condição de
// sobrevivência óbvia").
function escolherPorBandaDeContencao(candidatos, jitterMaximo) {
  const melhorScore = Math.max(...candidatos.map((c) => c.score));
  const concorrentes = candidatos.filter((c) => c.score >= melhorScore - jitterMaximo);
  if (concorrentes.length === 1) return concorrentes[0];

  const pesoTotal = concorrentes.reduce((soma, c) => soma + Math.max(1, c.ability.pesoUso ?? 1), 0);
  let sorteio = crypto.randomInt(0, pesoTotal);
  for (const candidato of concorrentes) {
    sorteio -= Math.max(1, candidato.ability.pesoUso ?? 1);
    if (sorteio < 0) return candidato;
  }
  return concorrentes[concorrentes.length - 1];
}

// §6.3 — seleção de alvo no servidor, por target_policy. SELF nunca
// mira oponente; os demais só consideram oponentes vivos (um morto nunca
// é alvo válido de ação nova).
function selecionarAlvos(targetPolicy, { actor, opponents }) {
  const vivos = opponents.filter((o) => o.alive !== false);
  switch (targetPolicy) {
    case "SELF":
      return [actor.id];
    case "ALL":
      return vivos.map((o) => o.id);
    case "LOWEST_HP":
      if (!vivos.length) return [];
      return [vivos.reduce((pior, o) => (porcentagem(o.hpAtual, o.hpMaxima) < porcentagem(pior.hpAtual, pior.hpMaxima) ? o : pior)).id];
    case "HIGHEST_HP":
      if (!vivos.length) return [];
      return [vivos.reduce((melhor, o) => (porcentagem(o.hpAtual, o.hpMaxima) > porcentagem(melhor.hpAtual, melhor.hpMaxima) ? o : melhor)).id];
    case "RANDOM":
      if (!vivos.length) return [];
      return [vivos[crypto.randomInt(0, vivos.length)].id];
    case "PLAYER":
    default:
      return vivos.map((o) => o.id);
  }
}

// Contrato conceitual do §5.1. `abilities` já vem com capabilities
// classificadas (powerCapabilityService) e condições carregadas — este
// serviço não consulta banco nenhum.
function chooseAction({ context, aiProfile, actor, opponents, abilities, phase, turn, history }) {
  const contextoCondicoes = { actor, opponents, turn, phase, history };

  const candidatosAbilities = (abilities ?? [])
    .filter((ability) => elegivel(ability, { context, ...contextoCondicoes }))
    .map((ability) => ({ ability, score: calcularScore(ability, contextoCondicoes) }));

  const candidatoAtaqueBasico = { ability: ACTION_BASIC_ATTACK, score: calcularScore(ACTION_BASIC_ATTACK, contextoCondicoes) };
  const candidatos = [candidatoAtaqueBasico, ...candidatosAbilities];

  const jitterMaximo = jitterMaximoDoPerfil(aiProfile);
  const escolhido = escolherPorBandaDeContencao(candidatos, jitterMaximo);

  const targetIds = selecionarAlvos(escolhido.ability.targetPolicy ?? "PLAYER", { actor, opponents });

  if (escolhido.ability.id === "basic_attack") {
    return { type: "attack", abilityId: null, powerId: null, targetIds, debug: { candidatos, escolhido } };
  }
  return {
    type: "power",
    abilityId: escolhido.ability.id,
    powerId: escolhido.ability.powerId ?? null,
    targetIds,
    debug: { candidatos, escolhido },
  };
}

module.exports = {
  chooseAction,
  avaliarCondicao,
  desperdicaria,
  elegivel,
  calcularScore,
  selecionarAlvos,
};
