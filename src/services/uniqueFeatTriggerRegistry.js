// Sistema de Proezas Únicas §6/§7/§15/§28 — registry de triggers
// secretos. NUNCA guarda lógica arbitrária: cada trigger_key tem um
// schema fixo de campos (o que o evento de origem PODE fornecer no
// context e o que o Admin PODE configurar em trigger_config), e a
// avaliação é sempre o mesmo comparador declarativo genérico — nunca
// eval, nunca SQL/JS/expressão dinâmica vinda do banco.
//
// trigger_config é um objeto { campo: restricao }. Restrição aceita por
// tipo de campo:
//   number  -> valor literal (igualdade) OU { min, max } (faixa,
//              qualquer um dos dois opcional) OU { in: [...] } (lista)
//   string  -> valor literal (igualdade) OU { in: [...] }
//   boolean -> valor literal (igualdade)
//   array   -> { contains: valor } OU { containsAll: [...] } — o campo
//              correspondente no context precisa ser um array
//
// Campo ausente em trigger_config = sem restrição nesse campo (não
// precisa listar todos). Campo em trigger_config que não exista no
// schema do trigger = configuração inválida, rejeitada antes de
// persistir (ver validarTriggerConfig, usado pelo admin CRUD).
const { TRIGGER_KEYS } = require("../config/uniqueFeatConfig");

// §7 — campos permitidos por trigger, com o tipo esperado no context
// (montado pelo serviço de origem autoritativo — combatController,
// forgeCraftingService, fishingCatchService etc. — sempre no MESMO
// fluxo/transaction que confirma o evento real, nunca em leitura de
// tela). Nomes seguem os exemplos da spec (§7 "dados permitidos" / §15
// "snapshot sugerido").
const SCHEMA_POR_TRIGGER = {
  WORLD_BOSS_FINAL_BLOW: {
    bossConfigId: "number",
    eventId: "string",
    finalBlow: "boolean",
    contribution: "number",
  },
  ADVENTURE_VICTORY: {
    zoneId: "number",
    monsterId: "number",
    hpRestante: "number",
    manaRestante: "number",
    turno: "number",
    itemIds: "array",
  },
  FORGE_CRAFT_COMPLETED: {
    blueprintId: "number",
    itemId: "number",
    raridade: "string",
    qualidade: "number",
    resultado: "string",
  },
  FORGE_REFINEMENT_COMPLETED: {
    instanceId: "number",
    targetLevel: "number",
    sucesso: "boolean",
    scrollKey: "string",
  },
  ALCHEMY_CRAFT_COMPLETED: {
    recipeId: "number",
    resultado: "string",
    ingredientIds: "array",
    loteId: "string",
  },
  FISH_CAUGHT: {
    speciesId: "number",
    peso: "number",
    zoneId: "number",
    condicaoId: "number",
    iscaId: "number",
    varaInstanceId: "number",
    varaRefinamento: "number",
  },
  NAVIGATION_DISCOVERY: {
    rotaId: "number",
    zoneId: "number",
    condicaoId: "number",
    embarcacaoId: "number",
  },
  EXPEDITION_COMPLETED: {
    regiaoId: "number",
    recursoId: "number",
    qualidade: "string",
    resultado: "string",
  },
  BESTIARY_EVENT: {
    monstroId: "number",
    regiaoId: "number",
    maestriaNivel: "number",
    contador: "number",
  },
};

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function schemaDoTrigger(triggerKey) {
  return SCHEMA_POR_TRIGGER[triggerKey] ?? null;
}

function tipoValido(tipo, valor) {
  if (tipo === "number") return typeof valor === "number" && Number.isFinite(valor);
  if (tipo === "string") return typeof valor === "string";
  if (tipo === "boolean") return typeof valor === "boolean";
  if (tipo === "array") return Array.isArray(valor);
  return false;
}

// Usado pelo admin CRUD (Fase 6) antes de persistir trigger_config —
// falha fechado: qualquer campo desconhecido, tipo errado ou forma de
// restrição não reconhecida rejeita a config inteira.
function validarTriggerConfig(triggerKey, config) {
  if (!TRIGGER_KEYS.includes(triggerKey)) {
    throw erro(`trigger_key desconhecido: "${triggerKey}".`);
  }
  const schema = schemaDoTrigger(triggerKey);
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw erro("trigger_config precisa ser um objeto.");
  }

  for (const [campo, restricao] of Object.entries(config)) {
    const tipo = schema[campo];
    if (!tipo) {
      throw erro(`Campo "${campo}" não é permitido pro trigger "${triggerKey}".`);
    }

    if (tipo === "array") {
      const valida =
        restricao !== null &&
        typeof restricao === "object" &&
        !Array.isArray(restricao) &&
        ((("contains" in restricao) && typeof restricao.contains !== "undefined") ||
          (Array.isArray(restricao.containsAll) && restricao.containsAll.length > 0));
      if (!valida) {
        throw erro(`Campo "${campo}" (array) precisa de { contains } ou { containsAll: [...] }.`);
      }
      continue;
    }

    if (tipoValido(tipo, restricao)) continue; // valor literal direto

    if (restricao !== null && typeof restricao === "object" && !Array.isArray(restricao)) {
      if (tipo === "number" && ("min" in restricao || "max" in restricao)) {
        if ("min" in restricao && typeof restricao.min !== "number") {
          throw erro(`Campo "${campo}": min precisa ser number.`);
        }
        if ("max" in restricao && typeof restricao.max !== "number") {
          throw erro(`Campo "${campo}": max precisa ser number.`);
        }
        continue;
      }
      if ((tipo === "number" || tipo === "string") && Array.isArray(restricao.in)) {
        if (restricao.in.length === 0 || !restricao.in.every((v) => tipoValido(tipo, v))) {
          throw erro(`Campo "${campo}": "in" precisa ser uma lista não vazia de ${tipo}.`);
        }
        continue;
      }
    }

    throw erro(`Campo "${campo}" tem restrição inválida pro tipo ${tipo}.`);
  }

  return true;
}

function avaliarCampoEscalar(tipo, restricao, valorContexto) {
  if (typeof valorContexto === "undefined" || valorContexto === null) return false;

  if (tipoValido(tipo, restricao)) {
    return valorContexto === restricao;
  }

  if (restricao !== null && typeof restricao === "object") {
    if (tipo === "number" && ("min" in restricao || "max" in restricao)) {
      if (typeof valorContexto !== "number") return false;
      if ("min" in restricao && valorContexto < restricao.min) return false;
      if ("max" in restricao && valorContexto > restricao.max) return false;
      return true;
    }
    if (Array.isArray(restricao.in)) {
      return restricao.in.includes(valorContexto);
    }
  }
  return false;
}

function avaliarCampoArray(restricao, valorContexto) {
  if (!Array.isArray(valorContexto)) return false;
  if ("contains" in restricao) return valorContexto.includes(restricao.contains);
  if (Array.isArray(restricao.containsAll)) {
    return restricao.containsAll.every((v) => valorContexto.includes(v));
  }
  return false;
}

// §7 — avalia se o `context` do evento real satisfaz o `trigger_config`
// de uma Proeza. Falha fechado: trigger desconhecido, config malformada
// (não devia acontecer — já validada ao salvar) ou campo ausente no
// context nunca "passam" por omissão.
function avaliar(triggerKey, triggerConfig, context) {
  const schema = schemaDoTrigger(triggerKey);
  if (!schema) return false;
  const config = triggerConfig || {};
  const ctx = context || {};

  for (const [campo, restricao] of Object.entries(config)) {
    const tipo = schema[campo];
    if (!tipo) return false; // config corrompida/desatualizada — nunca casa

    const valorContexto = ctx[campo];
    const bateu =
      tipo === "array" ? avaliarCampoArray(restricao, valorContexto) : avaliarCampoEscalar(tipo, restricao, valorContexto);
    if (!bateu) return false;
  }
  return true;
}

module.exports = {
  SCHEMA_POR_TRIGGER,
  schemaDoTrigger,
  validarTriggerConfig,
  avaliar,
};
