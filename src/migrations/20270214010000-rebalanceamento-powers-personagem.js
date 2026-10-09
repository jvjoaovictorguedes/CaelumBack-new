"use strict";

// Rebalanceamento Definitivo das Powers de PERSONAGEM (CHARACTER/BOTH).
// Migration CORRETIVA, não destrutiva: atualiza Powers EXISTENTES
// in-place (busca por nome — Power.nome é UNIQUE), preserva Power.id,
// CharacterAbilities, nivel_habilidade, is_active e histórico. Nunca
// usa scripts/reseed-poderes-producao.js (apaga CharacterAbilities).
//
// Cada Power canônica abaixo:
//  - É buscada por nome. Exatamente 1 ocorrência esperada; >1 falha
//    (ambíguo, precisa de intervenção manual). 0 ocorrências CRIA a
//    Power do zero com os valores canônicos (o catálogo original —
//    scripts/reseed-poderes-producao.js, nunca executado por esta
//    migration, só lido como referência — confirma que todas essas
//    ~90 Powers já foram semeadas em produção; zero é tratado como
//    "precisa existir e não existe ainda", não como erro fatal, pra
//    nunca abortar a migration inteira por causa de uma única Power
//    ausente num ambiente específico — mas o console.log deixa bem
//    claro qual aconteceu, nunca aplica "a metade" silenciosamente).
//  - Tem PowerStatusEffect/PowerCombatEffect RECRIADOS do zero (delete
//    por id_power + insert) — idempotente por natureza: reaplicar esta
//    migration num banco onde ela já rodou nunca duplica linha.
//
// Passivos (Couraça de Batalha, Instinto Assassino, Pele de Ferro,
// Fluxo Arcano, Mente Afiada, Reserva Arcana etc.): o bônus de
// atributo LEGADO (valor_escala alto escalando Força/Vitalidade/...)
// é zerado aqui (valor_escala=0) e substituído por um
// PowerCombatEffect PASSIVE com identidade mecânica própria (§23) —
// nunca os dois ao mesmo tempo.
const { DataTypes } = require("sequelize");

const STATUS = {
  BURN_NORMAL: { status_key: "BURN", chance_ppm: 500000, duration_turns: 2, percentual_vida_maxima: 0.5, target: "Enemy" },
  BURN_FORTE: { status_key: "BURN", chance_ppm: 550000, duration_turns: 2, percentual_vida_maxima: 0.6, target: "Enemy" },
  BLEED_NORMAL: { status_key: "BLEED", chance_ppm: 450000, duration_turns: 2, percentual_vida_maxima: 0.45, target: "Enemy" },
  BLEED_FORTE: { status_key: "BLEED", chance_ppm: 500000, duration_turns: 2, percentual_vida_maxima: 0.55, target: "Enemy" },
  FREEZE_LEVE: { status_key: "FREEZE", chance_ppm: 220000, duration_turns: 1, potency_base: 0, target: "Enemy" },
  FREEZE_FORTE: { status_key: "FREEZE", chance_ppm: 300000, duration_turns: 1, potency_base: 0, target: "Enemy" },
  STUN_LEVE: { status_key: "STUN", chance_ppm: 180000, duration_turns: 1, potency_base: 0, target: "Enemy" },
  STUN_FORTE: { status_key: "STUN", chance_ppm: 250000, duration_turns: 1, potency_base: 0, target: "Enemy" },
  PARALYZE: { status_key: "PARALYZE", chance_ppm: 1000000, duration_turns: 1, potency_base: 25, target: "Enemy" },
  PARALYZE_FORTE: { status_key: "PARALYZE", chance_ppm: 1000000, duration_turns: 1, potency_base: 30, target: "Enemy" },
  BLIND: { status_key: "BLIND", chance_ppm: 400000, duration_turns: 1, potency_base: 15, target: "Enemy" },
  WEAKEN: { status_key: "WEAKEN", chance_ppm: 1000000, duration_turns: 2, potency_base: 12, target: "Enemy" },
};

// §8-22 — especificação canônica desta entrega. Uma linha por Power.
const POWERS = [
  // ---------------------------------------------------------------
  // §8 GUERREIRO
  // ---------------------------------------------------------------
  { nome: "Golpe Poderoso", tipo_poder: "Ativo", custo_mana: 4, cooldown: 1, dano_base: 12, escala_atributo: "Forca", valor_escala: 1.15, tipo_dano: "Fisico", affinity_mode: "INHERIT_WEAPON",
    descricao: "Um golpe que concentra toda a força do herói num único ataque." },
  { nome: "Corte Selvagem", tipo_poder: "Ativo", custo_mana: 5, cooldown: 2, dano_base: 13, escala_atributo: "Forca", valor_escala: 1.15, tipo_dano: "Fisico", affinity_mode: "EXPLICIT", affinity_key: "SLASH",
    descricao: "Um corte rápido e impreciso, que abre feridas profundas antes do inimigo perceber.", status: [STATUS.BLEED_NORMAL] },
  { nome: "Investida Brutal", tipo_poder: "Ativo", custo_mana: 7, cooldown: 2, dano_base: 16, escala_atributo: "Forca", valor_escala: 1.20, tipo_dano: "Fisico", affinity_mode: "EXPLICIT", affinity_key: "BLUNT",
    descricao: "Avança contra o inimigo com o peso do corpo inteiro, ignorando a própria guarda." },
  { nome: "Investida Relâmpago", tipo_poder: "Ativo", custo_mana: 8, cooldown: 2, dano_base: 18, escala_atributo: "Agilidade", valor_escala: 1.25, tipo_dano: "Fisico", affinity_mode: "INHERIT_WEAPON",
    descricao: "Fecha a distância num piscar de olhos, usando pura velocidade em vez de força bruta — \"Relâmpago\" aqui é agilidade, não o elemento Raio.",
    combatEffects: [{ trigger: "ON_POWER_CAST", target: "SELF", effect_key: "DODGE_CHANCE_PCT", magnitude_base: 8, duration_turns: 1, scale_with_ability_level: false }] },
  { nome: "Fúria de Aço", tipo_poder: "Ativo", custo_mana: 11, cooldown: 3, dano_base: 21, escala_atributo: "Forca", valor_escala: 1.30, tipo_dano: "Fisico", affinity_mode: "INHERIT_WEAPON",
    descricao: "Uma sequência de golpes cada vez mais violentos — o primeiro golpe já sai reforçado pela fúria do combate.",
    combatEffects: [{ trigger: "ON_POWER_CAST", target: "SELF", effect_key: "DAMAGE_DEALT_PCT", magnitude_base: 10, duration_turns: 2, scale_with_ability_level: false }] },
  { nome: "Couraça de Batalha", tipo_poder: "Passivo", custo_mana: 0, cooldown: 0, dano_base: 0, cura_base: 0, escala_atributo: "Vitalidade", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "Anos de combate endureceram os reflexos defensivos — Defesa permanente adicional.",
    combatEffects: [{ trigger: "PASSIVE", target: "SELF", effect_key: "DEFENSE_FLAT", magnitude_base: 6, scale_with_ability_level: true }] },
  { nome: "Golpe Retumbante", tipo_poder: "Ativo", custo_mana: 13, cooldown: 3, dano_base: 24, escala_atributo: "Forca", valor_escala: 1.34, tipo_dano: "Fisico", affinity_mode: "EXPLICIT", affinity_key: "BLUNT",
    descricao: "Um golpe pesado o suficiente pra fazer o chão tremer e atordoar o inimigo ao redor do impacto.", status: [STATUS.STUN_LEVE] },
  { nome: "Brado de Guerra", tipo_poder: "Ativo", custo_mana: 14, cooldown: 4, dano_base: 0, cura_base: 0, escala_atributo: "Vitalidade", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "Um grito que fortalece temporariamente o guerreiro e o torna mais resistente a efeitos de status — nunca uma cura direta.",
    combatEffects: [
      { trigger: "ON_POWER_CAST", target: "SELF", effect_key: "DAMAGE_DEALT_PCT", magnitude_base: 12, duration_turns: 2, scale_with_ability_level: false },
      { trigger: "ON_POWER_CAST", target: "SELF", effect_key: "STATUS_RESISTANCE_PCT", magnitude_base: 20, duration_turns: 2, scale_with_ability_level: false },
    ] },
  { nome: "Instinto Assassino", tipo_poder: "Passivo", custo_mana: 0, cooldown: 0, dano_base: 0, cura_base: 0, escala_atributo: "Forca", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "Anos de combate afiaram os reflexos até virarem puro instinto — chance de crítico permanente adicional.",
    combatEffects: [{ trigger: "PASSIVE", target: "SELF", effect_key: "CRIT_CHANCE_PCT", magnitude_base: 6, scale_with_ability_level: true }] },
  { nome: "Investida Devastadora", tipo_poder: "Ativo", custo_mana: 17, cooldown: 3, dano_base: 30, escala_atributo: "Forca", valor_escala: 1.42, tipo_dano: "Fisico", affinity_mode: "EXPLICIT", affinity_key: "BLUNT",
    descricao: "Concentra todo o peso do corpo num único golpe pra atravessar qualquer guarda, enfraquecendo o inimigo.", status: [STATUS.WEAKEN] },
  { nome: "Pele de Ferro", tipo_poder: "Passivo", custo_mana: 0, cooldown: 0, dano_base: 0, cura_base: 0, escala_atributo: "Vitalidade", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "A pele endurece de tanto absorver golpes em combate — reduz permanentemente o dano recebido.",
    combatEffects: [{ trigger: "PASSIVE", target: "SELF", effect_key: "DAMAGE_TAKEN_PCT", magnitude_base: -6, scale_with_ability_level: true }] },
  { nome: "Golpe Sísmico", tipo_poder: "Ativo", custo_mana: 21, cooldown: 4, dano_base: 33, escala_atributo: "Forca", valor_escala: 1.48, tipo_dano: "Fisico", affinity_mode: "EXPLICIT", affinity_key: "BLUNT",
    descricao: "Um golpe devastador contra o chão que ecoa através do inimigo inteiro, atordoando-o com força.", status: [STATUS.STUN_FORTE] },
  { nome: "Fúria Implacável", tipo_poder: "Ativo", custo_mana: 25, cooldown: 3, dano_base: 43, escala_atributo: "Forca", valor_escala: 1.60, tipo_dano: "Fisico", affinity_mode: "INHERIT_WEAPON",
    descricao: "Nada mais importa além de derrubar o inimigo à frente — cada golpe vem mais forte que o último." },
  { nome: "Golpe do Titã", tipo_poder: "Ativo", custo_mana: 30, cooldown: 5, dano_base: 52, escala_atributo: "Forca", valor_escala: 1.70, tipo_dano: "Fisico", affinity_mode: "EXPLICIT", affinity_key: "BLUNT",
    descricao: "O golpe físico definitivo do Guerreiro — capstone da linhagem marcial, concentra toda uma vida de treino num único impacto." },

  // ---------------------------------------------------------------
  // §9 MAGO
  // ---------------------------------------------------------------
  { nome: "Cura Arcana", tipo_poder: "Ativo", custo_mana: 9, cooldown: 2, dano_base: 0, cura_base: 14, escala_atributo: "Inteligencia", valor_escala: 1.10, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "Recupera vida usando energia mágica canalizada pelo próprio corpo." },
  { nome: "Bola de Fogo", tipo_poder: "Ativo", custo_mana: 10, cooldown: 2, dano_base: 11, escala_atributo: "Inteligencia", valor_escala: 1.15, tipo_dano: "Magico", affinity_mode: "EXPLICIT", affinity_key: "FIRE",
    descricao: "Uma explosão de energia arcana imbuída de fogo, lançada contra o inimigo.", status: [STATUS.BURN_NORMAL] },
  { nome: "Mísseis Arcanos", tipo_poder: "Ativo", custo_mana: 8, cooldown: 1, dano_base: 12, escala_atributo: "Inteligencia", valor_escala: 1.18, tipo_dano: "Magico", affinity_mode: "NEUTRAL",
    descricao: "Projéteis de energia arcana pura, sem elemento concreto — rápidos de conjurar, prontos a qualquer momento." },
  { nome: "Lança de Gelo", tipo_poder: "Ativo", custo_mana: 15, cooldown: 3, dano_base: 17, escala_atributo: "Inteligencia", valor_escala: 1.25, tipo_dano: "Magico", affinity_mode: "EXPLICIT", affinity_key: "ICE",
    descricao: "Uma lança de gelo puro, rápida o bastante pra atravessar qualquer guarda desprevenida e congelar o inimigo.", status: [STATUS.FREEZE_LEVE] },
  { nome: "Escudo de Mana", tipo_poder: "Ativo", custo_mana: 18, cooldown: 3, dano_base: 0, cura_base: 0, escala_atributo: "Inteligencia", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "Concede uma barreira temporária de energia arcana que absorve dano — nunca recupera Vida diretamente.",
    combatEffects: [{ trigger: "ON_POWER_CAST", target: "SELF", effect_key: "GRANT_SHIELD", magnitude_base: 18, scale_attribute: "Inteligencia", scale_value: 0.35, scale_with_ability_level: true, duration_turns: 2 }] },
  { nome: "Fluxo Arcano", tipo_poder: "Passivo", custo_mana: 0, cooldown: 0, dano_base: 0, cura_base: 0, escala_atributo: "Inteligencia", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "O domínio arcano reduz o custo de Mana de todas as habilidades do Mago.",
    combatEffects: [{ trigger: "PASSIVE", target: "SELF", effect_key: "MANA_COST_PCT", magnitude_base: -6, scale_with_ability_level: true }] },
  { nome: "Explosão Arcana", tipo_poder: "Ativo", custo_mana: 20, cooldown: 2, dano_base: 25, escala_atributo: "Inteligencia", valor_escala: 1.38, tipo_dano: "Magico", affinity_mode: "NEUTRAL",
    descricao: "Concentra energia arcana bruta até liberá-la de uma vez, sem elemento ou piedade." },
  { nome: "Corrente Arcana", tipo_poder: "Ativo", custo_mana: 22, cooldown: 2, dano_base: 29, escala_atributo: "Inteligencia", valor_escala: 1.40, tipo_dano: "Magico", affinity_mode: "NEUTRAL",
    descricao: "Um fluxo contínuo de energia arcana pura, atingindo o inimigo diretamente." },
  { nome: "Mente Afiada", tipo_poder: "Passivo", custo_mana: 0, cooldown: 0, dano_base: 0, cura_base: 0, escala_atributo: "Inteligencia", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "A clareza mental do Mago encontra as fraquezas exatas do inimigo com mais frequência — chance de crítico permanente adicional.",
    combatEffects: [{ trigger: "PASSIVE", target: "SELF", effect_key: "CRIT_CHANCE_PCT", magnitude_base: 5, scale_with_ability_level: true }] },
  { nome: "Renascer Místico", tipo_poder: "Ativo", custo_mana: 28, cooldown: 4, dano_base: 0, cura_base: 35, escala_atributo: "Inteligencia", valor_escala: 1.20, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "Um ritual de cura profunda que, além de reverter ferimentos graves, purifica o corpo de queimaduras, sangramentos e venenos.",
    combatEffects: [
      { trigger: "ON_POWER_CAST", target: "SELF", effect_key: "CLEANSE_STATUS", magnitude_base: 0, config: { status_key: "BURN" } },
      { trigger: "ON_POWER_CAST", target: "SELF", effect_key: "CLEANSE_STATUS", magnitude_base: 0, config: { status_key: "BLEED" } },
      { trigger: "ON_POWER_CAST", target: "SELF", effect_key: "CLEANSE_STATUS", magnitude_base: 0, config: { status_key: "POISON" } },
    ] },
  { nome: "Nova Congelante", tipo_poder: "Ativo", custo_mana: 30, cooldown: 4, dano_base: 32, escala_atributo: "Inteligencia", valor_escala: 1.45, tipo_dano: "Magico", affinity_mode: "EXPLICIT", affinity_key: "ICE",
    descricao: "Uma explosão de gelo puro, forte o bastante pra congelar o inimigo no lugar.", status: [STATUS.FREEZE_FORTE] },
  { nome: "Reserva Arcana", tipo_poder: "Passivo", custo_mana: 0, cooldown: 0, dano_base: 0, cura_base: 0, escala_atributo: "Inteligencia", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "O Mago aprendeu a puxar energia arcana do ambiente continuamente, regenerando Mana por turno.",
    combatEffects: [{ trigger: "PASSIVE", target: "SELF", effect_key: "REGEN_MANA_PERCENT", magnitude_base: 1.5, scale_with_ability_level: true }] },
  { nome: "Tempestade Arcana", tipo_poder: "Ativo", custo_mana: 34, cooldown: 3, dano_base: 42, escala_atributo: "Inteligencia", valor_escala: 1.55, tipo_dano: "Magico", affinity_mode: "NEUTRAL",
    descricao: "Uma tempestade de energia arcana pura desabando sobre o inimigo." },
  { nome: "Meteoro Arcano", tipo_poder: "Ativo", custo_mana: 38, cooldown: 4, dano_base: 50, escala_atributo: "Inteligencia", valor_escala: 1.60, tipo_dano: "Magico", affinity_mode: "NEUTRAL",
    descricao: "Invoca um fragmento de poder puro do céu — o ápice da destruição arcana, sem elemento concreto." },
  { nome: "Colapso Dimensional", tipo_poder: "Ativo", custo_mana: 44, cooldown: 5, dano_base: 58, escala_atributo: "Inteligencia", valor_escala: 1.70, tipo_dano: "Magico", affinity_mode: "NEUTRAL",
    descricao: "O capstone mágico do Mago — rasga o próprio espaço com energia arcana pura. Devastador, mas nunca Dano Verdadeiro." },

  // ---------------------------------------------------------------
  // §10 HUMANO
  // ---------------------------------------------------------------
  { nome: "Determinação", tipo_poder: "Ativo", custo_mana: 8, cooldown: 2, dano_base: 0, cura_base: 12, escala_atributo: "Vitalidade", valor_escala: 1.0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "A força de vontade humana se manifesta como recuperação de vida em pleno combate." },
  { nome: "Vontade Inabalável", tipo_poder: "Ativo", custo_mana: 10, cooldown: 3, dano_base: 0, cura_base: 18, escala_atributo: "Vitalidade", valor_escala: 1.0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "A adaptabilidade humana em forma de resiliência — recupera-se e resiste a efeitos de status onde outras raças cederiam.",
    combatEffects: [{ trigger: "ON_POWER_CAST", target: "SELF", effect_key: "STATUS_RESISTANCE_PCT", magnitude_base: 20, duration_turns: 2, scale_with_ability_level: false }] },
  { nome: "Adaptação Rápida", tipo_poder: "Passivo", custo_mana: 0, cooldown: 0, dano_base: 0, cura_base: 0, escala_atributo: "Velocidade", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "A versatilidade humana se traduz em precisão permanente adicional em combate.",
    combatEffects: [{ trigger: "PASSIVE", target: "SELF", effect_key: "HIT_CHANCE_PCT", magnitude_base: 5, scale_with_ability_level: true }] },
  { nome: "Coração Resiliente", tipo_poder: "Passivo", custo_mana: 0, cooldown: 0, dano_base: 0, cura_base: 0, escala_atributo: "Vitalidade", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "A resiliência humana reduz permanentemente a chance de efeitos de status surtirem efeito.",
    combatEffects: [{ trigger: "PASSIVE", target: "SELF", effect_key: "STATUS_RESISTANCE_PCT", magnitude_base: 8, scale_with_ability_level: true }] },
  { nome: "Fúria Silenciosa", tipo_poder: "Ativo", custo_mana: 12, cooldown: 2, dano_base: 24, escala_atributo: "Forca", valor_escala: 1.30, tipo_dano: "Fisico", affinity_mode: "INHERIT_WEAPON",
    descricao: "Uma explosão contida de força, sem grito nem aviso — só o golpe." },
  { nome: "Instinto de Sobrevivência", tipo_poder: "Ativo", custo_mana: 20, cooldown: 4, dano_base: 0, cura_base: 30, escala_atributo: "Vitalidade", valor_escala: 1.20, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "No limite, o instinto humano de sobrevivência reduz o dano recebido enquanto o corpo se recupera.",
    combatEffects: [{ trigger: "ON_POWER_CAST", target: "SELF", effect_key: "DAMAGE_TAKEN_PCT", magnitude_base: -15, duration_turns: 2, scale_with_ability_level: false }] },

  // ---------------------------------------------------------------
  // §11 ELFO
  // ---------------------------------------------------------------
  { nome: "Passo Élfico", tipo_poder: "Ativo", custo_mana: 5, cooldown: 2, dano_base: 10, escala_atributo: "Agilidade", valor_escala: 1.15, tipo_dano: "Fisico", affinity_mode: "EXPLICIT", affinity_key: "PIERCE",
    descricao: "Um movimento rápido e preciso, guiado por reflexos élficos — deixa o corpo mais difícil de acertar logo em seguida.",
    combatEffects: [{ trigger: "ON_POWER_CAST", target: "SELF", effect_key: "DODGE_CHANCE_PCT", magnitude_base: 10, duration_turns: 1, scale_with_ability_level: false }] },
  { nome: "Flecha Élfica", tipo_poder: "Ativo", custo_mana: 8, cooldown: 2, dano_base: 14, escala_atributo: "Agilidade", valor_escala: 1.30, tipo_dano: "Fisico", affinity_mode: "EXPLICIT", affinity_key: "PIERCE",
    descricao: "Um disparo preciso guiado por séculos de instinto élfico com a natureza." },
  { nome: "Graça Élfica", tipo_poder: "Passivo", custo_mana: 0, cooldown: 0, dano_base: 0, cura_base: 0, escala_atributo: "Agilidade", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "A graça natural élfica se traduz em esquiva permanente adicional em combate.",
    combatEffects: [{ trigger: "PASSIVE", target: "SELF", effect_key: "DODGE_CHANCE_PCT", magnitude_base: 5, scale_with_ability_level: true }] },
  { nome: "Chuva de Flechas", tipo_poder: "Ativo", custo_mana: 16, cooldown: 3, dano_base: 26, escala_atributo: "Agilidade", valor_escala: 1.35, tipo_dano: "Fisico", affinity_mode: "EXPLICIT", affinity_key: "PIERCE",
    descricao: "Uma rajada concentrada de flechas disparadas contra o mesmo alvo — nunca uma área de efeito, só um único alvo recebendo muito mais flechas." },
  { nome: "Reflexos Élficos", tipo_poder: "Passivo", custo_mana: 0, cooldown: 0, dano_base: 0, cura_base: 0, escala_atributo: "Agilidade", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "Reflexos aguçados pela natureza élfica encontram aberturas com mais frequência — chance de crítico permanente adicional.",
    combatEffects: [{ trigger: "PASSIVE", target: "SELF", effect_key: "CRIT_CHANCE_PCT", magnitude_base: 5, scale_with_ability_level: true }] },
  { nome: "Dança das Lâminas", tipo_poder: "Ativo", custo_mana: 22, cooldown: 3, dano_base: 32, escala_atributo: "Agilidade", valor_escala: 1.45, tipo_dano: "Fisico", affinity_mode: "EXPLICIT", affinity_key: "SLASH",
    descricao: "Uma sequência fluida de cortes precisos que abrem feridas profundas no inimigo.", status: [STATUS.BLEED_FORTE] },

  // ---------------------------------------------------------------
  // §12 ANÃO
  // ---------------------------------------------------------------
  { nome: "Golpe de Martelo", tipo_poder: "Ativo", custo_mana: 6, cooldown: 2, dano_base: 14, escala_atributo: "Forca", valor_escala: 1.20, tipo_dano: "Fisico", affinity_mode: "EXPLICIT", affinity_key: "BLUNT",
    descricao: "Um golpe de martelo pesado o bastante pra atordoar quem for atingido.",
    status: [{ status_key: "STUN", chance_ppm: 150000, duration_turns: 1, potency_base: 0, target: "Enemy" }] },
  { nome: "Fúria Anã", tipo_poder: "Ativo", custo_mana: 6, cooldown: 2, dano_base: 16, escala_atributo: "Forca", valor_escala: 1.25, tipo_dano: "Fisico", affinity_mode: "EXPLICIT", affinity_key: "BLUNT",
    descricao: "A teimosia da rocha em forma de golpe — anões não recuam, nem quando deveriam." },
  { nome: "Pele de Granito", tipo_poder: "Passivo", custo_mana: 0, cooldown: 0, dano_base: 0, cura_base: 0, escala_atributo: "Vitalidade", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "A pele anã, endurecida como pedra, concede Defesa permanente adicional.",
    combatEffects: [{ trigger: "PASSIVE", target: "SELF", effect_key: "DEFENSE_FLAT", magnitude_base: 7, scale_with_ability_level: true }] },
  { nome: "Fúria da Montanha", tipo_poder: "Ativo", custo_mana: 16, cooldown: 2, dano_base: 28, escala_atributo: "Forca", valor_escala: 1.35, tipo_dano: "Fisico", affinity_mode: "EXPLICIT", affinity_key: "BLUNT",
    descricao: "A força acumulada de gerações de mineração liberada num único golpe." },
  { nome: "Couraça de Pedra", tipo_poder: "Passivo", custo_mana: 0, cooldown: 0, dano_base: 0, cura_base: 0, escala_atributo: "Vitalidade", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "A couraça natural anã reduz permanentemente o dano recebido.",
    combatEffects: [{ trigger: "PASSIVE", target: "SELF", effect_key: "DAMAGE_TAKEN_PCT", magnitude_base: -5, scale_with_ability_level: true }] },
  { nome: "Terremoto Anão", tipo_poder: "Ativo", custo_mana: 22, cooldown: 4, dano_base: 32, escala_atributo: "Forca", valor_escala: 1.45, tipo_dano: "Fisico", affinity_mode: "EXPLICIT", affinity_key: "BLUNT",
    descricao: "Um golpe no chão forte o bastante pra fazer a terra tremer e atordoar com força o inimigo.", status: [STATUS.STUN_FORTE] },

  // ---------------------------------------------------------------
  // §13 ORC
  // ---------------------------------------------------------------
  { nome: "Investida Bruta", tipo_poder: "Ativo", custo_mana: 4, cooldown: 2, dano_base: 15, escala_atributo: "Forca", valor_escala: 1.22, tipo_dano: "Fisico", affinity_mode: "EXPLICIT", affinity_key: "BLUNT",
    descricao: "Um avanço bruto, sem técnica nenhuma além do peso do corpo orc." },
  { nome: "Fúria Selvagem", tipo_poder: "Ativo", custo_mana: 5, cooldown: 2, dano_base: 20, escala_atributo: "Forca", valor_escala: 1.35, tipo_dano: "Fisico", affinity_mode: "INHERIT_WEAPON",
    descricao: "Um ataque bruto sem nenhuma técnica além da vontade pura de vencer." },
  { nome: "Sangue Selvagem", tipo_poder: "Passivo", custo_mana: 0, cooldown: 0, dano_base: 0, cura_base: 0, escala_atributo: "Forca", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "A fúria orc nas veias aumenta permanentemente o dano causado em combate.",
    combatEffects: [{ trigger: "PASSIVE", target: "SELF", effect_key: "DAMAGE_DEALT_PCT", magnitude_base: 5, scale_with_ability_level: true }] },
  { nome: "Machadada Selvagem", tipo_poder: "Ativo", custo_mana: 14, cooldown: 3, dano_base: 27, escala_atributo: "Forca", valor_escala: 1.35, tipo_dano: "Fisico", affinity_mode: "EXPLICIT", affinity_key: "SLASH",
    descricao: "Um golpe de machado selvagem que abre um corte profundo e sangrento no inimigo.", status: [STATUS.BLEED_FORTE] },
  { nome: "Fúria Interminável", tipo_poder: "Passivo", custo_mana: 0, cooldown: 0, dano_base: 0, cura_base: 0, escala_atributo: "Forca", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "A fúria orc nunca se esgota — golpes críticos causam ainda mais dano.",
    combatEffects: [{ trigger: "PASSIVE", target: "SELF", effect_key: "CRIT_DAMAGE_PCT", magnitude_base: 10, scale_with_ability_level: true }] },
  { nome: "Sede de Sangue", tipo_poder: "Ativo", custo_mana: 18, cooldown: 4, dano_base: 36, escala_atributo: "Forca", valor_escala: 1.50, tipo_dano: "Fisico", affinity_mode: "INHERIT_WEAPON",
    descricao: "Um golpe selvagem que rouba a vitalidade do inimigo diretamente para o atacante.",
    combatEffects: [{ trigger: "ON_POWER_CAST", target: "SELF", effect_key: "LIFESTEAL_PCT", magnitude_base: 20, duration_turns: 1, scale_with_ability_level: false }] },

  // ---------------------------------------------------------------
  // §14 CELESTIAL
  // ---------------------------------------------------------------
  { nome: "Julgamento Divino", tipo_poder: "Ativo", custo_mana: 15, cooldown: 2, dano_base: 18, escala_atributo: "Inteligencia", valor_escala: 1.50, tipo_dano: "Magico", affinity_mode: "EXPLICIT", affinity_key: "LIGHT",
    descricao: "Poder exclusivo da linhagem Celestial, invoca luz pura contra o inimigo." },
  { nome: "Aura Sagrada", tipo_poder: "Ativo", custo_mana: 16, cooldown: 3, dano_base: 0, cura_base: 22, escala_atributo: "Inteligencia", valor_escala: 1.10, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "Uma aura de luz sagrada que recupera a vitalidade do Celestial." },
  { nome: "Bênção Celestial", tipo_poder: "Passivo", custo_mana: 0, cooldown: 0, dano_base: 0, cura_base: 0, escala_atributo: "Inteligencia", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "A bênção celestial aumenta permanentemente toda cura produzida.",
    combatEffects: [{ trigger: "PASSIVE", target: "SELF", effect_key: "HEALING_DONE_PCT", magnitude_base: 6, scale_with_ability_level: true }] },
  { nome: "Luz Purificadora", tipo_poder: "Ativo", custo_mana: 22, cooldown: 3, dano_base: 30, escala_atributo: "Inteligencia", valor_escala: 1.50, tipo_dano: "Magico", affinity_mode: "EXPLICIT", affinity_key: "LIGHT",
    descricao: "Quando um Celestial atinge a maturidade de seu poder, nem as sombras mais densas resistem — o impacto também dissipa um fortalecimento do inimigo.",
    combatEffects: [{ trigger: "ON_POWER_HIT", target: "ENEMY", effect_key: "DISPEL_BUFF", magnitude_base: 0 }] },
  { nome: "Luz Interior", tipo_poder: "Passivo", custo_mana: 0, cooldown: 0, dano_base: 0, cura_base: 0, escala_atributo: "Inteligencia", valor_escala: 0, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "A luz interior do Celestial regenera Mana continuamente.",
    combatEffects: [{ trigger: "PASSIVE", target: "SELF", effect_key: "REGEN_MANA_PERCENT", magnitude_base: 1.2, scale_with_ability_level: true }] },
  { nome: "Ira Celestial", tipo_poder: "Ativo", custo_mana: 32, cooldown: 3, dano_base: 44, escala_atributo: "Inteligencia", valor_escala: 1.55, tipo_dano: "Magico", affinity_mode: "EXPLICIT", affinity_key: "LIGHT",
    descricao: "A ira contida de uma linhagem lendária se manifesta em luz pura e devastadora." },
  { nome: "Julgamento Final", tipo_poder: "Ativo", custo_mana: 44, cooldown: 5, dano_base: 60, escala_atributo: "Inteligencia", valor_escala: 1.75, tipo_dano: "Magico", affinity_mode: "EXPLICIT", affinity_key: "LIGHT",
    descricao: "O capstone Celestial — o julgamento definitivo, luz pura na sua forma mais absoluta." },

  // ---------------------------------------------------------------
  // §15 NATUREZA AR
  // ---------------------------------------------------------------
  { nome: "Investida do Vendaval", tipo_poder: "Ativo", custo_mana: 15, cooldown: 3, dano_base: 21, escala_atributo: "Agilidade", valor_escala: 1.30, tipo_dano: "Fisico", affinity_mode: "INHERIT_WEAPON",
    added_affinity_key: "WIND", added_damage_pct: 25,
    descricao: "Um golpe físico veloz como o vento, com a arma imbuída de uma lâmina de ar cortante.", status: [STATUS.BLIND] },
  { nome: "Tornado Arcano", tipo_poder: "Ativo", custo_mana: 24, cooldown: 3, dano_base: 28, escala_atributo: "Inteligencia", valor_escala: 1.40, tipo_dano: "Magico", affinity_mode: "EXPLICIT", affinity_key: "WIND",
    descricao: "Um tornado de energia arcana que cega o inimigo com ventos cortantes.", status: [STATUS.BLIND] },

  // ---------------------------------------------------------------
  // §16 NATUREZA ESCURIDÃO
  // ---------------------------------------------------------------
  { nome: "Golpe das Sombras", tipo_poder: "Ativo", custo_mana: 16, cooldown: 3, dano_base: 22, escala_atributo: "Forca", valor_escala: 1.30, tipo_dano: "Fisico", affinity_mode: "INHERIT_WEAPON",
    added_affinity_key: "DARK", added_damage_pct: 25,
    descricao: "Um golpe físico com a arma envolta em trevas, enfraquecendo quem for atingido.", status: [STATUS.WEAKEN] },
  { nome: "Drenar Vida", tipo_poder: "Ativo", custo_mana: 22, cooldown: 3, dano_base: 18, cura_base: 14, escala_atributo: "Inteligencia", valor_escala: 1.10, tipo_dano: "Magico", affinity_mode: "EXPLICIT", affinity_key: "DARK",
    descricao: "Drena a vitalidade do inimigo através de energia sombria — nunca Dano Verdadeiro." },

  // ---------------------------------------------------------------
  // §17 NATUREZA FOGO
  // ---------------------------------------------------------------
  { nome: "Lâmina Flamejante", tipo_poder: "Ativo", custo_mana: 16, cooldown: 3, dano_base: 22, escala_atributo: "Forca", valor_escala: 1.32, tipo_dano: "Fisico", affinity_mode: "INHERIT_WEAPON",
    added_affinity_key: "FIRE", added_damage_pct: 25,
    descricao: "Um golpe físico — a arma mantém sua afinidade normal e recebe um componente adicional de Fogo. O Guerreiro nunca vira conjurador mágico.", status: [STATUS.BURN_NORMAL] },
  { nome: "Erupção Arcana", tipo_poder: "Ativo", custo_mana: 25, cooldown: 3, dano_base: 29, escala_atributo: "Inteligencia", valor_escala: 1.40, tipo_dano: "Magico", affinity_mode: "EXPLICIT", affinity_key: "FIRE",
    descricao: "Uma erupção de energia arcana imbuída de fogo, usando o multiplicador mágico do Mago.", status: [STATUS.BURN_FORTE] },

  // ---------------------------------------------------------------
  // §18 NATUREZA ÁGUA
  // ---------------------------------------------------------------
  { nome: "Golpe da Maré", tipo_poder: "Ativo", custo_mana: 14, cooldown: 2, dano_base: 21, escala_atributo: "Agilidade", valor_escala: 1.28, tipo_dano: "Fisico", affinity_mode: "INHERIT_WEAPON",
    added_affinity_key: "WATER", added_damage_pct: 25,
    descricao: "Um golpe físico rápido com a arma envolta em água corrente, sem efeito de status adicional." },
  { nome: "Maré Curativa", tipo_poder: "Ativo", custo_mana: 23, cooldown: 3, dano_base: 0, cura_base: 34, escala_atributo: "Inteligencia", valor_escala: 1.20, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "Uma onda de água purificadora que cura e extingue queimaduras.",
    combatEffects: [{ trigger: "ON_POWER_CAST", target: "SELF", effect_key: "CLEANSE_STATUS", magnitude_base: 0, config: { status_key: "BURN" } }] },

  // ---------------------------------------------------------------
  // §19 NATUREZA TERRA
  // ---------------------------------------------------------------
  { nome: "Investida Telúrica", tipo_poder: "Ativo", custo_mana: 16, cooldown: 3, dano_base: 21, escala_atributo: "Forca", valor_escala: 1.30, tipo_dano: "Fisico", affinity_mode: "INHERIT_WEAPON",
    added_affinity_key: "EARTH", added_damage_pct: 25,
    descricao: "Um golpe físico com a arma carregada de força telúrica, capaz de atordoar o inimigo.",
    status: [{ status_key: "STUN", chance_ppm: 180000, duration_turns: 1, potency_base: 0, target: "Enemy" }] },
  { nome: "Colapso Telúrico", tipo_poder: "Ativo", custo_mana: 26, cooldown: 4, dano_base: 29, escala_atributo: "Inteligencia", valor_escala: 1.38, tipo_dano: "Magico", affinity_mode: "EXPLICIT", affinity_key: "EARTH",
    descricao: "Um colapso de energia arcana imbuída de terra, atordoando o inimigo com o impacto.",
    status: [{ status_key: "STUN", chance_ppm: 200000, duration_turns: 1, potency_base: 0, target: "Enemy" }] },

  // ---------------------------------------------------------------
  // §20 NATUREZA LUZ
  // ---------------------------------------------------------------
  { nome: "Bênção Radiante", tipo_poder: "Ativo", custo_mana: 18, cooldown: 3, dano_base: 0, cura_base: 30, escala_atributo: "Vitalidade", valor_escala: 1.15, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "Uma bênção de luz que cura e envolve o Guerreiro numa barreira protetora momentânea.",
    combatEffects: [{ trigger: "ON_POWER_CAST", target: "SELF", effect_key: "GRANT_SHIELD", magnitude_base: 10, scale_attribute: "Vitalidade", scale_value: 0.15, duration_turns: 1, scale_with_ability_level: false }] },
  { nome: "Raio de Cura Maior", tipo_poder: "Ativo", custo_mana: 26, cooldown: 4, dano_base: 0, cura_base: 38, escala_atributo: "Inteligencia", valor_escala: 1.25, tipo_dano: "Nenhum", affinity_mode: "NEUTRAL",
    descricao: "Um raio de luz pura que cura profundamente e remove o enfraquecimento e a cegueira do alvo.",
    combatEffects: [
      { trigger: "ON_POWER_CAST", target: "SELF", effect_key: "CLEANSE_STATUS", magnitude_base: 0, config: { status_key: "WEAKEN" } },
      { trigger: "ON_POWER_CAST", target: "SELF", effect_key: "CLEANSE_STATUS", magnitude_base: 0, config: { status_key: "BLIND" } },
    ] },

  // ---------------------------------------------------------------
  // §21 NATUREZA RAIO
  // ---------------------------------------------------------------
  { nome: "Golpe Relâmpago", tipo_poder: "Ativo", custo_mana: 17, cooldown: 3, dano_base: 23, escala_atributo: "Velocidade", valor_escala: 1.32, tipo_dano: "Fisico", affinity_mode: "INHERIT_WEAPON",
    added_affinity_key: "LIGHTNING", added_damage_pct: 25,
    descricao: "Um golpe físico com a arma carregada de eletricidade, forte o bastante pra paralisar o inimigo.", status: [STATUS.PARALYZE] },
  { nome: "Descarga Total", tipo_poder: "Ativo", custo_mana: 28, cooldown: 4, dano_base: 30, escala_atributo: "Inteligencia", valor_escala: 1.42, tipo_dano: "Magico", affinity_mode: "EXPLICIT", affinity_key: "LIGHTNING",
    descricao: "Uma descarga total de energia arcana imbuída de raio, paralisando o inimigo com força.", status: [STATUS.PARALYZE_FORTE] },

  // ---------------------------------------------------------------
  // §22 NATUREZA YIN&YANG
  // ---------------------------------------------------------------
  { nome: "Golpe do Equilíbrio", tipo_poder: "Ativo", custo_mana: 18, cooldown: 3, dano_base: 20, cura_base: 10, escala_atributo: "Forca", valor_escala: 1.20, tipo_dano: "Fisico", affinity_mode: "INHERIT_WEAPON",
    descricao: "Um golpe físico que equilibra dano e recuperação — sem nenhum componente elemental adicional, só o equilíbrio em si." },
  { nome: "Ciclo Vital", tipo_poder: "Ativo", custo_mana: 24, cooldown: 3, dano_base: 17, cura_base: 17, escala_atributo: "Inteligencia", valor_escala: 1.20, tipo_dano: "Magico", affinity_mode: "NEUTRAL",
    descricao: "Energia arcana neutra que equilibra dano e cura — Yin&Yang nunca cria uma afinidade elemental própria." },
];

function round4(numero) {
  return Math.round(numero * 10000) / 10000;
}

module.exports = {
  async up(queryInterface) {
    const [afinidades] = await queryInterface.sequelize.query(
      `SELECT id, key FROM damage_affinity_types;`,
    );
    const idPorAfinidade = new Map(afinidades.map((a) => [a.key, a.id]));

    let atualizadas = 0;
    let criadas = 0;

    for (const def of POWERS) {
      const [existentes] = await queryInterface.sequelize.query(
        `SELECT id FROM "Powers" WHERE nome = :nome;`,
        { replacements: { nome: def.nome } },
      );
      if (existentes.length > 1) {
        throw new Error(
          `[rebalanceamento-powers] "${def.nome}" tem ${existentes.length} ocorrências — ambíguo, corrija manualmente antes de rodar esta migration.`,
        );
      }

      const affinityId = def.affinity_key ? idPorAfinidade.get(def.affinity_key) : null;
      if (def.affinity_key && !affinityId) {
        throw new Error(`[rebalanceamento-powers] afinidade "${def.affinity_key}" não existe em damage_affinity_types (Power "${def.nome}").`);
      }
      const addedAffinityId = def.added_affinity_key ? idPorAfinidade.get(def.added_affinity_key) : null;
      if (def.added_affinity_key && !addedAffinityId) {
        throw new Error(`[rebalanceamento-powers] added_affinity "${def.added_affinity_key}" não existe (Power "${def.nome}").`);
      }

      const camposPower = {
        descricao: def.descricao,
        tipo_poder: def.tipo_poder,
        custo_mana: def.custo_mana,
        dano_base: def.dano_base ?? 0,
        cura_base: def.cura_base ?? 0,
        cooldown: def.tipo_poder === "Passivo" ? 0 : def.cooldown,
        escala_atributo: def.escala_atributo,
        valor_escala: def.valor_escala,
        tipo_dano: def.tipo_dano,
        acquisition_scope: "NORMAL",
        usage_scope: "CHARACTER",
        affinity_mode: def.affinity_mode,
        affinity_id: affinityId ?? null,
        added_affinity_id: addedAffinityId ?? null,
        added_damage_pct: round4(def.added_damage_pct ?? 0),
        updatedAt: new Date(),
      };

      let idPower;
      if (existentes.length === 1) {
        idPower = existentes[0].id;
        const sets = Object.keys(camposPower)
          .map((campo) => `"${campo}" = :${campo}`)
          .join(", ");
        await queryInterface.sequelize.query(
          `UPDATE "Powers" SET ${sets} WHERE id = :id;`,
          { replacements: { ...camposPower, id: idPower } },
        );
        console.log(`[rebalanceamento-powers] atualizada: "${def.nome}" (id=${idPower})`);
        atualizadas += 1;
      } else {
        const [[criada]] = await queryInterface.sequelize.query(
          `INSERT INTO "Powers"
             (nome, descricao, tipo_poder, custo_mana, dano_base, cura_base, cooldown,
              escala_atributo, valor_escala, tipo_dano, acquisition_scope, usage_scope,
              affinity_mode, affinity_id, added_affinity_id, added_damage_pct,
              "createdAt", "updatedAt")
           VALUES
             (:nome, :descricao, :tipo_poder, :custo_mana, :dano_base, :cura_base, :cooldown,
              :escala_atributo, :valor_escala, :tipo_dano, :acquisition_scope, :usage_scope,
              :affinity_mode, :affinity_id, :added_affinity_id, :added_damage_pct,
              now(), now())
           RETURNING id;`,
          { replacements: { ...camposPower, nome: def.nome } },
        );
        idPower = criada.id;
        console.log(`[rebalanceamento-powers] CRIADA (não existia no banco): "${def.nome}" (id=${idPower})`);
        criadas += 1;
      }

      // Status/CombatEffects: delete + recria — idempotente por natureza
      // (a Power canônica é a fonte da verdade pra esses efeitos a
      // partir desta migration; reaplicar nunca duplica).
      await queryInterface.sequelize.query(
        `DELETE FROM power_status_effects WHERE id_power = :id;`,
        { replacements: { id: idPower } },
      );
      for (const status of def.status ?? []) {
        await queryInterface.sequelize.query(
          `INSERT INTO power_status_effects
             (id_power, status_key, chance_ppm, duration_turns, potency_base,
              potency_scale_attribute, potency_scale_value, percentual_vida_maxima, target,
              "createdAt", "updatedAt")
           VALUES
             (:id_power, :status_key, :chance_ppm, :duration_turns, :potency_base,
              NULL, 0, :percentual_vida_maxima, :target, now(), now());`,
          {
            replacements: {
              id_power: idPower,
              status_key: status.status_key,
              chance_ppm: status.chance_ppm,
              duration_turns: status.duration_turns,
              potency_base: status.potency_base ?? 0,
              percentual_vida_maxima: status.percentual_vida_maxima ?? null,
              target: status.target,
            },
          },
        );
      }

      await queryInterface.sequelize.query(
        `DELETE FROM power_combat_effects WHERE id_power = :id;`,
        { replacements: { id: idPower } },
      );
      for (const efeito of def.combatEffects ?? []) {
        await queryInterface.sequelize.query(
          `INSERT INTO power_combat_effects
             (id_power, effect_key, target, trigger, magnitude_base, scale_attribute, scale_value,
              scale_with_ability_level, chance_ppm, duration_turns, stack_group, reapply_policy,
              max_stacks, condition_key, condition_config, dispellable, config,
              allow_pve, allow_party, allow_guild_boss, allow_world_boss, allow_temple_boss,
              allow_pvp_casual, allow_ranked, allow_tournament, ativo, "createdAt", "updatedAt")
           VALUES
             (:id_power, :effect_key, :target, :trigger, :magnitude_base, :scale_attribute, :scale_value,
              :scale_with_ability_level, 1000000, :duration_turns, NULL, 'REFRESH',
              NULL, NULL, '{}', true, :config,
              true, true, true, true, true, true, true, true, true, now(), now());`,
          {
            replacements: {
              id_power: idPower,
              effect_key: efeito.effect_key,
              target: efeito.target ?? "SELF",
              trigger: efeito.trigger,
              magnitude_base: efeito.magnitude_base ?? 0,
              scale_attribute: efeito.scale_attribute ?? null,
              scale_value: efeito.scale_value ?? 0,
              scale_with_ability_level: efeito.scale_with_ability_level ?? false,
              duration_turns: efeito.duration_turns ?? null,
              config: JSON.stringify(efeito.config ?? {}),
            },
          },
        );
      }
    }

    console.log(`[rebalanceamento-powers] concluído: ${atualizadas} atualizadas, ${criadas} criadas (${POWERS.length} no total).`);
  },

  async down() {
    // Corretiva, não reversível de forma segura — os valores ANTERIORES
    // não ficaram registrados em lugar nenhum pra restaurar. Reverter
    // de verdade exigiria rodar uma migration corretiva nova com os
    // valores antigos (nunca o reseed destrutivo).
    throw new Error("[rebalanceamento-powers] down() não suportado — veja o comentário no topo do arquivo.");
  },
};
