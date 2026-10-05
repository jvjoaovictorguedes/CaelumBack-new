"use strict";

// IA de Combate PvE & Habilidades de Monstros V1 -- seed de conteúdo
// (não é uma fase nova do motor; reaproveita 100% a infra já existente:
// Power/PowerStatusEffect/MonsterAbility/MonsterAbilityCondition +
// combatAiService/monsterCombatAdapter/monsterAbilityConfig, nenhum
// sistema paralelo).
//
// Cadastra 3 habilidades ativas por monstro comum e 4 por raro (a 4ª é
// a "ultimate", gated por uma MonsterAbilityCondition required) nos 40
// monstros do Modo Aventura (Zonas 1-10). Prioridade/peso seguem uma
// régua fixa por posição na lista (§8 do doc de especificação): a
// ultimate do raro só supera as outras porque soma score_bonus=15 da
// condição satisfeita (20+15=35) -- dentro do perfil TACTICAL
// (jitterMaximo=10 em combatAiService/monsterAbilityConfig) isso a
// torna praticamente garantida assim que elegível, sem precisar mexer
// no motor de pontuação.
//
// Perfil de IA: TACTICAL pros 40 (nunca BASIC nem ELITE_BOSS -- ver
// relatório final: BASIC tem jitterMaximo=18, largo o bastante pra
// competir ataque básico/habilidades quase igualzinho mesmo com scores
// bem diferentes, o que arrisca a condição-gated da 4ª habilidade do
// raro não dominar de verdade quando satisfeita; TACTICAL com
// jitterMaximo=10 resolve isso sem exigir ELITE_BOSS, reservado a
// outro conteúdo). Validado por teste de simulação (ver
// test/monsterActiveAbilitiesSeed.test.js).
//
// Idempotente: tudo resolvido por NOME (nunca ID fixo) -- Power.nome é
// UNIQUE no schema, então re-rodar a migration localiza as Powers/
// vínculos já criados e só preenche o que falta, nunca duplica nem
// sobrescreve valor numérico de uma Power/condição já existente (só
// cria quando ainda não existe). Nunca toca nos atributos de combate
// do monstro (vida/dano/defesa/agilidade/velocidade/nível/
// recompensas/drops) -- só ai_profile (parte explícita do escopo desta
// migration) e os vínculos de habilidade.

const MONSTROS = [
  {
    nome: "Rato das Campinas",
    raro: false,
    habilidades: [
      { nome: "Mordida Rasteira", dano: 7, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Guincho Desconcertante", dano: 7, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLIND", chance_ppm: 250000, duration_turns: 1, potency_base: 10, percentual_vida_maxima: null } },
      { nome: "Frenesi de Roedor", dano: 9, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Javali Selvagem",
    raro: false,
    habilidades: [
      { nome: "Presa Ascendente", dano: 11, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Pisoteio Brusco", dano: 10, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "STUN", chance_ppm: 150000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Investida Selvagem", dano: 13, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Goblin Batedor",
    raro: false,
    habilidades: [
      { nome: "Facada Oportunista", dano: 9, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Areia nos Olhos", dano: 9, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLIND", chance_ppm: 300000, duration_turns: 1, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Ataque e Recuo", dano: 12, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Lobo Alfa da Campina",
    raro: true,
    habilidades: [
      { nome: "Mordida Alfa", dano: 17, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Uivo Dominante", dano: 15, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 350000, duration_turns: 2, potency_base: 10, percentual_vida_maxima: null } },
      { nome: "Salto da Alcateia", dano: 20, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
      { nome: "Execução do Alfa", dano: 23, cooldown: 4, prioridade_base: 20, peso_uso: 2, condition: { key: "TARGET_HP_BELOW_PCT", config: {"thresholdPct":40}, score_bonus: 15 } },
    ],
  },
  {
    nome: "Lobo das Sombras",
    raro: false,
    habilidades: [
      { nome: "Garra Sombria", dano: 15, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Mordida do Eclipse", dano: 14, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLEED", chance_ppm: 300000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1 } },
      { nome: "Bote das Sombras", dano: 18, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Aranha Venenosa",
    raro: false,
    habilidades: [
      { nome: "Picada Venenosa", dano: 18, cooldown: 1, prioridade_base: 8, peso_uso: 3, status: { key: "POISON", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1 } },
      { nome: "Teia Ofuscante", dano: 17, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLIND", chance_ppm: 300000, duration_turns: 2, potency_base: 10, percentual_vida_maxima: null } },
      { nome: "Salto da Viúva", dano: 23, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Goblin Saqueador",
    raro: false,
    habilidades: [
      { nome: "Golpe de Cutelo", dano: 16, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Pó de Saque", dano: 14, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLIND", chance_ppm: 300000, duration_turns: 1, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Saque Impiedoso", dano: 20, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Espectro Sussurrante",
    raro: true,
    habilidades: [
      { nome: "Toque Espectral", dano: 28, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Sussurro Profano", dano: 25, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "SILENCE", chance_ppm: 350000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Passagem Fantasma", dano: 34, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
      { nome: "Lamento do Além", dano: 38, cooldown: 4, prioridade_base: 20, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 350000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null }, condition: { key: "TURN_AT_LEAST", config: {"turn":3}, score_bonus: 15 } },
    ],
  },
  {
    nome: "Sapo Venenoso",
    raro: false,
    habilidades: [
      { nome: "Cuspe Tóxico", dano: 25, cooldown: 1, prioridade_base: 8, peso_uso: 3, status: { key: "POISON", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1 } },
      { nome: "Muco Entorpecente", dano: 24, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "PARALYZE", chance_ppm: 300000, duration_turns: 1, potency_base: 20, percentual_vida_maxima: null } },
      { nome: "Explosão da Glândula", dano: 31, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Serpente do Brejo",
    raro: false,
    habilidades: [
      { nome: "Bote do Brejo", dano: 24, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Presas Tóxicas", dano: 23, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "POISON", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1 } },
      { nome: "Constrição Lamacenta", dano: 28, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "STUN", chance_ppm: 150000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
    ],
  },
  {
    nome: "Lodo Vivo",
    raro: false,
    habilidades: [
      { nome: "Golpe Gelatinoso", dano: 23, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Jato Corrosivo", dano: 22, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 300000, duration_turns: 2, potency_base: 10, percentual_vida_maxima: null } },
      { nome: "Esmagamento Viscoso", dano: 29, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Hidra Jovem",
    raro: true,
    habilidades: [
      { nome: "Mordida Dupla", dano: 36, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Hálito Tóxico", dano: 33, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "POISON", chance_ppm: 400000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.25 } },
      { nome: "Chicote de Cauda", dano: 45, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
      { nome: "Fúria das Muitas Cabeças", dano: 51, cooldown: 4, prioridade_base: 20, peso_uso: 2, condition: { key: "TURN_AT_LEAST", config: {"turn":3}, score_bonus: 15 } },
    ],
  },
  {
    nome: "Bandido Errante",
    raro: false,
    habilidades: [
      { nome: "Corte Sujo", dano: 30, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Poeira nos Olhos", dano: 28, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLIND", chance_ppm: 300000, duration_turns: 1, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Golpe Traiçoeiro", dano: 38, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Arqueiro Renegado",
    raro: false,
    habilidades: [
      { nome: "Flecha Rápida", dano: 36, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Flecha Debilitante", dano: 34, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 300000, duration_turns: 2, potency_base: 10, percentual_vida_maxima: null } },
      { nome: "Disparo Perfurante", dano: 44, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Cão de Guerra",
    raro: false,
    habilidades: [
      { nome: "Mordida Treinada", dano: 35, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Investida de Guarda", dano: 31, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "STUN", chance_ppm: 150000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Rasgar Tendão", dano: 40, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "BLEED", chance_ppm: 300000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1 } },
    ],
  },
  {
    nome: "Capitão Mercenário",
    raro: true,
    habilidades: [
      { nome: "Corte Mercenário", dano: 50, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Quebra-Guarda", dano: 45, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 350000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Lâmina do Contrato", dano: 61, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
      { nome: "Golpe de Execução", dano: 70, cooldown: 4, prioridade_base: 20, peso_uso: 2, condition: { key: "TARGET_HP_BELOW_PCT", config: {"thresholdPct":40}, score_bonus: 15 } },
    ],
  },
  {
    nome: "Cultista Renegado",
    raro: false,
    habilidades: [
      { nome: "Rajada Profana", dano: 42, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Selo Silenciador", dano: 40, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "SILENCE", chance_ppm: 300000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Chama Ritual", dano: 48, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "BURN", chance_ppm: 300000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1 } },
    ],
  },
  {
    nome: "Esqueleto Guardião",
    raro: false,
    habilidades: [
      { nome: "Corte Ossudo", dano: 39, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Golpe de Escudo", dano: 35, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "STUN", chance_ppm: 150000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Avanço do Guardião", dano: 48, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Aparição Cinzenta",
    raro: false,
    habilidades: [
      { nome: "Toque Cinzento", dano: 42, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Névoa Mortuária", dano: 38, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLIND", chance_ppm: 300000, duration_turns: 2, potency_base: 10, percentual_vida_maxima: null } },
      { nome: "Travessia Espectral", dano: 52, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Cavaleiro Amaldiçoado",
    raro: true,
    habilidades: [
      { nome: "Corte Amaldiçoado", dano: 62, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Marca da Ruína", dano: 56, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 350000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Investida Negra", dano: 76, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
      { nome: "Julgamento dos Mortos", dano: 87, cooldown: 4, prioridade_base: 20, peso_uso: 2, condition: { key: "TURN_AT_LEAST", config: {"turn":3}, score_bonus: 15 } },
    ],
  },
  {
    nome: "Hiena das Cinzas",
    raro: false,
    habilidades: [
      { nome: "Mordida Carniçeira", dano: 44, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Rasgo das Cinzas", dano: 42, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLEED", chance_ppm: 300000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1 } },
      { nome: "Salto Predador", dano: 55, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Escorpião de Cinzas",
    raro: false,
    habilidades: [
      { nome: "Pinça Carbonizada", dano: 54, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Ferrão Incandescente", dano: 51, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BURN", chance_ppm: 300000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1 } },
      { nome: "Cauda Demolidora", dano: 66, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Elemental de Cinzas",
    raro: false,
    habilidades: [
      { nome: "Rajada de Cinzas", dano: 55, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Nuvem Sufocante", dano: 49, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLIND", chance_ppm: 350000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Erupção Cinzenta", dano: 62, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "BURN", chance_ppm: 300000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1 } },
    ],
  },
  {
    nome: "Golem de Pedra",
    raro: true,
    habilidades: [
      { nome: "Punho Rúnico", dano: 63, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Onda de Pedra", dano: 54, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "STUN", chance_ppm: 200000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Ruptura Rúnica", dano: 77, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
      { nome: "Colapso Telúrico do Golem", dano: 88, cooldown: 4, prioridade_base: 20, peso_uso: 2, condition: { key: "TURN_AT_LEAST", config: {"turn":3}, score_bonus: 15 } },
    ],
  },
  {
    nome: "Orc Guerreiro",
    raro: false,
    habilidades: [
      { nome: "Machado Brutal", dano: 59, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Rugido Intimidador", dano: 56, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 300000, duration_turns: 2, potency_base: 10, percentual_vida_maxima: null } },
      { nome: "Golpe de Guerra", dano: 73, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Harpia da Garganta",
    raro: false,
    habilidades: [
      { nome: "Rasante Cortante", dano: 54, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Grito Estridente", dano: 51, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "SILENCE", chance_ppm: 300000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Vendaval de Garras", dano: 66, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Troll das Pedras",
    raro: false,
    habilidades: [
      { nome: "Pancada de Pedra", dano: 61, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Esmagar Guarda", dano: 58, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 300000, duration_turns: 2, potency_base: 10, percentual_vida_maxima: null } },
      { nome: "Martelo de Dois Braços", dano: 75, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Chefe Orc Sangrento",
    raro: true,
    habilidades: [
      { nome: "Talho do Chefe", dano: 86, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Grito de Guerra Sangrento", dano: 78, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 350000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Golpe do Totem", dano: 105, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
      { nome: "Frenesi Sangrento", dano: 113, cooldown: 4, prioridade_base: 20, peso_uso: 2, status: { key: "BLEED", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.25 }, condition: { key: "TURN_AT_LEAST", config: {"turn":3}, score_bonus: 15 } },
    ],
  },
  {
    nome: "Morcego Cristalino",
    raro: false,
    habilidades: [
      { nome: "Mordida Cristalina", dano: 64, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Eco Desorientador", dano: 58, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLIND", chance_ppm: 300000, duration_turns: 2, potency_base: 10, percentual_vida_maxima: null } },
      { nome: "Mergulho Prismático", dano: 79, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Aranha de Pedra",
    raro: false,
    habilidades: [
      { nome: "Patada Pétrea", dano: 64, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Teia Mineral", dano: 58, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "PARALYZE", chance_ppm: 300000, duration_turns: 1, potency_base: 20, percentual_vida_maxima: null } },
      { nome: "Queda de Rocha", dano: 79, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Sentinela Rúnica",
    raro: false,
    habilidades: [
      { nome: "Lâmina Rúnica", dano: 72, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Pulso Interruptor", dano: 69, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "SILENCE", chance_ppm: 300000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Descarga Rúnica", dano: 90, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Guardião Rúnico Ancestral",
    raro: true,
    habilidades: [
      { nome: "Punho Ancestral", dano: 95, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Selo de Supressão", dano: 86, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "SILENCE", chance_ppm: 350000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Raio Rúnico", dano: 116, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
      { nome: "Sobrecarga Ancestral", dano: 133, cooldown: 4, prioridade_base: 20, peso_uso: 2, condition: { key: "TURN_AT_LEAST", config: {"turn":3}, score_bonus: 15 } },
    ],
  },
  {
    nome: "Draconídeo Jovem",
    raro: false,
    habilidades: [
      { nome: "Garra Dracônica", dano: 78, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Sopro Jovem", dano: 78, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BURN", chance_ppm: 250000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1 } },
      { nome: "Cauda Dracônica", dano: 96, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Basilisco de Pedra",
    raro: false,
    habilidades: [
      { nome: "Mordida Pétrea", dano: 84, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Olhar Calcificante", dano: 72, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "PARALYZE", chance_ppm: 350000, duration_turns: 1, potency_base: 25, percentual_vida_maxima: null } },
      { nome: "Cauda de Granito", dano: 104, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Salamandra de Obsidiana",
    raro: false,
    habilidades: [
      { nome: "Mordida Ígnea", dano: 90, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Labareda de Obsidiana", dano: 86, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BURN", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1 } },
      { nome: "Explosão Magmática", dano: 112, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Draco de Obsidiana",
    raro: true,
    habilidades: [
      { nome: "Garra de Obsidiana", dano: 112, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Sopro do Abismo", dano: 102, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BURN", chance_ppm: 400000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.25 } },
      { nome: "Mergulho Dracônico", dano: 138, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
      { nome: "Inferno de Obsidiana", dano: 148, cooldown: 4, prioridade_base: 20, peso_uso: 2, status: { key: "BURN", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.5 }, condition: { key: "TURN_AT_LEAST", config: {"turn":3}, score_bonus: 15 } },
    ],
  },
  {
    nome: "Ogro do Labirinto",
    raro: false,
    habilidades: [
      { nome: "Pancada de Clava", dano: 97, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Pisão Labiríntico", dano: 87, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "STUN", chance_ppm: 150000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Esmagamento Brutal", dano: 120, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Guardião Taurino",
    raro: false,
    habilidades: [
      { nome: "Chifrada de Guarda", dano: 93, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Guarda Rompida", dano: 89, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 300000, duration_turns: 2, potency_base: 10, percentual_vida_maxima: null } },
      { nome: "Carga do Corredor", dano: 116, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Draconídeo Veterano",
    raro: false,
    habilidades: [
      { nome: "Garra Veterana", dano: 107, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Sopro Escaldante", dano: 102, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BURN", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1 } },
      { nome: "Golpe de Asa", dano: 133, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Minotauro",
    raro: true,
    habilidades: [
      { nome: "Machado Labiríntico", dano: 123, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Rugido do Labirinto", dano: 112, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 350000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Carga Taurina", dano: 151, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
      { nome: "Sentença do Labirinto", dano: 174, cooldown: 4, prioridade_base: 20, peso_uso: 2, condition: { key: "TARGET_HP_BELOW_PCT", config: {"thresholdPct":40}, score_bonus: 15 } },
    ],
  },
];

const AI_PROFILE_ALVO = "TACTICAL";

function descricaoAutomatica(nomeHabilidade, nomeMonstro) {
  return `Habilidade de combate de ${nomeMonstro}: ${nomeHabilidade}.`;
}

async function encontrarIdMonstro(queryInterface, nome, transaction) {
  const [linhas] = await queryInterface.sequelize.query(
    `SELECT id, ai_profile FROM "AdventureMonsters" WHERE nome = :nome LIMIT 1;`,
    { replacements: { nome }, transaction },
  );
  return linhas[0] ?? null;
}

async function encontrarOuCriarPower(queryInterface, habilidade, nomeMonstro, transaction) {
  const [existentes] = await queryInterface.sequelize.query(
    `SELECT id, usage_scope FROM "Powers" WHERE nome = :nome LIMIT 1;`,
    { replacements: { nome: habilidade.nome }, transaction },
  );
  if (existentes[0]) {
    // §22 do documento -- nunca reaproveitar silenciosamente uma Power
    // de mesmo nome que claramente pertence a outro contexto.
    if (existentes[0].usage_scope === "CHARACTER") {
      throw new Error(
        `Power "${habilidade.nome}" já existe com usage_scope CHARACTER (destinada a personagem) -- não é seguro reutilizá-la como habilidade de monstro. Renomeie uma das duas antes de rodar esta migration.`,
      );
    }
    return existentes[0].id; // já existe como MONSTER/BOTH -- idempotente, não sobrescreve números
  }

  const [criadas] = await queryInterface.sequelize.query(
    `INSERT INTO "Powers"
       (nome, descricao, tipo_poder, custo_mana, dano_base, cura_base, cooldown, escala_atributo, valor_escala, tipo_dano, acquisition_scope, usage_scope, "createdAt", "updatedAt")
     VALUES
       (:nome, :descricao, 'Ativo', 0, :dano_base, 0, :cooldown, 'Forca', 0, 'Fisico', 'NORMAL', 'MONSTER', NOW(), NOW())
     RETURNING id;`,
    {
      replacements: {
        nome: habilidade.nome,
        descricao: descricaoAutomatica(habilidade.nome, nomeMonstro),
        dano_base: habilidade.dano,
        cooldown: habilidade.cooldown,
      },
      transaction,
    },
  );
  return criadas[0].id;
}

async function garantirStatusEffect(queryInterface, idPower, status, transaction) {
  const [existentes] = await queryInterface.sequelize.query(
    `SELECT id FROM power_status_effects WHERE id_power = :id_power AND status_key = :status_key LIMIT 1;`,
    { replacements: { id_power: idPower, status_key: status.key }, transaction },
  );
  if (existentes[0]) return;

  await queryInterface.sequelize.query(
    `INSERT INTO power_status_effects
       (id_power, status_key, chance_ppm, duration_turns, potency_base, potency_scale_attribute, potency_scale_value, percentual_vida_maxima, target, ativo, "createdAt", "updatedAt")
     VALUES
       (:id_power, :status_key, :chance_ppm, :duration_turns, :potency_base, NULL, 0, :percentual_vida_maxima, 'Enemy', true, NOW(), NOW());`,
    {
      replacements: {
        id_power: idPower,
        status_key: status.key,
        chance_ppm: status.chance_ppm,
        duration_turns: status.duration_turns,
        potency_base: status.potency_base,
        percentual_vida_maxima: status.percentual_vida_maxima,
      },
      transaction,
    },
  );
}

async function encontrarOuCriarMonsterAbility(queryInterface, idMonstro, idPower, habilidade, transaction) {
  const [existentes] = await queryInterface.sequelize.query(
    `SELECT id FROM monster_abilities WHERE id_monstro = :id_monstro AND id_power = :id_power LIMIT 1;`,
    { replacements: { id_monstro: idMonstro, id_power: idPower }, transaction },
  );
  if (existentes[0]) return existentes[0].id;

  const [criadas] = await queryInterface.sequelize.query(
    `INSERT INTO monster_abilities
       (id_monstro, id_power, prioridade_base, peso_uso, cooldown_override, custo_mana_override, target_policy, ativo, ordem_admin, "createdAt", "updatedAt")
     VALUES
       (:id_monstro, :id_power, :prioridade_base, :peso_uso, NULL, NULL, 'PLAYER', true, NULL, NOW(), NOW())
     RETURNING id;`,
    {
      replacements: {
        id_monstro: idMonstro,
        id_power: idPower,
        prioridade_base: habilidade.prioridade_base,
        peso_uso: habilidade.peso_uso,
      },
      transaction,
    },
  );
  return criadas[0].id;
}

async function garantirCondicao(queryInterface, idMonsterAbility, condition, transaction) {
  const [existentes] = await queryInterface.sequelize.query(
    `SELECT id FROM monster_ability_conditions WHERE id_monster_ability = :id_monster_ability AND condition_key = :condition_key LIMIT 1;`,
    { replacements: { id_monster_ability: idMonsterAbility, condition_key: condition.key }, transaction },
  );
  if (existentes[0]) return;

  await queryInterface.sequelize.query(
    `INSERT INTO monster_ability_conditions
       (id_monster_ability, condition_key, config, score_bonus, required, ativo, "createdAt", "updatedAt")
     VALUES
       (:id_monster_ability, :condition_key, :config, :score_bonus, true, true, NOW(), NOW());`,
    {
      replacements: {
        id_monster_ability: idMonsterAbility,
        condition_key: condition.key,
        config: JSON.stringify(condition.config),
        score_bonus: condition.score_bonus,
      },
      transaction,
    },
  );
}

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const monstro of MONSTROS) {
        const linhaMonstro = await encontrarIdMonstro(queryInterface, monstro.nome, transaction);
        if (!linhaMonstro) {
          throw new Error(
            `Monstro "${monstro.nome}" não encontrado em AdventureMonsters -- confira o seed da Aventura antes de rodar esta migration (nenhum ID foi hardcoded, a resolução é só por nome).`,
          );
        }

        for (const habilidade of monstro.habilidades) {
          const idPower = await encontrarOuCriarPower(queryInterface, habilidade, monstro.nome, transaction);
          if (habilidade.status) {
            await garantirStatusEffect(queryInterface, idPower, habilidade.status, transaction);
          }
          const idMonsterAbility = await encontrarOuCriarMonsterAbility(queryInterface, linhaMonstro.id, idPower, habilidade, transaction);
          if (habilidade.condition) {
            await garantirCondicao(queryInterface, idMonsterAbility, habilidade.condition, transaction);
          }
        }

        await queryInterface.sequelize.query(
          `UPDATE "AdventureMonsters" SET ai_profile = :ai_profile WHERE id = :id;`,
          { replacements: { ai_profile: AI_PROFILE_ALVO, id: linhaMonstro.id }, transaction },
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const nomesHabilidades = MONSTROS.flatMap((m) => m.habilidades.map((h) => h.nome));
      const nomesMonstros = MONSTROS.map((m) => m.nome);

      // monster_abilities primeiro (id_power é RESTRICT -- apagar a
      // Power antes falharia enquanto o vínculo existir; as condições
      // somem sozinhas via ON DELETE CASCADE de monster_ability_conditions).
      await queryInterface.sequelize.query(
        `DELETE FROM monster_abilities WHERE id_power IN (SELECT id FROM "Powers" WHERE nome IN (:nomes));`,
        { replacements: { nomes: nomesHabilidades }, transaction },
      );

      // Powers por último (power_status_effects some sozinho via CASCADE).
      // Só apaga as que ainda são usage_scope MONSTER -- defesa extra
      // contra remover algo que um admin tenha reaproveitado depois.
      await queryInterface.sequelize.query(
        `DELETE FROM "Powers" WHERE nome IN (:nomes) AND usage_scope = 'MONSTER';`,
        { replacements: { nomes: nomesHabilidades }, transaction },
      );

      await queryInterface.sequelize.query(
        `UPDATE "AdventureMonsters" SET ai_profile = 'BASIC' WHERE nome IN (:nomes);`,
        { replacements: { nomes: nomesMonstros }, transaction },
      );
    });
  },
};
