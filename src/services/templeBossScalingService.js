// Templo do Véu Celestial (templo_veu_celestial_v1_caelum.docx) — Fase
// 5: calibração numérica do Guardião (§9.1/§9.2). Núcleo PURO e
// determinístico (mesmo princípio de combatPowerService — nenhum
// Math.random aqui): dado o Poder de Combate REAL do personagem (dpr/
// ehp, de combatPowerService.calcularPoderPersonagem) e a identidade-
// base do Guardião (do config_snapshot.boss, nunca recalculado do
// catálogo editável em runtime), devolve os 4 stats NUMÉRICOS que
// podem escalar (vida_maxima/dano_min/dano_max/defesa) — nunca Status/
// cooldowns/casts/resistências, que vêm fixos do snapshot (§9.1).
//
// HP/EHP alvo do Boss ~= player.dpr * target_turns_to_kill
// Dano alvo do Boss   ~= player.ehp / target_boss_actions_survivable
// Depois: clamp em [base * scaling_min_multiplier, base * scaling_max_multiplier]
// pra nunca deixar o Guardião absurdamente fraco/forte, e arredondamento
// determinístico (Math.round) em todo passo.
const SPREAD_DANO = 0.15;

function calcularStatsEscaladosDoBoss({ playerSnapshot, bossBase, scaling }) {
  const dpr = Math.max(1, playerSnapshot?.dpr ?? 1);
  const ehp = Math.max(1, playerSnapshot?.ehp ?? 1);

  const targetTurnsToKill = Math.max(1, scaling.target_turns_to_kill ?? 8);
  const targetBossActionsSurvivable = Math.max(1, scaling.target_boss_actions_survivable ?? 6);
  const minMult = Math.max(0.01, scaling.scaling_min_multiplier ?? 0.5);
  const maxMult = Math.max(minMult, scaling.scaling_max_multiplier ?? 3);

  const vidaMaximaAlvo = dpr * targetTurnsToKill;
  const danoMedioAlvo = ehp / targetBossActionsSurvivable;

  const baseVidaMaxima = Math.max(1, bossBase.vida_maxima ?? 1);
  const baseDanoMedio = Math.max(1, ((bossBase.dano_min ?? 0) + (bossBase.dano_max ?? 0)) / 2 || 1);

  const vidaMaxima = Math.round(
    clamp(vidaMaximaAlvo, baseVidaMaxima * minMult, baseVidaMaxima * maxMult),
  );
  const danoMedio = Math.round(
    clamp(danoMedioAlvo, baseDanoMedio * minMult, baseDanoMedio * maxMult),
  );

  // §9.1 — defesa é identidade do Guardião (traço fixo da espécie-base),
  // não um terceiro alvo escalado independente: já está representada no
  // EHP do jogador (via mitigação) e no EHP/dano do Guardião via
  // ehpAjustado quando o Admin calibra target_*. Mantida igual a
  // bossBase.defesa de propósito.
  const defesa = Math.max(0, Math.round(bossBase.defesa ?? 0));

  return {
    vida_maxima: Math.max(1, vidaMaxima),
    dano_min: Math.max(1, Math.round(danoMedio * (1 - SPREAD_DANO))),
    dano_max: Math.max(1, Math.round(danoMedio * (1 + SPREAD_DANO))),
    defesa,
  };
}

function clamp(valor, minimo, maximo) {
  return Math.min(maximo, Math.max(minimo, valor));
}

// §8.3 — fase ativa é a de MAIOR ordem cujo hp_threshold_pct ainda não
// foi cruzado pra baixo (ex.: fases [100, 50, 20] em ordem crescente de
// severidade; com 35% de vida, a fase de threshold 50 está ativa, a de
// 20 ainda não). `fases` já vem ordenado por `ordem` (snapshot
// congelado) — nunca reordenado aqui.
function faseAtivaPara(fasesOrdenadas, percentualVidaAtual) {
  let ativa = null;
  for (const fase of fasesOrdenadas) {
    if (percentualVidaAtual <= fase.hp_threshold_pct) ativa = fase;
  }
  return ativa;
}

module.exports = { calcularStatsEscaladosDoBoss, faseAtivaPara };
