// src/config/fishingConfig.js
//
// Configuração central do domínio de Pesca & Navegação (ver especificação
// completa em /tmp .../pesca_spec.txt, §7/§8/§9/§14/§17). Toda a
// matemática de progressão/minigame mora aqui, igual forgeConfig.js e
// expeditionConfig.js — nada de número mágico espalhado em service.
//
// Nível de Pesca: V1 usa faixa 1..25 (spec §7), com a mesma FORMA de
// curva que Forja/Expedição (XP acumulado crescente por etapa) mas
// escalado pra uma faixa maior de níveis.

const NIVEL_MAXIMO_PESCA = 25;

const XP_NECESSARIO_POR_ETAPA_PESCA = (() => {
  const mapa = {};
  for (let nivel = 1; nivel < NIVEL_MAXIMO_PESCA; nivel += 1) {
    // Curva suave: cresce ~18% por etapa, base 40 — dá uma progressão de
    // várias sessões sem ficar impossível nos níveis finais (25).
    mapa[nivel] = Math.round(40 * Math.pow(1.18, nivel - 1));
  }
  return mapa;
})();

const XP_TOTAL_PARA_NIVEL_PESCA = { 1: 0 };
for (let nivel = 2; nivel <= NIVEL_MAXIMO_PESCA; nivel += 1) {
  XP_TOTAL_PARA_NIVEL_PESCA[nivel] =
    XP_TOTAL_PARA_NIVEL_PESCA[nivel - 1] + XP_NECESSARIO_POR_ETAPA_PESCA[nivel - 1];
}

function nivelPescaPorXpTotal(xpTotal) {
  let nivel = 1;
  for (let n = 2; n <= NIVEL_MAXIMO_PESCA; n += 1) {
    if (xpTotal >= XP_TOTAL_PARA_NIVEL_PESCA[n]) nivel = n;
    else break;
  }
  return nivel;
}

function xpParaProximoNivelPesca(nivelAtual) {
  if (nivelAtual >= NIVEL_MAXIMO_PESCA) return null;
  return XP_TOTAL_PARA_NIVEL_PESCA[nivelAtual + 1];
}

// XP concedido por captura, escalado pela dificuldade da espécie (spec
// §8.1 dificuldade_base 1..1000) e pela qualidade do espécime (peso
// relativo a min/max — spec §17).
function xpPorCaptura(dificuldadeBase, quality) {
  const base = 8 + Math.round((dificuldadeBase / 1000) * 40);
  const bonusQualidade = Math.round(base * 0.5 * quality);
  return base + bonusQualidade;
}

// ---------------------------------------------------------------------
// Minigame (spec §14) — tuning determinístico, sem RNG "solto": todo
// sorteio usa Math.random() só no server, nunca client-controlável, e o
// comportamento por espécie é resolvido em fishingEngine.js (whitelist
// comportamento_key, nunca código do banco — spec §14.5/§31).
// ---------------------------------------------------------------------

const TENSAO_MAXIMA = 1000; // 0..1000 — rompimento de linha em >= TENSAO_MAXIMA
const ZONA_IDEAL_MIN = 350;
const ZONA_IDEAL_MAX = 650;
const PROGRESSO_PARA_CAPTURA = 1000; // recolhimento acumulado necessário

const JANELA_MORDIDA_BASE_MS = 2500; // tempo que o jogador tem pra fisgar após a mordida
const ESPERA_MORDIDA_MIN_MS = 1500;
const ESPERA_MORDIDA_MAX_MS = 6000;

const SESSAO_EXPIRACAO_MS = 3 * 60_000; // sessão inteira expira em 3 minutos sem finalizar

// Comportamentos de espécie (spec §14.5) — whitelist fechada, resolvida
// em fishingEngine.js. Cada chave define como a "força do peixe" evolui
// a cada ação de reel (puxão de tensão extra / recuperação de
// progresso).
const COMPORTAMENTOS = {
  CALM: { picoChance: 0.08, picoForca: 60, recuperacaoProgresso: 0.02 },
  BURST: { picoChance: 0.28, picoForca: 160, recuperacaoProgresso: 0.05 },
  ERRATIC: { picoChance: 0.4, picoForca: 110, recuperacaoProgresso: 0.08 },
  ENDURANCE: { picoChance: 0.15, picoForca: 90, recuperacaoProgresso: 0.12 },
  DEEP_DIVE: { picoChance: 0.12, picoForca: 220, recuperacaoProgresso: 0.18 },
};

const COMPORTAMENTO_KEYS = Object.keys(COMPORTAMENTOS);

// Perfis de peso (spec §8.1 perfil_peso) — curva server-side de onde
// dentro de [min,max] o peso tende a cair. LIGHT puxa pra baixo, HEAVY
// puxa pra cima, NORMAL é uniforme.
const PERFIS_PESO = ["LIGHT", "NORMAL", "HEAVY"];

function sortearPesoGramas(pesoMinG, pesoMaxG, perfilPeso, random = Math.random) {
  const r = random();
  let t;
  if (perfilPeso === "LIGHT") t = Math.pow(r, 2); // enviesa pra baixo
  else if (perfilPeso === "HEAVY") t = 1 - Math.pow(1 - r, 2); // enviesa pra cima
  else t = r; // NORMAL — uniforme
  return Math.round(pesoMinG + t * (pesoMaxG - pesoMinG));
}

function qualidadeEspecime(pesoG, pesoMinG, pesoMaxG) {
  if (pesoMaxG <= pesoMinG) return 0;
  const q = (pesoG - pesoMinG) / (pesoMaxG - pesoMinG);
  return Math.max(0, Math.min(1, q));
}

module.exports = {
  NIVEL_MAXIMO_PESCA,
  XP_TOTAL_PARA_NIVEL_PESCA,
  nivelPescaPorXpTotal,
  xpParaProximoNivelPesca,
  xpPorCaptura,
  TENSAO_MAXIMA,
  ZONA_IDEAL_MIN,
  ZONA_IDEAL_MAX,
  PROGRESSO_PARA_CAPTURA,
  JANELA_MORDIDA_BASE_MS,
  ESPERA_MORDIDA_MIN_MS,
  ESPERA_MORDIDA_MAX_MS,
  SESSAO_EXPIRACAO_MS,
  COMPORTAMENTOS,
  COMPORTAMENTO_KEYS,
  PERFIS_PESO,
  sortearPesoGramas,
  qualidadeEspecime,
};
