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
  encontrarOverride,
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

test("encontrarOverride acha a linha da raridade certa ou devolve null", () => {
  const overrides = [
    { qualidade: "Raro", atributos: { dano_min: 999 } },
    { qualidade: "Mitico", atributos: { dano_max: 500 } },
  ];
  assert.deepEqual(encontrarOverride(overrides, "Raro"), { dano_min: 999 });
  assert.equal(encontrarOverride(overrides, "Comum"), null, "sem override cadastrado pra essa raridade");
  assert.equal(encontrarOverride(null, "Raro"), null, "sem array de overrides nenhum (item sem includes)");
  assert.equal(encontrarOverride([], "Raro"), null);
});

test("aplicarRaridadeArma: override parcial substitui só as chaves presentes, resto continua vindo do multiplicador", () => {
  const base = { dano_min: 10, dano_max: 20, valor_bonus_atributo: 5, tipo_dano: "Fisico" };
  const overrides = [{ qualidade: "Lendario", atributos: { dano_max: 999 } }];

  const comOverride = aplicarRaridadeArma(base, "Lendario", overrides);
  assert.equal(comOverride.dano_max, 999, "chave presente no override vence o cálculo");
  assert.equal(comOverride.dano_min, 13, "10 * 1.25 = 12.5 -> arredonda 13 (chave ausente no override, segue a curva global)");

  const semOverride = aplicarRaridadeArma(base, "Lendario", []);
  assert.equal(semOverride.dano_max, 25, "array vazio = nenhum override, comportamento idêntico a não passar nada");
});

test("aplicarRaridadeArma: override ignora chave desconhecida/valor não numérico e nunca quebra", () => {
  const base = { dano_min: 10, dano_max: 20, valor_bonus_atributo: 5 };
  const overrides = [{ qualidade: "Raro", atributos: { dano_min: "abc", chave_inexistente: 1, dano_max: 30 } }];
  const resultado = aplicarRaridadeArma(base, "Raro", overrides);
  assert.equal(resultado.dano_max, 30);
  assert.equal(resultado.dano_min, 11, "valor não numérico no override é ignorado, mantém o cálculo (10 * 1.1 = 11)");
  assert.equal(resultado.chave_inexistente, undefined);
});

test("aplicarRaridadeArmadura e aplicarRaridadeVara também aceitam override parcial", () => {
  const armaduraBase = { defesa: 100, bonus_forca: 0, bonus_vitalidade: 10, bonus_inteligencia: 0, bonus_agilidade: 0, bonus_velocidade: 0 };
  const armaduraOverrides = [{ qualidade: "Mitico", atributos: { defesa: 500 } }];
  const armadura = aplicarRaridadeArmadura(armaduraBase, "Mitico", armaduraOverrides);
  assert.equal(armadura.defesa, 500);
  assert.equal(armadura.bonus_vitalidade, 14, "10 * 1.35 = 13.5 -> arredonda 14, sem override nessa chave");

  const varaBase = { forca_linha: 100, controle: 100, recolhimento: 100, precisao: 100, estabilidade: 100 };
  const varaOverrides = [{ qualidade: "Epico", atributos: { controle: 250 } }];
  const vara = aplicarRaridadeVara(varaBase, "Epico", varaOverrides);
  assert.equal(vara.controle, 250);
  assert.equal(vara.forca_linha, 117, "100 * 1.17 = 117, sem override nessa chave");
});
