// Sorteios do Modo Aventura (§6/§7/§8) — sempre crypto.randomInt, nunca
// Math.random, mesmo raciocínio de dropService.js/raridadeRolagemService.js:
// aparição de monstro e nível dele são "vale a pena tentar prever", já
// que afetam recompensa (§11/§12).
const crypto = require("crypto");

// Mesmo truque de escala inteira do dropService.sortearComPeso — crypto.randomInt
// não aceita float, então rola sobre uma escala inteira e divide de volta.
const ESCALA = 1000;

// Escolhe um AdventureZoneMonster da lista respeitando peso_aparicao
// (§6/§7 — nunca hardcoded, sempre o peso configurado no banco).
function sortearMonstroDaZona(zoneMonsters) {
  const ativos = zoneMonsters.filter((zm) => zm.ativo !== false);
  const pesoTotal = ativos.reduce((soma, zm) => soma + zm.peso_aparicao, 0);
  if (pesoTotal <= 0) return null;

  let alvo = crypto.randomInt(0, Math.round(pesoTotal * ESCALA));
  for (const zm of ativos) {
    alvo -= zm.peso_aparicao * ESCALA;
    if (alvo < 0) return zm;
  }
  return ativos[ativos.length - 1];
}

// Sorteia o nível do monstro dentro da faixa (§8) — usa o override do
// AdventureZoneMonster quando presente (Raro geralmente usa isso pra
// ficar perto do topo da faixa da zona), senão cai pra faixa da própria
// AdventureZone.
function sortearNivelMonstro(zoneMonster, zone) {
  const min = zoneMonster.nivel_min_override ?? zone.nivel_monstro_min;
  const max = zoneMonster.nivel_max_override ?? zone.nivel_monstro_max;
  if (max <= min) return min;
  return crypto.randomInt(min, max + 1);
}

module.exports = { sortearMonstroDaZona, sortearNivelMonstro };
