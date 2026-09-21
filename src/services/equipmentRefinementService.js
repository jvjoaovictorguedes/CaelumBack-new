// Aplica o bônus percentual de refinamento (BONUS_ATRIBUTO_REFINAMENTO_PCT,
// já usado na Forja) às PROPRIEDADES DO PRÓPRIO EQUIPAMENTO — nunca aos
// atributos-base do personagem (spec Inventário v2 §6). Fonte única
// usada tanto por equipmentBonusService (soma no combate) quanto pela
// API de inventário (mostrar base vs efetivo no tooltip), pra nunca
// haver dois lugares calculando a mesma conta com arredondamento
// diferente.
const { BONUS_ATRIBUTO_REFINAMENTO_PCT } = require("../config/forgeConfig");

function fatorRefinamento(refinamento) {
  const pct = BONUS_ATRIBUTO_REFINAMENTO_PCT[refinamento] ?? 0;
  return 1 + pct / 100;
}

// Só escala valores POSITIVOS (spec: "bônus positivos de atributos") —
// zero continua zero, e nunca inventamos um bônus negativo virando
// "mais negativo ainda" por um efeito colateral de arredondamento.
//
// Garante pelo menos +1 assim que refinamento > 0 — sem isso, um
// atributo baixo (ex.: dano 5-8 de uma arma Comum, ou um bônus de +1
// de atributo) ficava com Math.round(valor * pct) travado em 0 por
// VÁRIOS refinamentos seguidos (ex.: +1 a +3 não mudavam nada, e um
// bônus de atributo de valor 1 nunca subia nem no +10 — 32% de 1 ainda
// arredonda pra 0). Jogador refinando e "não acontecendo nada" era
// literalmente esse bug: o % configurado é real, só não aparecia em
// valores pequenos até o arredondamento normal ultrapassar 1 sozinho.
function escalar(valor, fator) {
  const numero = Number(valor) || 0;
  if (numero <= 0) return numero;
  const percentual = fator - 1;
  if (percentual <= 0) return numero;
  const bonusCalculado = Math.round(numero * percentual);
  return numero + Math.max(1, bonusCalculado);
}

// `arma`/`armadura` aceitam tanto a instância Sequelize quanto um
// objeto plano (.toJSON() já resolvido) — sempre devolve objeto plano.
function propriedadesEfetivasArma(weaponProperties, refinamento) {
  if (!weaponProperties) return null;
  const base = weaponProperties.toJSON ? weaponProperties.toJSON() : weaponProperties;
  const fator = fatorRefinamento(refinamento);
  return {
    ...base,
    dano_min: escalar(base.dano_min, fator),
    dano_max: escalar(base.dano_max, fator),
    valor_bonus_atributo: escalar(base.valor_bonus_atributo, fator),
  };
}

function propriedadesEfetivasArmadura(armorProperties, refinamento) {
  if (!armorProperties) return null;
  const base = armorProperties.toJSON ? armorProperties.toJSON() : armorProperties;
  const fator = fatorRefinamento(refinamento);
  return {
    ...base,
    defesa: escalar(base.defesa, fator),
    bonus_forca: escalar(base.bonus_forca, fator),
    bonus_vitalidade: escalar(base.bonus_vitalidade, fator),
    bonus_inteligencia: escalar(base.bonus_inteligencia, fator),
    bonus_agilidade: escalar(base.bonus_agilidade, fator),
    bonus_velocidade: escalar(base.bonus_velocidade, fator),
  };
}

module.exports = {
  fatorRefinamento,
  propriedadesEfetivasArma,
  propriedadesEfetivasArmadura,
  BONUS_ATRIBUTO_REFINAMENTO_PCT,
};
