// Classes V2 §10 — efeitos mecânicos configuráveis de uma evolução
// (ClassEvolutionEffect). Catálogo FECHADO: o schema documenta as 11
// effect_keys do desenho original (ver o ENUM no model), mas só as
// listadas em EFFECT_KEYS_IMPLEMENTADAS abaixo podem ser
// criadas/editadas pelo Admin (classEvolutionEffectAdminService valida
// contra esta lista) e só elas são de fato interpretadas em combate —
// nenhum effect_key novo passa a fazer algo só por existir no banco
// (§10 "nenhum efeito executa lógica arbitrária vinda do banco").
//
// DAMAGE_REDUCTION é o único efeito com integração real nesta entrega:
// soma `valor` pontos de defesa extra, resolvido sob demanda pela MESMA
// função central que já soma equipamento/passivas/sets/evolução de
// classe (equipmentBonusService.buscarBonusDeAtributos) — reaproveita a
// fórmula de mitigação já existente (combatFormulas.aplicarMitigacaoDeDefesa),
// sem precisar de nenhum ramo novo no motor de combate nem duplicar a
// integração nos ~16 pontos de chamada que já leem `defesa` de lá.
//
// As outras 10 effect_keys (RAGE_STACK, LIFESTEAL, LOW_HP_DAMAGE,
// MANA_COST_REDUCTION, COOLDOWN_REDUCTION, CRITICAL_CHANCE,
// CRITICAL_DAMAGE, DODGE_BONUS, HEALING_BONUS, SHIELD_ON_CAST) exigiriam
// mexer nos 4 motores de combate separados do jogo (PvE, PvP ao vivo/
// assíncrono, Ameaça Mundial, Party) — fora do escopo desta entrega de
// Classes V2; ficam documentadas no catálogo e reservadas pra uma
// entrega dedicada de efeitos de combate (ver relatório final).
const EFFECT_KEYS_IMPLEMENTADAS = ["DAMAGE_REDUCTION"];

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

module.exports = { EFFECT_KEYS_IMPLEMENTADAS, validarEffectKeyImplementada, resolverBonusDeEfeitosDeEvolucao };
