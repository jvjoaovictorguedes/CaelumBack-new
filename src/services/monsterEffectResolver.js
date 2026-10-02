// Resolve os efeitos de status configurados num MONSTRO no instante em
// que o ataque básico dele acerta o jogador (ideia #3 da fila de
// melhorias) — mesmo padrão de weaponEffectResolver.js/
// combatEffectResolver.js: sorteia a chance sempre no servidor (crypto),
// devolve instâncias prontas pra statusEffectService.aplicarStatus.
//
// `efeitosDeStatus` já vem pré-carregado no snapshot do encontro (ver
// combatController.gerarInimigoParaPersonagem — mesmo princípio de
// "capturar a config uma vez, no início do encontro" que já vale pra
// armaEquipadaEfeitos), então esta função nunca consulta o banco: zero
// N+1 por hit (§32 Performance).
const crypto = require("crypto");

function resolverEfeitosDeMonstroNoHit({ efeitosDeStatus, turno }) {
  const instancias = [];
  for (const efeito of efeitosDeStatus ?? []) {
    if (!efeito.ativo) continue;
    const rolagem = crypto.randomInt(0, 1_000_000);
    if (rolagem >= efeito.chance_ppm) continue;

    instancias.push({
      key: efeito.status_key,
      sourceActorId: "enemy",
      sourcePowerId: null,
      sourceItemId: null,
      remainingTurns: efeito.duration_turns,
      stacks: 1,
      // Sem scale attribute (monstro usa stats fixos, §5.3/§9.3) — a
      // potência é exatamente o que o admin cadastrou.
      potency: efeito.potency_base,
      // Habilidades V2.0 §4/§21 — null = linha ainda no modo legado.
      percentualVidaMaxima: efeito.percentual_vida_maxima ?? null,
      appliedAtTurn: turno,
    });
  }
  return instancias;
}

module.exports = { resolverEfeitosDeMonstroNoHit };
