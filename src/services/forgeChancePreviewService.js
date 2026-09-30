// Profissão de Ferreiro §10/§13.3 — breakdown server-side das chances,
// pra UI (aba Ferraria/Habilidades de Ferreiro) e pro Simulador do
// Admin usarem a MESMA lógica das ações reais (nunca uma fórmula
// paralela). Refinamento já tem seu próprio breakdown completo em
// forgeRefinementService.previaRefinamento (precisa de id_instancia
// pra resolver categoria/raridade/materiais) — não duplicado aqui.
const CharacterForgeProgress = require("../models/CharacterForgeProgress");
const forgeConfig = require("../config/forgeConfig");
const { nivelPorXpTotal } = require("./forgeProgressionService");
const forgeBonusesService = require("./forgeBonusesService");
const { bonusesAtivosPara } = require("./guildBuffService");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

async function nivelForjaDoPersonagem(characterId) {
  const progresso = await CharacterForgeProgress.findOne({ where: { id_personagem: characterId } });
  return nivelPorXpTotal(progresso?.experiencia ?? 0);
}

// area=Fundicao — chance de barra bônus (spec §6.2/§13.2 "Fole").
async function previewFundicao(characterId) {
  const nivelForja = await nivelForjaDoPersonagem(characterId);
  const chanceBasePpm = forgeConfig.CHANCE_BARRA_BONUS_PPM_POR_NIVEL[nivelForja] ?? 0;
  const bonusFerramentaPpm = await forgeBonusesService.bonusFundicaoPpm(characterId, null);
  const chanceFinalPpm = chanceBasePpm + bonusFerramentaPpm;
  return {
    area: "Fundicao",
    nivel_forja: nivelForja,
    chance_base_percentual: chanceBasePpm / 10_000,
    bonus_ferramenta_percentual: bonusFerramentaPpm / 10_000,
    chance_final_percentual: chanceFinalPpm / 10_000,
  };
}

// area=Fabricacao — distribuição de qualidade final (spec §6.2/§13.2
// "Martelo"). qualidadeBase é a qualidade do material escolhido.
async function previewFabricacao(characterId, qualidadeBase) {
  if (!forgeConfig.ORDEM_QUALIDADE.includes(qualidadeBase)) throw erro("Qualidade de material inválida.");
  const nivelForja = await nivelForjaDoPersonagem(characterId);
  const { forjaPontosPercentuais } = await bonusesAtivosPara(characterId, null);
  const bonusFerramentaPercentual = (await forgeBonusesService.bonusFabricacaoPpm(characterId, null)) / 10_000;
  const bonusTotalPercentual = forjaPontosPercentuais + bonusFerramentaPercentual;

  const { rolarDegrausQualidadeSuperior } = require("./forgeRollService");
  // Não rola de verdade — só reconstrói a MESMA distribuição que
  // rolarDegrausQualidadeSuperior usaria, pra exibição (nunca decide
  // nada aqui).
  const chancesBase = forgeConfig.CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL[nivelForja];
  if (!chancesBase) throw erro(`Sem tabela de chance de fabricação pro nível de Forja ${nivelForja}.`, 500);
  const somaDegraus = ["mais1", "mais2", "mais3", "mais4", "mais5"].reduce((s, k) => s + (chancesBase[k] ?? 0), 0);
  const mesmaQualidadePpm = 1_000_000 - somaDegraus;
  const bonusPpm = Math.min(mesmaQualidadePpm, Math.round((bonusTotalPercentual / 100) * 1_000_000));
  const chances = { ...chancesBase, mais1: (chancesBase.mais1 ?? 0) + bonusPpm };

  const indiceBase = forgeConfig.ORDEM_QUALIDADE.indexOf(qualidadeBase);
  const distribuicaoFinal = {};
  for (let degrau = 0; degrau <= 5; degrau += 1) {
    const indiceFinal = Math.min(forgeConfig.ORDEM_QUALIDADE.length - 1, indiceBase + degrau);
    const qualidadeFinal = forgeConfig.ORDEM_QUALIDADE[indiceFinal];
    const chavePpm = degrau === 0 ? "mesma" : `mais${degrau}`;
    const ppm = chances[chavePpm] ?? 0;
    if (ppm > 0 || degrau === 0) distribuicaoFinal[qualidadeFinal] = (distribuicaoFinal[qualidadeFinal] ?? 0) + ppm / 10_000;
  }

  return {
    area: "Fabricacao",
    nivel_forja: nivelForja,
    qualidade_base: qualidadeBase,
    bonus_guilda_percentual: forjaPontosPercentuais,
    bonus_ferramenta_percentual: bonusFerramentaPercentual,
    distribuicao_final_percentual: distribuicaoFinal,
  };
}

module.exports = { previewFundicao, previewFabricacao };
