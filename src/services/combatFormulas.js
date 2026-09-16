// Fórmulas de combate compartilhadas entre PvE (combatController) e PvP
// (pvpController). Mantidas num só lugar pra não desbalancear um sem
// perceber que o outro também mudou.

const ATRIBUTO_PARA_CAMPO = {
  Forca: "forca",
  Vitalidade: "vitalidade",
  Agilidade: "agilidade",
  Inteligencia: "inteligencia",
  Velocidade: "velocidade",
};

// Dano esperado (sem aleatoriedade) do ataque básico — usado pra
// balancear o inimigo em combatController.gerarInimigo. Tem que ficar
// coerente com calcularDanoBasico abaixo, senão o balanceamento (que
// assume esse número como "dano médio por turno") desalinha.
function danoBasicoEsperado(atacante) {
  if (atacante.arma_equipada) {
    const { dano_min, dano_max } = atacante.arma_equipada;
    const mediaArma = (dano_min + dano_max) / 2;
    return mediaArma + (atacante.forca || 0) * 0.5;
  }
  return 4 + (atacante.forca || 0) * 0.9;
}

function calcularDanoBasico(atacante) {
  // Com arma equipada, o dano_min/dano_max dela é o que manda — a força
  // só soma em cima, nunca deixa o resultado cair abaixo do dano_min da
  // arma (antes o ataque básico ignorava esses campos e só olhava a
  // força, então uma espada com "dano mínimo 15" podia causar menos que
  // isso na prática).
  if (atacante.arma_equipada) {
    const { dano_min, dano_max } = atacante.arma_equipada;
    const rolagemArma = dano_min + Math.random() * Math.max(0, dano_max - dano_min);
    const bonusForca = (atacante.forca || 0) * 0.5;
    return Math.max(1, Math.round(rolagemArma + bonusForca));
  }

  const base = 4 + atacante.forca * 0.9;
  const variacao = 0.85 + Math.random() * 0.3;
  return Math.max(1, Math.round(base * variacao));
}

function calcularEfeitoPoder(power, personagem) {
  const campoAtributo = ATRIBUTO_PARA_CAMPO[power.escala_atributo] || "forca";
  const valorAtributo = personagem[campoAtributo] || 0;
  const variacao = 0.9 + Math.random() * 0.2;

  const dano = power.dano_base
    ? Math.round((power.dano_base + valorAtributo * power.valor_escala) * variacao)
    : 0;

  const cura = power.cura_base
    ? Math.round((power.cura_base + valorAtributo * power.valor_escala) * variacao)
    : 0;

  return { dano, cura };
}

function chanceDeEsquiva(defensor, atacante) {
  const diferenca = (defensor.agilidade || 0) - (atacante.agilidade || 0);
  const chanceBase = 0.05;
  const chance = chanceBase + Math.max(0, diferenca) * 0.01;
  return Math.random() < Math.min(chance, 0.35);
}

function vidaMaximaDe(personagem) {
  return 30 + (personagem.vitalidade || 0) * 6;
}

function manaMaximaDe(personagem) {
  return 20 + (personagem.inteligencia || 0) * 5;
}

module.exports = {
  ATRIBUTO_PARA_CAMPO,
  calcularDanoBasico,
  danoBasicoEsperado,
  calcularEfeitoPoder,
  chanceDeEsquiva,
  vidaMaximaDe,
  manaMaximaDe,
};
