// src/config/monsterBalanceConfig.js
//
// Configuração central do Editor de Balanceamento de Monstros por
// Resultado (Admin Aventura — Especificação "Admin Aventura: Editor de
// Balanceamento de Monstros por Resultado"). Guarda só os números de
// UX/heurística deste editor (limites técnicos de multiplicador,
// classificação de dificuldade, presets e perfis sintéticos de
// jogador) — nunca a fórmula de combate real, que continua inteira em
// combatFormulas.js/combatController.js e nunca é duplicada aqui (§9.2).

// §13 — nunca aceitar Infinity/NaN/overflow, mas também nunca escolher
// um teto baixo que impeça conteúdo autoral. Faixa observada hoje no
// catálogo real (seed inicial da Aventura): 0.6 a 2.4.
const MULTIPLICADOR_MINIMO = 0.05;
const MULTIPLICADOR_MAXIMO = 20;

// §4.3 — piso/teto REAIS do motor de esquiva (combatFormulas.
// probabilidadeDeEsquiva/chanceDeEsquiva). Nunca alterados aqui — só
// refletidos pra validar/avisar o Admin sobre o que a fórmula atual
// consegue representar (spec §17: "não alterar a fórmula de esquiva ou
// o teto de 35%").
const ESQUIVA_MINIMA_PCT = 5;
const ESQUIVA_MAXIMA_PCT = 35;

// §7.3 — classificação informativa de dificuldade. Configuração de UX,
// nunca uma regra de gameplay: nunca impede salvar.
const FAIXAS_DIFICULDADE = [
  { chave: "TRIVIAL", label: "Trivial", min: 0.98, estrito: true },
  { chave: "FACIL", label: "Fácil", min: 0.9 },
  { chave: "NORMAL", label: "Normal", min: 0.7 },
  { chave: "DIFICIL", label: "Difícil", min: 0.45 },
  { chave: "MUITO_DIFICIL", label: "Muito difícil", min: 0.2 },
  { chave: "EXTREMO", label: "Extremo", min: 0 },
];

function classificarDificuldade(taxaVitoriaJogador) {
  const taxa = Number.isFinite(taxaVitoriaJogador) ? taxaVitoriaJogador : 0;
  for (const faixa of FAIXAS_DIFICULDADE) {
    if (faixa.estrito ? taxa > faixa.min : taxa >= faixa.min) return faixa;
  }
  return FAIXAS_DIFICULDADE[FAIXAS_DIFICULDADE.length - 1];
}

// §8 — presets só preenchem os 4 multiplicadores como PONTO DE PARTIDA
// (nunca um vínculo dinâmico: depois de aplicado, o monstro salva
// valores concretos, igual a qualquer edição manual — §8 "Não persistir
// uma dependência dinâmica do preset"). Derivados observando a faixa
// real do catálogo atual (seed inicial: 0.6-2.4, ver
// 20260930680000-modo-aventura-seed-inicial.js) e a semântica de cada
// identidade descrita na especificação (§8). Números de primeira
// versão — ajustáveis depois de playtest sem tocar no motor.
const PRESETS_MONSTRO = {
  EQUILIBRADO: { label: "Equilibrado", multiplicadores: { vida: 1.0, dano: 1.0, agilidade: 1.0, velocidade: 1.0 } },
  TANQUE: { label: "Tanque", multiplicadores: { vida: 2.2, dano: 0.9, agilidade: 0.65, velocidade: 0.7 } },
  BRUTO: { label: "Bruto", multiplicadores: { vida: 1.3, dano: 1.5, agilidade: 0.85, velocidade: 0.85 } },
  AGIL: { label: "Ágil", multiplicadores: { vida: 0.85, dano: 1.0, agilidade: 1.4, velocidade: 1.35 } },
  ASSASSINO: { label: "Assassino", multiplicadores: { vida: 0.75, dano: 1.7, agilidade: 1.3, velocidade: 1.3 } },
  FRAGIL_OFENSIVO: { label: "Frágil Ofensivo", multiplicadores: { vida: 0.55, dano: 2.0, agilidade: 1.0, velocidade: 1.0 } },
  ELITE: { label: "Elite", multiplicadores: { vida: 1.8, dano: 1.4, agilidade: 1.3, velocidade: 1.3 } },
};

// §6 — perfis sintéticos SÓ pra comparação/simulação no preview do
// Admin; nunca consultam personagem real nem alteram a geração do
// monstro real (isso continua vindo só do nível dele, ver
// combatController.gerarInimigo). Construídos em cima da MESMA base de
// atributo por nível que o motor já usa (statsDeReferenciaPorNivel) +
// um "equipamento aproximado" com valores coerentes com
// equipmentTierConfig.js (Tier V = básico, Tier I = topo) — sem inventar
// escala nova. Ponto de partida de primeira versão (spec §6: "propor
// valores coerentes com conteúdo realmente alcançável"), reajustável
// aqui sem tocar no motor de combate.
const PERFIS_SINTETICOS = {
  FRACO: {
    label: "Fraco",
    bonusAtributoPct: -0.15,
    defesaPorNivel: 0.25,
    armaDanoMinBase: 3,
    armaDanoMaxBase: 6,
  },
  MEDIO: {
    label: "Médio",
    bonusAtributoPct: 0.1,
    defesaPorNivel: 0.8,
    armaDanoMinBase: 5,
    armaDanoMaxBase: 10,
  },
  FORTE: {
    label: "Forte",
    bonusAtributoPct: 0.3,
    defesaPorNivel: 1.6,
    armaDanoMinBase: 8,
    armaDanoMaxBase: 15,
  },
};

// §7.1/§13 — o simulador nunca roda sem limite (nem iterações, nem
// turnos por combate) e nunca compartilha o caminho de requests do
// jogador (fica isolado num serviço próprio, nunca chamado por rotas de
// combate real).
const SIMULACAO_MAX_ITERACOES = 1000;
const SIMULACAO_MAX_TURNOS_POR_COMBATE = 200;
const SIMULACAO_RATE_LIMIT_JANELA_MS = 60 * 1000;
const SIMULACAO_RATE_LIMIT_MAX_TENTATIVAS = 10;

function multiplicadorValido(valor) {
  return Number.isFinite(valor) && valor >= MULTIPLICADOR_MINIMO && valor <= MULTIPLICADOR_MAXIMO;
}

module.exports = {
  MULTIPLICADOR_MINIMO,
  MULTIPLICADOR_MAXIMO,
  ESQUIVA_MINIMA_PCT,
  ESQUIVA_MAXIMA_PCT,
  FAIXAS_DIFICULDADE,
  classificarDificuldade,
  PRESETS_MONSTRO,
  PERFIS_SINTETICOS,
  SIMULACAO_MAX_ITERACOES,
  SIMULACAO_MAX_TURNOS_POR_COMBATE,
  SIMULACAO_RATE_LIMIT_JANELA_MS,
  SIMULACAO_RATE_LIMIT_MAX_TENTATIVAS,
  multiplicadorValido,
};
