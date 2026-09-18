// Forja de Caelum — funde N itens da mesma categoria+raridade (mais
// ouro) em 1 item aleatório da categoria seguinte, uma raridade acima.
// Dá propósito de verdade pro loot "de sabor" que só servia pra vender
// (Pelo de Lobo, Presa Afiada etc.) e cria uma progressão gradual de
// equipamento sem depender só de drop/mercado.
//
// Mítico fica de fora de propósito (sem "Lendario -> Mitico" na tabela
// de custo): as duas Relíquias de Ascensão (classEvolutionService.js) e
// o Fragmento da Lâmina Celestial precisam continuar raros de verdade,
// só via drop — forjar em massa mataria a exclusividade deles.
const ORDEM_RARIDADE = ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"];

// Categorias com sentido de "virar mais forte" fundindo — Consumível,
// QuestItem e Currencia nunca fizeram parte de uma progressão de
// equipamento, então ficam de fora.
const CATEGORIAS_CRAFTAVEIS = ["Arma", "Armadura", "Capacete", "Escudo", "Material"];

// Quantidade de itens da raridade ATUAL + custo em ouro pra subir um
// degrau. Cresce mais rápido que o custo de evoluir habilidade (Fase 1
// dos Grimórios) de propósito: forjar é uma alternativa a caçar loot
// bom, não deveria ser mais barato que a sorte.
const CUSTO_POR_RARIDADE_ORIGEM = {
  Comum: { quantidade: 4, ouro: 30 },
  Incomum: { quantidade: 4, ouro: 90 },
  Raro: { quantidade: 3, ouro: 220 },
  Epico: { quantidade: 3, ouro: 500 },
};

function proximaRaridade(raridade) {
  const indice = ORDEM_RARIDADE.indexOf(raridade);
  if (indice === -1 || indice >= ORDEM_RARIDADE.length - 1) return null;
  return ORDEM_RARIDADE[indice + 1];
}

function custoDaForja(raridadeOrigem) {
  return CUSTO_POR_RARIDADE_ORIGEM[raridadeOrigem] ?? null;
}

module.exports = {
  ORDEM_RARIDADE,
  CATEGORIAS_CRAFTAVEIS,
  CUSTO_POR_RARIDADE_ORIGEM,
  proximaRaridade,
  custoDaForja,
};
