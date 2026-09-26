// Fórmulas de combate compartilhadas entre PvE (combatController) e PvP
// (pvpController). Mantidas num só lugar pra não desbalancear um sem
// perceber que o outro também mudou.

const {
  multiplicadorEfeito: multiplicadorEfeitoPorNivelHabilidade,
  multiplicadorCustoMana: multiplicadorCustoManaPorNivelHabilidade,
} = require("./abilityLevelService");

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

// `nivelHabilidade` (1 a 10, default 1 pra quem chama sem passar nada —
// ex.: inimigo de PvE, que não tem CharacterAbilities) vem de
// abilityLevelService.js: cada nível investido multiplica dano/cura por
// cima de tudo (atributo, bônus de nível de personagem, classe).
function calcularEfeitoPoder(power, personagem, nivelHabilidade = 1) {
  const campoAtributo = ATRIBUTO_PARA_CAMPO[power.escala_atributo] || "forca";
  const valorAtributo = personagem[campoAtributo] || 0;
  const variacao = 0.9 + Math.random() * 0.2;
  const bonusNivel = bonusPorNivel(personagem, DANO_MAGICO_BASE_POR_NIVEL);
  const multiplicadorNivelHabilidade = multiplicadorEfeitoPorNivelHabilidade(nivelHabilidade);
  // O multiplicador de classe aplicado ao DANO depende de como o poder
  // escala: um poder de Inteligencia é mágico e usa multiplicador_dano_magico;
  // qualquer outra escala (Forca/Vitalidade/Agilidade/Velocidade) é marcial
  // e usa multiplicador_dano_fisico — senão um Guerreiro com habilidade de
  // Força era punido pelo multiplicador mágico fraco da própria classe dele,
  // igual ataque básico ficar mais forte que a habilidade. Nunca afeta a
  // cura — um mago forte em dano não devia automaticamente curar mais forte
  // só por isso.
  const multiplicadorClassePorPoder =
    power.escala_atributo === "Inteligencia"
      ? (personagem.multiplicador_dano_magico ?? 1)
      : (personagem.multiplicador_dano_fisico ?? 1);

  const dano = power.dano_base
    ? Math.round(
        (power.dano_base + valorAtributo * power.valor_escala + bonusNivel) *
          variacao *
          multiplicadorClassePorPoder *
          multiplicadorNivelHabilidade,
      )
    : 0;

  const cura = power.cura_base
    ? Math.round(
        (power.cura_base + valorAtributo * power.valor_escala + bonusNivel) *
          variacao *
          multiplicadorNivelHabilidade,
      )
    : 0;

  return { dano, cura };
}

// Custo de mana efetivo da habilidade, já considerando o desconto que os
// marcos de nível 5/10 dão (ver abilityLevelService.js) — usado tanto pra
// checar "tem mana suficiente?" quanto pra descontar de verdade, sempre
// os dois com a MESMA conta (senão um poder nível 10 mais barato podia
// ficar bloqueado por um check que ainda olhava o custo cheio).
function custoManaEfetivo(power, nivelHabilidade = 1) {
  return Math.round(power.custo_mana * multiplicadorCustoManaPorNivelHabilidade(nivelHabilidade));
}

// Versão DETERMINÍSTICA de calcularEfeitoPoder — mesma fórmula, mas com
// variação fixa em 1,00 (sem Math.random). Usada pelo Power Score
// (combatPowerService.js), que por definição nunca pode depender de RNG
// (Especificação Consolidada Poder/Status/Cooldown/Balanceamento, §14):
// dois cálculos do mesmo snapshot precisam sempre bater o mesmo número.
function calcularEfeitoPoderEsperado(power, personagem, nivelHabilidade = 1) {
  const campoAtributo = ATRIBUTO_PARA_CAMPO[power.escala_atributo] || "forca";
  const valorAtributo = personagem[campoAtributo] || 0;
  const bonusNivel = bonusPorNivel(personagem, DANO_MAGICO_BASE_POR_NIVEL);
  const multiplicadorNivelHabilidade = multiplicadorEfeitoPorNivelHabilidade(nivelHabilidade);
  const multiplicadorClassePorPoder =
    power.escala_atributo === "Inteligencia"
      ? (personagem.multiplicador_dano_magico ?? 1)
      : (personagem.multiplicador_dano_fisico ?? 1);

  const dano = power.dano_base
    ? Math.round(
        (power.dano_base + valorAtributo * power.valor_escala + bonusNivel) *
          multiplicadorClassePorPoder *
          multiplicadorNivelHabilidade,
      )
    : 0;

  const cura = power.cura_base
    ? Math.round(
        (power.cura_base + valorAtributo * power.valor_escala + bonusNivel) * multiplicadorNivelHabilidade,
      )
    : 0;

  return { dano, cura };
}

// Constante de "diminishing returns" da mitigação por defesa — cada
// ponto de defesa vale cada vez menos, então armadura nunca deixa o
// personagem invulnerável, só reduz. Com K=50: 12 de defesa (um set
// comum/incomum completo) reduz ~19%; 60 (raro/épico misturado) reduz
// ~55%; 136 (mítico completo em tudo) reduz ~73%. Fórmula padrão de RPG
// (defesa / (defesa + K)) em vez de subtração linear, que a essa escala
// de defesa (até 34 por peça) zeraria o dano de ataques básicos fracos.
const CONSTANTE_MITIGACAO_DEFESA = 50;

// Aplica a redução de dano da defesa do alvo — chamado depois de
// calcularDanoBasico/calcularEfeitoPoder, nunca antes (a rolagem de
// dano do atacante não sabe nada sobre o alvo). `defensor.defesa` vem
// de personagemComBonus (equipmentBonusService.js); um inimigo de PvE
// sem esse campo simplesmente não mitiga nada (0 de defesa).
function aplicarMitigacaoDeDefesa(dano, defensor) {
  const defesa = defensor?.defesa || 0;
  if (defesa <= 0 || dano <= 0) return dano;
  const reducao = defesa / (defesa + CONSTANTE_MITIGACAO_DEFESA);
  return Math.max(1, Math.round(dano * (1 - reducao)));
}

// Só a PROBABILIDADE (sem rolar dado) — extraída de chanceDeEsquiva pra
// o Editor de Balanceamento de Monstros (Admin Aventura, §4.3/§9.2)
// poder mostrar "esquiva estimada contra perfil X" sem depender de RNG.
// Mesma fórmula, mesmo piso/teto reais (5%/35%) — nunca duplicar isso
// em outro lugar (frontend inclusive).
function probabilidadeDeEsquiva(defensor, atacante) {
  const diferenca = (defensor.agilidade || 0) - (atacante.agilidade || 0);
  const chanceBase = 0.05;
  const chance = chanceBase + Math.max(0, diferenca) * 0.01;
  return Math.min(chance, 0.35);
}

function chanceDeEsquiva(defensor, atacante) {
  return Math.random() < probabilidadeDeEsquiva(defensor, atacante);
}

// Unifica Cegueira (BLIND) e esquiva num único resultado de acerto
// (Evolução do Motor de Status §17) — Blind é checado primeiro (chance
// ADICIONAL de erro do ATACANTE afetado, em pontos percentuais),
// esquiva continua exatamente como já era. `blindPotency` vem de quem
// chama (o status BLIND mora no ATACANTE, não no defensor) — nunca lido
// daqui pra dentro, pra não criar dependência circular com
// statusEffectService. Não muda Agilidade permanentemente; é só um
// resultado de acerto por golpe.
function resolverResultadoDeAcerto({ atacante, defensor, blindPotency = 0 }) {
  const chanceCegueira = Math.min(100, Math.max(0, blindPotency || 0)) / 100;
  if (chanceCegueira > 0 && Math.random() < chanceCegueira) {
    return { hit: false, reason: "BLIND_MISS" };
  }
  if (chanceDeEsquiva(defensor, atacante)) {
    return { hit: false, reason: "DODGE" };
  }
  return { hit: true, reason: "HIT" };
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
// A evolução de CLASSE (ver ClassEvolutionPath/classEvolutionService.js)
// não mexe mais nos multiplicadores da classe — desde que virou uma
// árvore de caminhos exclusivos, o bônus dela é aplicado direto nos
// atributos do personagem (forca/vitalidade/etc, mesmo critério da
// árvore de Evolution por natureza mágica) no momento de evoluir, então
// já chega embutido em `personagem` antes daqui. Essa função só existe
// pra anexar os multiplicadores da própria Classe (vida/mana/dano).
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
  CONSTANTE_MITIGACAO_DEFESA,
  calcularDanoBasico,
  danoBasicoEsperado,
  calcularEfeitoPoder,
  calcularEfeitoPoderEsperado,
  custoManaEfetivo,
  aplicarMitigacaoDeDefesa,
  chanceDeEsquiva,
  probabilidadeDeEsquiva,
  resolverResultadoDeAcerto,
  vidaMaximaDe,
  manaMaximaDe,
  comMultiplicadoresDeClasse,
};
