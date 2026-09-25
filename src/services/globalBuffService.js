// Painel Administrativo Fase 15 — leitura, pelo motor de jogo, dos Buffs
// Globais ativos AGORA. Nunca cacheada como gameSettingCache.js (aquele
// cache é pra valores praticamente estáticos entre edições admin; aqui
// o que muda a cada segundo é o RELÓGIO — um buff que "começa às 20h"
// precisa passar a valer exatamente às 20h, não até 60s depois). A
// tabela é pequena (poucos eventos de cada vez) e filtrada por índice
// (ativo, tipo, inicio, fim), então uma query por chamada é barata o
// bastante pra não precisar de cache.
const { Op } = require("sequelize");
const GlobalBuff = require("../models/GlobalBuff");

const TIPOS_VALIDOS = ["Xp", "Ouro", "DropAventura", "XpExpedicao"];

// Soma os percentuais de todo buff ATIVO cuja janela [inicio, fim]
// cobre o instante atual, agrupado por tipo — múltiplos eventos do
// mesmo tipo sobrepostos se somam (nunca "vence" um só). Devolve 0 pra
// tipo sem nenhum buff ativo (nunca undefined/NaN — quem chama nunca
// precisa de fallback próprio).
async function bonusesAtivosAgora() {
  const agora = new Date();
  const buffs = await GlobalBuff.findAll({
    where: { ativo: true, inicio: { [Op.lte]: agora }, fim: { [Op.gte]: agora } },
    attributes: ["tipo", "multiplicador_percentual"],
  });

  const somaPorTipo = Object.fromEntries(TIPOS_VALIDOS.map((t) => [t, 0]));
  for (const buff of buffs) {
    somaPorTipo[buff.tipo] += buff.multiplicador_percentual;
  }

  return {
    xpPercentual: somaPorTipo.Xp,
    ouroPercentual: somaPorTipo.Ouro,
    dropAventuraPercentual: somaPorTipo.DropAventura,
    xpExpedicaoPercentual: somaPorTipo.XpExpedicao,
  };
}

module.exports = { TIPOS_VALIDOS, bonusesAtivosAgora };
