// Habilidades V2.0 (doc "Habilidades V2.0" §7/§8/§9) — Fase 3. Catálogo
// central de MODIFICADORES de combate (buffs/debuffs numéricos — o que
// NÃO é um Status de statusEffectConfig.js). Puro catálogo + validação:
// nenhum effect_key aqui executa nada ainda — isso é combatModifierService,
// que só entra na Fase 4. Até lá, nada consome este arquivo em combate de
// verdade; existe só pra Admin/validação terem uma fonte fechada desde já.
//
// §7 "Regra de ouro": o MESMO effect_key recebe magnitude positiva ou
// negativa — DAMAGE_DEALT_PCT com -20 é um debuff, com +20 é um buff. Não
// existe um catálogo separado de "debuffs".
const EFFECT_KEYS = [
  "DAMAGE_DEALT_PCT",
  "DAMAGE_TAKEN_PCT",
  "DEFENSE_FLAT",
  "CRIT_CHANCE_PCT",
  "CRIT_DAMAGE_PCT",
  "DODGE_CHANCE_PCT",
  "HIT_CHANCE_PCT",
  "HEALING_DONE_PCT",
  "HEALING_RECEIVED_PCT",
  "MANA_COST_PCT",
  "COOLDOWN_REDUCTION_TURNS",
  "REGEN_HP_FLAT",
  "REGEN_HP_PERCENT",
  "REGEN_MANA_FLAT",
  "REGEN_MANA_PERCENT",
  "STATUS_RESISTANCE_PCT",
  "LIFESTEAL_PCT",
  "GRANT_SHIELD",
  "SHIELD_ON_CAST",
  "CLEANSE_STATUS",
  "CLEANSE_CATEGORY",
  "DISPEL_BUFF",
  "REDUCE_COOLDOWN",
  "RESTORE_MANA_ON_TRIGGER",
];

// Metadados pro Admin (§17/§18) — label fixo e unidade real, nunca um
// campo genérico "magnitude"/"potência base" sem dizer o que ela mede.
const METADADOS_DO_EFEITO = {
  DAMAGE_DEALT_PCT: { label: "Dano causado (%)", unidade: "PERCENTUAL" },
  DAMAGE_TAKEN_PCT: { label: "Dano recebido (%)", unidade: "PERCENTUAL" },
  DEFENSE_FLAT: { label: "Defesa (pontos)", unidade: "FLAT" },
  CRIT_CHANCE_PCT: { label: "Chance de crítico (%)", unidade: "PERCENTUAL" },
  CRIT_DAMAGE_PCT: { label: "Dano crítico (%)", unidade: "PERCENTUAL" },
  DODGE_CHANCE_PCT: { label: "Chance de esquiva (%)", unidade: "PERCENTUAL" },
  HIT_CHANCE_PCT: { label: "Precisão adicional (%)", unidade: "PERCENTUAL" },
  HEALING_DONE_PCT: { label: "Cura produzida (%)", unidade: "PERCENTUAL" },
  HEALING_RECEIVED_PCT: { label: "Cura recebida (%)", unidade: "PERCENTUAL" },
  MANA_COST_PCT: { label: "Custo de Mana (%)", unidade: "PERCENTUAL" },
  COOLDOWN_REDUCTION_TURNS: { label: "Redução de cooldown (turnos)", unidade: "TURNOS" },
  REGEN_HP_FLAT: { label: "Regen de Vida por turno (pontos)", unidade: "FLAT" },
  REGEN_HP_PERCENT: { label: "Regen de Vida por turno (%)", unidade: "PERCENTUAL" },
  REGEN_MANA_FLAT: { label: "Regen de Mana por turno (pontos)", unidade: "FLAT" },
  REGEN_MANA_PERCENT: { label: "Regen de Mana por turno (%)", unidade: "PERCENTUAL" },
  STATUS_RESISTANCE_PCT: { label: "Resistência a Status (%)", unidade: "PERCENTUAL" },
  LIFESTEAL_PCT: { label: "Roubo de vida (%)", unidade: "PERCENTUAL" },
  GRANT_SHIELD: { label: "Escudo concedido (pontos)", unidade: "FLAT" },
  SHIELD_ON_CAST: { label: "Escudo ao lançar (pontos)", unidade: "FLAT" },
  CLEANSE_STATUS: { label: "Remove Status específico", unidade: "SEM_MAGNITUDE" },
  CLEANSE_CATEGORY: { label: "Remove categoria de Status (DoT/Controle)", unidade: "SEM_MAGNITUDE" },
  DISPEL_BUFF: { label: "Remove modificador do alvo", unidade: "SEM_MAGNITUDE" },
  REDUCE_COOLDOWN: { label: "Reduz cooldown atual (turnos)", unidade: "TURNOS" },
  RESTORE_MANA_ON_TRIGGER: { label: "Restaura Mana no gatilho (pontos)", unidade: "FLAT" },
};

// §4/§9 — alvo de um modificador. ALL_ALLIES/ALL_ENEMIES só fazem
// sentido em contextos com múltiplos aliados/inimigos (Party/Guild
// Boss/World Boss); quem aplica valida isso contra o contexto real.
const TARGETS = ["SELF", "ENEMY", "ALL_ALLIES", "ALL_ENEMIES"];

// §9 — política de reaplicação/combinação quando um modificador do
// MESMO stack_group já está ativo. Nenhum modificador soma
// indefinidamente por padrão (era o bug relatado em combatBuffService —
// ver combatBuffService.aplicarBuff, que já aplica STRONGEST pra todo
// atributo hoje). Esta é a versão GENERALIZADA e configurável por
// efeito, que combatModifierService vai usar a partir da Fase 4.
const REAPPLY_POLICIES = {
  // Não reaplica, não renova e não acumula enquanto o grupo está ativo.
  BLOCK_WHILE_ACTIVE: "BLOCK_WHILE_ACTIVE",
  // Mantém magnitude existente, renova a duração.
  REFRESH: "REFRESH",
  // Mantém a maior magnitude válida; duração segue a da aplicação que
  // prevaleceu (mesmo critério que concederEscudo/combatBuffService já
  // usam hoje pra "o maior vence").
  STRONGEST: "STRONGEST",
  // Empilha até max_stacks.
  STACK: "STACK",
  // Nova aplicação substitui a existente por completo (valor E duração).
  REPLACE: "REPLACE",
  // Uma instância por FONTE (sourcePowerId/sourceItemId) — evita duas
  // cópias da MESMA Power/Item, mas permite fontes diferentes
  // coexistirem (se o stack_group permitir).
  UNIQUE_SOURCE: "UNIQUE_SOURCE",
};

const REAPPLY_POLICIES_VALIDAS = Object.keys(REAPPLY_POLICIES);

const DESCRICAO_DA_POLITICA = {
  STRONGEST: "Só o efeito de maior magnitude do grupo prevalece.",
  REFRESH: "Mantém a magnitude existente e renova a duração.",
  REPLACE: "A nova aplicação substitui valor e duração.",
  BLOCK_WHILE_ACTIVE: "Ignora novas aplicações enquanto o efeito estiver ativo.",
  STACK: "Permite acumular múltiplas instâncias até o máximo configurado.",
  UNIQUE_SOURCE: "Uma instância por fonte; fontes diferentes podem coexistir.",
};

const DESCRICAO_DO_ALVO = {
  SELF: "Quem possui/usa a habilidade",
  ENEMY: "Alvo inimigo",
  ALL_ALLIES: "Todos os aliados",
  ALL_ENEMIES: "Todos os inimigos",
};

function effectKeyValida(effectKey) {
  return EFFECT_KEYS.includes(effectKey);
}

function metadadosDoEfeito(effectKey) {
  return METADADOS_DO_EFEITO[effectKey] ?? null;
}

function targetValido(target) {
  return TARGETS.includes(target);
}

function reapplyPolicyValida(policy) {
  return REAPPLY_POLICIES_VALIDAS.includes(policy);
}

module.exports = {
  EFFECT_KEYS,
  METADADOS_DO_EFEITO,
  TARGETS,
  REAPPLY_POLICIES,
  REAPPLY_POLICIES_VALIDAS,
  DESCRICAO_DA_POLITICA,
  DESCRICAO_DO_ALVO,
  effectKeyValida,
  metadadosDoEfeito,
  targetValido,
  reapplyPolicyValida,
};
