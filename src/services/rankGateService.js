// src/services/rankGateService.js
//
// Portal de Ranque — combate interativo turno a turno (igual a Aventura,
// ver combatController.js), não mais resolvido numa tacada só. Duas
// mudanças pedidas: (1) o jogador escolhe a dificuldade (Fácil/Difícil/
// Muito Difícil) e realmente joga o combate com poderes/itens; (2)
// vencer no Fácil não te promove de ranque numa luta só — cada
// dificuldade rende PONTOS_POR_DIFICULDADE, e só promove quando o
// personagem acumula PONTOS_NECESSARIOS no ranque atual. Muito Difícil
// sozinho já basta; Fácil precisa de várias vitórias seguidas.
const { danoBasicoEsperado } = require("./combatFormulas");

const DIFICULDADES = ["Facil", "Dificil", "MuitoDificil"];

const NOME_DIFICULDADE = {
  Facil: "Fácil",
  Dificil: "Difícil",
  MuitoDificil: "Muito Difícil",
};

// Multiplica os atributos do chefe cadastrado (RankGate), que representa
// a versão "Difícil" (1x) — Fácil é uma versão mais fraca pra quem
// ainda não está pronto pro ranque, Muito Difícil é mais forte que o
// "esperado" do ranque, pensada pra quem já está overpowered pra ele.
const MULTIPLICADOR_STATS = {
  Facil: 0.65,
  Dificil: 1,
  MuitoDificil: 1.5,
};

// Recompensa (dinheiro/xp) acompanha o risco — Muito Difícil paga mais
// que o dobro do Fácil pelo mesmo chefe-base.
const MULTIPLICADOR_RECOMPENSA = {
  Facil: 0.5,
  Dificil: 1,
  MuitoDificil: 2,
};

// Quantos pontos uma vitória nessa dificuldade rende, e quantos pontos
// um personagem precisa acumular no ranque atual pra ser promovido.
// Facil × 5 vitórias, Dificil × 2, MuitoDificil × 1 — todos chegam em
// 10, então dá pra misturar dificuldades e ainda fazer sentido.
const PONTOS_POR_DIFICULDADE = {
  Facil: 2,
  Dificil: 5,
  MuitoDificil: 10,
};
const PONTOS_NECESSARIOS = 10;

// Fragmento de Grimório garantido a cada chefe derrotado (ver
// abilityLevelService.js) — diferente do drop de PvE comum (que é por
// sorte), aqui é certo, e a quantidade acompanha o risco escolhido, dando
// ao Portal um motivo a mais pra arriscar a dificuldade mais alta além
// de ouro/xp/pontos de ranque.
const FRAGMENTOS_POR_DIFICULDADE = {
  Facil: 1,
  Dificil: 2,
  MuitoDificil: 4,
};

function ehDificuldadeValida(dificuldade) {
  return DIFICULDADES.includes(dificuldade);
}

// Gera a instância do chefe pra esta tentativa, com stats escalados
// pela dificuldade escolhida — mesmo "formato de personagem" que o
// resto do motor de combate espera (forca/vitalidade/agilidade/
// velocidade/defesa/inteligencia), sem arma_equipada (chefe é sempre
// desarmado nas fórmulas de dano).
function gerarChefeComDificuldade(chefeBase, dificuldade) {
  const mult = MULTIPLICADOR_STATS[dificuldade];
  const vidaMaxima = Math.max(10, Math.round(chefeBase.vida * mult));
  const chefe = {
    // "nome" (não "nome_chefe") pra bater com o formato EnemyState que
    // o frontend já usa pra Aventura (ver CombatArena.tsx) — o Portal
    // reaproveita o mesmo componente de combate.
    nome: chefeBase.nome_chefe,
    dificuldade,
    nivel: chefeBase.nivel_recomendado,
    forca: Math.max(1, Math.round(chefeBase.forca * mult)),
    vitalidade: Math.max(1, Math.round(chefeBase.vitalidade * mult)),
    agilidade: Math.max(1, Math.round(chefeBase.agilidade * mult)),
    inteligencia: Math.max(1, Math.round((chefeBase.inteligencia || 0) * mult)),
    velocidade: Math.max(1, Math.round(chefeBase.velocidade * mult)),
    defesa: Math.max(0, Math.round(chefeBase.defesa * mult)),
    vida_maxima: vidaMaxima,
    vida_atual: vidaMaxima,
    arma_equipada: null,
  };
  chefe.dano_base = Math.round(danoBasicoEsperado(chefe));
  return chefe;
}

function recompensaComDificuldade(chefeBase, dificuldade) {
  const mult = MULTIPLICADOR_RECOMPENSA[dificuldade];
  return {
    dinheiro: Math.round(chefeBase.recompensa_dinheiro * mult),
    xp: Math.round(chefeBase.recompensa_xp * mult),
  };
}

module.exports = {
  DIFICULDADES,
  NOME_DIFICULDADE,
  MULTIPLICADOR_STATS,
  MULTIPLICADOR_RECOMPENSA,
  PONTOS_POR_DIFICULDADE,
  PONTOS_NECESSARIOS,
  FRAGMENTOS_POR_DIFICULDADE,
  ehDificuldadeValida,
  gerarChefeComDificuldade,
  recompensaComDificuldade,
};
