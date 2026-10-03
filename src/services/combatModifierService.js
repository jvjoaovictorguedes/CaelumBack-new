// Habilidades V2.0 (doc "Habilidades V2.0" §7/§9/§11/§12) — Fase 4.
// Serviço central de modificadores de combate (buffs/debuffs numéricos,
// escudos, regen, lifesteal, crítico, cura, Mana...) — a "matemática
// depois da aplicação" que §3 pede pra viver num único lugar, nunca
// duplicada por fonte (Power/poção/evolução/equipamento).
//
// combatBuffService.js continua sendo a fonte dos buffs TEMPORÁRIOS de
// combate (Alquimia — spec Caldeirão §13); este serviço NÃO o substitui
// (§26 "mantendo combatBuffService como facade/wrapper temporário") —
// ele soma, por cima, os modificadores PASSIVOS que vêm de
// PowerCombatEffect (Powers aprendidas pelo personagem). Quem chama
// combina os dois: ex. modificador de dano final = combatBuffService.
// modificadorDeDanoSaida(buffsDaPoção) * combatModifierService.
// multiplicadorDanoSaida(modificadoresDoPersonagem).
//
// Só cobre PASSIVO por enquanto (§26 ordem recomendada, passo 5): todo
// efeito com trigger "PASSIVE" conta sempre que a Power estiver
// aprendida — Passiva (tipo_poder=Passivo) sempre; Power Ativa só
// enquanto estiver marcada no loadout (is_active=true), pro mesmo
// critério de "ocupa slot" que já vale pro resto do jogo. Gatilhos
// reativos (ON_HIT, ON_CRIT, COMBAT_START, etc.) ficam pra próxima fase
// — ver dispararGatilho abaixo, que já valida o shape mas ainda não é
// chamado de lugar nenhum do motor real.
const Power = require("../models/Power");
const CharacterAbilities = require("../models/CharacterAbilities");
const PowerCombatEffect = require("../models/PowerCombatEffect");
// Efeito colateral necessário: CharacterAbilities só ganha a associação
// belongsTo(Power) quando characterAbilitiesController é carregado
// (mesmo padrão de test/helpers/db.js e adminPowerService.js).
require("../controllers/characterAbilitiesController");

const {
  effectKeyValida,
  reapplyPolicyValida,
  REAPPLY_POLICIES,
} = require("../config/combatModifierConfig");
const { triggerValido } = require("../config/combatTriggerConfig");
const { contextoValido, CONTEXTOS_DE_COMBATE } = require("../config/combatContextConfig");
const { multiplicadorEfeito: multiplicadorPorNivelHabilidade } = require("./abilityLevelService");
const { resolverModificadoresDeEfeitosDeEvolucao } = require("./classEvolutionEffectService");

function erro(mensagem, statusCode = 500) {
  return Object.assign(new Error(mensagem), { statusCode });
}

const ATRIBUTO_PARA_CAMPO = {
  Forca: "forca",
  Vitalidade: "vitalidade",
  Agilidade: "agilidade",
  Inteligencia: "inteligencia",
  Velocidade: "velocidade",
};

// §17/§11 — coluna allow_* por contexto, mesmo padrão de
// UniquePowerEffect/uniqueFeatConfig.POWER_EFFECT_CONTEXT_COLUMNS.
const COLUNA_POR_CONTEXTO = {
  PVE: "allow_pve",
  PARTY: "allow_party",
  GUILD_BOSS: "allow_guild_boss",
  WORLD_BOSS: "allow_world_boss",
  PVP_CASUAL: "allow_pvp_casual",
  RANKED: "allow_ranked",
  TOURNAMENT: "allow_tournament",
};

// §9 — magnitude efetiva de UMA linha de PowerCombatEffect, já com
// escala por atributo (opcional) e pela curva 1-10 de abilityLevelService
// (opcional) — mesma curva que já multiplica dano_base/cura_base/
// custo_mana da própria Power, nunca uma curva paralela.
function magnitudeEfetiva(efeito, personagem, nivelHabilidade) {
  let valor = efeito.magnitude_base;
  if (efeito.scale_attribute) {
    const campo = ATRIBUTO_PARA_CAMPO[efeito.scale_attribute];
    valor += (personagem?.[campo] || 0) * (efeito.scale_value || 0);
  }
  if (efeito.scale_with_ability_level) {
    valor *= multiplicadorPorNivelHabilidade(nivelHabilidade || 1);
  }
  return valor;
}

// §9/§12 — resolve uma lista de { effect_key, magnitude, stack_group,
// reapply_policy, max_stacks } no mapa final { effect_key: total }.
// Mesmo princípio "o maior prevalece, nunca soma" que combatBuffService.
// aplicarBuff já usa pra buffs temporários (bug real: dano empilhando
// por soma) — generalizado aqui por stack_group:
//   - sem stack_group: cada linha soma livremente (mecanismos
//     DIFERENTES, ex. lifesteal + crítico, podem coexistir à vontade —
//     §12 "passivas de mecanismos diferentes podem coexistir").
//   - com stack_group: linhas do MESMO grupo nunca somam cruas — a
//     política decide (STRONGEST = maior venceu; STACK = soma até
//     max_stacks instâncias; REPLACE/REFRESH/BLOCK_WHILE_ACTIVE, sem
//     duração real aqui porque passiva não expira, colapsam pro mesmo
//     resultado de STRONGEST — manter a magnitude mais forte válida).
function resolverModificadores(linhas) {
  const porChave = new Map();
  const gruposVistos = new Map(); // "effectKey::stackGroup" -> linhas do grupo

  for (const linha of linhas) {
    if (!linha.stack_group) {
      porChave.set(linha.effect_key, (porChave.get(linha.effect_key) ?? 0) + linha.magnitude);
      continue;
    }
    const chaveGrupo = `${linha.effect_key}::${linha.stack_group}`;
    const grupo = gruposVistos.get(chaveGrupo) ?? [];
    grupo.push(linha);
    gruposVistos.set(chaveGrupo, grupo);
  }

  for (const [chaveGrupo, linhasDoGrupo] of gruposVistos) {
    const [effectKey] = chaveGrupo.split("::");
    const politica = linhasDoGrupo[0].reapply_policy;
    let total = 0;
    if (politica === REAPPLY_POLICIES.STACK) {
      const maxStacks = linhasDoGrupo[0].max_stacks ?? linhasDoGrupo.length;
      const ordenadas = [...linhasDoGrupo].sort((a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude));
      total = ordenadas.slice(0, maxStacks).reduce((soma, l) => soma + l.magnitude, 0);
    } else {
      // STRONGEST / REFRESH / REPLACE / BLOCK_WHILE_ACTIVE / UNIQUE_SOURCE
      // — nenhuma dessas soma magnitudes cruas de um mesmo grupo passivo;
      // todas convergem pra "a maior magnitude válida prevalece" (§9).
      total = linhasDoGrupo.reduce(
        (maior, l) => (Math.abs(l.magnitude) > Math.abs(maior) ? l.magnitude : maior),
        0,
      );
    }
    porChave.set(effectKey, (porChave.get(effectKey) ?? 0) + total);
  }

  return porChave;
}

// §11 — generaliza a política de contexto já usada por UniquePowerEffect/
// uniqueFeatConfig pra QUALQUER PowerCombatEffect, fonte única (nunca um
// segundo conjunto de allow_pve/allow_ranked por sistema).
function efeitoPermitidoNoContexto(efeito, contexto) {
  const coluna = COLUNA_POR_CONTEXTO[contexto];
  if (!coluna) return false;
  return efeito[coluna] !== false;
}

// §26 passo 5/10 — único ponto que lê CharacterAbilities+Power+
// PowerCombatEffect e devolve o mapa de modificadores PASSIVOS do
// personagem pra um contexto. Chamado UMA vez por turno/ação (nunca
// dentro de um loop por golpe) — quem chama guarda o resultado e passa
// adiante pros getters abaixo.
//
// `personagem` precisa ser o objeto JÁ COM os atributos efetivos (o
// mesmo que combatFormulas.calcularEfeitoPoder usa — com bônus de
// equipamento, ver equipmentBonusService), nunca uma linha crua de
// Character: scale_attribute escala em cima do MESMO valor que o resto
// do combate usa, nunca um atributo base desatualizado.
async function resolverModificadoresDoPersonagem(personagem, contexto, { transaction } = {}) {
  if (!contextoValido(contexto)) {
    throw erro(`Contexto de combate desconhecido: "${contexto}". Válidos: ${CONTEXTOS_DE_COMBATE.join(", ")}.`);
  }
  if (!personagem?.id) return new Map();

  const aprendidas = await CharacterAbilities.findAll({
    where: { id_personagem: personagem.id },
    include: [
      {
        model: Power,
        required: true,
        include: [
          {
            model: PowerCombatEffect,
            as: "efeitosDeCombate",
            required: false,
            where: { trigger: "PASSIVE", ativo: true },
          },
        ],
      },
    ],
    transaction,
  });

  const linhasAplicaveis = [];
  for (const aprendida of aprendidas) {
    const power = aprendida.Power;
    if (!power) continue;
    // Passiva: sempre ativa (nunca ocupa o loadout de 5 — §11). Power
    // Ativa: o efeito PASSIVE só conta enquanto a Power estiver marcada
    // no loadout (is_active), mesmo critério de "ocupa slot" que já
    // vale pro resto do jogo.
    const contaComoAtiva = power.tipo_poder === "Passivo" || aprendida.is_active;
    if (!contaComoAtiva) continue;

    for (const efeito of power.efeitosDeCombate ?? []) {
      if (!efeitoPermitidoNoContexto(efeito, contexto)) continue;
      // Efeito com chance < 100% não é "sempre ativo" de verdade — fica
      // de fora do agregado passivo (que precisa ser determinístico pro
      // mesmo turno); esse tipo de efeito pertence a um trigger reativo
      // (ON_HIT/ON_CRIT/...), não a PASSIVE. Documentado aqui em vez de
      // silenciosamente tratado como 100%.
      if (efeito.chance_ppm < 1_000_000) continue;
      linhasAplicaveis.push({
        effect_key: efeito.effect_key,
        magnitude: magnitudeEfetiva(efeito, personagem, aprendida.nivel_habilidade),
        stack_group: efeito.stack_group,
        reapply_policy: efeito.reapply_policy,
        max_stacks: efeito.max_stacks,
      });
    }
  }

  const modificadores = resolverModificadores(linhasAplicaveis);

  // Item 8 — soma por cima os modificadores de ClassEvolutionEffect
  // (LIFESTEAL/MANA_COST_REDUCTION/COOLDOWN_REDUCTION/CRITICAL_CHANCE/
  // CRITICAL_DAMAGE/DODGE_BONUS/HEALING_BONUS), mesmo Map, nenhuma
  // fórmula duplicada: quem chama este serviço (duelEngine, pvpController,
  // pvpLiveSocket, partySocket, guildBossSocket, worldBossCombatService,
  // combatController) já ganha as duas fontes combinadas de graça.
  // DAMAGE_REDUCTION fica de fora daqui de propósito — já é somado em
  // `defesa` por equipmentBonusService, somar DEFENSE_FLAT aqui também
  // contaria em dobro.
  const modificadoresDeEvolucao = await resolverModificadoresDeEfeitosDeEvolucao(personagem.id, transaction);
  for (const [chave, valor] of modificadoresDeEvolucao) {
    modificadores.set(chave, (modificadores.get(chave) ?? 0) + valor);
  }

  return modificadores;
}

// Item 7 — gatilhos reativos (ON_HIT/ON_KILL por enquanto, ver
// REACTIVE_EFFECT_KEYS_IMPLEMENTADAS abaixo). Diferente de PASSIVE
// (resolverModificadoresDoPersonagem acima), aqui NUNCA agrega de
// antemão: cada linha carrega seu próprio chance_ppm e só é decidida no
// INSTANTE do evento (um golpe pode acertar e não procar; o próximo
// pode procar), então o resultado é uma lista crua por trigger — quem
// quiser o Map final chama processarGatilho(linhas) no momento certo
// (ver duelEngine.aplicarAcao), rolando o dado ali, nunca aqui.
const TRIGGERS_REATIVOS_SUPORTADOS = ["ON_HIT", "ON_KILL"];

// Único subconjunto de EFFECT_KEYS com significado definido como "proc
// instantâneo" hoje — reaproveita REGEN_HP_FLAT/PERCENT e
// REGEN_MANA_FLAT/PERCENT (mesmos effect_keys do regen passivo por
// turno) como "cura/restaura instantânea ao acertar/matar", chance_ppm
// decidindo se procou. Qualquer outro effect_key configurado num
// trigger reativo é ignorado aqui (documentado, nunca silenciosamente
// tratado como passivo) — mesmo critério de EFFECT_KEYS_IMPLEMENTADAS
// em classEvolutionEffectService.js: escopo fechado, expande quando
// alguém definir o que ON_CRIT/dano-bônus/debuff-no-alvo significam de
// verdade.
const REACTIVE_EFFECT_KEYS_IMPLEMENTADAS = [
  "REGEN_HP_FLAT",
  "REGEN_HP_PERCENT",
  "REGEN_MANA_FLAT",
  "REGEN_MANA_PERCENT",
];

// Mesmo formato de retorno de resolverModificadoresDoPersonagem (Map),
// mas chaveado por trigger -> array de linhas CRUAS (nunca agregadas,
// nunca com o dado rolado) pra quem chama resolver UMA vez por turno
// (mesmo princípio de "nunca uma query por golpe") e processar o proc
// de fato a cada evento real (ver processarGatilho).
async function resolverGatilhosDoPersonagem(personagem, contexto, { transaction } = {}) {
  const porTrigger = new Map(TRIGGERS_REATIVOS_SUPORTADOS.map((t) => [t, []]));
  if (!contextoValido(contexto)) {
    throw erro(`Contexto de combate desconhecido: "${contexto}". Válidos: ${CONTEXTOS_DE_COMBATE.join(", ")}.`);
  }
  if (!personagem?.id) return porTrigger;

  const aprendidas = await CharacterAbilities.findAll({
    where: { id_personagem: personagem.id },
    include: [
      {
        model: Power,
        required: true,
        include: [
          {
            model: PowerCombatEffect,
            as: "efeitosDeCombate",
            required: false,
            where: { trigger: TRIGGERS_REATIVOS_SUPORTADOS, ativo: true },
          },
        ],
      },
    ],
    transaction,
  });

  for (const aprendida of aprendidas) {
    const power = aprendida.Power;
    if (!power) continue;
    const contaComoAtiva = power.tipo_poder === "Passivo" || aprendida.is_active;
    if (!contaComoAtiva) continue;

    for (const efeito of power.efeitosDeCombate ?? []) {
      if (!efeitoPermitidoNoContexto(efeito, contexto)) continue;
      if (!REACTIVE_EFFECT_KEYS_IMPLEMENTADAS.includes(efeito.effect_key)) continue;
      const linhas = porTrigger.get(efeito.trigger);
      if (!linhas) continue;
      linhas.push({
        effect_key: efeito.effect_key,
        magnitude: magnitudeEfetiva(efeito, personagem, aprendida.nivel_habilidade),
        stack_group: efeito.stack_group,
        reapply_policy: efeito.reapply_policy,
        max_stacks: efeito.max_stacks,
        chance_ppm: efeito.chance_ppm,
      });
    }
  }

  return porTrigger;
}

// Rola o chance_ppm de CADA linha (independente, no instante do evento
// — nunca o mesmo dado pré-computado por turno) e agrega só as que
// procaram, reaproveitando resolverModificadores (mesma política de
// stack_group/reapply_policy que o passivo já usa).
function processarGatilho(linhas = []) {
  const procadas = linhas.filter((linha) => Math.random() * 1_000_000 < (linha.chance_ppm ?? 1_000_000));
  return resolverModificadores(procadas);
}

// Cura/restauração instantânea de um proc ON_HIT/ON_KILL — mesma
// fórmula de regenVidaDoTurno/regenManaDoTurno (abaixo), só que chamada
// uma vez no instante do evento, nunca por turno.
function regenInstantanea(mapaModificadoresDoProc, vidaMaxima, manaMaxima) {
  return {
    vida: regenVidaDoTurno(mapaModificadoresDoProc, vidaMaxima),
    mana: regenManaDoTurno(mapaModificadoresDoProc, manaMaxima),
  };
}

function valorDoModificador(mapaModificadores, effectKey) {
  if (!effectKeyValida(effectKey)) {
    throw erro(`effect_key desconhecido: "${effectKey}".`);
  }
  return mapaModificadores?.get(effectKey) ?? 0;
}

// --------------------------------------------------------------------
// Getters de conveniência — mesmo shape de combatBuffService (um
// multiplicador OU um bônus flat por chamada), pra combatController
// combinar os dois sem reimplementar nada: `multiplicador final =
// combatBuffService.X(buffs) * combatModifierService.Y(modificadores)`.
// --------------------------------------------------------------------

function multiplicadorDanoSaida(mapaModificadores) {
  return 1 + valorDoModificador(mapaModificadores, "DAMAGE_DEALT_PCT") / 100;
}

function multiplicadorDanoRecebido(mapaModificadores) {
  return 1 + valorDoModificador(mapaModificadores, "DAMAGE_TAKEN_PCT") / 100;
}

function bonusDefesa(mapaModificadores) {
  return valorDoModificador(mapaModificadores, "DEFENSE_FLAT");
}

function bonusChanceCriticoPct(mapaModificadores) {
  return valorDoModificador(mapaModificadores, "CRIT_CHANCE_PCT");
}

function bonusDanoCriticoPct(mapaModificadores) {
  return valorDoModificador(mapaModificadores, "CRIT_DAMAGE_PCT");
}

function bonusChanceEsquivaPct(mapaModificadores) {
  return valorDoModificador(mapaModificadores, "DODGE_CHANCE_PCT");
}

function bonusChanceAcertoPct(mapaModificadores) {
  return valorDoModificador(mapaModificadores, "HIT_CHANCE_PCT");
}

function multiplicadorCuraFeita(mapaModificadores) {
  return 1 + valorDoModificador(mapaModificadores, "HEALING_DONE_PCT") / 100;
}

function multiplicadorCuraRecebida(mapaModificadores) {
  return 1 + valorDoModificador(mapaModificadores, "HEALING_RECEIVED_PCT") / 100;
}

function multiplicadorCustoMana(mapaModificadores) {
  // Nunca deixa o custo ficar negativo (§15: "sem custo negativo").
  return Math.max(0, 1 + valorDoModificador(mapaModificadores, "MANA_COST_PCT") / 100);
}

function reducaoDeCooldownTurnos(mapaModificadores) {
  return Math.max(0, Math.round(valorDoModificador(mapaModificadores, "COOLDOWN_REDUCTION_TURNS")));
}

function regenVidaDoTurno(mapaModificadores, vidaMaxima) {
  const flat = valorDoModificador(mapaModificadores, "REGEN_HP_FLAT");
  const percent = valorDoModificador(mapaModificadores, "REGEN_HP_PERCENT");
  return Math.max(0, Math.round(flat + vidaMaxima * (percent / 100)));
}

function regenManaDoTurno(mapaModificadores, manaMaxima) {
  const flat = valorDoModificador(mapaModificadores, "REGEN_MANA_FLAT");
  const percent = valorDoModificador(mapaModificadores, "REGEN_MANA_PERCENT");
  return Math.max(0, Math.round(flat + manaMaxima * (percent / 100)));
}

function resistenciaStatusPct(mapaModificadores) {
  // Mesmo teto global que combatBuffService.STATUS_RESISTANCE_MAXIMA já
  // usa — nunca deixa status ficar impossível de aplicar (§Caldeirão §13).
  return Math.min(75, Math.max(0, valorDoModificador(mapaModificadores, "STATUS_RESISTANCE_PCT")));
}

function lifestealPct(mapaModificadores) {
  return Math.max(0, valorDoModificador(mapaModificadores, "LIFESTEAL_PCT"));
}

// §15 — lifesteal usa o dano que EFETIVAMENTE reduziu a Vida do alvo
// (depois de Defesa e escudo), nunca o dano bruto/absorvido.
function curaPorLifesteal(mapaModificadores, danoEfetivoNaVida) {
  if (danoEfetivoNaVida <= 0) return 0;
  const pct = lifestealPct(mapaModificadores);
  if (pct <= 0) return 0;
  return Math.max(0, Math.round(danoEfetivoNaVida * (pct / 100)));
}

// §14 — valida o shape de um gatilho reativo (ON_HIT/ON_CRIT/...) sem
// ainda disparar nada no motor real (próxima fase da migração, §26
// passo 5 em diante). Existe aqui pra Admin/preview poderem validar um
// PowerCombatEffect de trigger reativo mesmo antes do motor consumi-lo.
function dispararGatilho(triggerKey) {
  if (!triggerValido(triggerKey)) {
    throw erro(`trigger desconhecido: "${triggerKey}".`);
  }
  return { suportado: triggerKey === "PASSIVE" };
}

module.exports = {
  resolverModificadoresDoPersonagem,
  resolverGatilhosDoPersonagem,
  processarGatilho,
  regenInstantanea,
  TRIGGERS_REATIVOS_SUPORTADOS,
  REACTIVE_EFFECT_KEYS_IMPLEMENTADAS,
  resolverModificadores,
  magnitudeEfetiva,
  efeitoPermitidoNoContexto,
  valorDoModificador,
  multiplicadorDanoSaida,
  multiplicadorDanoRecebido,
  bonusDefesa,
  bonusChanceCriticoPct,
  bonusDanoCriticoPct,
  bonusChanceEsquivaPct,
  bonusChanceAcertoPct,
  multiplicadorCuraFeita,
  multiplicadorCuraRecebida,
  multiplicadorCustoMana,
  reducaoDeCooldownTurnos,
  regenVidaDoTurno,
  regenManaDoTurno,
  resistenciaStatusPct,
  lifestealPct,
  curaPorLifesteal,
  dispararGatilho,
  reapplyPolicyValida,
};
