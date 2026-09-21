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
// Garante um MÍNIMO DE +1 POR NÍVEL, não só uma vez ao sair do +0 —
// sem isso (versão anterior), um atributo baixo (dano 5-8 de arma
// Comum) ganhava +1 ao refinar pra +1, e depois ficava TRAVADO nesse
// mesmo valor por +2, +3, +4... até o % ultrapassar 1 ponto sozinho —
// jogador via o item mudar no +1 e "parar" nos seguintes, achando que
// quebrou de novo. Agora cada refinamento N garante pelo menos +N
// sobre a base (nunca menos que o refinamento anterior + 1), então
// toda vez que o jogador refina, o número na tela muda — mesmo que o
// % configurado (BONUS_ATRIBUTO_REFINAMENTO_PCT) ainda não tenha
// alcançado esse tanto. Em itens fortes o % ultrapassa esse piso cedo
// e assume o controle normalmente (ver forgeConfig.js).
function escalar(valor, fator, refinamento) {
  const numero = Number(valor) || 0;
  if (numero <= 0) return numero;
  const percentual = fator - 1;
  if (percentual <= 0) return numero;
  const bonusCalculado = Math.round(numero * percentual);
  return numero + Math.max(refinamento, bonusCalculado);
}

// `arma`/`armadura` aceitam tanto a instância Sequelize quanto um
// objeto plano (.toJSON() já resolvido) — sempre devolve objeto plano.
function propriedadesEfetivasArma(weaponProperties, refinamento) {
  if (!weaponProperties) return null;
  const base = weaponProperties.toJSON ? weaponProperties.toJSON() : weaponProperties;
  const fator = fatorRefinamento(refinamento);
  return {
    ...base,
    dano_min: escalar(base.dano_min, fator, refinamento),
    dano_max: escalar(base.dano_max, fator, refinamento),
    valor_bonus_atributo: escalar(base.valor_bonus_atributo, fator, refinamento),
  };
}

function propriedadesEfetivasArmadura(armorProperties, refinamento) {
  if (!armorProperties) return null;
  const base = armorProperties.toJSON ? armorProperties.toJSON() : armorProperties;
  const fator = fatorRefinamento(refinamento);
  return {
    ...base,
    defesa: escalar(base.defesa, fator, refinamento),
    bonus_forca: escalar(base.bonus_forca, fator, refinamento),
    bonus_vitalidade: escalar(base.bonus_vitalidade, fator, refinamento),
    bonus_inteligencia: escalar(base.bonus_inteligencia, fator, refinamento),
    bonus_agilidade: escalar(base.bonus_agilidade, fator, refinamento),
    bonus_velocidade: escalar(base.bonus_velocidade, fator, refinamento),
  };
}

module.exports = {
  fatorRefinamento,
  propriedadesEfetivasArma,
  propriedadesEfetivasArmadura,
  BONUS_ATRIBUTO_REFINAMENTO_PCT,
};
