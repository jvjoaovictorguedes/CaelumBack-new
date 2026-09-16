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

// Ataque básico depende da classe: guerreiro é forte na unha (ou com
// arma), mago é fraco nisso — o forte do mago é poder/mana, não o
// ataque básico. multiplicador_dano_fisico vem da Classe (1.2 pro
// guerreiro, 0.5 pro mago; 1.0 se não tiver classe/valor configurado).
// Só afeta ataque básico — calcularEfeitoPoder (poderes) não usa isso,
// de propósito: é onde o mago é forte.
function multiplicadorDeClasse(atacante) {
  return atacante.multiplicador_dano_fisico ?? 1;
}

// Dano esperado (sem aleatoriedade) — usado só pra calibrar a vida/dano
// do inimigo em combatController.gerarInimigo, nunca pra dano real de
// combate (isso é calcularDanoBasico, abaixo).
//
// Usa o maior entre o ataque físico esperado (já nerfado pra classes
// mágicas) e um "potencial via poder" estimado pela inteligência. Sem
// isso, um mago que investiu tudo em inteligência e quase nada em
// força ficava com o pior dos dois mundos: o inimigo calibrado pro
// ataque básico fraquíssimo dele (então baratinho de matar), mas o
// dano do inimigo calibrado pela vida real do mago (que não é tão
// baixa) — o combate virava perdível mesmo jogando bem, porque na
// prática um mago ataca com poder, não no tapa.
function danoBasicoEsperado(atacante) {
  const fisico =
    (atacante.arma_equipada
      ? (atacante.arma_equipada.dano_min + atacante.arma_equipada.dano_max) / 2 +
        (atacante.forca || 0) * 0.5
      : 4 + (atacante.forca || 0) * 0.9) * multiplicadorDeClasse(atacante);

  const potencialViaPoder = 4 + (atacante.inteligencia || 0) * 0.5;

  return Math.max(fisico, potencialViaPoder);
}

function calcularDanoBasico(atacante) {
  // Com arma equipada, o dano_min/dano_max dela é o que manda — a força
  // só soma em cima, nunca deixa o resultado cair abaixo do dano_min da
  // arma (antes o ataque básico ignorava esses campos e só olhava a
  // força, então uma espada com "dano mínimo 15" podia causar menos que
  // isso na prática). O multiplicador de classe entra por último, em
  // cima do resultado já rolado.
  const multiplicador = multiplicadorDeClasse(atacante);

  if (atacante.arma_equipada) {
    const { dano_min, dano_max } = atacante.arma_equipada;
    const rolagemArma = dano_min + Math.random() * Math.max(0, dano_max - dano_min);
    const bonusForca = (atacante.forca || 0) * 0.5;
    return Math.max(1, Math.round((rolagemArma + bonusForca) * multiplicador));
  }

  const base = 4 + atacante.forca * 0.9;
  const variacao = 0.85 + Math.random() * 0.3;
  return Math.max(1, Math.round(base * variacao * multiplicador));
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

// multiplicador_vida_por_nivel/multiplicador_mana_por_nivel vêm da
// Classe (guerreiro é mais vida e menos mana, mago o contrário) — sem
// esses multiplicadores, todo mundo tem a mesma vida/mana pra mesma
// vitalidade/inteligência, e as classes ficam mecanicamente idênticas.
function vidaMaximaDe(personagem) {
  const base = 30 + (personagem.vitalidade || 0) * 6;
  return Math.round(base * (personagem.multiplicador_vida_por_nivel ?? 1));
}

function manaMaximaDe(personagem) {
  const base = 20 + (personagem.inteligencia || 0) * 5;
  return Math.round(base * (personagem.multiplicador_mana_por_nivel ?? 1));
}

// Anexa os 3 multiplicadores da Classe (vida/mana/dano físico) num
// personagem, pra calcularDanoBasico/vidaMaximaDe/manaMaximaDe acima
// enxergarem. Sem classe (ou campo não configurado), fica tudo em 1.0
// — comportamento neutro, igual a antes desses multiplicadores
// existirem.
function comMultiplicadoresDeClasse(personagem, classe) {
  return {
    ...personagem,
    multiplicador_vida_por_nivel: classe?.multiplicador_vida_por_nivel ?? 1,
    multiplicador_mana_por_nivel: classe?.multiplicador_mana_por_nivel ?? 1,
    multiplicador_dano_fisico: classe?.multiplicador_dano_fisico ?? 1,
  };
}

module.exports = {
  ATRIBUTO_PARA_CAMPO,
  calcularDanoBasico,
  danoBasicoEsperado,
  calcularEfeitoPoder,
  chanceDeEsquiva,
  vidaMaximaDe,
  manaMaximaDe,
  comMultiplicadoresDeClasse,
};
