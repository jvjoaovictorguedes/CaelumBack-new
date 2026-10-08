// Habilidades V2.0 — Fase 3 da ordem recomendada de implementação
// (seção 26, passo 3): "Criar catálogo central de contextos/status/
// modifiers/triggers/conditions e contratos de validação." Testa só os
// catálogos em si (puro, sem banco) — nenhum deles é consumido em
// combate de verdade ainda (isso começa na Fase 4, combatModifierService).
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CONTEXTOS_DE_COMBATE,
  ROTULO_DO_CONTEXTO,
  contextoValido,
} = require("../src/config/combatContextConfig");
const { POWER_EFFECT_CONTEXT_COLUMNS } = require("../src/config/uniqueFeatConfig");
const {
  EFFECT_KEYS,
  METADADOS_DO_EFEITO,
  TARGETS,
  REAPPLY_POLICIES_VALIDAS,
  effectKeyValida,
  metadadosDoEfeito,
  targetValido,
  reapplyPolicyValida,
} = require("../src/config/combatModifierConfig");
const { TRIGGERS, DESCRICAO_DO_TRIGGER, triggerValido } = require("../src/config/combatTriggerConfig");
const {
  CONDITIONS,
  conditionKeyValida,
  configBateComContrato,
} = require("../src/config/combatConditionConfig");
const { CHAVES_VALIDAS, STATUS, UNIDADE } = require("../src/config/statusEffectConfig");

// ---------------------------------------------------------------------
// Contextos
// ---------------------------------------------------------------------

test("combatContextConfig: 8 contextos canônicos, todos com rótulo pro Admin", () => {
  // TEMPLE_BOSS entrou na Fase 5 do Templo do Véu Celestial — Guardião
  // solo reaproveita carregarLutador/combatModifierService, que exigem
  // um contexto central de verdade (nunca um paralelo).
  assert.equal(CONTEXTOS_DE_COMBATE.length, 8);
  for (const contexto of CONTEXTOS_DE_COMBATE) {
    assert.ok(contextoValido(contexto));
    assert.ok(ROTULO_DO_CONTEXTO[contexto], `contexto ${contexto} precisa de rótulo`);
  }
  assert.equal(contextoValido("CONTEXTO_INVENTADO"), false);
});

test("combatContextConfig: NUNCA diverge da lista que uniqueFeatConfig já usa pra Proezas Únicas", () => {
  // Proezas Únicas ainda mantém a própria lista (POWER_EFFECT_CONTEXT_
  // COLUMNS) — a migração pra consumir combatContextConfig direto é
  // tarefa de uma fase futura (seção 10 do doc: "só depois da migração
  // segura"). Até lá, este teste é a rede de segurança: se alguém
  // adicionar um contexto novo num lugar e esquecer o outro, a suíte
  // quebra aqui, não silenciosamente em produção.
  const contextosDeProezas = Object.keys(POWER_EFFECT_CONTEXT_COLUMNS);
  assert.deepEqual(
    [...contextosDeProezas].sort(),
    [...CONTEXTOS_DE_COMBATE].sort(),
    "a lista de contextos de Proezas Únicas e o catálogo central precisam ser EXATAMENTE os mesmos 8 nomes",
  );
});

// ---------------------------------------------------------------------
// Modifiers (PowerCombatEffect, ainda não implementado — só catálogo)
// ---------------------------------------------------------------------

test("combatModifierConfig: todo effect_key tem metadados completos pro Admin (label + unidade)", () => {
  assert.ok(EFFECT_KEYS.length >= 23, "catálogo da seção 8 do doc tem 23 effect_keys");
  for (const chave of EFFECT_KEYS) {
    assert.ok(effectKeyValida(chave));
    const meta = metadadosDoEfeito(chave);
    assert.ok(meta, `effect_key ${chave} sem metadados`);
    assert.ok(meta.label, `effect_key ${chave} sem label`);
    assert.ok(meta.unidade, `effect_key ${chave} sem unidade`);
  }
  assert.equal(effectKeyValida("EFEITO_INVENTADO"), false);
  assert.equal(metadadosDoEfeito("EFEITO_INVENTADO"), null);
});

test("combatModifierConfig: targets e reapply policies batem com a seção 4/9 do doc", () => {
  assert.deepEqual(TARGETS, ["SELF", "ENEMY", "ALL_ALLIES", "ALL_ENEMIES"]);
  for (const target of TARGETS) assert.ok(targetValido(target));
  assert.equal(targetValido("TODOS_OS_SERES_VIVOS"), false);

  assert.deepEqual(
    [...REAPPLY_POLICIES_VALIDAS].sort(),
    ["BLOCK_WHILE_ACTIVE", "REFRESH", "REPLACE", "STACK", "STRONGEST", "UNIQUE_SOURCE"].sort(),
  );
  for (const policy of REAPPLY_POLICIES_VALIDAS) assert.ok(reapplyPolicyValida(policy));
  assert.equal(reapplyPolicyValida("SOMA_TUDO"), false, "a política antiga (empilhar por soma) nunca pode ser uma opção válida");
});

// ---------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------

test("combatTriggerConfig: todo trigger da seção 14 tem descrição", () => {
  assert.deepEqual(
    [...TRIGGERS].sort(),
    [
      "PASSIVE",
      "COMBAT_START",
      "ON_CAST",
      "ON_HIT",
      "ON_CRIT",
      "ON_DAMAGE_TAKEN",
      "ON_DODGE",
      "ON_HEAL",
      "ON_KILL",
      "TURN_START",
      "TURN_END",
    ].sort(),
  );
  for (const trigger of TRIGGERS) {
    assert.ok(triggerValido(trigger));
    assert.ok(DESCRICAO_DO_TRIGGER[trigger], `trigger ${trigger} sem descrição`);
  }
  assert.equal(triggerValido("ON_FULL_MOON"), false);
});

// ---------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------

test("combatConditionConfig: condition_key valida contrato de config tipada, nunca aceita config livre", () => {
  assert.deepEqual(
    [...CONDITIONS].sort(),
    ["SELF_HP_BELOW_PCT", "TARGET_HP_BELOW_PCT", "SELF_HAS_STATUS", "TARGET_HAS_STATUS", "TARGET_HAS_DEBUFF_GROUP"].sort(),
  );
  assert.ok(conditionKeyValida("SELF_HP_BELOW_PCT"));
  assert.equal(conditionKeyValida("LUA_CHEIA"), false);

  assert.ok(configBateComContrato("SELF_HP_BELOW_PCT", { limite_pct: 30 }));
  assert.equal(configBateComContrato("SELF_HP_BELOW_PCT", {}), false, "falta o campo obrigatório limite_pct");
  assert.equal(configBateComContrato("SELF_HP_BELOW_PCT", null), false);
  assert.equal(configBateComContrato("CONDITION_INVENTADA", { limite_pct: 30 }), false);

  assert.ok(configBateComContrato("TARGET_HAS_STATUS", { status_key: "POISON" }));
});

// ---------------------------------------------------------------------
// Status catalog — metadados de unidade (Admin, seção 17) sem alterar
// NENHUM comportamento de combate existente.
// ---------------------------------------------------------------------

test("statusEffectConfig: todo Status tem unidadeHoje/unidadeAlvoV2 documentados, sem exceção", () => {
  for (const chave of CHAVES_VALIDAS) {
    const def = STATUS[chave];
    assert.ok(def.unidadeHoje, `${chave} sem unidadeHoje`);
    assert.ok(def.unidadeAlvoV2, `${chave} sem unidadeAlvoV2`);
    assert.ok(Object.values(UNIDADE).includes(def.unidadeHoje));
    assert.ok(Object.values(UNIDADE).includes(def.unidadeAlvoV2));
  }
});

test("statusEffectConfig: BURN/BLEED/POISON são os únicos com migração pendente (hoje ABSOLUTA, alvo V2 é % da Vida Máxima)", () => {
  for (const chave of ["BURN", "BLEED", "POISON"]) {
    assert.equal(STATUS[chave].unidadeHoje, UNIDADE.ABSOLUTA);
    assert.equal(STATUS[chave].unidadeAlvoV2, UNIDADE.PERCENTUAL_VIDA_MAXIMA);
    assert.notEqual(STATUS[chave].unidadeHoje, STATUS[chave].unidadeAlvoV2, "a lacuna que a Fase 7 vai fechar precisa continuar visível até lá");
  }
  // Os demais já nascem com a unidade final — sem pendência de migração.
  for (const chave of ["WEAKEN", "PARALYZE", "BLIND", "SILENCE", "FREEZE", "STUN"]) {
    assert.equal(STATUS[chave].unidadeHoje, STATUS[chave].unidadeAlvoV2, `${chave} não deveria ter lacuna de migração`);
  }
});

test("statusEffectConfig: labelAdminMagnitude só é null pros Status SEM_MAGNITUDE (SILENCE/FREEZE/STUN)", () => {
  for (const chave of CHAVES_VALIDAS) {
    const def = STATUS[chave];
    if (def.unidadeHoje === UNIDADE.SEM_MAGNITUDE) {
      assert.equal(def.labelAdminMagnitude, null, `${chave} é sem magnitude, Admin não deveria mostrar campo nenhum`);
    } else {
      assert.ok(def.labelAdminMagnitude, `${chave} tem magnitude mas não tem label pro Admin — "Potência base" genérico nunca pode voltar`);
    }
  }
});
