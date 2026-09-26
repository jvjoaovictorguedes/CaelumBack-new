// equipmentRarityService — autoridade única pra aplicar/comparar
// raridade em runtime na Reformulação V2 (Item Único por Equipamento,
// Raridade por Instância). Testes puros, sem banco: a matemática não
// depende de nada além de RARITY_POWER_MULTIPLIER/TIER_ECONOMIC_MULTIPLIER
// (equipmentTierConfig) e ORDEM_QUALIDADE (forgeConfig).
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validarRaridade,
  compararRaridade,
  aplicarRaridadeArma,
  aplicarRaridadeArmadura,
  aplicarRaridadeVara,
  calcularValorVendaInstancia,
} = require("../src/services/equipmentRarityService");

test("validarRaridade aceita as 6 raridades e rejeita qualquer outra coisa", () => {
  for (const r of ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"]) {
    assert.doesNotThrow(() => validarRaridade(r));
  }
  assert.throws(() => validarRaridade("Lendaria"), /Raridade inválida/);
  assert.throws(() => validarRaridade(""), /Raridade inválida/);
  assert.throws(() => validarRaridade(null), /Raridade inválida/);
});

test("compararRaridade segue a ordem Comum < Incomum < ... < Mitico", () => {
  assert.equal(compararRaridade("Comum", "Mitico"), -1);
  assert.equal(compararRaridade("Mitico", "Comum"), 1);
  assert.equal(compararRaridade("Raro", "Raro"), 0);
  assert.equal(compararRaridade("Epico", "Raro"), 1);
});

test("aplicarRaridadeArma: Comum é identidade (fator 1.0), raridades maiores escalam pra cima", () => {
  const base = { dano_min: 10, dano_max: 20, valor_bonus_atributo: 5, tipo_dano: "Fisico" };

  const comum = aplicarRaridadeArma(base, "Comum");
  assert.equal(comum.dano_min, 10);
  assert.equal(comum.dano_max, 20);
  assert.equal(comum.valor_bonus_atributo, 5);
  assert.equal(comum.tipo_dano, "Fisico", "campos não numéricos precisam ser preservados");

  const mitico = aplicarRaridadeArma(base, "Mitico");
  assert.equal(mitico.dano_min, 14, "10 * 1.35 = 13.5 -> arredonda pra 14");
  assert.equal(mitico.dano_max, 27, "20 * 1.35 = 27");
});

test("aplicarRaridadeArmadura: escala defesa e todos os bônus de atributo", () => {
  const base = {
    defesa: 100,
    bonus_forca: 0,
    bonus_vitalidade: 10,
    bonus_inteligencia: 0,
    bonus_agilidade: 0,
    bonus_velocidade: 0,
  };
  const raro = aplicarRaridadeArmadura(base, "Raro");
  assert.equal(raro.defesa, 110, "100 * 1.10 = 110");
  assert.equal(raro.bonus_vitalidade, 11, "10 * 1.10 = 11");
  assert.equal(raro.bonus_forca, 0, "zero continua zero");
});

test("aplicarRaridadeVara: escala os 5 atributos da vara de pesca", () => {
  const base = { forca_linha: 100, controle: 100, recolhimento: 100, precisao: 100, estabilidade: 100, nivel_pesca_minimo: 5 };
  const epico = aplicarRaridadeVara(base, "Epico");
  assert.equal(epico.forca_linha, 117, "100 * 1.17 = 117");
  assert.equal(epico.nivel_pesca_minimo, 5, "campo não escalável precisa ser preservado");
});

test("calcularValorVendaInstancia combina raridade da instância com Tier do Item", () => {
  const itemTier1 = { id: 1, tier_equipamento: 1 };
  const itemTier5 = { id: 2, tier_equipamento: 5 };

  assert.equal(calcularValorVendaInstancia(itemTier5, "Comum"), 15, "Tier 5 (mult 1) * base Comum (15)");
  assert.equal(calcularValorVendaInstancia(itemTier1, "Mitico"), 56000, "Tier 1 (mult 16) * base Mitico (3500)");
});

test("calcularValorVendaInstancia rejeita Item sem tier_equipamento configurado", () => {
  assert.throws(() => calcularValorVendaInstancia({ id: 99, tier_equipamento: null }, "Raro"), /sem tier_equipamento configurado/);
});
