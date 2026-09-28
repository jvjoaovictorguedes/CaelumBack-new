// Classes V2 §7 — bônus de Evolução de Classe resolvido SOB DEMANDA, na
// mesma filosofia já usada por equipamento/passivas/sets
// (equipmentBonusService.js): nunca gravado permanentemente em
// Character.forca/vitalidade/etc. Uma evolução V2 nova nunca materializa
// nada — só os registros de BACKFILL (personagens que já evoluíram na
// V1, legacy_bonus_materializado=true) têm o bônus embutido nos
// atributos-base, e por isso são explicitamente ignorados aqui pra não
// contar em dobro.
const CharacterClassEvolution = require("../models/CharacterClassEvolution");
const ClassEvolutionPath = require("../models/ClassEvolutionPath");

function bonusZerado() {
  return { forca: 0, vitalidade: 0, agilidade: 0, inteligencia: 0, velocidade: 0 };
}

// Devolve a soma dos bônus de TODAS as evoluções de classe adquiridas
// pelo personagem cujo bônus ainda não está materializado no Character
// (ou seja: tudo que veio do fluxo V2, nunca o backfill de personagens
// legados). `transaction` opcional — mesmo motivo de
// equipmentBonusService.buscarBonusDeAtributos: ler dentro da mesma
// transação que acabou de gravar uma evolução nova.
async function resolverBonusDeEvolucaoDeClasse(idPersonagem, transaction) {
  const evolucoes = await CharacterClassEvolution.findAll({
    where: { id_personagem: idPersonagem, legacy_bonus_materializado: false },
    transaction,
  });

  const bonus = bonusZerado();
  if (evolucoes.length === 0) return bonus;

  const caminhos = await ClassEvolutionPath.findAll({
    where: { id: evolucoes.map((e) => e.id_evolucao) },
    transaction,
  });
  const caminhoPorId = new Map(caminhos.map((c) => [c.id, c]));

  for (const evolucao of evolucoes) {
    const caminho = caminhoPorId.get(evolucao.id_evolucao);
    if (!caminho) continue;
    bonus.forca += caminho.bonus_forca || 0;
    bonus.vitalidade += caminho.bonus_vitalidade || 0;
    bonus.agilidade += caminho.bonus_agilidade || 0;
    bonus.inteligencia += caminho.bonus_inteligencia || 0;
    bonus.velocidade += caminho.bonus_velocidade || 0;
  }

  return bonus;
}

module.exports = { resolverBonusDeEvolucaoDeClasse, bonusZerado };
