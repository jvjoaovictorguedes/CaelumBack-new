// Caçadas da Guilda dos Aventureiros (ver spec "Caçadas da Guilda dos
// Aventureiros") — configuração central: nada de dificuldade/reputação/
// rotação hardcoded em service. Progressão TOTALMENTE separada do Rank
// F-S e da Reputação Comercial do Balcão de Espólios (§2 "NÃO MISTURAR
// PROGRESSÕES") — mesmo padrão de adventureGuildConfig.js, que já
// mantém a rotação de 6h dos contratos de Rank isolada da de 4h do
// Balcão.
const HUNT_ROTATION_HOURS = 4;
const HUNT_ROTATION_MS = HUNT_ROTATION_HOURS * 60 * 60 * 1000;

function inicioDaJanelaDeCacada(agora = new Date()) {
  return new Date(Math.floor(agora.getTime() / HUNT_ROTATION_MS) * HUNT_ROTATION_MS);
}

// §5 — vida/dano ADICIONAIS (fração, não multiplicador direto — vida
// final = vida_normal * (1 + hpMultiplier)) aplicados SÓ ao alvo da
// Caçada, só pro personagem com aquela Caçada Ativa (nunca no
// AdventureMonster global). Quantidade inversamente proporcional ao
// perigo (§5.1): dificuldades baixas = mais mortes/menos modificação;
// altas = poucos exemplares muito fortalecidos.
const HUNT_DIFFICULTIES = {
  Dangerous: {
    ordem: 1,
    nome: "Perigosa",
    hpMultiplier: 0.15,
    damageMultiplier: 0.1,
    quantityRange: [15, 25],
    rewardMultiplier: 1.25,
    reputationReward: 10,
  },
  Difficult: {
    ordem: 2,
    nome: "Difícil",
    hpMultiplier: 0.3,
    damageMultiplier: 0.2,
    quantityRange: [10, 18],
    rewardMultiplier: 1.5,
    reputationReward: 18,
  },
  Deadly: {
    ordem: 3,
    nome: "Mortal",
    hpMultiplier: 0.55,
    damageMultiplier: 0.35,
    quantityRange: [7, 12],
    rewardMultiplier: 2.0,
    reputationReward: 30,
  },
  Nightmare: {
    ordem: 4,
    nome: "Pesadelo",
    hpMultiplier: 0.9,
    damageMultiplier: 0.55,
    quantityRange: [4, 8],
    rewardMultiplier: 2.75,
    reputationReward: 50,
  },
  Extermination: {
    ordem: 5,
    nome: "Extermínio",
    hpMultiplier: 1.5,
    damageMultiplier: 0.8,
    quantityRange: [2, 5],
    rewardMultiplier: 4.0,
    reputationReward: 80,
  },
};

// §7 — 5 níveis permanentes de Reputação de Caçador, cada um com o
// próprio pool de dificuldades sorteáveis (§7.1) — controla o que a
// ROTAÇÃO pode oferecer, nunca o que o jogador pode aceitar (a oferta
// já vem com dificuldade definida).
const HUNT_REPUTATION_LEVELS = [
  { nivel: 1, roman: "I", titulo: "Caçador Iniciante", minimo: 0, pool: ["Dangerous", "Difficult"] },
  { nivel: 2, roman: "II", titulo: "Caçador Intermediário", minimo: 2500, pool: ["Dangerous", "Difficult", "Deadly"] },
  { nivel: 3, roman: "III", titulo: "Caçador Experiente", minimo: 8500, pool: ["Difficult", "Deadly", "Nightmare"] },
  { nivel: 4, roman: "IV", titulo: "Caçador de Platina", minimo: 22000, pool: ["Deadly", "Nightmare", "Extermination"] },
  { nivel: 5, roman: "V", titulo: "Caçador de Monstros", minimo: 50000, pool: ["Deadly", "Nightmare", "Extermination"] },
];

// §7.2 — pesos (em partes, somam 100 por nível) de sorteio de
// dificuldade dentro do pool liberado daquele nível de Reputação.
const HUNT_DIFFICULTY_WEIGHTS_BY_REPUTATION = {
  1: { Dangerous: 65, Difficult: 35 },
  2: { Dangerous: 35, Difficult: 50, Deadly: 15 },
  3: { Difficult: 35, Deadly: 50, Nightmare: 15 },
  4: { Deadly: 45, Nightmare: 45, Extermination: 10 },
  5: { Deadly: 30, Nightmare: 45, Extermination: 25 },
};

// §4.1 — histórias geradas por TEMPLATE (nunca IA em runtime); o texto
// final é sempre persistido em story_snapshot (§13.2), então mudar este
// catálogo no futuro nunca reescreve caçadas antigas. {regiao}/
// {monstro} são os únicos placeholders (§4.1).
const HUNT_STORY_TEMPLATES = [
  {
    key: "CARAVANA",
    texto: "Uma caravana que atravessa {regiao} vem sofrendo ataques de {monstro}. A Guilda procura alguém capaz de reduzir a ameaça.",
  },
  {
    key: "ALDEIA",
    texto: "Moradores próximos de {regiao} relatam uma presença crescente de {monstro}. A situação já ameaça as rotas locais.",
  },
  {
    key: "EMERGENCIA",
    texto: "A Guilda emitiu uma ordem de emergência. Exemplares de {monstro} apresentam uma agressividade incomum e precisam ser abatidos.",
  },
  {
    key: "COMERCIANTES",
    texto: "Comerciantes que cruzam {regiao} pagaram um preço alto demais: {monstro} tem emboscado quase toda rota nos últimos dias.",
  },
  {
    key: "SENTINELAS",
    texto: "As sentinelas de {regiao} pedem reforço. {monstro} tem sido avistado cada vez mais perto dos muros.",
  },
  {
    key: "COLHEITA",
    texto: "A colheita perto de {regiao} está em risco: {monstro} vem destruindo plantações inteiras durante a noite.",
  },
  {
    key: "DESAPARECIDOS",
    texto: "Viajantes desapareceram na estrada que corta {regiao}. Rastros apontam para {monstro} como responsável.",
  },
  {
    key: "TERRITORIO",
    texto: "{monstro} tem expandido seu território dentro de {regiao} de forma anormal. A Guilda quer isso contido antes que piore.",
  },
  {
    key: "RUMOR_ANTIGO",
    texto: "Um rumor antigo sobre {monstro} em {regiao} voltou a se confirmar — e dessa vez a Guilda decidiu agir.",
  },
  {
    key: "CACADOR_FERIDO",
    texto: "Um caçador voltou ferido de {regiao}, jurando que nunca viu {monstro} tão agressivo. A Guilda quer uma segunda opinião — a sua.",
  },
  {
    key: "ROTA_BLOQUEADA",
    texto: "A rota principal de {regiao} está praticamente impassável: {monstro} tomou conta da passagem.",
  },
  {
    key: "SINAIS",
    texto: "Batedores da Guilda encontraram sinais claros de {monstro} se multiplicando em {regiao}. É hora de agir antes que vire um problema maior.",
  },
  {
    key: "RECOMPENSA_LOCAL",
    texto: "Autoridades locais de {regiao} ofereceram recompensa própria por {monstro} — a Guilda decidiu formalizar o contrato.",
  },
  {
    key: "NOITE_MAL_DORMIDA",
    texto: "Ninguém em {regiao} dorme direito desde que {monstro} passou a rondar as proximidades à noite.",
  },
  {
    key: "PADRAO_ESTRANHO",
    texto: "Os ataques de {monstro} em {regiao} seguem um padrão estranho demais pra ser coincidência. A Guilda quer respostas — e o monstro abatido.",
  },
];

module.exports = {
  HUNT_ROTATION_HOURS,
  HUNT_ROTATION_MS,
  inicioDaJanelaDeCacada,
  HUNT_DIFFICULTIES,
  HUNT_REPUTATION_LEVELS,
  HUNT_DIFFICULTY_WEIGHTS_BY_REPUTATION,
  HUNT_STORY_TEMPLATES,
};
