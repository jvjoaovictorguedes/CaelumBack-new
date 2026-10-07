// Metadados de apresentação do Admin. Não executa efeitos nem acrescenta
// gatilhos ao combate; o suporte reativo vem do serviço que os resolve.
const {
  EFFECT_KEYS,
  METADADOS_DO_EFEITO,
  TARGETS,
  REAPPLY_POLICIES_VALIDAS,
  DESCRICAO_DA_POLITICA,
  DESCRICAO_DO_ALVO,
} = require("../config/combatModifierConfig");
const {
  TRIGGERS,
  DESCRICAO_DO_TRIGGER,
} = require("../config/combatTriggerConfig");
const {
  CONDITIONS,
  CONFIG_ESPERADA,
} = require("../config/combatConditionConfig");
const {
  CONTEXTOS_DE_COMBATE,
  ROTULO_DO_CONTEXTO,
} = require("../config/combatContextConfig");
const { CHAVES_VALIDAS, STATUS } = require("../config/statusEffectConfig");
const {
  TRIGGERS_REATIVOS_SUPORTADOS,
  REACTIVE_EFFECT_KEYS_IMPLEMENTADAS,
} = require("./combatModifierService");

const PREFIXOS = {
  PASSIVE: "Enquanto esta habilidade estiver válida",
  COMBAT_START: "No início do combate",
  ON_CAST: "Ao lançar a habilidade",
  ON_HIT: "Ao acertar um ataque",
  ON_CRIT: "Ao causar um crítico",
  ON_DAMAGE_TAKEN: "Ao sofrer dano",
  ON_DODGE: "Ao esquivar",
  ON_HEAL: "Após curar",
  ON_KILL: "Ao derrotar o alvo",
  TURN_START: "No início do turno",
  TURN_END: "No fim do turno",
};

// Somente os modificadores de Power cujos valores são consumidos nas
// fórmulas/ações do personagem. Cura recebida e cooldown têm consumidores
// específicos e permanecem parciais para não prometer todas as fontes/modos.
const PASSIVOS_EXECUTADOS = new Set([
  "DAMAGE_DEALT_PCT",
  "DAMAGE_TAKEN_PCT",
  "DEFENSE_FLAT",
  "CRIT_CHANCE_PCT",
  "CRIT_DAMAGE_PCT",
  "DODGE_CHANCE_PCT",
  "HIT_CHANCE_PCT",
  "HEALING_DONE_PCT",
  "MANA_COST_PCT",
  "REGEN_HP_FLAT",
  "REGEN_HP_PERCENT",
  "REGEN_MANA_FLAT",
  "REGEN_MANA_PERCENT",
  "STATUS_RESISTANCE_PCT",
  "LIFESTEAL_PCT",
]);

const FRASES = {
  DAMAGE_DEALT_PCT: "{subject} causa {value}% {direction} dano",
  DAMAGE_TAKEN_PCT: "{subject} recebe {value}% {direction} dano",
  DEFENSE_FLAT: "{subject} tem {value} pontos a {direction} de defesa",
  CRIT_CHANCE_PCT:
    "{subject} tem {value} pontos percentuais a {direction} de chance de crítico",
  CRIT_DAMAGE_PCT: "{subject} causa {value}% {direction} dano crítico",
  DODGE_CHANCE_PCT:
    "{subject} tem {value} pontos percentuais a {direction} de chance de esquiva",
  HIT_CHANCE_PCT:
    "{subject} tem {value} pontos percentuais a {direction} de precisão",
  HEALING_DONE_PCT: "{subject} produz {value}% {direction} cura",
  HEALING_RECEIVED_PCT: "{subject} recebe {value}% {direction} cura",
  MANA_COST_PCT: "{subject} gasta {value}% {direction} Mana",
  COOLDOWN_REDUCTION_TURNS:
    "{subject} reduz o cooldown em {signedValue} turnos",
  REGEN_HP_FLAT: "{subject} recupera {signedValue} pontos de Vida",
  REGEN_HP_PERCENT: "{subject} recupera {signedValue}% da Vida máxima",
  REGEN_MANA_FLAT: "{subject} recupera {signedValue} pontos de Mana",
  REGEN_MANA_PERCENT: "{subject} recupera {signedValue}% da Mana máxima",
  STATUS_RESISTANCE_PCT:
    "{subject} tem {value} pontos percentuais a {direction} de resistência a Status",
  LIFESTEAL_PCT: "{subject} recupera {signedValue}% do dano efetivo como Vida",
  GRANT_SHIELD: "{subject} recebe um escudo de {signedValue} pontos",
  SHIELD_ON_CAST:
    "{subject} recebe um escudo de {signedValue} pontos ao lançar",
  CLEANSE_STATUS: "{subject} remove o Status {status}",
  CLEANSE_CATEGORY: "{subject} remove Status da categoria {category}",
  DISPEL_BUFF: "{subject} remove um modificador",
  REDUCE_COOLDOWN: "{subject} reduz o cooldown atual em {signedValue} turnos",
  RESTORE_MANA_ON_TRIGGER: "{subject} restaura {signedValue} pontos de Mana",
};

const CONFIG_DO_EFEITO = {
  CLEANSE_STATUS: [
    {
      key: "status_key",
      label: "Status a remover",
      type: "select",
      optionsSource: "statusKeys",
      required: true,
    },
  ],
  CLEANSE_CATEGORY: [
    {
      key: "category",
      label: "Categoria a remover",
      type: "select",
      required: true,
      options: [
        { value: "DOT", label: "Dano periódico (DoT)" },
        { value: "CONTROLE", label: "Controle" },
      ],
    },
  ],
};

function suporteDaCombinacao(effectKey, trigger) {
  if (trigger === "PASSIVE" && PASSIVOS_EXECUTADOS.has(effectKey)) {
    return {
      status: "FUNCTIONAL",
      label: "Funcional",
      description:
        "Modificador passivo consumido pelo motor do personagem, com alvo SELF e chance de 100%.",
    };
  }
  if (trigger === "PASSIVE" && ["HEALING_RECEIVED_PCT", "COOLDOWN_REDUCTION_TURNS"].includes(effectKey)) {
    return {
      status: "PARTIAL", label: "Suporte parcial",
      description: effectKey === "HEALING_RECEIVED_PCT"
        ? "Consumido nas curas de Power; outras fontes mantêm o comportamento anterior."
        : "Reduz o cooldown inicial no PvE; os outros modos mantêm o ciclo anterior.",
    };
  }
  if (
    TRIGGERS_REATIVOS_SUPORTADOS.includes(trigger) &&
    REACTIVE_EFFECT_KEYS_IMPLEMENTADAS.includes(effectKey)
  ) {
    return {
      status: "PARTIAL",
      label: "Suporte parcial",
      description:
        "Evento executado com chance e condições. Modificadores numéricos usam duração e reaplicação; Vida/Mana são instantâneas. Há limitações de alvos de grupo em Boss Mundial, de cooldown fora do PvE e de políticas de escudo/dissipação.",
    };
  }
  return {
    status: "UNSUPPORTED",
    label: "Ainda não executado pelo motor",
    description:
      "Esta combinação é válida no catálogo, mas não é executada pelo motor do personagem atualmente.",
  };
}

function catalogoAdminCombatEffects(attributes) {
  return {
    effectKeys: EFFECT_KEYS.map((key) => ({
      key,
      ...METADADOS_DO_EFEITO[key],
      previewTemplate: FRASES[key],
      configFields: CONFIG_DO_EFEITO[key] ?? [],
      supportByTrigger: Object.fromEntries(
        TRIGGERS.map((trigger) => [trigger, suporteDaCombinacao(key, trigger)]),
      ),
    })),
    targets: TARGETS,
    targetDescriptions: DESCRICAO_DO_ALVO,
    targetSubjects: {
      SELF: "o personagem",
      ENEMY: "o inimigo",
      ALL_ALLIES: "cada aliado",
      ALL_ENEMIES: "cada inimigo",
    },
    triggers: TRIGGERS.map((key) => ({
      key,
      descricao: DESCRICAO_DO_TRIGGER[key],
      previewPrefix: PREFIXOS[key],
      support: {
        status:
          key === "PASSIVE"
            ? "FUNCTIONAL"
            : TRIGGERS_REATIVOS_SUPORTADOS.includes(key)
              ? "PARTIAL"
              : "UNSUPPORTED",
        label:
          key === "PASSIVE"
            ? "Funcional"
            : TRIGGERS_REATIVOS_SUPORTADOS.includes(key)
              ? "Executado — suporte parcial"
              : "Ainda não executado pelo motor",
      },
    })),
    reapplyPolicies: REAPPLY_POLICIES_VALIDAS,
    reapplyPolicyDescriptions: DESCRICAO_DA_POLITICA,
    conditions: CONDITIONS.map((key) => ({ key, ...CONFIG_ESPERADA[key] })),
    contexts: CONTEXTOS_DE_COMBATE.map((key) => ({
      key,
      rotulo: ROTULO_DO_CONTEXTO[key],
      field: `allow_${key.toLowerCase()}`,
    })),
    statusKeys: CHAVES_VALIDAS.map((key) => ({
      value: key,
      label: STATUS[key].nomeUi,
    })),
    scaleAttributes: attributes,
    engineNotes: {
      scope:
        "Suporte de Powers aprendidas pelo personagem. Habilidades de monstros usam um adaptador específico; o catálogo não garante execução em todos os motores.",
      target:
        "Reativos resolvem SELF/ENEMY; ALL_ALLIES inclui os membros no combate de Grupo/Guild Boss. No Boss Mundial, grupos ficam limitados à sessão atual. PASSIVE continua agregado no portador.",
      condition:
        "Condições reativas são avaliadas por alvo no instante do evento. Condições em PASSIVE ainda não são avaliadas.",
      passiveChance:
        "PASSIVE com chance abaixo de 100% é ignorado pelo motor; não é sorteado como um efeito reativo.",
      duration:
        "Modificadores numéricos reativos expiram nos turnos do destinatário; sem duração, valem até o fim do combate. Vida/Mana e limpeza são instantâneas, independentemente da duração. Escudos usam a política de maior valor do motor existente.",
      passivePolicy:
        "Em passivas agrupadas, as políticas diferentes de STACK convergem hoje para a maior magnitude; não há renovação ou substituição temporal geral.",
      noGroup:
        "Passivas sem grupo somam livremente. Reativos sem grupo reaplicam por origem/linha; um grupo explícito compartilha a política entre origens.",
    },
  };
}

module.exports = { catalogoAdminCombatEffects };
