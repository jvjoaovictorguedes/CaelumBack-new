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
// Instância: { atributo, valor, remainingTurns, sourceItemId }. Bug real
// reportado: multiplos buffs do MESMO atributo empilhavam por soma (dois
// elixires de +15% de dano viravam +30%, três +45%, sem teto nenhum —
// só STATUS_RESISTANCE_PCT tinha um limite). Nunca pode acumular: no
// máximo UMA instância por atributo fica ativa ao mesmo tempo (mesmo
// princípio de "o maior prevalece, nunca soma" que concederEscudo já
// usa pra GRANT_SHIELD) — ver aplicarBuff.

const ATRIBUTOS_BUFAVEIS = [
  "DANO_SAIDA_PCT",
  "DEFESA_FLAT",
  // REGEN_HP/MANA (spec Caldeirão §13) — cura/restaura no FIM do
  // próprio turno de quem carrega (mesmo ponto do tick de DoT —
  // Queimadura/Sangramento/Veneno — só que somando em vez de
  // subtrair), antes do decremento de duração. _FLAT soma pontos
  // fixos por turno; _PERCENT soma um percentual do máximo efetivo por
  // turno (mesma convenção dos handlers HEAL_HP_*/RESTORE_MANA_*).
  "REGEN_HP_FLAT",
  "REGEN_HP_PERCENT",
  "REGEN_MANA_FLAT",
  "REGEN_MANA_PERCENT",
  // STATUS_RESISTANCE (spec Caldeirão §13) — chance (pontos
  // percentuais, 0-100) de uma TENTATIVA de status effect contra quem
  // carrega simplesmente não acontecer. Resolvida no ponto central
  // único de aplicação de status (ver resolverTentativaDeStatus
  // abaixo) — nunca espalhada pelos vários lugares que hoje chamam
  // statusEffectService.aplicarStatus.
  "STATUS_RESISTANCE_PCT",
];

// Teto global de resistência a status (spec Caldeirão §13) — por mais
// que empilhe, nunca fica impossível aplicar status NENHUM em alguém
// (evitaria contra-jogo pra qualquer build baseada em status).
const STATUS_RESISTANCE_MAXIMA = 75;

function erro(mensagem) {
  return Object.assign(new Error(mensagem), { statusCode: 500 });
}

// Nunca muta a lista recebida — mesma convenção pura do resto do motor
// (statusEffectService/consumableEffectRegistry). Não empilha: só pode
// existir UMA instância por atributo. Se já existe uma mais forte (ou
// igual) ativa, a nova aplicação é descartada (não derruba o buff bom
// por um elixir mais fraco bebido por engano); senão, a nova substitui
// a antiga por completo (valor E duração) — nunca soma os dois.
function aplicarBuff(lista, novoBuff) {
  if (!ATRIBUTOS_BUFAVEIS.includes(novoBuff.atributo)) {
    throw erro(`APPLY_COMBAT_BUFF com atributo inválido: ${novoBuff.atributo}`);
  }
  if (!(novoBuff.remainingTurns > 0)) {
    throw erro(`APPLY_COMBAT_BUFF precisa de duration_turns > 0 (recebeu ${novoBuff.remainingTurns}).`);
  }
  const existente = lista.find((b) => b.atributo === novoBuff.atributo);
  if (existente && existente.valor > novoBuff.valor) {
    return [...lista];
  }
  const semEsseAtributo = lista.filter((b) => b.atributo !== novoBuff.atributo);
  return [...semEsseAtributo, { ...novoBuff }];
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

// Regen de vida/mana do PRÓPRIO turno de quem carrega — chamado uma vez
// por ator, no mesmo ponto em que o tick de DoT dele já acontece (nunca
// duas vezes por engano: lido ANTES do decremento de duração, igual o
// tick de DoT lê a lista antes de decrementar). `maximo` é
// vidaMaxima/manaMaxima efetivos, pro _PERCENT bater com o mesmo teto
// que o resto do combate usa.
function regenDoTurno(lista, atributoFlat, atributoPercent, maximo) {
  const flat = somaDeAtributo(lista, atributoFlat);
  const percent = somaDeAtributo(lista, atributoPercent);
  return Math.max(0, Math.round(flat + maximo * (percent / 100)));
}

function regenDeVidaDoTurno(lista, vidaMaxima) {
  return regenDoTurno(lista, "REGEN_HP_FLAT", "REGEN_HP_PERCENT", vidaMaxima);
}

function regenDeManaDoTurno(lista, manaMaxima) {
  return regenDoTurno(lista, "REGEN_MANA_FLAT", "REGEN_MANA_PERCENT", manaMaxima);
}

// Resolve UMA tentativa de aplicar status effect em quem carrega os
// buffs — ponto central único (spec Caldeirão §13): todo lugar que hoje
// chama statusEffectService.aplicarStatus num alvo precisa passar por
// aqui ANTES, nunca checar resistência duplicado nem espalhado. Devolve
// `resistiu: true` sem rodar RNG nenhuma quando a soma é 0 (nunca gasta
// uma rolagem à toa pra quem não tem resistência configurada).
function resolverTentativaDeStatus(lista) {
  const chance = Math.min(STATUS_RESISTANCE_MAXIMA, somaDeAtributo(lista, "STATUS_RESISTANCE_PCT"));
  if (chance <= 0) return { resistiu: false };
  return { resistiu: Math.random() * 100 < chance };
}

// Escudo (GRANT_SHIELD — spec Caldeirão §13): absorve dano ANTES da
// Vida, nunca altera Defesa (não é mitigação — é uma reserva separada
// que esvazia conforme absorve). Vive fora da lista de buffs (não
// empilha por soma — concederEscudo abaixo é "o maior prevalece", nunca
// os dois somados) porque é estado MUTÁVEL que se esgota com o dano,
// diferente de um multiplicador recalculado do zero a cada cálculo.
// Instância: { valor, remainingTurns } | null.
function concederEscudo(atual, novoValor, remainingTurns) {
  if (!(novoValor > 0) || !(remainingTurns > 0)) {
    throw Object.assign(new Error(`GRANT_SHIELD precisa de valor e duration_turns > 0 (recebeu ${novoValor}/${remainingTurns}).`), {
      statusCode: 500,
    });
  }
  if (atual && atual.valor >= novoValor) return atual;
  return { valor: novoValor, remainingTurns };
}

// Absorve `dano` do escudo atual (null = sem escudo) — devolve o escudo
// já descontado (ou null se esgotou) e o dano que sobrou pra Vida de
// verdade. Nunca deixa `danoResidual` negativo.
function absorverDano(escudo, dano) {
  if (!escudo || dano <= 0) return { escudo, danoResidual: Math.max(0, dano) };
  const absorvido = Math.min(escudo.valor, dano);
  const valorRestante = escudo.valor - absorvido;
  return {
    escudo: valorRestante > 0 ? { ...escudo, valor: valorRestante } : null,
    danoResidual: dano - absorvido,
  };
}

function decrementarDuracaoDoEscudo(escudo) {
  if (!escudo) return null;
  const restante = escudo.remainingTurns - 1;
  return restante > 0 ? { ...escudo, remainingTurns: restante } : null;
}

module.exports = {
  ATRIBUTOS_BUFAVEIS,
  STATUS_RESISTANCE_MAXIMA,
  aplicarBuff,
  decrementarDuracoes,
  somaDeAtributo,
  modificadorDeDanoSaida,
  bonusDeDefesa,
  regenDeVidaDoTurno,
  regenDeManaDoTurno,
  resolverTentativaDeStatus,
  concederEscudo,
  absorverDano,
  decrementarDuracaoDoEscudo,
};
