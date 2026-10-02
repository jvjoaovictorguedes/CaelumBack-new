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

// Teto de dano periódico por turno, em % da Vida Máxima do alvo,
// somando TODOS os DoTs ativos nele (Habilidades V2.0 §11/§17) — nunca
// um teto por status individual, e sim um teto agregado pra impedir que
// empilhar Burn+Bleed+Poison (de fontes diferentes: Power, arma,
// monstro) vire dano incontrolável num único turno. Só entra em vigor
// quando quem chama processarTicksDeInicio passa um `contexto` (opt-in
// — combates antigos sem contexto continuam sem teto, nunca uma
// mudança silenciosa de balanceamento). Quando o total bruto excede o
// teto, TODOS os ticks daquele turno são escalados proporcionalmente
// pra caber nele — nunca corta um status inteiro e deixa outro
// intacto. Valores iniciais conservadores, ajustáveis sem migração
// (puro catálogo em memória, como o resto deste arquivo).
const DOT_TOTAL_MAX_PCT_PER_TURN = {
  PVE: 50,
  PARTY: 50,
  GUILD_BOSS: 40,
  WORLD_BOSS: 40,
  PVP_CASUAL: 35,
  RANKED: 35,
  TOURNAMENT: 35,
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

// Unidade de magnitude pro Admin (Habilidades V2.0 §4/§17 — "o campo
// genérico 'Potência base' deve desaparecer da experiência do Admin; o
// label deve refletir a unidade real"). `unidadeHoje` é como `potency`
// É INTERPRETADO ATUALMENTE no motor (ver habilidadesV2Caracterizacao.
// test.js: BURN/BLEED/POISON ainda são dano ABSOLUTO, não percentual);
// `unidadeAlvoV2` é o que a migração da Fase 7 vai tornar verdade. Até
// lá as duas colunas DIVERGEM de propósito pra essa lacuna ficar
// visível em qualquer lugar que leia este catálogo — nunca silenciada.
const UNIDADE = {
  ABSOLUTA: "ABSOLUTA",
  PERCENTUAL_VIDA_MAXIMA: "PERCENTUAL_VIDA_MAXIMA",
  PERCENTUAL_DANO_CAUSADO: "PERCENTUAL_DANO_CAUSADO",
  PERCENTUAL_CHANCE: "PERCENTUAL_CHANCE",
  PERCENTUAL_ERRO_ADICIONAL: "PERCENTUAL_ERRO_ADICIONAL",
  SEM_MAGNITUDE: "SEM_MAGNITUDE",
};

const STATUS = {
  BURN: {
    nomeUi: "Queimadura",
    ehDot: true,
    stack: REGRA_STACK.RENEW_MAX_POTENCY,
    mitigacao: MITIGACAO_DOT_PADRAO,
    unidadeHoje: UNIDADE.ABSOLUTA,
    unidadeAlvoV2: UNIDADE.PERCENTUAL_VIDA_MAXIMA,
    labelAdminMagnitude: "Dano por tick (% da Vida Máxima)",
  },
  BLEED: {
    nomeUi: "Sangramento",
    ehDot: true,
    stack: REGRA_STACK.STACK_CAP,
    mitigacao: MITIGACAO_DOT_PADRAO,
    unidadeHoje: UNIDADE.ABSOLUTA,
    unidadeAlvoV2: UNIDADE.PERCENTUAL_VIDA_MAXIMA,
    labelAdminMagnitude: "Dano por stack/tick (% da Vida Máxima)",
  },
  POISON: {
    nomeUi: "Veneno",
    ehDot: true,
    stack: REGRA_STACK.STACK_CAP,
    mitigacao: MITIGACAO_DOT_PADRAO,
    unidadeHoje: UNIDADE.ABSOLUTA,
    unidadeAlvoV2: UNIDADE.PERCENTUAL_VIDA_MAXIMA,
    labelAdminMagnitude: "Dano por stack/tick (% da Vida Máxima)",
  },
  SILENCE: {
    nomeUi: "Silêncio",
    ehDot: false,
    stack: REGRA_STACK.RENEW_MAX_DURATION,
    mitigacao: MITIGACAO.NONE,
    // Bloqueia habilidades ativas; ataque básico e item continuam
    // permitidos (§4 do catálogo canônico).
    bloqueiaAcoes: [ACTION_TYPE.POWER],
    unidadeHoje: UNIDADE.SEM_MAGNITUDE,
    unidadeAlvoV2: UNIDADE.SEM_MAGNITUDE,
    labelAdminMagnitude: null,
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
    unidadeHoje: UNIDADE.PERCENTUAL_DANO_CAUSADO,
    unidadeAlvoV2: UNIDADE.PERCENTUAL_DANO_CAUSADO,
    labelAdminMagnitude: "Redução do dano causado (%)",
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
    unidadeHoje: UNIDADE.SEM_MAGNITUDE,
    unidadeAlvoV2: UNIDADE.SEM_MAGNITUDE,
    labelAdminMagnitude: null,
  },
  // Hard control (§5.2) — igual a Freeze na ação bloqueada, mas dano
  // recebido NUNCA remove Stun (só a duração expirando).
  STUN: {
    nomeUi: "Atordoamento",
    ehDot: false,
    stack: REGRA_STACK.RENEW_MAX_DURATION,
    mitigacao: MITIGACAO.NONE,
    bloqueiaAcoes: [ACTION_TYPE.BASIC_ATTACK, ACTION_TYPE.POWER, ACTION_TYPE.ITEM],
    unidadeHoje: UNIDADE.SEM_MAGNITUDE,
    unidadeAlvoV2: UNIDADE.SEM_MAGNITUDE,
    labelAdminMagnitude: null,
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
    unidadeHoje: UNIDADE.PERCENTUAL_CHANCE,
    unidadeAlvoV2: UNIDADE.PERCENTUAL_CHANCE,
    labelAdminMagnitude: "Chance de perder a ação (%)",
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
    unidadeHoje: UNIDADE.PERCENTUAL_ERRO_ADICIONAL,
    unidadeAlvoV2: UNIDADE.PERCENTUAL_ERRO_ADICIONAL,
    labelAdminMagnitude: "Chance adicional de erro (%)",
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
  DOT_TOTAL_MAX_PCT_PER_TURN,
  ACTION_TYPE,
  TODAS_ACOES_DE_TURNO,
  CHAVES_VALIDAS,
  UNIDADE,
  definicaoDoStatus,
};
