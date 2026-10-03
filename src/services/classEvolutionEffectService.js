// Classes V2 §10 — efeitos mecânicos configuráveis de uma evolução
// (ClassEvolutionEffect). Catálogo FECHADO: o schema documenta as 11
// effect_keys do desenho original (ver o ENUM no model), mas só as
// listadas em EFFECT_KEYS_IMPLEMENTADAS abaixo podem ser
// criadas/editadas pelo Admin (classEvolutionEffectAdminService valida
// contra esta lista) e só elas são de fato interpretadas em combate —
// nenhum effect_key novo passa a fazer algo só por existir no banco
// (§10 "nenhum efeito executa lógica arbitrária vinda do banco").
//
// DAMAGE_REDUCTION continua resolvido à parte (ver
// resolverBonusDeEfeitosDeEvolucao): soma `valor` pontos de defesa
// extra, pela MESMA função central que já soma equipamento/passivas/
// sets/evolução de classe (equipmentBonusService.buscarBonusDeAtributos)
// — reaproveita a fórmula de mitigação já existente
// (combatFormulas.aplicarMitigacaoDeDefesa), sem precisar de nenhum
// ramo novo no motor de combate.
//
// Habilidades V2.0 (item 8) — as 7 effect_keys abaixo (LIFESTEAL,
// MANA_COST_REDUCTION, COOLDOWN_REDUCTION, CRITICAL_CHANCE,
// CRITICAL_DAMAGE, DODGE_BONUS, HEALING_BONUS) agora também são
// resolvidas, mas por `resolverModificadoresDeEfeitosDeEvolucao`, no
// MESMO shape (Map effect_key->magnitude) que
// combatModifierService.resolverModificadoresDoPersonagem já usa pros
// PowerCombatEffect passivos. combatModifierService mescla as duas
// fontes num único Map antes de devolver pro motor de combate — nenhum
// dos 4 motores (PvE/PvP/Party/Boss) precisa de um ramo novo, eles já
// leem esse Map pros getters (multiplicadorCuraFeita,
// bonusChanceCriticoPct, lifestealPct, etc.).
//
// RAGE_STACK, LOW_HP_DAMAGE e SHIELD_ON_CAST ficam de fora: são
// mecânicas condicionais/com estado (stack que cresce por golpe, bônus
// só abaixo de X% de vida, escudo disparado no cast) que não cabem num
// bônus passivo flat — exigiriam um gatilho reativo de verdade (ver
// combatModifierService.dispararGatilho, ainda não chamado do motor
// real) e ficam documentadas pra uma entrega futura.
const EFFECT_KEYS_IMPLEMENTADAS = [
  "DAMAGE_REDUCTION",
  "LIFESTEAL",
  "MANA_COST_REDUCTION",
  "COOLDOWN_REDUCTION",
  "CRITICAL_CHANCE",
  "CRITICAL_DAMAGE",
  "DODGE_BONUS",
  "HEALING_BONUS",
];

// Mapeia effect_key de ClassEvolutionEffect -> effect_key de
// combatModifierConfig (mesmo catálogo que PowerCombatEffect usa), pra
// reaproveitar os getters já existentes sem duplicar fórmula nenhuma.
// MANA_COST_REDUCTION inverte o sinal: valor=20 significa "reduz 20% do
// custo", e MANA_COST_PCT é somado como 1 + valor/100 (negativo reduz).
const EFFECT_KEY_PARA_MODIFICADOR = {
  LIFESTEAL: { chave: "LIFESTEAL_PCT", sinal: 1 },
  MANA_COST_REDUCTION: { chave: "MANA_COST_PCT", sinal: -1 },
  COOLDOWN_REDUCTION: { chave: "COOLDOWN_REDUCTION_TURNS", sinal: 1 },
  CRITICAL_CHANCE: { chave: "CRIT_CHANCE_PCT", sinal: 1 },
  CRITICAL_DAMAGE: { chave: "CRIT_DAMAGE_PCT", sinal: 1 },
  DODGE_BONUS: { chave: "DODGE_CHANCE_PCT", sinal: 1 },
  HEALING_BONUS: { chave: "HEALING_DONE_PCT", sinal: 1 },
};

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

function validarEffectKeyImplementada(effectKey) {
  if (!EFFECT_KEYS_IMPLEMENTADAS.includes(effectKey)) {
    throw erro(
      `"${effectKey}" ainda não tem efeito implementado no motor de combate — só ${EFFECT_KEYS_IMPLEMENTADAS.join(", ")} pode ser cadastrado por enquanto.`,
    );
  }
}

// Soma de bônus derivados de efeitos ativos (hoje só DAMAGE_REDUCTION
// -> defesa) pras evoluções de classe REALMENTE adquiridas pelo
// personagem (nunca materializado, nunca lido de backfill legado —
// mesmo filtro de classEvolutionBonusService.resolverBonusDeEvolucaoDeClasse).
async function resolverBonusDeEfeitosDeEvolucao(idPersonagem, transaction) {
  const CharacterClassEvolution = require("../models/CharacterClassEvolution");
  const ClassEvolutionEffect = require("../models/ClassEvolutionEffect");

  const evolucoes = await CharacterClassEvolution.findAll({
    where: { id_personagem: idPersonagem, legacy_bonus_materializado: false },
    transaction,
  });
  if (evolucoes.length === 0) return { defesa: 0 };

  const efeitos = await ClassEvolutionEffect.findAll({
    where: { id_evolucao: evolucoes.map((e) => e.id_evolucao), ativo: true, effect_key: "DAMAGE_REDUCTION" },
    transaction,
  });

  let defesa = 0;
  for (const efeito of efeitos) {
    defesa += efeito.valor || 0;
  }
  return { defesa };
}

// Item 8 — resolve as 7 effect_keys "de modificador" (tudo em
// EFFECT_KEY_PARA_MODIFICADOR) num Map(effect_key -> magnitude) no
// MESMO shape que combatModifierService.resolverModificadores produz,
// pra ele mesclar com os modificadores de PowerCombatEffect. Mesmo
// filtro de "evolução realmente adquirida, nunca backfill legado" que
// resolverBonusDeEfeitosDeEvolucao já usa.
async function resolverModificadoresDeEfeitosDeEvolucao(idPersonagem, transaction) {
  const CharacterClassEvolution = require("../models/CharacterClassEvolution");
  const ClassEvolutionEffect = require("../models/ClassEvolutionEffect");

  const mapa = new Map();
  if (!idPersonagem) return mapa;

  const evolucoes = await CharacterClassEvolution.findAll({
    where: { id_personagem: idPersonagem, legacy_bonus_materializado: false },
    transaction,
  });
  if (evolucoes.length === 0) return mapa;

  const chavesEfeito = Object.keys(EFFECT_KEY_PARA_MODIFICADOR);
  const efeitos = await ClassEvolutionEffect.findAll({
    where: { id_evolucao: evolucoes.map((e) => e.id_evolucao), ativo: true, effect_key: chavesEfeito },
    transaction,
  });

  for (const efeito of efeitos) {
    const mapeamento = EFFECT_KEY_PARA_MODIFICADOR[efeito.effect_key];
    if (!mapeamento) continue;
    const atual = mapa.get(mapeamento.chave) ?? 0;
    mapa.set(mapeamento.chave, atual + (efeito.valor || 0) * mapeamento.sinal);
  }

  return mapa;
}

module.exports = {
  EFFECT_KEYS_IMPLEMENTADAS,
  validarEffectKeyImplementada,
  resolverBonusDeEfeitosDeEvolucao,
  resolverModificadoresDeEfeitosDeEvolucao,
};
