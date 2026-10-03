// Habilidades V2.0 (item 8) — ClassEvolutionEffect agora alimenta
// combatModifierService.resolverModificadoresDoPersonagem pras 7
// effect_keys "de modificador" (LIFESTEAL/MANA_COST_REDUCTION/
// COOLDOWN_REDUCTION/CRITICAL_CHANCE/CRITICAL_DAMAGE/DODGE_BONUS/
// HEALING_BONUS), mesmo Map que já soma PowerCombatEffect passivo —
// qualquer motor de combate (PvE/PvP/Party/Boss) que já chama essa
// função ganha o bônus de evolução de classe sem nenhum ramo novo.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const ClassEvolutionPath = require("../src/models/ClassEvolutionPath");
const CharacterClassEvolution = require("../src/models/CharacterClassEvolution");
const ClassEvolutionEffect = require("../src/models/ClassEvolutionEffect");
const combatModifierService = require("../src/services/combatModifierService");
const {
  resolverModificadoresDeEfeitosDeEvolucao,
  EFFECT_KEYS_IMPLEMENTADAS,
} = require("../src/services/classEvolutionEffectService");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

test("EFFECT_KEYS_IMPLEMENTADAS inclui as 7 novas effect_keys de modificador além de DAMAGE_REDUCTION", () => {
  for (const chave of [
    "DAMAGE_REDUCTION",
    "LIFESTEAL",
    "MANA_COST_REDUCTION",
    "COOLDOWN_REDUCTION",
    "CRITICAL_CHANCE",
    "CRITICAL_DAMAGE",
    "DODGE_BONUS",
    "HEALING_BONUS",
  ]) {
    assert.ok(EFFECT_KEYS_IMPLEMENTADAS.includes(chave), `${chave} deveria estar implementada`);
  }
});

async function criarEvolucaoComEfeito(personagem, effectKey, valor) {
  const caminho = await ClassEvolutionPath.create({
    id_classe: personagem.id_classe,
    slug: `caminho-mod-${sufixo()}`,
    estagio: 1,
    nome: "Caminho de Modificador",
    descricao: "Caminho de teste.",
    nivel_necessario: 40,
  });
  const evolucao = await CharacterClassEvolution.create({
    id_personagem: personagem.id,
    id_evolucao: caminho.id,
    estagio: 1,
  });
  const efeito = await ClassEvolutionEffect.create({
    id_evolucao: caminho.id,
    effect_key: effectKey,
    valor,
    ativo: true,
  });
  return {
    caminho,
    evolucao,
    efeito,
    async limpar() {
      await ClassEvolutionEffect.destroy({ where: { id: efeito.id } });
      await CharacterClassEvolution.destroy({ where: { id: evolucao.id } });
      await ClassEvolutionPath.destroy({ where: { id: caminho.id } });
    },
  };
}

testeComBanco(
  "resolverModificadoresDeEfeitosDeEvolucao: LIFESTEAL vira LIFESTEAL_PCT direto",
  async () => {
    const { personagem } = await criarPersonagem({ nivel: 50 });
    const ctx = await criarEvolucaoComEfeito(personagem, "LIFESTEAL", 25);
    try {
      const mapa = await resolverModificadoresDeEfeitosDeEvolucao(personagem.id);
      assert.equal(mapa.get("LIFESTEAL_PCT"), 25);
    } finally {
      await ctx.limpar();
    }
  },
);

testeComBanco(
  "resolverModificadoresDeEfeitosDeEvolucao: MANA_COST_REDUCTION inverte o sinal (reduz, nunca aumenta)",
  async () => {
    const { personagem } = await criarPersonagem({ nivel: 50 });
    const ctx = await criarEvolucaoComEfeito(personagem, "MANA_COST_REDUCTION", 20);
    try {
      const mapa = await resolverModificadoresDeEfeitosDeEvolucao(personagem.id);
      assert.equal(mapa.get("MANA_COST_PCT"), -20, "valor=20 de redução vira -20 no modificador de custo");
      assert.equal(
        combatModifierService.multiplicadorCustoMana(mapa),
        0.8,
        "multiplicador final de custo de mana cai pra 80%",
      );
    } finally {
      await ctx.limpar();
    }
  },
);

testeComBanco(
  "resolverModificadoresDoPersonagem mescla ClassEvolutionEffect com PowerCombatEffect no MESMO Map, sem duplicar DEFENSE_FLAT",
  async () => {
    const { personagem } = await criarPersonagem({ nivel: 50 });
    const ctx = await criarEvolucaoComEfeito(personagem, "CRITICAL_CHANCE", 10);
    try {
      const mapa = await combatModifierService.resolverModificadoresDoPersonagem(personagem, "PVE");
      assert.equal(combatModifierService.bonusChanceCriticoPct(mapa), 10);
      assert.equal(mapa.has("DEFENSE_FLAT"), false, "DAMAGE_REDUCTION nunca entra aqui (já é somado via equipmentBonusService)");
    } finally {
      await ctx.limpar();
    }
  },
);

test.after(async () => {
  await sequelize.close();
});
