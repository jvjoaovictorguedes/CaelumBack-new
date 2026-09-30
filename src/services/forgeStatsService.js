// Profissão de Ferreiro §7/§9 — atualiza CharacterForgeStats nos eventos
// REAIS (nunca na prévia/enfileiramento). Toda função recebe a
// transaction do chamador — nunca abre a própria.
const CharacterForgeStats = require("../models/CharacterForgeStats");

async function garantir(characterId, transaction) {
  const [stats] = await CharacterForgeStats.findOrCreate({
    where: { id_personagem: characterId },
    defaults: { id_personagem: characterId },
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
  return stats;
}

async function registrarFundicao(characterId, quantidadeBarras, transaction) {
  const stats = await garantir(characterId, transaction);
  stats.barras_fundidas += quantidadeBarras;
  await stats.save({ transaction });
}

async function registrarFabricacao(characterId, qualidadeFinal, transaction) {
  const stats = await garantir(characterId, transaction);
  stats.equipamentos_fabricados += 1;
  stats.qualidades_fabricadas = {
    ...stats.qualidades_fabricadas,
    [qualidadeFinal]: (stats.qualidades_fabricadas[qualidadeFinal] ?? 0) + 1,
  };
  stats.changed("qualidades_fabricadas", true);
  await stats.save({ transaction });
}

async function registrarRefinamento(characterId, sucesso, nivelAlvoResultante, transaction) {
  const stats = await garantir(characterId, transaction);
  if (sucesso) {
    stats.refinamentos_sucesso += 1;
    if (nivelAlvoResultante > stats.maior_refinamento_alcancado) {
      stats.maior_refinamento_alcancado = nivelAlvoResultante;
    }
  } else {
    stats.refinamentos_falha += 1;
  }
  await stats.save({ transaction });
}

async function registrarReceitaAprendida(characterId, raridade, transaction) {
  const stats = await garantir(characterId, transaction);
  if (raridade === "Comum") stats.receitas_aprendidas_comum += 1;
  else if (raridade === "Raro") stats.receitas_aprendidas_raro += 1;
  else if (raridade === "Lendario") stats.receitas_aprendidas_lendario += 1;
  await stats.save({ transaction });
}

async function obterResumo(characterId) {
  const stats = await CharacterForgeStats.findOne({ where: { id_personagem: characterId } });
  if (!stats) {
    return {
      barras_fundidas: 0,
      equipamentos_fabricados: 0,
      refinamentos_sucesso: 0,
      refinamentos_falha: 0,
      maior_refinamento_alcancado: 0,
      qualidades_fabricadas: {},
      receitas_aprendidas: { Comum: 0, Raro: 0, Lendario: 0 },
    };
  }
  return {
    barras_fundidas: stats.barras_fundidas,
    equipamentos_fabricados: stats.equipamentos_fabricados,
    refinamentos_sucesso: stats.refinamentos_sucesso,
    refinamentos_falha: stats.refinamentos_falha,
    maior_refinamento_alcancado: stats.maior_refinamento_alcancado,
    qualidades_fabricadas: stats.qualidades_fabricadas,
    receitas_aprendidas: {
      Comum: stats.receitas_aprendidas_comum,
      Raro: stats.receitas_aprendidas_raro,
      Lendario: stats.receitas_aprendidas_lendario,
    },
  };
}

module.exports = {
  garantir,
  registrarFundicao,
  registrarFabricacao,
  registrarRefinamento,
  registrarReceitaAprendida,
  obterResumo,
};
