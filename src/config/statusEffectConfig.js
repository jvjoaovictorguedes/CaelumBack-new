// Motor de Status (Especificação Consolidada Poder/Status/Cooldown/
// Balanceamento, §19-32). Chaves ESTÁVEIS — nome de exibição fica só
// aqui e no frontend; banco/API nunca usam o nome em português como
// identificador.
//
// Cada status entra numa destas categorias de stack (§25):
// - "RENEW_MAX_POTENCY": sem stack; reaplicar renova a duração e
//   mantém a MAIOR potência já aplicada (BURN).
// - "STACK_CAP": empilha até STACKS_MAXIMOS[chave]; cada stack conta
//   pra potência total; reaplicar sempre atualiza a duração pro maior
//   valor (BLEED, POISON).
// - "RENEW_MAX_DURATION": sem stack; reaplicar só estende se a nova
//   duração for maior que a restante (SILENCE).
// - "MAX_INTENSITY": sem stack; ao reaplicar, fica com a MAIOR potência
//   entre a existente e a nova, e a duração é a da aplicação mais
//   recente (SLOW, WEAKEN).
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
    bloqueiaHabilidadesAtivas: true,
  },
  SLOW: {
    nomeUi: "Lentidão",
    ehDot: false,
    stack: REGRA_STACK.MAX_INTENSITY,
    mitigacao: MITIGACAO.NONE,
    // Reduz `velocidade` em `potency`% enquanto ativo. Hoje nenhuma
    // fórmula de combate (combatFormulas.js) lê `velocidade` durante a
    // resolução de turno — é usada só pra CALIBRAR o inimigo no momento
    // em que ele é gerado (gerarInimigo/gerarInimigoDeGrupo). Ou seja:
    // o status É rastreado, aparece no log/UI e decrementa certinho,
    // mas hoje não muda dano/esquiva/iniciativa de ninguém, porque não
    // existe sistema de iniciativa/turno-por-velocidade no motor atual.
    // Sinalizado de propósito (ver §45 e o relatório final) em vez de
    // inventar uma mecânica de iniciativa não pedida — fica pronto pra
    // plugar numa fórmula futura sem mudar schema.
    modificaAtributo: "velocidade",
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
};

// §21 — deliberadamente NÃO implementados nesta primeira versão (Stun,
// Freeze, Regeneration, Shield, Haste, Vulnerability, imunidades
// complexas). Listados aqui só pra quem for ler o config saber que a
// ausência é intencional, não esquecimento.
const STATUS_ADIADOS_PARA_DEPOIS = [
  "STUN",
  "FREEZE",
  "REGENERATION",
  "SHIELD",
  "HASTE",
  "VULNERABILITY",
];

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
  STATUS_ADIADOS_PARA_DEPOIS,
  CHAVES_VALIDAS,
  definicaoDoStatus,
};
