"use strict";

// IA de Combate PvE & Habilidades de Monstros V1 -- segundo lote (Zonas
// 51-100, "Vale dos Colossos" até "Trono do Eclipse"). Mesmo molde de
// 20270204010000-seed-monster-active-abilities.js (lote 1, Zonas 1-10):
// 100% infra já existente (Power/PowerStatusEffect/MonsterAbility/
// MonsterAbilityCondition + combatAiService/monsterCombatAdapter/
// monsterAbilityConfig), nenhum sistema paralelo.
//
// 3 habilidades ativas por monstro comum e 4 por "raro" (a 4ª é a
// "ultimate", gated por uma MonsterAbilityCondition required) nos 40
// monstros deste lote. Perfil de IA: TACTICAL pros 39 comuns/raros,
// BOSS só pro Seraphyr (Trono do Eclipse) -- ver AI_PROFILES em
// config/monsterAbilityConfig.js (BASIC/TACTICAL/BOSS/ELITE_BOSS); BOSS
// reduz o jitter de 10 pra 6, deixando a ultimate dele ainda mais
// garantida quando elegível.
//
// Idempotente: tudo resolvido por NOME (nunca ID fixo) -- Power.nome é
// UNIQUE no schema, então re-rodar a migration localiza as Powers/
// vínculos já criados e só preenche o que falta, nunca duplica nem
// sobrescreve valor numérico de uma Power/condição já existente (só
// cria quando ainda não existe). Nunca toca nos atributos de combate
// do monstro (vida/dano/defesa/agilidade/velocidade/nível/
// recompensas/drops) -- só ai_profile e os vínculos de habilidade.
//
// Pré-requisito (checado em runtime, nunca hardcoded): os 40 monstros
// abaixo e suas zonas já precisam existir em AdventureMonsters/
// AdventureZone (cadastrados pelo painel de Admin) -- confirmado antes
// de escrever esta migration. Se algum nome não bater exatamente, a
// migration lança erro e NÃO aplica nada parcialmente (tudo numa única
// transação) -- mas como o `npm start` deste backend roda `migrate`
// antes de subir o servidor, uma falha aqui trava o boot até o arquivo
// ser corrigido. Rodar primeiro em dev antes de promover pra main.

const MONSTROS = [
  {
    nome: "Javali Rochoso",
    raro: false,
    habilidades: [
      { nome: "Casco de Granito", dano: 115, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Investida Rochosa", dano: 105, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "STUN", chance_ppm: 200000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Presas Tectônicas", dano: 145, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Grifo das Escarpas",
    raro: false,
    habilidades: [
      { nome: "Garras da Escarpa", dano: 125, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Rajada Cegante", dano: 115, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLIND", chance_ppm: 350000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Mergulho Serrilhado", dano: 155, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "BLEED", chance_ppm: 300000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.0 } },
    ],
  },
  {
    nome: "Gigante das Colinas",
    raro: false,
    habilidades: [
      { nome: "Maça Colossal", dano: 125, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Rugido das Colinas", dano: 115, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 300000, duration_turns: 2, potency_base: 10, percentual_vida_maxima: null } },
      { nome: "Queda do Gigante", dano: 155, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "STUN", chance_ppm: 150000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
    ],
  },
  {
    nome: "Colosso de Basalto",
    raro: true,
    habilidades: [
      { nome: "Punho Basáltico", dano: 170, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Tremor Basáltico", dano: 150, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "STUN", chance_ppm: 250000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Ruptura Vulcânica", dano: 205, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
      { nome: "Cataclismo de Basalto", dano: 245, cooldown: 4, prioridade_base: 20, peso_uso: 2, status: { key: "BURN", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.5 }, condition: { key: "TURN_AT_LEAST", config: { turn: 3 }, score_bonus: 15 } },
    ],
  },
  {
    nome: "Caranguejo Ossário",
    raro: false,
    habilidades: [
      { nome: "Pinça Ossária", dano: 120, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Quebra-Carapaça", dano: 105, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 300000, duration_turns: 2, potency_base: 10, percentual_vida_maxima: null } },
      { nome: "Esmagamento de Quelícera", dano: 150, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Serpente Salina",
    raro: false,
    habilidades: [
      { nome: "Bote Salino", dano: 135, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Salmoura Venenosa", dano: 120, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "POISON", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.0 } },
      { nome: "Constrição de Sal", dano: 165, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "PARALYZE", chance_ppm: 300000, duration_turns: 1, potency_base: 20, percentual_vida_maxima: null } },
    ],
  },
  {
    nome: "Necrófago da Maré",
    raro: false,
    habilidades: [
      { nome: "Garras Encharcadas", dano: 140, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Mordida Necrótica", dano: 125, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLEED", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.0 } },
      { nome: "Banquete da Maré", dano: 170, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Kraken",
    raro: true,
    habilidades: [
      { nome: "Tentáculo Abissal", dano: 155, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Tinta Sepulcral", dano: 135, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLIND", chance_ppm: 400000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Constrição do Abismo", dano: 190, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "STUN", chance_ppm: 200000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Maelstrom dos Mortos", dano: 225, cooldown: 4, prioridade_base: 20, peso_uso: 2, status: { key: "PARALYZE", chance_ppm: 350000, duration_turns: 1, potency_base: 25, percentual_vida_maxima: null }, condition: { key: "TURN_AT_LEAST", config: { turn: 3 }, score_bonus: 15 } },
    ],
  },
  {
    nome: "Louva-a-Deus de Âmbar",
    raro: false,
    habilidades: [
      { nome: "Lâmina de Âmbar", dano: 115, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Reflexo Prismático", dano: 105, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLIND", chance_ppm: 350000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Ceifa Quitinosa", dano: 140, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "BLEED", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.0 } },
    ],
  },
  {
    nome: "Lobo Resinoso",
    raro: false,
    habilidades: [
      { nome: "Mordida Resinosa", dano: 120, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Resina Pegajosa", dano: 110, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "PARALYZE", chance_ppm: 350000, duration_turns: 1, potency_base: 20, percentual_vida_maxima: null } },
      { nome: "Salto da Matilha", dano: 150, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Treante Fossilizado",
    raro: false,
    habilidades: [
      { nome: "Galho Fossilizado", dano: 130, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Seiva Petrificada", dano: 115, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 350000, duration_turns: 2, potency_base: 10, percentual_vida_maxima: null } },
      { nome: "Raízes Ancestrais", dano: 160, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "STUN", chance_ppm: 200000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
    ],
  },
  {
    nome: "Rainha da Crisálida",
    raro: true,
    habilidades: [
      { nome: "Ferrão Real", dano: 170, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Poeira de Crisálida", dano: 150, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLIND", chance_ppm: 400000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Eclosão Predatória", dano: 210, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
      { nome: "Metamorfose Mortal", dano: 250, cooldown: 4, prioridade_base: 20, peso_uso: 2, status: { key: "POISON", chance_ppm: 400000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.5 }, condition: { key: "TURN_AT_LEAST", config: { turn: 3 }, score_bonus: 15 } },
    ],
  },
  {
    nome: "Escorpião Dourado",
    raro: false,
    habilidades: [
      { nome: "Pinças Douradas", dano: 130, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Ferrão Solar", dano: 115, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "POISON", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.0 } },
      { nome: "Cauda do Deserto", dano: 160, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "PARALYZE", chance_ppm: 300000, duration_turns: 1, potency_base: 20, percentual_vida_maxima: null } },
    ],
  },
  {
    nome: "Hiena das Dunas",
    raro: false,
    habilidades: [
      { nome: "Mordida das Dunas", dano: 145, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Rasgo Arenoso", dano: 130, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLEED", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.0 } },
      { nome: "Caçada Impiedosa", dano: 180, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Guardião de Arenito",
    raro: false,
    habilidades: [
      { nome: "Lâmina de Arenito", dano: 115, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Nuvem de Areia", dano: 100, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLIND", chance_ppm: 350000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Coluna de Pedra", dano: 140, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "STUN", chance_ppm: 200000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
    ],
  },
  {
    nome: "Esfinge Solar",
    raro: true,
    habilidades: [
      { nome: "Garra Solar", dano: 180, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Enigma Incandescente", dano: 160, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "SILENCE", chance_ppm: 350000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Raio do Meio-Dia", dano: 220, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "BURN", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.25 } },
      { nome: "Julgamento da Esfinge", dano: 260, cooldown: 4, prioridade_base: 20, peso_uso: 2, status: { key: "BURN", chance_ppm: 400000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.5 }, condition: { key: "TARGET_HP_BELOW_PCT", config: { thresholdPct: 40 }, score_bonus: 15 } },
    ],
  },
  {
    nome: "Afogado Real",
    raro: false,
    habilidades: [
      { nome: "Sabre Afogado", dano: 160, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Bruma Salgada", dano: 145, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 300000, duration_turns: 2, potency_base: 10, percentual_vida_maxima: null } },
      { nome: "Corte da Ressaca", dano: 200, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "BLEED", chance_ppm: 300000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.0 } },
    ],
  },
  {
    nome: "Naga das Profundezas",
    raro: false,
    habilidades: [
      { nome: "Tridente Profundo", dano: 155, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Veneno Abissal", dano: 140, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "POISON", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.0 } },
      { nome: "Espiral da Naga", dano: 190, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "PARALYZE", chance_ppm: 300000, duration_turns: 1, potency_base: 20, percentual_vida_maxima: null } },
    ],
  },
  {
    nome: "Guardião de Coral",
    raro: false,
    habilidades: [
      { nome: "Punho Coralino", dano: 160, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Fragmentos Cortantes", dano: 145, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLEED", chance_ppm: 300000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.0 } },
      { nome: "Muralha Quebradora", dano: 200, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "STUN", chance_ppm: 200000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
    ],
  },
  {
    nome: "Rei das Profundezas",
    raro: true,
    habilidades: [
      { nome: "Tridente Real", dano: 195, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Comando das Profundezas", dano: 175, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 350000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Onda Soberana", dano: 240, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
      { nome: "Decreto Abissal", dano: 285, cooldown: 4, prioridade_base: 20, peso_uso: 2, status: { key: "SILENCE", chance_ppm: 350000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null }, condition: { key: "TARGET_HP_BELOW_PCT", config: { thresholdPct: 40 }, score_bonus: 15 } },
    ],
  },
  {
    nome: "Águia Trovejante",
    raro: false,
    habilidades: [
      { nome: "Garra Trovejante", dano: 185, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Arco Elétrico", dano: 165, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "PARALYZE", chance_ppm: 350000, duration_turns: 1, potency_base: 25, percentual_vida_maxima: null } },
      { nome: "Mergulho do Trovão", dano: 230, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Yeti dos Picos",
    raro: false,
    habilidades: [
      { nome: "Punho Glacial", dano: 155, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Rugido Branco", dano: 140, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 350000, duration_turns: 2, potency_base: 10, percentual_vida_maxima: null } },
      { nome: "Avalanche Corporal", dano: 190, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "STUN", chance_ppm: 200000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
    ],
  },
  {
    nome: "Elemental da Tempestade",
    raro: false,
    habilidades: [
      { nome: "Raio Vivo", dano: 180, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Descarga Estática", dano: 160, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "PARALYZE", chance_ppm: 400000, duration_turns: 1, potency_base: 25, percentual_vida_maxima: null } },
      { nome: "Tempestade Encarnada", dano: 220, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "BLIND", chance_ppm: 350000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
    ],
  },
  {
    nome: "Roc Tempestuoso",
    raro: true,
    habilidades: [
      { nome: "Bico do Trovão", dano: 225, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Asas da Tormenta", dano: 200, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLIND", chance_ppm: 350000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Queda Celeste", dano: 275, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "STUN", chance_ppm: 200000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Olho do Furacão", dano: 325, cooldown: 4, prioridade_base: 20, peso_uso: 2, status: { key: "PARALYZE", chance_ppm: 400000, duration_turns: 1, potency_base: 25, percentual_vida_maxima: null }, condition: { key: "TURN_AT_LEAST", config: { turn: 3 }, score_bonus: 15 } },
    ],
  },
  {
    nome: "Flor Carnívora",
    raro: false,
    habilidades: [
      { nome: "Mordida Floral", dano: 185, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Pólen Tóxico", dano: 165, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "POISON", chance_ppm: 400000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.0 } },
      { nome: "Cipó Constritor", dano: 225, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "PARALYZE", chance_ppm: 300000, duration_turns: 1, potency_base: 20, percentual_vida_maxima: null } },
    ],
  },
  {
    nome: "Besouro Pestilento",
    raro: false,
    habilidades: [
      { nome: "Mandíbula Pestilenta", dano: 185, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Nuvem Pestífera", dano: 165, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "POISON", chance_ppm: 400000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.25 } },
      { nome: "Investida Carapaçada", dano: 225, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "STUN", chance_ppm: 150000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
    ],
  },
  {
    nome: "Ent Corrompido",
    raro: false,
    habilidades: [
      { nome: "Braço Corrompido", dano: 145, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Esporos da Ruína", dano: 130, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 350000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Raízes Profanas", dano: 175, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "POISON", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.0 } },
    ],
  },
  {
    nome: "Rainha Mandrágora",
    raro: true,
    habilidades: [
      { nome: "Chicote de Raiz", dano: 210, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Grito da Mandrágora", dano: 185, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "SILENCE", chance_ppm: 400000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Névoa Alucinógena", dano: 260, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "BLIND", chance_ppm: 400000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Coro das Pragas", dano: 305, cooldown: 4, prioridade_base: 20, peso_uso: 2, status: { key: "POISON", chance_ppm: 400000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.5 }, condition: { key: "TURN_AT_LEAST", config: { turn: 3 }, score_bonus: 15 } },
    ],
  },
  {
    nome: "Armadura Encantada",
    raro: false,
    habilidades: [
      { nome: "Espada Encantada", dano: 210, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Impacto Rúnico", dano: 185, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "STUN", chance_ppm: 200000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Investida Implacável", dano: 255, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Quimera Arcana",
    raro: false,
    habilidades: [
      { nome: "Garra Quimérica", dano: 195, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Hálito Tríplice", dano: 175, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BURN", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.25 } },
      { nome: "Bote Bestial", dano: 240, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Sentinela Astral",
    raro: false,
    habilidades: [
      { nome: "Lança Astral", dano: 180, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Selo de Interdição", dano: 160, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "SILENCE", chance_ppm: 350000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Queda Estelar", dano: 220, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "BLIND", chance_ppm: 350000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
    ],
  },
  {
    nome: "Arquimago Sem-Rosto",
    raro: true,
    habilidades: [
      { nome: "Projétil Arcano", dano: 245, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Selo Sem-Rosto", dano: 215, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "SILENCE", chance_ppm: 400000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Colapso Astral do Arquimago", dano: 300, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
      { nome: "Horizonte Proibido", dano: 355, cooldown: 4, prioridade_base: 20, peso_uso: 2, status: { key: "BLIND", chance_ppm: 400000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null }, condition: { key: "TARGET_HP_BELOW_PCT", config: { thresholdPct: 40 }, score_bonus: 15 } },
    ],
  },
  {
    nome: "Rastreador do Vazio",
    raro: false,
    habilidades: [
      { nome: "Lâmina do Vazio", dano: 235, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Marca da Fenda", dano: 210, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLEED", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.25 } },
      { nome: "Passo Entre Mundos", dano: 290, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Devorador Etéreo",
    raro: false,
    habilidades: [
      { nome: "Mordida Etérea", dano: 240, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Drenagem do Nada", dano: 215, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 350000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Ruptura de Essência", dano: 295, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
    ],
  },
  {
    nome: "Horror Prismático",
    raro: false,
    habilidades: [
      { nome: "Corte Prismático", dano: 250, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Refração Cegante", dano: 225, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLIND", chance_ppm: 400000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Estilhaço Cromático", dano: 310, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "PARALYZE", chance_ppm: 350000, duration_turns: 1, potency_base: 25, percentual_vida_maxima: null } },
    ],
  },
  {
    nome: "Arauto do Nada",
    raro: true,
    habilidades: [
      { nome: "Toque do Nada", dano: 275, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Voz do Vazio", dano: 240, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "SILENCE", chance_ppm: 400000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Rasgo Ontológico", dano: 335, cooldown: 3, prioridade_base: 14, peso_uso: 2 },
      { nome: "Aniquilação do Arauto", dano: 400, cooldown: 4, prioridade_base: 20, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 400000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null }, condition: { key: "TURN_AT_LEAST", config: { turn: 3 }, score_bonus: 15 } },
    ],
  },
  {
    nome: "Cavaleiro do Eclipse",
    raro: false,
    habilidades: [
      { nome: "Lâmina Eclipsada", dano: 255, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Marca Crepuscular", dano: 225, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "WEAKEN", chance_ppm: 350000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Carga do Eclipse", dano: 310, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "BLEED", chance_ppm: 350000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.25 } },
    ],
  },
  {
    nome: "Guardião Umbral",
    raro: false,
    habilidades: [
      { nome: "Punho Umbral", dano: 255, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Véu da Sombra", dano: 230, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLIND", chance_ppm: 400000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
      { nome: "Prisão Umbral", dano: 315, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "PARALYZE", chance_ppm: 350000, duration_turns: 1, potency_base: 25, percentual_vida_maxima: null } },
    ],
  },
  {
    nome: "Fera Crepuscular",
    raro: false,
    habilidades: [
      { nome: "Garra Crepuscular", dano: 285, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Mordida Sombria", dano: 255, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BLEED", chance_ppm: 400000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.25 } },
      { nome: "Salto da Penumbra", dano: 350, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "BLIND", chance_ppm: 350000, duration_turns: 2, potency_base: 12, percentual_vida_maxima: null } },
    ],
  },
  {
    nome: "Seraphyr, o Dragão Sagrado",
    raro: true,
    aiProfile: "BOSS",
    habilidades: [
      { nome: "Garra Sagrada", dano: 700, cooldown: 1, prioridade_base: 8, peso_uso: 3 },
      { nome: "Sopro do Eclipse", dano: 620, cooldown: 2, prioridade_base: 10, peso_uso: 2, status: { key: "BURN", chance_ppm: 400000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.5 } },
      { nome: "Julgamento Dracônico", dano: 860, cooldown: 3, prioridade_base: 14, peso_uso: 2, status: { key: "SILENCE", chance_ppm: 350000, duration_turns: 1, potency_base: 0, percentual_vida_maxima: null } },
      { nome: "Apoteose do Eclipse", dano: 1020, cooldown: 4, prioridade_base: 20, peso_uso: 2, status: { key: "BURN", chance_ppm: 400000, duration_turns: 2, potency_base: 0, percentual_vida_maxima: 1.5 }, condition: { key: "TURN_AT_LEAST", config: { turn: 3 }, score_bonus: 15 } },
    ],
  },
];

const AI_PROFILE_PADRAO = "TACTICAL";

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
    // Nunca reaproveitar silenciosamente uma Power de mesmo nome que
    // claramente pertence a outro contexto (mesma regra do lote 1).
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
          // Pula só este monstro (não aborta a migration inteira) --
          // ambientes sem o cadastro completo de Admin (ex.: dev, que
          // não espelha 1:1 os monstros criados em produção) não devem
          // travar o boot do servidor por faltar conteúdo que nem é
          // obrigatório pra app rodar. Em produção, onde os 40 monstros
          // já existem, isto nunca é atingido -- comportamento idêntico
          // a antes.
          console.warn(
            `[seed-monster-active-abilities-zonas-51-100] Monstro "${monstro.nome}" não encontrado em AdventureMonsters -- pulando (cadastre no Admin pra este ambiente ganhar as habilidades dele).`,
          );
          continue;
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
          { replacements: { ai_profile: monstro.aiProfile ?? AI_PROFILE_PADRAO, id: linhaMonstro.id }, transaction },
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
