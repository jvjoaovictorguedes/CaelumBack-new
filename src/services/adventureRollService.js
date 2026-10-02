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

// Emboscada da Expedição (Mineração/Silvicultura/Exploração) — escolhe
// entre o pool curado pelo admin (AdventureMonster.disponivel_emboscada,
// ver expeditionService.coletar) o(s) monstro(s) com nível mais próximo
// do nível-alvo (nível de combate do jogador + deslocamento de
// dificuldade da região, calculado pelo caller). Sem peso configurável
// aqui — a emboscada nunca teve um conceito de "raridade" por monstro
// como as Áreas de Caça, só filtro de elegibilidade; sorteio uniforme
// entre os empatados na menor distância de nível evita sempre cair no
// mesmo monstro quando dois+ catálogos têm o nível ideal.
function sortearMonstroEmboscada(monstrosDisponiveis, nivelAlvo) {
  if (!monstrosDisponiveis || monstrosDisponiveis.length === 0) return null;

  let menorDistancia = Infinity;
  for (const monstro of monstrosDisponiveis) {
    const distancia = Math.abs((monstro.nivel ?? 1) - nivelAlvo);
    if (distancia < menorDistancia) menorDistancia = distancia;
  }
  const candidatos = monstrosDisponiveis.filter(
    (monstro) => Math.abs((monstro.nivel ?? 1) - nivelAlvo) === menorDistancia,
  );
  return candidatos[crypto.randomInt(0, candidatos.length)];
}

module.exports = { sortearMonstroDaZona, sortearNivelMonstro, sortearMonstroEmboscada };
