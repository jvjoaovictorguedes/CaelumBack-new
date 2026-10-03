// IA de Combate PvE & Habilidades de Monstros V1 (§8.1/§8.2) — Adapter
// de Aventura Solo E Party: converte estado REAL de combate pro DTO do
// combatAiService puro, e executa a decisão "power" reaproveitando os
// MESMOS serviços que o resto do motor já usa (nunca uma fórmula
// paralela de dano/cura/status — §1.2 "não reescrever o motor").
//
// Solo (combatController.js) e Party (partySocket.js) têm shapes de
// estado DIFERENTES (Solo: par único {statusEffects:{player,enemy},
// combatBuffs, escudo}; Party: N membros, cada um com .status/
// .combatBuffs/.estado, e o monstro sem escudo/regen wired no motor
// hoje — ver nota §8.2 abaixo) — por isso cada modo tem seu próprio par
// decidirAcao*/executarPoder*, nunca forçando uma abstração única que
// esconderia essa diferença real.
//
// Escopo de EXECUÇÃO desta V1 (decisão documentada, não é lacuna
// escondida): monstro não tem pool de Mana nem atributos pra escalar
// Power (só dano_min/dano_max/agilidade/velocidade — ver
// AdventureMonster). Por isso:
//   - custo_mana NUNCA bloqueia uma MonsterAbility (actor.manaAtual
//     entra como Infinity pro combatAiService) — condições
//     SELF_MANA_BELOW_PCT numa MonsterAbility nunca disparam nesta V1.
//   - Power.dano_base é usado como dano PLANO (sem escala_atributo —
//     monstro não tem o atributo pra escalar), exatamente como já
//     acontece pro dano_base legado de monstro pré-V2.
//   - OFFENSIVE_BUFF/DEFENSIVE_BUFF (DAMAGE_DEALT_PCT, CRIT_CHANCE_PCT,
//     DEFENSE_FLAT etc.) ainda não têm ponto de leitura nenhum pro lado
//     do monstro nas fórmulas de dano/defesa dele (só o lado do jogador
//     lê combatBuffs.player/modificadoresJogador hoje) — plugar isso
//     tocaria fórmula de combate pra TODO combate, não só o com IA,
//     então fica fora desta V1. Uma MonsterAbility cuja Power só tem
//     essas capabilities nunca vira candidata (ver capabilitiesExecutaveis).
//   - SHIELD/REGEN_HP reaproveitam escudo.enemy/combatBuffs.enemy, que
//     JÁ são lidos no motor hoje (concederEscudo/absorverDano pro lado
//     enemy, regenDeVidaDoTurno(combatBuffs.enemy, ...) linha a linha
//     do processarTurno) — zero fórmula nova.
//   - A chance de acerto/esquiva do turno do monstro (resolverResultadoDeAcerto)
//     vale pra AÇÃO INTEIRA escolhida, não só dano — um "erro" consome o
//     turno inteiro, incluindo autoefeitos como cura/escudo. Simplificação
//     V1 deliberada (o documento não detalha esse caso).
const MonsterAbility = require("../models/MonsterAbility");
const MonsterAbilityCondition = require("../models/MonsterAbilityCondition");
const GuildBossAbility = require("../models/GuildBossAbility");
const { carregarPowerComEfeitos, classificarPower } = require("./powerCapabilityService");
const { chooseAction } = require("./combatAiService");
const cooldownService = require("./cooldownService");
const statusEffectService = require("./statusEffectService");
const combatBuffService = require("./combatBuffService");
const combatModifierService = require("./combatModifierService");
const { resolverEfeitosDeMonstroNoHit } = require("./monsterEffectResolver");
const { executarEfeito } = require("./consumableEffectRegistry");
const { definicaoDoStatus } = require("../config/statusEffectConfig");
const { rolarCritico, aplicarMitigacaoDeDefesa, MULTIPLICADOR_DANO_CRITICO } = require("./combatFormulas");

// Capabilities que esta V1 sabe executar de verdade — ver nota de escopo
// no topo do arquivo. Uma MonsterAbility cuja Power não tem NENHUMA
// dessas nunca entra na lista pré-carregada do encontro (nunca vira uma
// ação "escolhida" que não faz nada).
const CAPABILITIES_EXECUTAVEIS_V1 = ["DAMAGE", "DEBUFF_CONTROL", "HEAL_HP", "REGEN_HP", "SHIELD", "CLEANSE_SELF", "DISPEL_TARGET"];

// §8.2 — Party (partySocket.js) nunca teve escudo (GRANT_SHIELD) nem
// regen-por-turno wired no motor pra NENHUM ator (nem personagem, nem
// monstro) — diferente de Solo, onde escudo.enemy/combatBuffs.enemy já
// são lidos linha a linha do processarTurno hoje. Plugar SHIELD/REGEN_HP
// em Party exigiria tocar o pipeline de dano de TODO combate em grupo
// (jogador->monstro e monstro->jogador), não só o caminho com IA — fora
// de escopo desta V1 (§1.2 "não reescrever o motor"). Uma MonsterAbility
// cuja Power só tem SHIELD/REGEN_HP nunca vira candidata em Party.
const CAPABILITIES_EXECUTAVEIS_PARTY_V1 = ["DAMAGE", "DEBUFF_CONTROL", "HEAL_HP", "CLEANSE_SELF", "DISPEL_TARGET"];

const TIPO_COMBAT_EFFECT_PARA_CAPABILITY = {
  SHIELD: "SHIELD",
  REGEN_HP: "REGEN_HP",
  CLEANSE_SELF: "CLEANSE_SELF",
  DISPEL_TARGET: "DISPEL_TARGET",
};

function combatEffectExecutavel(efeito) {
  if (efeito.effect_key === "GRANT_SHIELD" || efeito.effect_key === "SHIELD_ON_CAST") {
    return { tipo: "SHIELD", magnitude: efeito.magnitude_base, durationTurns: efeito.duration_turns ?? 1 };
  }
  if (efeito.effect_key === "REGEN_HP_FLAT" || efeito.effect_key === "REGEN_HP_PERCENT") {
    return { tipo: "REGEN_HP", effectKey: efeito.effect_key, magnitude: efeito.magnitude_base, durationTurns: efeito.duration_turns ?? 1 };
  }
  if (efeito.effect_key === "CLEANSE_STATUS" && efeito.target === "SELF") {
    return { tipo: "CLEANSE_SELF", effectKey: "CLEANSE_STATUS", config: efeito.config ?? {} };
  }
  if (efeito.effect_key === "CLEANSE_CATEGORY" && efeito.target === "SELF") {
    return { tipo: "CLEANSE_SELF", effectKey: "CLEANSE_CATEGORY", config: efeito.config ?? {} };
  }
  if (efeito.effect_key === "DISPEL_BUFF" && (efeito.target === "ENEMY" || efeito.target === "ALL_ENEMIES")) {
    return { tipo: "DISPEL_TARGET" };
  }
  return null;
}

// Pré-carrega MonsterAbility+Power+condições UMA vez, no início do
// encontro (§8.1) — mesmo princípio de efeitosDeStatus/armaEquipadaEfeitos
// em combatController.gerarInimigoParaPersonagem. Devolve um array
// plano, serializável em JSONB (encontro_pve), sem instância Sequelize
// nenhuma sobrevivendo pro próximo turno.
async function construirHabilidadesParaEncontro(idMonstro, { transaction, capabilidadesExecutaveis = CAPABILITIES_EXECUTAVEIS_V1 } = {}) {
  const abilities = await MonsterAbility.findAll({
    where: { id_monstro: idMonstro, ativo: true },
    include: [{ model: MonsterAbilityCondition, as: "condicoes", where: { ativo: true }, required: false }],
    transaction,
  });

  const resultado = [];
  for (const ability of abilities) {
    const power = await carregarPowerComEfeitos(ability.id_power, { transaction });
    if (!power) continue;

    const capabilities = Array.from(classificarPower(power));
    const capabilitiesExecutaveis = capabilities.filter((c) => capabilidadesExecutaveis.includes(c));
    if (capabilitiesExecutaveis.length === 0) continue;

    resultado.push({
      id: ability.id,
      powerId: power.id,
      nome: power.nome,
      capabilities: capabilitiesExecutaveis,
      prioridadeBase: ability.prioridade_base,
      pesoUso: ability.peso_uso,
      targetPolicy: ability.target_policy,
      cooldownConfigurado: ability.cooldown_override ?? power.cooldown ?? null,
      danoBase: capabilitiesExecutaveis.includes("DAMAGE") ? power.dano_base ?? 0 : 0,
      curaBase: capabilitiesExecutaveis.includes("HEAL_HP") ? power.cura_base ?? 0 : 0,
      statusEffects: capabilitiesExecutaveis.includes("DEBUFF_CONTROL")
        ? (power.efeitosDeStatus ?? [])
            .filter((e) => e.target === "Enemy")
            .map((e) => ({
              status_key: e.status_key,
              chance_ppm: e.chance_ppm,
              duration_turns: e.duration_turns,
              potency_base: e.potency_base,
              percentual_vida_maxima: e.percentual_vida_maxima,
              ativo: true,
            }))
        : [],
      combatEffectsExecutaveis: (power.efeitosDeCombate ?? [])
        .map(combatEffectExecutavel)
        .filter((efeito) => efeito && capabilitiesExecutaveis.includes(TIPO_COMBAT_EFFECT_PARA_CAPABILITY[efeito.tipo])),
      conditions: (ability.condicoes ?? []).map((c) => ({
        key: c.condition_key,
        config: c.config,
        scoreBonus: c.score_bonus,
        required: c.required,
        ativo: c.ativo,
      })),
    });
  }
  return resultado;
}

// Converte estado real de combate pro DTO do combatAiService (§5.1) e
// devolve a decisão crua — quem chama resolve abilityId de volta pra
// linha de `inimigoAtual.habilidades`.
function decidirAcao({ inimigoAtual, personagemAtual, vidaMaximaJogador, statusEffects, combatBuffs, escudo, cooldowns, combatTurn }) {
  const actor = {
    id: "enemy",
    hpAtual: inimigoAtual.vida_atual,
    hpMaxima: inimigoAtual.vida_maxima,
    // V1: Mana de monstro não existe — nunca bloqueia uma MonsterAbility
    // (ver nota de escopo no topo do arquivo).
    manaAtual: Infinity,
    manaMaxima: Infinity,
    statuses: (statusEffects.enemy ?? []).map((s) => s.key),
    buffs: (combatBuffs.enemy ?? []).map((b) => b.atributo),
    hasShield: Boolean(escudo.enemy),
  };
  const opponents = [
    {
      id: "player",
      hpAtual: personagemAtual.vida_atual,
      hpMaxima: vidaMaximaJogador,
      alive: personagemAtual.vida_atual > 0,
      statuses: (statusEffects.player ?? []).map((s) => s.key),
      buffs: (combatBuffs.player ?? []).map((b) => b.atributo),
    },
  ];
  const abilities = (inimigoAtual.habilidades ?? []).map((h) => ({
    id: h.id,
    powerId: h.powerId,
    capabilities: new Set(h.capabilities),
    prioridadeBase: h.prioridadeBase,
    pesoUso: h.pesoUso,
    manaCost: 0,
    cooldownAtual: cooldownService.turnosRestantes(cooldowns.enemy ?? {}, h.powerId),
    targetPolicy: h.targetPolicy,
    isPassive: false,
    conditions: h.conditions,
  }));

  return chooseAction({
    context: "PVE",
    aiProfile: inimigoAtual.ai_profile ?? "BASIC",
    actor,
    opponents,
    abilities,
    phase: null,
    turn: combatTurn,
    history: [],
  });
}

// Executa a Power escolhida pela IA, reaproveitando os MESMOS serviços
// que o ataque básico/Powers de personagem já usam. Muta statusEffects/
// combatBuffs/escudo in place (mesma convenção do resto de
// processarTurno) e devolve só os escalares que o controller precisa
// pra log/resposta HTTP.
function executarPoder({
  habilidade,
  inimigoAtual,
  personagemAtual,
  statusEffects,
  combatBuffs,
  escudo,
  modificadoresJogador,
  multiplicadorDefesaTaverna,
  combatTurn,
  log,
}) {
  let criticoInimigo = false;
  let danoRecebidoContraAtaque = 0;

  if (habilidade.danoBase > 0) {
    const danoEnfraquecido = Math.round(
      Math.max(1, habilidade.danoBase) * statusEffectService.multiplicadorDeDanoDeSaida(statusEffects.enemy),
    );
    if (rolarCritico(inimigoAtual)) criticoInimigo = true;
    const danoComCritico = criticoInimigo ? Math.round(danoEnfraquecido * MULTIPLICADOR_DANO_CRITICO) : danoEnfraquecido;
    const bonusDefesaTotal =
      combatBuffService.bonusDeDefesa(combatBuffs.player) + combatModifierService.bonusDefesa(modificadoresJogador);
    const defensorComBuffs = bonusDefesaTotal
      ? { ...personagemAtual, defesa: (personagemAtual.defesa || 0) + bonusDefesaTotal }
      : personagemAtual;
    const danoFinal = Math.max(
      1,
      Math.round(
        aplicarMitigacaoDeDefesa(danoComCritico, defensorComBuffs) *
          multiplicadorDefesaTaverna *
          combatModifierService.multiplicadorDanoRecebido(modificadoresJogador),
      ),
    );
    danoRecebidoContraAtaque = danoFinal;

    const absorcaoEscudo = combatBuffService.absorverDano(escudo.player, danoFinal);
    escudo.player = absorcaoEscudo.escudo;
    personagemAtual.vida_atual = Math.max(0, personagemAtual.vida_atual - absorcaoEscudo.danoResidual);

    log.push(
      criticoInimigo
        ? `${inimigoAtual.nome} usou ${habilidade.nome} e causou ${danoFinal} de dano em você. ACERTO CRÍTICO!`
        : `${inimigoAtual.nome} usou ${habilidade.nome} e causou ${danoFinal} de dano em você.`,
    );

    const quebraFreeze = statusEffectService.removerFreezeAoReceberDanoDireto(statusEffects.player, danoFinal);
    statusEffects.player = quebraFreeze.lista;
    if (quebraFreeze.quebrou) log.push("Você descongelou com o impacto!");
  } else {
    log.push(`${inimigoAtual.nome} usou ${habilidade.nome}!`);
  }

  if (habilidade.statusEffects.length > 0) {
    const novosEfeitos = resolverEfeitosDeMonstroNoHit({ efeitosDeStatus: habilidade.statusEffects, turno: combatTurn });
    for (const efeito of novosEfeitos) {
      const chanceResistencia = Math.min(
        combatBuffService.STATUS_RESISTANCE_MAXIMA,
        combatBuffService.somaDeAtributo(combatBuffs.player, "STATUS_RESISTANCE_PCT") +
          combatModifierService.resistenciaStatusPct(modificadoresJogador),
      );
      if (chanceResistencia > 0 && Math.random() * 100 < chanceResistencia) {
        log.push(`Você resistiu a ${definicaoDoStatus(efeito.key).nomeUi}!`);
        continue;
      }
      statusEffects.player = statusEffectService.aplicarStatus(statusEffects.player, efeito);
      log.push(`${inimigoAtual.nome} aplicou ${definicaoDoStatus(efeito.key).nomeUi} em você por ${efeito.remainingTurns} turno(s)!`);
    }
  }

  if (habilidade.curaBase > 0) {
    const vidaAntes = inimigoAtual.vida_atual;
    inimigoAtual.vida_atual = Math.min(inimigoAtual.vida_maxima, inimigoAtual.vida_atual + habilidade.curaBase);
    if (inimigoAtual.vida_atual > vidaAntes) {
      log.push(`${inimigoAtual.nome} recuperou ${inimigoAtual.vida_atual - vidaAntes} de vida!`);
    }
  }

  for (const efeito of habilidade.combatEffectsExecutaveis ?? []) {
    if (efeito.tipo === "SHIELD") {
      escudo.enemy = combatBuffService.concederEscudo(escudo.enemy, efeito.magnitude, efeito.durationTurns);
      log.push(`${inimigoAtual.nome} ganhou um escudo de ${efeito.magnitude} pontos!`);
    } else if (efeito.tipo === "REGEN_HP") {
      combatBuffs.enemy = combatBuffService.aplicarBuff(combatBuffs.enemy, {
        atributo: efeito.effectKey,
        valor: efeito.magnitude,
        remainingTurns: efeito.durationTurns,
        sourceItemId: null,
      });
      log.push(`${inimigoAtual.nome} começou a regenerar vida!`);
    } else if (efeito.tipo === "CLEANSE_SELF") {
      const resultado = executarEfeito(efeito.effectKey, { statusEffects: statusEffects.enemy, config: efeito.config });
      if (resultado.aplicado) log.push(`${inimigoAtual.nome} se livrou de um efeito negativo!`);
      statusEffects.enemy = resultado.statusEffects;
    } else if (efeito.tipo === "DISPEL_TARGET" && combatBuffs.player.length > 0) {
      combatBuffs.player = combatBuffs.player.slice(0, -1);
      log.push(`${inimigoAtual.nome} removeu um efeito benéfico seu!`);
    }
  }

  return { criticoInimigo, danoRecebidoContraAtaque };
}

// §7/§8.3 — Guild Boss V1: combate deste modo NÃO TEM NENHUMA lista de
// status/combatBuffs/escudo hoje, nem pro jogador nem pro chefe (ver
// guildBossSocket.js — zero statusEffectService/combatBuffService
// importado nesse arquivo). Plugar DEBUFF_CONTROL/CLEANSE_SELF/
// DISPEL_TARGET exigiria criar esse estado do zero pra TODO combate de
// Guild Boss (jogador vs chefe, não só o turno com IA) — fora de escopo
// desta V1 (§1.2 "não reescrever o motor"). Só DAMAGE é executável; o
// "ataque básico" já escalava por rodada (forcaChefeParaRodada) e a
// ability reusa o MESMO truque de força sintética, só com outra base.
// GuildBossAbility também não tem condições (não existe
// GuildBossAbilityCondition nesta V1) — a IA aqui só pontua por
// prioridade_base/peso_uso/jitter, sem condições situacionais.
const CAPABILITIES_EXECUTAVEIS_GUILD_BOSS_V1 = ["DAMAGE"];

// §8.2 — Party: mesmo DTO do combatAiService, mas `opponents` é TODO
// membro vivo do grupo (não um único alvo pré-sorteado), porque
// target_policy (LOWEST_HP/HIGHEST_HP/RANDOM/ALL) só faz sentido quando
// a IA realmente escolhe entre vários alvos — §6.3 "Party/Bosses podem
// usar políticas de alvo". Quando a decisão cai em "attack" (sem
// ability elegível), quem chama ignora `targetIds` e mantém o sorteio
// aleatório ORIGINAL do Party (nunca muda o alvo do ataque básico
// legado — regressão zero).
function decidirAcaoGrupo({ inimigo, membrosVivos, cooldowns, combatTurn }) {
  const actor = {
    id: "enemy",
    hpAtual: inimigo.vida_atual,
    hpMaxima: inimigo.vida_maxima,
    manaAtual: Infinity,
    manaMaxima: Infinity,
    statuses: (inimigo.status ?? []).map((s) => s.key),
    buffs: (inimigo.combatBuffs ?? []).map((b) => b.atributo),
    hasShield: false,
  };
  const opponents = membrosVivos.map((m) => ({
    id: m.id,
    hpAtual: m.estado.vida_atual,
    hpMaxima: m.vidaMax,
    alive: m.estado.vida_atual > 0,
    statuses: (m.status ?? []).map((s) => s.key),
    buffs: (m.combatBuffs ?? []).map((b) => b.atributo),
  }));
  const abilities = (inimigo.habilidades ?? []).map((h) => ({
    id: h.id,
    powerId: h.powerId,
    capabilities: new Set(h.capabilities),
    prioridadeBase: h.prioridadeBase,
    pesoUso: h.pesoUso,
    manaCost: 0,
    cooldownAtual: cooldownService.turnosRestantes(cooldowns ?? {}, h.powerId),
    targetPolicy: h.targetPolicy,
    isPassive: false,
    conditions: h.conditions,
  }));

  return chooseAction({
    context: "PARTY",
    aiProfile: inimigo.ai_profile ?? "BASIC",
    actor,
    opponents,
    abilities,
    phase: null,
    turn: combatTurn,
    history: [],
  });
}

// §8.2 — execução da Power escolhida em Party. Mesma matemática de
// executarPoder (dano/status/cura/cleanse/dispel), só adaptada ao shape
// de Party: `inimigo` é `batalha.inimigo` direto (tem .status/
// .combatBuffs/.vida_atual própios, sem wrapper {player,enemy});
// `alvoEstado`/`alvoStatus`/`alvoBuffs` vêm do membro atacado. SHIELD/
// REGEN_HP não entram aqui de propósito — ver
// CAPABILITIES_EXECUTAVEIS_PARTY_V1 no topo do arquivo.
function executarPoderEmGrupo({ habilidade, inimigo, alvoEstado, alvoStatus, alvoBuffs, modificadoresDefensor, combatTurn, log }) {
  let criticoInimigo = false;
  let dano = 0;
  let novoStatusDefensor = alvoStatus;
  let novoStatusAtacante = inimigo.status ?? [];

  if (habilidade.danoBase > 0) {
    const danoEnfraquecido = Math.round(
      Math.max(1, habilidade.danoBase) * statusEffectService.multiplicadorDeDanoDeSaida(novoStatusAtacante),
    );
    if (rolarCritico(inimigo)) criticoInimigo = true;
    const danoComCritico = criticoInimigo ? Math.round(danoEnfraquecido * MULTIPLICADOR_DANO_CRITICO) : danoEnfraquecido;
    const bonusDefesaTotal =
      combatBuffService.bonusDeDefesa(alvoBuffs ?? []) + combatModifierService.bonusDefesa(modificadoresDefensor ?? new Map());
    const defensorComBuffs = bonusDefesaTotal ? { ...alvoEstado, defesa: (alvoEstado.defesa || 0) + bonusDefesaTotal } : alvoEstado;
    dano = Math.max(1, Math.round(aplicarMitigacaoDeDefesa(danoComCritico, defensorComBuffs)));

    alvoEstado.vida_atual = Math.max(0, alvoEstado.vida_atual - dano);
    log.push(
      criticoInimigo
        ? `${inimigo.nome} usou ${habilidade.nome} e causou ${dano} de dano. ACERTO CRÍTICO!`
        : `${inimigo.nome} usou ${habilidade.nome} e causou ${dano} de dano.`,
    );

    const quebraFreeze = statusEffectService.removerFreezeAoReceberDanoDireto(novoStatusDefensor, dano);
    novoStatusDefensor = quebraFreeze.lista;
    if (quebraFreeze.quebrou) log.push("O alvo descongelou com o impacto!");
  } else {
    log.push(`${inimigo.nome} usou ${habilidade.nome}!`);
  }

  if (habilidade.statusEffects.length > 0) {
    const novosEfeitos = resolverEfeitosDeMonstroNoHit({ efeitosDeStatus: habilidade.statusEffects, turno: combatTurn });
    for (const efeito of novosEfeitos) {
      const chanceResistencia = Math.min(
        combatBuffService.STATUS_RESISTANCE_MAXIMA,
        combatBuffService.somaDeAtributo(alvoBuffs ?? [], "STATUS_RESISTANCE_PCT") +
          combatModifierService.resistenciaStatusPct(modificadoresDefensor ?? new Map()),
      );
      if (chanceResistencia > 0 && Math.random() * 100 < chanceResistencia) {
        log.push(`Resistiu a ${definicaoDoStatus(efeito.key).nomeUi}!`);
        continue;
      }
      novoStatusDefensor = statusEffectService.aplicarStatus(novoStatusDefensor, efeito);
      log.push(`${inimigo.nome} aplicou ${definicaoDoStatus(efeito.key).nomeUi} por ${efeito.remainingTurns} turno(s)!`);
    }
  }

  if (habilidade.curaBase > 0) {
    const vidaAntes = inimigo.vida_atual;
    inimigo.vida_atual = Math.min(inimigo.vida_maxima, inimigo.vida_atual + habilidade.curaBase);
    if (inimigo.vida_atual > vidaAntes) log.push(`${inimigo.nome} recuperou ${inimigo.vida_atual - vidaAntes} de vida!`);
  }

  let novosBuffsDefensor = alvoBuffs;
  for (const efeito of habilidade.combatEffectsExecutaveis ?? []) {
    if (efeito.tipo === "CLEANSE_SELF") {
      const resultado = executarEfeito(efeito.effectKey, { statusEffects: novoStatusAtacante, config: efeito.config });
      if (resultado.aplicado) log.push(`${inimigo.nome} se livrou de um efeito negativo!`);
      novoStatusAtacante = resultado.statusEffects;
    } else if (efeito.tipo === "DISPEL_TARGET" && (novosBuffsDefensor ?? []).length > 0) {
      novosBuffsDefensor = novosBuffsDefensor.slice(0, -1);
      log.push(`${inimigo.nome} removeu um efeito benéfico do alvo!`);
    }
  }

  return { criticoInimigo, dano, statusAtacante: novoStatusAtacante, statusDefensor: novoStatusDefensor, buffsDefensor: novosBuffsDefensor };
}

// §7/§8.3 — mesmo princípio de construirHabilidadesParaEncontro, mas
// pra GuildBossAbility (sem condições — ver nota de escopo acima).
async function construirHabilidadesParaGuildBoss(idGuildBossConfig, { transaction } = {}) {
  const abilities = await GuildBossAbility.findAll({ where: { id_guild_boss_config: idGuildBossConfig, ativo: true }, transaction });

  const resultado = [];
  for (const ability of abilities) {
    const power = await carregarPowerComEfeitos(ability.id_power, { transaction });
    if (!power) continue;

    const capabilities = Array.from(classificarPower(power)).filter((c) => CAPABILITIES_EXECUTAVEIS_GUILD_BOSS_V1.includes(c));
    if (capabilities.length === 0) continue;

    resultado.push({
      id: ability.id,
      powerId: power.id,
      nome: power.nome,
      capabilities,
      prioridadeBase: ability.prioridade_base,
      pesoUso: ability.peso_uso,
      targetPolicy: ability.target_policy,
      cooldownConfigurado: ability.cooldown_override ?? power.cooldown ?? null,
      danoBase: power.dano_base ?? 0,
      conditions: [],
    });
  }
  return resultado;
}

// §8.3 — DTO do combatAiService pro turno do chefe. `vivos` são os
// membros vivos da batalha (mesmo shape de Party: .id/.estado.vida_atual/
// .vidaMax); vida do chefe vem de batalha.vidaRestante/vidaTotal (já
// existem, únicos campos de HP que este modo rastreia pro chefe).
function decidirAcaoChefe({ vidaRestante, vidaTotal, habilidades, cooldowns, vivos, rodada }) {
  const actor = {
    id: "chefe",
    hpAtual: vidaRestante,
    hpMaxima: vidaTotal,
    manaAtual: Infinity,
    manaMaxima: Infinity,
    statuses: [],
    buffs: [],
    hasShield: false,
  };
  const opponents = vivos.map((m) => ({
    id: m.id,
    hpAtual: m.estado.vida_atual,
    hpMaxima: m.vidaMax,
    alive: m.estado.vida_atual > 0,
    statuses: [],
    buffs: [],
  }));
  const abilities = (habilidades ?? []).map((h) => ({
    id: h.id,
    powerId: h.powerId,
    capabilities: new Set(h.capabilities),
    prioridadeBase: h.prioridadeBase,
    pesoUso: h.pesoUso,
    manaCost: 0,
    cooldownAtual: cooldownService.turnosRestantes(cooldowns ?? {}, h.powerId),
    targetPolicy: h.targetPolicy,
    isPassive: false,
    conditions: [],
  }));

  return chooseAction({
    context: "GUILD_BOSS",
    aiProfile: "BOSS",
    actor,
    opponents,
    abilities,
    phase: null,
    turn: rodada,
    history: [],
  });
}

module.exports = {
  CAPABILITIES_EXECUTAVEIS_V1,
  CAPABILITIES_EXECUTAVEIS_PARTY_V1,
  CAPABILITIES_EXECUTAVEIS_GUILD_BOSS_V1,
  construirHabilidadesParaEncontro,
  decidirAcao,
  executarPoder,
  decidirAcaoGrupo,
  executarPoderEmGrupo,
  construirHabilidadesParaGuildBoss,
  decidirAcaoChefe,
};
