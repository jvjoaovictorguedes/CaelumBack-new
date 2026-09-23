// Motor de Status (§19 da Especificação Consolidada) — aplicar,
// renovar/empilhar, processar ticks, processar modificadores e expirar.
// Único lugar que entende as regras de cada status; ninguém mais deve
// escrever `if (efeito_status === 'Queimadura')` num controller.
//
// Instância de status em combate (§24):
// { key, sourceActorId, sourcePowerId, sourceItemId, remainingTurns,
//   stacks, potency, appliedAtTurn }
//
// Toda função aqui é pura — recebe a lista atual e devolve uma NOVA
// lista, nunca muta o array recebido. Quem chama é responsável por
// persistir o resultado de volta em encontro_pve/partyBattleState/etc.
const { REGRA_STACK, STACKS_MAXIMOS, definicaoDoStatus } = require("../config/statusEffectConfig");
const { aplicarMitigacaoDeDefesa } = require("./combatFormulas");

function listaVazia() {
  return [];
}

// Aplica (ou reaplica) uma instância de status numa lista, seguindo a
// regra de stack da própria chave (§25).
function aplicarStatus(lista, novaInstancia) {
  const def = definicaoDoStatus(novaInstancia.key);
  if (!def) {
    throw new Error(`Status desconhecido: ${novaInstancia.key}`);
  }

  const existente = lista.find((s) => s.key === novaInstancia.key);
  const resto = lista.filter((s) => s.key !== novaInstancia.key);

  if (!existente) {
    const stacksIniciais = def.stack === REGRA_STACK.STACK_CAP ? 1 : 1;
    return [...resto, { ...novaInstancia, stacks: stacksIniciais }];
  }

  switch (def.stack) {
    // BURN: sem stack; reaplicar renova duração e mantém a maior potência.
    case REGRA_STACK.RENEW_MAX_POTENCY:
      return [
        ...resto,
        { ...novaInstancia, stacks: 1, potency: Math.max(existente.potency, novaInstancia.potency) },
      ];

    // BLEED/POISON: empilha até o cap; cada stack aumenta o tick
    // (ver calcularDanoDoTick); reaplicar sempre atualiza a duração pro
    // maior valor entre a existente e a nova.
    case REGRA_STACK.STACK_CAP: {
      const cap = STACKS_MAXIMOS[novaInstancia.key] ?? 1;
      return [
        ...resto,
        {
          ...novaInstancia,
          stacks: Math.min(cap, existente.stacks + 1),
          potency: Math.max(existente.potency, novaInstancia.potency),
          remainingTurns: Math.max(existente.remainingTurns, novaInstancia.remainingTurns),
        },
      ];
    }

    // SILENCE: sem stack; reaplicar só estende se a nova duração for maior.
    case REGRA_STACK.RENEW_MAX_DURATION:
      return [
        ...resto,
        { ...existente, remainingTurns: Math.max(existente.remainingTurns, novaInstancia.remainingTurns) },
      ];

    // SLOW/WEAKEN: sem stack; fica com a maior potência, duração é a da
    // aplicação mais recente.
    case REGRA_STACK.MAX_INTENSITY:
      return [
        ...resto,
        { ...novaInstancia, stacks: 1, potency: Math.max(existente.potency, novaInstancia.potency) },
      ];

    default:
      return [...resto, novaInstancia];
  }
}

function calcularDanoDoTick(instancia) {
  return Math.round(instancia.potency * instancia.stacks);
}

// Processa os ticks de início de turno (§23 passo 1) — Burn/Bleed/Poison
// causam dano; para de processar assim que a vida chega a 0 (§23 passo 2,
// "se DoT matar o ator antes da ação, a ação não acontece"). `defensor`
// é o alvo do DoT, usado só pra mitigação por Defesa quando a política do
// status for DEFENSE (ver statusEffectConfig.MITIGACAO_DOT_PADRAO).
function processarTicksDeInicio({ vidaAtual, defensor, lista, log, nomeAlvo }) {
  let vida = vidaAtual;
  for (const instancia of lista) {
    if (vida <= 0) break;
    const def = definicaoDoStatus(instancia.key);
    if (!def?.ehDot) continue;

    let dano = calcularDanoDoTick(instancia);
    if (def.mitigacao === "DEFENSE") {
      dano = aplicarMitigacaoDeDefesa(dano, defensor);
    }
    dano = Math.max(0, Math.round(dano));
    if (dano <= 0) continue;

    vida = Math.max(0, vida - dano);
    log.push(`${nomeAlvo} sofreu ${dano} de dano de ${def.nomeUi}.`);
  }
  return vida;
}

// Fim de turno do ator (§23 passos 8/9): decrementa a duração de todo
// status ativo e remove quem expirou. Chamado uma vez por ator, ao final
// do PRÓPRIO turno dele — nunca decrementa status de quem não agiu ainda
// nesta rodada.
function decrementarDuracoes(lista) {
  return lista.map((s) => ({ ...s, remainingTurns: s.remainingTurns - 1 })).filter((s) => s.remainingTurns > 0);
}

function possuiStatus(lista, chave) {
  return lista.some((s) => s.key === chave);
}

function bloqueiaHabilidadesAtivas(lista) {
  return lista.some((s) => definicaoDoStatus(s.key)?.bloqueiaHabilidadesAtivas);
}

// WEAKEN (§45): multiplicador aplicado sobre o dano JÁ calculado (básico
// ou de poder) de quem está enfraquecido — nunca sobre o dano recebido.
function multiplicadorDeDanoDeSaida(lista) {
  const weaken = lista.find((s) => s.key === "WEAKEN");
  if (!weaken) return 1;
  return Math.max(0, 1 - weaken.potency / 100);
}

// SLOW (§45): reduz `velocidade` no snapshot de stats efetivos do turno.
// Ver statusEffectConfig.js — hoje nenhuma fórmula de combate consome
// `velocidade` durante a resolução de turno, então isto fica pronto sem
// ter efeito mecânico ainda (rastreado/exibido normalmente).
function aplicarModificadoresDeAtributos(statsBase, lista) {
  const slow = lista.find((s) => s.key === "SLOW");
  if (!slow) return statsBase;
  return {
    ...statsBase,
    velocidade: Math.max(1, Math.round((statsBase.velocidade || 0) * (1 - slow.potency / 100))),
  };
}

// §65 — APIs de dispel/cleanse, pra consumíveis (Bandagem/Antídoto) e
// futuras habilidades. Categorias mínimas necessárias hoje; novas
// categorias entram quando algo realmente precisar delas.
function removerStatus(lista, chave) {
  return lista.filter((s) => s.key !== chave);
}

function removerStatusPorCategoria(lista, categoria) {
  if (categoria === "DOT") return lista.filter((s) => !definicaoDoStatus(s.key)?.ehDot);
  if (categoria === "CONTROLE") return lista.filter((s) => !["SILENCE", "SLOW", "WEAKEN"].includes(s.key));
  return lista;
}

module.exports = {
  listaVazia,
  aplicarStatus,
  calcularDanoDoTick,
  processarTicksDeInicio,
  decrementarDuracoes,
  possuiStatus,
  bloqueiaHabilidadesAtivas,
  multiplicadorDeDanoDeSaida,
  aplicarModificadoresDeAtributos,
  removerStatus,
  removerStatusPorCategoria,
};
