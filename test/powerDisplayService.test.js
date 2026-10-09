// Rebalanceamento de Powers §30 — powerDisplayService é o formatador
// único do que o jogador vê sobre uma Power (nunca reimplementado no
// frontend). Testa cada peça isolada: label de tipo_dano, afinidade
// principal (EXPLICIT) vs adicional (INHERIT_WEAPON + added), "pode
// causar X", escudo/cura, e o resumo composto.
const test = require("node:test");
const assert = require("node:assert/strict");
const { describirPower } = require("../src/services/powerDisplayService");

test("Bola de Fogo: Mágico EXPLICIT com afinidade Fogo + BURN", () => {
  const power = {
    nome: "Bola de Fogo",
    tipo_poder: "Ativo",
    custo_mana: 10,
    cooldown: 2,
    tipo_dano: "Magico",
    affinity_mode: "EXPLICIT",
    added_damage_pct: 0,
    afinidadePrincipal: { key: "FIRE", nome: "Fogo" },
    afinidadeAdicional: null,
    cura_base: 0,
  };
  const r = describirPower(power, { efeitosDeStatus: [{ status_key: "BURN", ativo: true }], efeitosDeCombate: [] });
  assert.equal(r.tipo_dano_label, "Mágico");
  assert.deepEqual(r.afinidade_principal, { key: "FIRE", nome: "Fogo" });
  assert.equal(r.afinidade_adicional, null);
  assert.deepEqual(r.status_possiveis, ["Queimadura"]);
  assert.equal(r.resumo, "Bola de Fogo / Mágico • Fogo / 10 Mana • Recarga 2 / Pode causar Queimadura");
});

test("Lâmina Flamejante: Físico INHERIT_WEAPON + afinidade adicional Fogo (nunca vira mágico)", () => {
  const power = {
    nome: "Lâmina Flamejante",
    tipo_poder: "Ativo",
    custo_mana: 16,
    cooldown: 3,
    tipo_dano: "Fisico",
    affinity_mode: "INHERIT_WEAPON",
    added_damage_pct: 25,
    afinidadePrincipal: null,
    afinidadeAdicional: { key: "FIRE", nome: "Fogo" },
    cura_base: 0,
  };
  const r = describirPower(power, { efeitosDeStatus: [], efeitosDeCombate: [] });
  assert.equal(r.tipo_dano_label, "Físico");
  assert.equal(r.afinidade_principal, null);
  assert.deepEqual(r.afinidade_adicional, { key: "FIRE", nome: "Fogo", added_damage_pct: 25 });
  assert.equal(r.resumo, "Lâmina Flamejante / Físico + Fogo / 16 Mana • Recarga 3");
});

test("Escudo de Mana: tipo_dano Nenhum, concede escudo, resumo não mostra linha de tipo", () => {
  const power = {
    nome: "Escudo de Mana",
    tipo_poder: "Ativo",
    custo_mana: 18,
    cooldown: 3,
    tipo_dano: "Nenhum",
    affinity_mode: "NEUTRAL",
    added_damage_pct: 0,
    afinidadePrincipal: null,
    afinidadeAdicional: null,
    cura_base: 0,
  };
  const r = describirPower(power, { efeitosDeStatus: [], efeitosDeCombate: [{ effect_key: "SHIELD_ON_CAST", ativo: true }] });
  assert.equal(r.tipo_dano_label, null);
  assert.equal(r.concede_escudo, true);
  assert.equal(r.resumo, "Escudo de Mana / 18 Mana • Recarga 3 / Concede uma barreira temporária");
});

test("Passivo nunca mostra Mana/Recarga no resumo (tipo_poder=Passivo)", () => {
  const power = {
    nome: "Fluxo Arcano",
    tipo_poder: "Passivo",
    custo_mana: 0,
    cooldown: 0,
    tipo_dano: "Nenhum",
    affinity_mode: "NEUTRAL",
    added_damage_pct: 0,
    afinidadePrincipal: null,
    afinidadeAdicional: null,
    cura_base: 0,
  };
  const r = describirPower(power, { efeitosDeStatus: [], efeitosDeCombate: [] });
  assert.ok(!r.resumo.includes("Mana"));
  assert.ok(!r.resumo.includes("Recarga"));
});

test("status_possiveis não duplica o mesmo status_key repetido em linhas diferentes", () => {
  const power = { nome: "X", tipo_poder: "Ativo", custo_mana: 5, cooldown: 1, tipo_dano: "Fisico", affinity_mode: "INHERIT_WEAPON", added_damage_pct: 0, afinidadePrincipal: null, afinidadeAdicional: null, cura_base: 0 };
  const r = describirPower(power, {
    efeitosDeStatus: [
      { status_key: "BLEED", ativo: true, target: "Enemy" },
      { status_key: "BLEED", ativo: true, target: "Enemy" },
    ],
    efeitosDeCombate: [],
  });
  assert.deepEqual(r.status_possiveis, ["Sangramento"]);
});

test("cura pura (sem status/escudo) mostra 'Cura o alvo' no resumo", () => {
  const power = { nome: "Cura Arcana", tipo_poder: "Ativo", custo_mana: 12, cooldown: 2, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL", added_damage_pct: 0, afinidadePrincipal: null, afinidadeAdicional: null, cura_base: 40 };
  const r = describirPower(power, { efeitosDeStatus: [], efeitosDeCombate: [] });
  assert.equal(r.cura_direta, true);
  assert.ok(r.resumo.endsWith("Cura o alvo"));
});

test("efeito inativo (ativo=false) não entra em status_possiveis nem concede_escudo", () => {
  const power = { nome: "Y", tipo_poder: "Ativo", custo_mana: 5, cooldown: 1, tipo_dano: "Fisico", affinity_mode: "INHERIT_WEAPON", added_damage_pct: 0, afinidadePrincipal: null, afinidadeAdicional: null, cura_base: 0 };
  const r = describirPower(power, {
    efeitosDeStatus: [{ status_key: "STUN", ativo: false }],
    efeitosDeCombate: [{ effect_key: "GRANT_SHIELD", ativo: false }],
  });
  assert.deepEqual(r.status_possiveis, []);
  assert.equal(r.concede_escudo, false);
});
