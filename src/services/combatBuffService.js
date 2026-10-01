// Buffs de combate temporários (ConsumableEffect APPLY_COMBAT_BUFF —
// spec Caldeirão §13). Vivem SÓ no estado da própria batalha (nunca
// persistidos fora dela — encontro_pve/duelo/batalha de grupo guardam
// isto do mesmo jeito que já guardam statusEffects), expiram por turno
// (mesmo padrão de decrementarDuracoes do statusEffectService) e
// modificam o cálculo de dano/defesa SÓ nos pontos centrais que já
// existem pra isso — nunca duplicam a fórmula de dano aqui, só somam
// mais um multiplicador/bônus junto do que Enfraquecimento (WEAKEN) e
// os buffs da Taverna já fazem.
//
// Instância: { atributo, valor, remainingTurns, sourceItemId }. Cada
// atributo tem sua própria regra de combinação (ver somaDeAtributo):
// múltiplos buffs do MESMO atributo empilham (somam), cada um com sua
// própria duração — igual a POISON/BLEED no motor de Status, só que sem
// stack cap (não é um dano periódico, é um bônus/atributo).

const ATRIBUTOS_BUFAVEIS = ["DANO_SAIDA_PCT", "DEFESA_FLAT"];

function erro(mensagem) {
  return Object.assign(new Error(mensagem), { statusCode: 500 });
}

// Nunca muta a lista recebida — mesma convenção pura do resto do motor
// (statusEffectService/consumableEffectRegistry).
function aplicarBuff(lista, novoBuff) {
  if (!ATRIBUTOS_BUFAVEIS.includes(novoBuff.atributo)) {
    throw erro(`APPLY_COMBAT_BUFF com atributo inválido: ${novoBuff.atributo}`);
  }
  if (!(novoBuff.remainingTurns > 0)) {
    throw erro(`APPLY_COMBAT_BUFF precisa de duration_turns > 0 (recebeu ${novoBuff.remainingTurns}).`);
  }
  return [...lista, { ...novoBuff }];
}

// Fim de turno de quem carrega os buffs — mesmo princípio de
// statusEffectService.decrementarDuracoes, chamado uma vez por ator, ao
// final do PRÓPRIO turno dele.
function decrementarDuracoes(lista) {
  return lista.map((b) => ({ ...b, remainingTurns: b.remainingTurns - 1 })).filter((b) => b.remainingTurns > 0);
}

function somaDeAtributo(lista, atributo) {
  return lista.filter((b) => b.atributo === atributo).reduce((soma, b) => soma + b.valor, 0);
}

// Multiplicador do dano de SAÍDA de quem carrega os buffs — aplicado no
// MESMO ponto e do MESMO jeito que
// statusEffectService.multiplicadorDeDanoDeSaida (WEAKEN) e o
// PVE_DAMAGE_PCT da Taverna já são: multiplicado na hora de calcular o
// dano do ataque básico/poder, antes da mitigação de Defesa do alvo.
function modificadorDeDanoSaida(lista) {
  return 1 + somaDeAtributo(lista, "DANO_SAIDA_PCT") / 100;
}

// Bônus de Defesa de quem carrega os buffs — somado à Defesa "crua" do
// personagem bem na hora de mitigar o dano recebido (mesmo ponto que já
// usa `defensor.defesa`), nunca alterando o atributo real do personagem.
function bonusDeDefesa(lista) {
  return somaDeAtributo(lista, "DEFESA_FLAT");
}

module.exports = {
  ATRIBUTOS_BUFAVEIS,
  aplicarBuff,
  decrementarDuracoes,
  somaDeAtributo,
  modificadorDeDanoSaida,
  bonusDeDefesa,
};
