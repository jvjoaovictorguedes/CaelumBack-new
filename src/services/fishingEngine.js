// Motor determinístico da disputa de tensão/recolhimento (Pesca §14).
// Whitelist FECHADA de comportamentos (COMPORTAMENTOS, fishingConfig.js)
// — nunca eval/código vindo do banco (spec §14.5/§31). Toda aleatoriedade
// usada aqui é derivada de um PRNG seedado (mulberry32) pelo
// behavior_seed + sequence da sessão, nunca Math.random() direto — dá
// pra escrever teste de "comportamento determinístico por seed"
// (spec §35.1) chamando a mesma função duas vezes com o mesmo seed.
const { COMPORTAMENTOS, TENSAO_MAXIMA, ZONA_IDEAL_MIN, ZONA_IDEAL_MAX } = require("../config/fishingConfig");

// PRNG determinístico simples e rápido — suficiente pro minigame (não é
// criptográfico, não precisa ser).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngParaPasso(seed, sequence) {
  return mulberry32((Number(seed) * 2654435761 + Number(sequence) * 40503) >>> 0);
}

function comportamentoDe(key) {
  return COMPORTAMENTOS[key] ?? COMPORTAMENTOS.CALM;
}

// Resolve UM passo de recolhimento (uma chamada de /reel) — nunca decide
// nada fora daqui: nem controller nem fishingService recalculam
// tensão/progresso por conta própria (autoridade do servidor, spec §15).
//
// rod: { forca_linha, controle, recolhimento, precisao, estabilidade }
// (0..1000, já com refinamento aplicado — ver fishingRodService).
function resolverPassoDeReel({ behaviorKey, seed, sequence, tensaoAtual, progressoAtual, rod, active }) {
  const comportamento = comportamentoDe(behaviorKey);
  const rng = rngParaPasso(seed, sequence);
  const r = rng();

  const forcaLinha = rod?.forca_linha ?? 100;
  const controle = rod?.controle ?? 100;
  const recolhimento = rod?.recolhimento ?? 100;
  const estabilidade = rod?.estabilidade ?? 100;

  let tensao = tensaoAtual;
  let progresso = progressoAtual;
  let evento = "calmo";

  if (active) {
    // REEL ON — aumenta progresso e tensão (spec §14.4).
    progresso += 18 + Math.round((recolhimento / 1000) * 28);
    tensao += 22 - Math.round((forcaLinha / 1000) * 14);
  } else {
    // REEL OFF — reduz tensão, mas o peixe pode recuperar distância.
    tensao -= 20 + Math.round((controle / 1000) * 18);
  }

  // Comportamento do peixe: chance de "arrancada" (pico de tensão), com
  // estabilidade da vara suavizando o impacto (spec §14.4: "Estabilidade
  // suaviza arrancadas/oscilações").
  if (r < comportamento.picoChance) {
    evento = "arrancada";
    const suavizacao = 1 - (estabilidade / 1000) * 0.5;
    tensao += Math.round(comportamento.picoForca * suavizacao);
    if (!active) {
      // Peixe recupera parte da distância só quando o jogador NÃO está
      // recolhendo — mesma regra da barra ASCII da spec.
      progresso -= Math.round(progresso * comportamento.recuperacaoProgresso);
    }
  }

  tensao = Math.max(0, Math.min(TENSAO_MAXIMA + 200, tensao)); // teto com folga pra detectar rompimento fora do clamp duro
  progresso = Math.max(0, progresso);

  return { tensao, progresso, evento, na_zona_ideal: tensao >= ZONA_IDEAL_MIN && tensao <= ZONA_IDEAL_MAX };
}

module.exports = {
  mulberry32,
  rngParaPasso,
  comportamentoDe,
  resolverPassoDeReel,
};
