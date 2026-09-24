// Resolve os efeitos de status configurados numa ARMA no instante em
// que ela proc-a (Evolução do Motor de Status §12-14). V1: só dispara em
// BASIC_ATTACK_HIT bem-sucedido com dano direto > 0 — Power e DoT nunca
// disparam proc de arma (checado por quem chama, não aqui).
//
// `efeitosDaArma` já vem pré-carregado no snapshot do encontro (ver
// combatController.gerarInimigoParaPersonagem — mesmo princípio de
// "capturar a arma equipada uma vez, no início do encontro" que já vale
// pra dano_min/dano_max), então esta função nunca consulta o banco:
// zero N+1 por hit (§32 Performance).
const crypto = require("crypto");
const { potenciaEsperada } = require("./combatEffectResolver");

function resolverEfeitosDeArmaNoHit({ efeitosDaArma, personagemCaster, casterActorId, itemId, turno }) {
  const instancias = [];
  for (const efeito of efeitosDaArma ?? []) {
    if (efeito.trigger !== "BASIC_ATTACK_HIT" || !efeito.ativo) continue;
    const rolagem = crypto.randomInt(0, 1_000_000);
    if (rolagem >= efeito.chance_ppm) continue;

    instancias.push({
      key: efeito.status_key,
      sourceActorId: casterActorId,
      sourcePowerId: null,
      sourceItemId: itemId,
      remainingTurns: efeito.duration_turns,
      stacks: 1,
      potency: potenciaEsperada(efeito, personagemCaster),
      appliedAtTurn: turno,
      // Proc de arma em ataque básico é sempre ofensivo nesta v1 (§12.1
      // "target: Enemy nesta v1 para procs ofensivos").
      target: "Enemy",
    });
  }
  return instancias;
}

module.exports = { resolverEfeitosDeArmaNoHit };
