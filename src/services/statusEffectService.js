// Motor de Status (§19 da Especificação Consolidada; evoluído pela
// Especificação Evolução do Motor de Status — Habilidades + Armas) —
// aplicar, renovar/empilhar, processar ticks, processar modificadores,
// resolver controle de turno e expirar. Único lugar que entende as
// regras de cada status; ninguém mais deve escrever
// `if (efeito_status === 'Queimadura')` num controller.
//
// Instância de status em combate:
// { key, sourceActorId, sourcePowerId, sourceItemId, remainingTurns,
//   stacks, potency, appliedAtTurn, target? }
// PARALYZE ganha dois campos internos extras (checkedTurn,
// blockedThisTurn) pra nunca rerrolar duas vezes no mesmo turno.
//
// Toda função aqui é pura — recebe a lista atual e devolve uma NOVA
// lista, nunca muta o array recebido. Quem chama é responsável por
// persistir o resultado de volta em encontro_pve/partyBattleState/etc.
const crypto = require("crypto");
const { REGRA_STACK, STACKS_MAXIMOS, DOT_TOTAL_MAX_PCT_PER_TURN, ACTION_TYPE, definicaoDoStatus } = require("../config/statusEffectConfig");
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
    // BURN: sem stack; reaplicar renova duração e mantém a instância
    // mais forte — potency e percentualVidaMaxima SEMPRE da mesma
    // instância vencedora (Habilidades V2.0 §21: nunca misturar um
    // potency legado de uma aplicação com o percentual da outra).
    case REGRA_STACK.RENEW_MAX_POTENCY: {
      const vencedor = maisForte(existente, novaInstancia);
      return [
        ...resto,
        { ...novaInstancia, stacks: 1, potency: vencedor.potency, percentualVidaMaxima: vencedor.percentualVidaMaxima ?? null },
      ];
    }

    // BLEED/POISON: empilha até o cap; cada stack aumenta o tick
    // (ver calcularDanoDoTick); reaplicar sempre atualiza a duração pro
    // maior valor entre a existente e a nova.
    case REGRA_STACK.STACK_CAP: {
      const cap = STACKS_MAXIMOS[novaInstancia.key] ?? 1;
      const vencedor = maisForte(existente, novaInstancia);
      return [
        ...resto,
        {
          ...novaInstancia,
          stacks: Math.min(cap, existente.stacks + 1),
          potency: vencedor.potency,
          percentualVidaMaxima: vencedor.percentualVidaMaxima ?? null,
          remainingTurns: Math.max(existente.remainingTurns, novaInstancia.remainingTurns),
        },
      ];
    }

    // SILENCE/FREEZE/STUN: sem stack; reaplicar só estende se a nova
    // duração for maior (RENEW_MAX_DURATION).
    case REGRA_STACK.RENEW_MAX_DURATION:
      return [
        ...resto,
        { ...existente, remainingTurns: Math.max(existente.remainingTurns, novaInstancia.remainingTurns) },
      ];

    // WEAKEN/PARALYZE/BLIND: sem stack; fica com a maior potência,
    // duração é a da aplicação mais recente. Esses três já são
    // percentuais hoje (sem percentualVidaMaxima), então maisForte()
    // compara potency normalmente.
    case REGRA_STACK.MAX_INTENSITY: {
      const vencedor = maisForte(existente, novaInstancia);
      return [
        ...resto,
        { ...novaInstancia, stacks: 1, potency: vencedor.potency, percentualVidaMaxima: vencedor.percentualVidaMaxima ?? null },
      ];
    }

    default:
      return [...resto, novaInstancia];
  }
}

// Compara duas instâncias do MESMO status e devolve a mais forte,
// olhando percentualVidaMaxima quando presente (modo novo) ou potency
// (modo legado) — nunca os dois critérios de instâncias diferentes
// (Habilidades V2.0 §4/§21: fonte diferente não muda a matemática, mas
// cada instância carrega seu PRÓPRIO par potency/percentualVidaMaxima
// coerente, vindo de um único efeito configurado).
function maisForte(a, b) {
  const intensidadeA = a.percentualVidaMaxima ?? a.potency ?? 0;
  const intensidadeB = b.percentualVidaMaxima ?? b.potency ?? 0;
  return intensidadeB > intensidadeA ? b : a;
}

// Dano do tick (§21): se a instância tiver percentualVidaMaxima
// configurado (modo novo), o tick é uma fração da Vida Máxima do alvo —
// nunca escalado por stacks fora da própria fórmula (stacks multiplica
// a fração, igual ao modo legado multiplica potency). Sem
// percentualVidaMaxima (null), comportamento 100% inalterado: dano
// absoluto de potency * stacks.
function calcularDanoDoTick(instancia, vidaMaxima) {
  if (instancia.percentualVidaMaxima != null) {
    return Math.round((vidaMaxima || 0) * (instancia.percentualVidaMaxima / 100) * instancia.stacks);
  }
  return Math.round(instancia.potency * instancia.stacks);
}

// Processa os ticks de início de turno (§23 passo 1) — Burn/Bleed/Poison
// causam dano; para de processar assim que a vida chega a 0 (§23 passo 2,
// "se DoT matar o ator antes da ação, a ação não acontece"). `defensor`
// é o alvo do DoT, usado só pra mitigação por Defesa quando a política do
// status for DEFENSE (ver statusEffectConfig.MITIGACAO_DOT_PADRAO).
// `contexto` (Habilidades V2.0 §11/§17, opcional) ativa o teto agregado
// de DOT_TOTAL_MAX_PCT_PER_TURN: primeira passada calcula o dano (já
// mitigado) de CADA DoT sem aplicar ainda, pra conhecer o TOTAL bruto
// do turno antes de decidir se precisa escalar; se exceder o teto do
// contexto, todos os ticks são reduzidos pelo MESMO fator (nunca corta
// um status inteiro deixando outro intacto). Sem `contexto`, zero
// mudança de comportamento (compatibilidade com todo chamador
// existente). `eventos`, se um array for passado, recebe um registro
// por tick aplicado — statusTickEvents separados pro payload de combate,
// em vez de só o total agregado (danoStatusJogador/danoStatusInimigo).
function processarTicksDeInicio({ vidaAtual, vidaMaxima, defensor, lista, log, nomeAlvo, contexto, eventos }) {
  const vidaMaximaEfetiva = vidaMaxima ?? defensor?.vida_maxima ?? 0;

  const danosBrutos = [];
  for (const instancia of lista) {
    const def = definicaoDoStatus(instancia.key);
    if (!def?.ehDot) continue;
    let dano = calcularDanoDoTick(instancia, vidaMaximaEfetiva);
    if (def.mitigacao === "DEFENSE") {
      dano = aplicarMitigacaoDeDefesa(dano, defensor);
    }
    dano = Math.max(0, Math.round(dano));
    if (dano <= 0) continue;
    danosBrutos.push({ key: instancia.key, nomeUi: def.nomeUi, dano });
  }

  let fatorEscala = 1;
  const tetoPct = contexto ? DOT_TOTAL_MAX_PCT_PER_TURN[contexto] : null;
  if (tetoPct != null && vidaMaximaEfetiva > 0) {
    const totalBruto = danosBrutos.reduce((soma, d) => soma + d.dano, 0);
    const teto = vidaMaximaEfetiva * (tetoPct / 100);
    if (totalBruto > teto && totalBruto > 0) fatorEscala = teto / totalBruto;
  }

  let vida = vidaAtual;
  for (const { key, nomeUi, dano: danoBruto } of danosBrutos) {
    if (vida <= 0) break;
    const dano = Math.max(0, Math.round(danoBruto * fatorEscala));
    if (dano <= 0) continue;

    vida = Math.max(0, vida - dano);
    log.push(`${nomeAlvo} sofreu ${dano} de dano de ${nomeUi}.`);
    if (eventos) eventos.push({ key, nomeUi, dano });
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

// Mantido por compatibilidade de nome (só cobre SILENCE bloqueando
// Power) — resolverAcoesBloqueadasDoTurno abaixo é a checagem central
// que também cobre os hard controls (FREEZE/STUN/PARALYZE).
function bloqueiaHabilidadesAtivas(lista) {
  return lista.some((s) => definicaoDoStatus(s.key)?.bloqueiaAcoes?.includes(ACTION_TYPE.POWER));
}

// WEAKEN (§45/§5): multiplicador aplicado sobre o dano JÁ calculado
// (básico ou de poder) de quem está enfraquecido — nunca sobre o dano
// recebido.
function multiplicadorDeDanoDeSaida(lista) {
  const weaken = lista.find((s) => s.key === "WEAKEN");
  if (!weaken) return 1;
  return Math.max(0, 1 - weaken.potency / 100);
}

// PARALYZE (Evolução do Motor de Status §5.3/§19): uma única rolagem
// por ator/turno — decisão persistida na própria instância
// (checkedTurn/blockedThisTurn), nunca rerrolada por request repetido
// no mesmo turno (mesmo duplo clique ou nova tentativa de ação depois
// de bloqueada). Devolve a lista (com a instância atualizada, se havia
// PARALYZE) e se o ator está bloqueado por ela NESTE turno.
function resolverChecagemDeParalyze(lista, turnoAtual) {
  const paralyze = lista.find((s) => s.key === "PARALYZE");
  if (!paralyze) return { lista, bloqueadoPorParalyze: false };

  if (paralyze.checkedTurn === turnoAtual) {
    return { lista, bloqueadoPorParalyze: Boolean(paralyze.blockedThisTurn) };
  }

  const chance = Math.min(100, Math.max(0, paralyze.potency || 0)) / 100;
  const bloqueado = crypto.randomInt(0, 1_000_000) < chance * 1_000_000;
  const atualizado = { ...paralyze, checkedTurn: turnoAtual, blockedThisTurn: bloqueado };
  return {
    lista: [...lista.filter((s) => s.key !== "PARALYZE"), atualizado],
    bloqueadoPorParalyze: bloqueado,
  };
}

const PRIORIDADE_BLOQUEIO_TOTAL = ["FREEZE", "STUN", "PARALYZE"];

// Função central de política de ações (Evolução do Motor de Status §6)
// — resolve, num só lugar, quais ACTION_TYPE estão bloqueados pro ator
// neste turno e por qual status (pra log/UI), evitando checks
// espalhados pelo controller. Sempre chamada uma vez por ator/turno,
// ANTES de decidir o que a ação pedida vai fazer.
function resolverAcoesBloqueadasDoTurno(lista, turnoAtual) {
  const { lista: listaAtualizada, bloqueadoPorParalyze } = resolverChecagemDeParalyze(lista, turnoAtual);
  const presentes = new Map(listaAtualizada.map((s) => [s.key, s]));
  const bloqueadas = new Set();
  let motivoBloqueioTotal = null;

  for (const chave of PRIORIDADE_BLOQUEIO_TOTAL) {
    if (!presentes.has(chave)) continue;
    if (chave === "PARALYZE" && !bloqueadoPorParalyze) continue;
    for (const acao of definicaoDoStatus(chave).bloqueiaAcoes) bloqueadas.add(acao);
    motivoBloqueioTotal = motivoBloqueioTotal ?? chave;
  }

  if (presentes.has("SILENCE")) bloqueadas.add(ACTION_TYPE.POWER);

  return { lista: listaAtualizada, bloqueadas, motivoBloqueioTotal };
}

// FREEZE quebra por dano DIRETO (nunca DoT, nunca pelo próprio hit que
// acabou de aplicá-lo — quem chama executa isto ANTES de aplicar novos
// efeitos do mesmo golpe, §18/§5.1).
function removerFreezeAoReceberDanoDireto(lista, danoDireto) {
  if (!(danoDireto > 0)) return { lista, quebrou: false };
  if (!lista.some((s) => s.key === "FREEZE")) return { lista, quebrou: false };
  return { lista: lista.filter((s) => s.key !== "FREEZE"), quebrou: true };
}

// §65 — APIs de dispel/cleanse, pra consumíveis (Bandagem/Antídoto) e
// futuras habilidades. Categorias mínimas necessárias hoje; novas
// categorias entram quando algo realmente precisar delas.
function removerStatus(lista, chave) {
  return lista.filter((s) => s.key !== chave);
}

function removerStatusPorCategoria(lista, categoria) {
  if (categoria === "DOT") return lista.filter((s) => !definicaoDoStatus(s.key)?.ehDot);
  if (categoria === "CONTROLE") {
    return lista.filter((s) => !["SILENCE", "WEAKEN", "FREEZE", "STUN", "PARALYZE", "BLIND"].includes(s.key));
  }
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
  resolverChecagemDeParalyze,
  resolverAcoesBloqueadasDoTurno,
  removerFreezeAoReceberDanoDireto,
  removerStatus,
  removerStatusPorCategoria,
};
