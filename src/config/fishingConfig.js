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
// Recolher DENTRO da zona ideal concede +15% de progresso naquele passo
// (rebalanceamento Pesca v3 §3.3) — dá função mecânica real à faixa, não
// só um indicador visual.
const ZONA_IDEAL_BONUS_PCT = 0.15;
// 1000 -> 800: reduz repetição de ações ON/OFF por captura sem tirar
// habilidade (rebalanceamento v3 §3.4) — meta de ~15-30s por luta comum
// com vara adequada.
const PROGRESSO_PARA_CAPTURA = 800; // recolhimento acumulado necessário

const JANELA_MORDIDA_BASE_MS = 2500; // tempo que o jogador tem pra fisgar após a mordida
const ESPERA_MORDIDA_MIN_MS = 1500;
const ESPERA_MORDIDA_MAX_MS = 6000;

const SESSAO_EXPIRACAO_MS = 3 * 60_000; // sessão inteira expira em 3 minutos sem finalizar

// Comportamentos de espécie (spec §14.5) — whitelist fechada, resolvida
// em fishingEngine.js. Cada chave define como a "força do peixe" evolui
// a cada ação de reel (puxão de tensão extra / recuperação de
// progresso). Valores rebalanceados (Pesca v3 §3.2): pico de força mais
// próximo entre perfis pra nenhum ficar punitivo demais com vara
// apropriada — o multiplicador de dificuldade_base (fatorDificuldade)
// modula a intensidade final por espécie em cima destes valores base.
const COMPORTAMENTOS = {
  CALM: { picoChance: 0.08, picoForca: 50, recuperacaoProgresso: 0.02 },
  BURST: { picoChance: 0.18, picoForca: 90, recuperacaoProgresso: 0.03 },
  ERRATIC: { picoChance: 0.25, picoForca: 65, recuperacaoProgresso: 0.05 },
  ENDURANCE: { picoChance: 0.12, picoForca: 75, recuperacaoProgresso: 0.08 },
  DEEP_DIVE: { picoChance: 0.08, picoForca: 130, recuperacaoProgresso: 0.12 },
};

const COMPORTAMENTO_KEYS = Object.keys(COMPORTAMENTOS);

// Metadados públicos de apresentação (Pesca v3 §6/§6.1) — fonte de
// verdade única pro nome/descrição/dica em português de cada
// comportamento. As keys internas (COMPORTAMENTO_KEYS acima) continuam
// em inglês pra não exigir migration; só a apresentação muda. Frontend
// (FishingAlmanaque, FishingClient, AdminFishingClient) consome isso
// pronto, nunca traduz na mão.
const COMPORTAMENTO_META = {
  CALM: {
    nome: "Calmo",
    descricao: "Poucas arrancadas e ritmo previsível.",
    dica: "Use a faixa ideal para recolher com segurança.",
  },
  BURST: {
    nome: "Explosivo",
    descricao: "Arrancadas curtas e fortes.",
    dica: "Alivie a linha quando a tensão subir rapidamente.",
  },
  ERRATIC: {
    nome: "Imprevisível",
    descricao: "Muda de ritmo e arranca com frequência.",
    dica: "Evite manter recolhimento contínuo por muito tempo.",
  },
  ENDURANCE: {
    nome: "Resistente",
    descricao: "Prolonga a disputa e recupera distância.",
    dica: "Mantenha pressão quando a tensão estiver segura.",
  },
  DEEP_DIVE: {
    nome: "Mergulhador",
    descricao: "Poucos mergulhos, mas muito intensos.",
    dica: "Reserve margem de tensão para reagir aos mergulhos.",
  },
};

function metaComportamento(key) {
  return COMPORTAMENTO_META[key] ?? COMPORTAMENTO_META.CALM;
}

// dificuldade_base (1..1000) modula a força mecânica do peixe (Pesca
// v3 §3.1). Bug real reportado: com a faixa antiga (0,8x-1,2x) só
// afetando a arrancada, uma vara com TODOS os atributos no mínimo (1)
// ainda tinha mais de 60% de chance de capturar um peixe de
// dificuldade 700 — o ritmo BASE de progresso/tensão (fora da
// arrancada) praticamente não dependia da vara nem da dificuldade, só
// o pico ocasional. Faixa alargada pra 0,5x-2,0x e agora aplicada
// também ao ganho de progresso e ao ganho/alívio de tensão do próprio
// recolhimento em resolverPassoDeReel (fishingEngine.js) — não só à
// arrancada — pra dificuldade_base realmente pesar peixe a peixe, e
// pra vara ruim genuinamente perder pra peixe difícil.
function fatorDificuldade(dificuldadeBase) {
  const db = Math.max(1, Math.min(1000, Number(dificuldadeBase) || 1));
  return 0.5 + 1.5 * (db / 1000);
}

function rotuloDificuldade(dificuldadeBase) {
  const db = Number(dificuldadeBase) || 0;
  if (db <= 250) return "Fácil";
  if (db <= 500) return "Moderada";
  if (db <= 750) return "Difícil";
  return "Muito difícil";
}

// Proficiência de Nível de Pesca (Pesca v3 §4) — aplicada sobre os
// atributos efetivos da vara (já com raridade/refinamento), ANTES de
// buffs temporários (ex.: Taverna). Bônus por nível acima de 1; o teto
// natural é NIVEL_MAXIMO_PESCA (25), então não precisa de cap adicional
// — controle/precisão/estabilidade chegam a ~+18%, força/recolhimento a
// ~+9,6% no nível máximo.
const PROFICIENCIA_PCT_POR_NIVEL = {
  controle: 0.0075,
  precisao: 0.0075,
  estabilidade: 0.0075,
  forca_linha: 0.004,
  recolhimento: 0.004,
};

function aplicarProficienciaPesca(statsVara, nivelPesca) {
  if (!statsVara) return statsVara;
  const nivel = Math.max(1, Math.min(NIVEL_MAXIMO_PESCA, Number(nivelPesca) || 1));
  const niveisAcima = nivel - 1;
  const resultado = { ...statsVara };
  for (const [campo, pctPorNivel] of Object.entries(PROFICIENCIA_PCT_POR_NIVEL)) {
    if (typeof resultado[campo] !== "number") continue;
    resultado[campo] = Math.round(resultado[campo] * (1 + pctPorNivel * niveisAcima));
  }
  return resultado;
}

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
  ZONA_IDEAL_BONUS_PCT,
  PROGRESSO_PARA_CAPTURA,
  JANELA_MORDIDA_BASE_MS,
  ESPERA_MORDIDA_MIN_MS,
  ESPERA_MORDIDA_MAX_MS,
  SESSAO_EXPIRACAO_MS,
  COMPORTAMENTOS,
  COMPORTAMENTO_KEYS,
  COMPORTAMENTO_META,
  metaComportamento,
  fatorDificuldade,
  rotuloDificuldade,
  aplicarProficienciaPesca,
  PERFIS_PESO,
  sortearPesoGramas,
  qualidadeEspecime,
};
