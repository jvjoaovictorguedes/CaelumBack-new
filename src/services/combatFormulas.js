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

// Antes, subir de nível só rendia pontos_distribuir — vida/mana/dano
// básico só cresciam se o jogador escolhesse gastar ponto em
// vitalidade/inteligência/força. Um personagem que gastasse tudo em
// outro atributo ficava com a vida de nível 1 pra sempre, não importa
// o nível. Esses "BASE_POR_NIVEL" garantem um crescimento mínimo
// atrelado só ao nível (nível 1 = nenhum bônus ainda, dai em diante
// cada nível seguinte soma um pouco), multiplicado pelo mesmo
// multiplicador de Classe que já afeta o resto — guerreiro ganha mais
// vida por nível, mago ganha mais mana por nível, etc.
const VIDA_BASE_POR_NIVEL = 5;
const MANA_BASE_POR_NIVEL = 4;
const DANO_FISICO_BASE_POR_NIVEL = 0.6;
const DANO_MAGICO_BASE_POR_NIVEL = 0.6;

function bonusPorNivel(personagem, baseNivel) {
  return Math.max(0, (personagem.nivel || 1) - 1) * baseNivel;
}

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
  const bonusNivel = bonusPorNivel(atacante, DANO_FISICO_BASE_POR_NIVEL);
  const fisico =
    ((atacante.arma_equipada
      ? (atacante.arma_equipada.dano_min + atacante.arma_equipada.dano_max) / 2 +
        (atacante.forca || 0) * 0.5
      : 4 + (atacante.forca || 0) * 0.9) + bonusNivel) * multiplicadorDeClasse(atacante);

  const potencialViaPoder = 4 + (atacante.inteligencia || 0) * 0.5 + bonusPorNivel(atacante, DANO_MAGICO_BASE_POR_NIVEL);

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
  const bonusNivel = bonusPorNivel(atacante, DANO_FISICO_BASE_POR_NIVEL);

  if (atacante.arma_equipada) {
    const { dano_min, dano_max } = atacante.arma_equipada;
    const rolagemArma = dano_min + Math.random() * Math.max(0, dano_max - dano_min);
    const bonusForca = (atacante.forca || 0) * 0.5;
    return Math.max(1, Math.round((rolagemArma + bonusForca + bonusNivel) * multiplicador));
  }

  const base = 4 + atacante.forca * 0.9 + bonusNivel;
  const variacao = 0.85 + Math.random() * 0.3;
  return Math.max(1, Math.round(base * variacao * multiplicador));
}

function calcularEfeitoPoder(power, personagem) {
  const campoAtributo = ATRIBUTO_PARA_CAMPO[power.escala_atributo] || "forca";
  const valorAtributo = personagem[campoAtributo] || 0;
  const variacao = 0.9 + Math.random() * 0.2;
  const bonusNivel = bonusPorNivel(personagem, DANO_MAGICO_BASE_POR_NIVEL);
  // multiplicador_dano_magico só afeta o dano do poder, não a cura —
  // um mago forte em dano não devia automaticamente curar mais forte
  // só por isso.
  const multiplicadorMagico = personagem.multiplicador_dano_magico ?? 1;

  const dano = power.dano_base
    ? Math.round((power.dano_base + valorAtributo * power.valor_escala + bonusNivel) * variacao * multiplicadorMagico)
    : 0;

  const cura = power.cura_base
    ? Math.round((power.cura_base + valorAtributo * power.valor_escala + bonusNivel) * variacao)
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
  const base = 30 + (personagem.vitalidade || 0) * 6 + bonusPorNivel(personagem, VIDA_BASE_POR_NIVEL);
  return Math.round(base * (personagem.multiplicador_vida_por_nivel ?? 1));
}

function manaMaximaDe(personagem) {
  const base = 20 + (personagem.inteligencia || 0) * 5 + bonusPorNivel(personagem, MANA_BASE_POR_NIVEL);
  return Math.round(base * (personagem.multiplicador_mana_por_nivel ?? 1));
}

// Anexa os 4 multiplicadores da Classe (vida/mana/dano físico/dano
// mágico) num personagem, pra calcularDanoBasico/vidaMaximaDe/
// manaMaximaDe/calcularEfeitoPoder acima enxergarem. Sem classe (ou
// campo não configurado), fica tudo em 1.0 — comportamento neutro,
// igual a antes desses multiplicadores existirem.
function comMultiplicadoresDeClasse(personagem, classe) {
  return {
    ...personagem,
    multiplicador_vida_por_nivel: classe?.multiplicador_vida_por_nivel ?? 1,
    multiplicador_mana_por_nivel: classe?.multiplicador_mana_por_nivel ?? 1,
    multiplicador_dano_fisico: classe?.multiplicador_dano_fisico ?? 1,
    multiplicador_dano_magico: classe?.multiplicador_dano_magico ?? 1,
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
