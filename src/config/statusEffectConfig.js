// Motor de Status (Especificação Consolidada Poder/Status/Cooldown/
// Balanceamento, §19-32; evoluído pela Especificação Evolução do Motor
// de Status — Habilidades + Armas). Chaves ESTÁVEIS — nome de exibição
// fica só aqui e no frontend; banco/API nunca usam o nome em português
// como identificador.
//
// Cada status entra numa destas categorias de stack (§25):
// - "RENEW_MAX_POTENCY": sem stack; reaplicar renova a duração e
//   mantém a MAIOR potência já aplicada (BURN).
// - "STACK_CAP": empilha até STACKS_MAXIMOS[chave]; cada stack conta
//   pra potência total; reaplicar sempre atualiza a duração pro maior
//   valor (BLEED, POISON).
// - "RENEW_MAX_DURATION": sem stack; reaplicar só estende se a nova
//   duração for maior que a restante (SILENCE, FREEZE, STUN).
// - "MAX_INTENSITY": sem stack; ao reaplicar, fica com a MAIOR potência
//   entre a existente e a nova, e a duração é a da aplicação mais
//   recente (WEAKEN, PARALYZE, BLIND).
const REGRA_STACK = {
  RENEW_MAX_POTENCY: "RENEW_MAX_POTENCY",
  STACK_CAP: "STACK_CAP",
  RENEW_MAX_DURATION: "RENEW_MAX_DURATION",
  MAX_INTENSITY: "MAX_INTENSITY",
};

// Política de mitigação por Defesa pro dano periódico (§27) — o próprio
// documento pede pra NÃO decidir isso silenciosamente. Escolha registrada
// aqui: DEFENSE (dano de DoT passa pela mesma aplicarMitigacaoDeDefesa do
// dano direto), por consistência com o resto do motor de combate — sem
// isso, Defesa vira irrelevante contra qualquer build baseada em DoT.
// Pra reverter pra "DoT ignora Defesa", troque MITIGACAO_DOT_PADRAO pra
// "NONE" abaixo (nenhum outro arquivo precisa mudar). Ver relatório final
// da Fase 4 — essa é uma decisão sinalizada, não definitiva.
const MITIGACAO = { NONE: "NONE", DEFENSE: "DEFENSE" };
const MITIGACAO_DOT_PADRAO = MITIGACAO.DEFENSE;

const STACKS_MAXIMOS = {
  BLEED: 3,
  POISON: 5,
};

// Tipos de ação que um status de controle pode bloquear (Evolução do
// Motor de Status §6) — usado por combatController.resolverPermissaoDeAcao
// em vez de checks espalhados por controller.
const ACTION_TYPE = {
  BASIC_ATTACK: "BASIC_ATTACK",
  POWER: "POWER",
  ITEM: "ITEM",
  PASS: "PASS",
};

const TODAS_ACOES_DE_TURNO = [ACTION_TYPE.BASIC_ATTACK, ACTION_TYPE.POWER, ACTION_TYPE.ITEM];

const STATUS = {
  BURN: {
    nomeUi: "Queimadura",
    ehDot: true,
    stack: REGRA_STACK.RENEW_MAX_POTENCY,
    mitigacao: MITIGACAO_DOT_PADRAO,
  },
  BLEED: {
    nomeUi: "Sangramento",
    ehDot: true,
    stack: REGRA_STACK.STACK_CAP,
    mitigacao: MITIGACAO_DOT_PADRAO,
  },
  POISON: {
    nomeUi: "Veneno",
    ehDot: true,
    stack: REGRA_STACK.STACK_CAP,
    mitigacao: MITIGACAO_DOT_PADRAO,
  },
  SILENCE: {
    nomeUi: "Silêncio",
    ehDot: false,
    stack: REGRA_STACK.RENEW_MAX_DURATION,
    mitigacao: MITIGACAO.NONE,
    // Bloqueia habilidades ativas; ataque básico e item continuam
    // permitidos (§4 do catálogo canônico).
    bloqueiaAcoes: [ACTION_TYPE.POWER],
  },
  WEAKEN: {
    nomeUi: "Enfraquecimento",
    ehDot: false,
    stack: REGRA_STACK.MAX_INTENSITY,
    mitigacao: MITIGACAO.NONE,
    // Reduz o dano CAUSADO pelo afetado (básico e de poder) em
    // `potency`% enquanto ativo — aplicado como multiplicador sobre o
    // dano já calculado, depois de toda a rolagem normal.
    modificaSaidaDeDano: true,
  },
  // Hard control (§4/§5.1) — o ator não executa nenhuma ação; é
  // removido imediatamente ao receber DANO DIRETO (não DoT, e não pelo
  // próprio golpe que o aplicou — ver
  // statusEffectService.removerFreezeAoReceberDanoDireto).
  FREEZE: {
    nomeUi: "Congelamento",
    ehDot: false,
    stack: REGRA_STACK.RENEW_MAX_DURATION,
    mitigacao: MITIGACAO.NONE,
    bloqueiaAcoes: [ACTION_TYPE.BASIC_ATTACK, ACTION_TYPE.POWER, ACTION_TYPE.ITEM],
    quebraPorDanoDireto: true,
  },
  // Hard control (§5.2) — igual a Freeze na ação bloqueada, mas dano
  // recebido NUNCA remove Stun (só a duração expirando).
  STUN: {
    nomeUi: "Atordoamento",
    ehDot: false,
    stack: REGRA_STACK.RENEW_MAX_DURATION,
    mitigacao: MITIGACAO.NONE,
    bloqueiaAcoes: [ACTION_TYPE.BASIC_ATTACK, ACTION_TYPE.POWER, ACTION_TYPE.ITEM],
  },
  // Controle probabilístico (§5.3) — `potency` é a chance percentual
  // (0..100) de perder a ação NESTE turno; uma única rolagem por
  // ator/turno (nunca por request), ver
  // combatController.resolverChecagemDeParalyze.
  PARALYZE: {
    nomeUi: "Paralisia",
    ehDot: false,
    stack: REGRA_STACK.MAX_INTENSITY,
    mitigacao: MITIGACAO.NONE,
    controleProbabilistico: true,
    bloqueiaAcoes: [ACTION_TYPE.BASIC_ATTACK, ACTION_TYPE.POWER, ACTION_TYPE.ITEM],
  },
  // Precisão (§5.4) — `potency` é a chance ADICIONAL de errar (pontos
  // percentuais, 0..100) do ATACANTE afetado; não bloqueia ação, só
  // altera o resultado de acerto (ver
  // combatFormulas.resolverResultadoDeAcerto). Não afeta cura/self.
  BLIND: {
    nomeUi: "Cegueira",
    ehDot: false,
    stack: REGRA_STACK.MAX_INTENSITY,
    mitigacao: MITIGACAO.NONE,
    afetaAcerto: true,
  },
};

const CHAVES_VALIDAS = Object.keys(STATUS);

function definicaoDoStatus(chave) {
  return STATUS[chave] ?? null;
}

module.exports = {
  STATUS,
  REGRA_STACK,
  MITIGACAO,
  MITIGACAO_DOT_PADRAO,
  STACKS_MAXIMOS,
  ACTION_TYPE,
  TODAS_ACOES_DE_TURNO,
  CHAVES_VALIDAS,
  definicaoDoStatus,
};
