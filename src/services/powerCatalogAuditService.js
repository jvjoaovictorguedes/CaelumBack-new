// Rebalanceamento de Powers §31 — auditoria automática e reaproveitável
// do catálogo inteiro de Powers (não só das ~76 canônicas desta entrega):
// detecta dado incoerente que já exista no banco (seed antigo, migration
// direta, edição manual) além do que o Admin (adminPowerService) agora
// bloqueia na entrada. Read-only: nunca corrige nada aqui, só relata.
//
// Cada finding tem `severidade` ("ERRO" | "ALERTA"). ERRO é invariante
// grave — §31 "devem fazer teste/CI falhar" (ver gravesFalham() e o teste
// correspondente). ALERTA é heurística que pede revisão humana (ex.:
// Verdadeiro fora da allowlist, ON_CAST/ON_HIT num efeito que parece
// intrínseco) — nunca travou CI sozinho, porque tem falso-positivo real.
const Power = require("../models/Power");
const ClassAbilities = require("../models/ClassAbilities");
const RaceAbilities = require("../models/RaceAbilities");
const NatureAbilities = require("../models/NatureAbilities");
const Evolution = require("../models/Evolution");
const PowerBook = require("../models/PowerBook");
const UniqueFeat = require("../models/UniqueFeat");
const CharacterAbilities = require("../models/CharacterAbilities");
const PowerStatusEffect = require("../models/PowerStatusEffect");
const PowerCombatEffect = require("../models/PowerCombatEffect");
const { CHAVES_VALIDAS } = require("../config/statusEffectConfig");
const { EFFECT_KEYS, TARGETS, REAPPLY_POLICIES_VALIDAS, effectKeyValida, targetValido, reapplyPolicyValida } = require("../config/combatModifierConfig");
const { triggerValido } = require("../config/combatTriggerConfig");

const TIPOS_DANO_VALIDOS = ["Fisico", "Magico", "Verdadeiro", "Nenhum"];
const AFFINITY_MODES_VALIDOS = ["INHERIT_WEAPON", "EXPLICIT", "NEUTRAL"];

// §4 "Verdadeiro continua excepcional" — nenhuma Power desta entrega é
// Verdadeiro (ver a migration 20270214010000). Lista viva: se um dia o
// design time aprovar uma Power Verdadeiro de propósito, o nome entra
// aqui junto da decisão — nunca silenciosamente por já existir no banco.
const POWERS_VERDADEIRO_APROVADAS = [];

function finding(severidade, categoria, power, detalhe) {
  return {
    severidade,
    categoria,
    power_id: power?.id ?? null,
    power_nome: power?.nome ?? null,
    detalhe,
  };
}

// --------------------------------------------------- INVARIANTES DE Power
function auditarPower(power, findings) {
  const ehPersonagem = ["CHARACTER", "BOTH"].includes(power.usage_scope);

  if (power.tipo_poder === "Ativo" && ehPersonagem) {
    if (power.cooldown == null || !Number.isInteger(power.cooldown) || power.cooldown <= 0) {
      findings.push(finding("ERRO", "ATIVA_SEM_COOLDOWN", power, `tipo_poder=Ativo, usage_scope=${power.usage_scope}, cooldown=${power.cooldown} — precisa ser inteiro >= 1.`));
    }
  }
  if (power.custo_mana < 0) {
    findings.push(finding("ERRO", "MANA_NEGATIVA", power, `custo_mana=${power.custo_mana}.`));
  }
  if (power.tipo_poder === "Passivo") {
    if (power.custo_mana !== 0) findings.push(finding("ERRO", "PASSIVA_COM_MANA", power, `custo_mana=${power.custo_mana}, esperado 0.`));
    if (power.cooldown !== 0) findings.push(finding("ERRO", "PASSIVA_COM_COOLDOWN", power, `cooldown=${power.cooldown}, esperado 0.`));
    if ((power.dano_base ?? 0) > 0 || (power.cura_base ?? 0) > 0) {
      findings.push(finding("ALERTA", "PASSIVA_COM_DANO_OU_CURA_ATIVO", power, `dano_base=${power.dano_base}, cura_base=${power.cura_base} — Passiva não devia ter componente ativo direto (revisar se é intencional via PowerCombatEffect em vez disso).`));
    }
  }
  if (power.tipo_poder === "Ativo" && (power.dano_base ?? 0) > 0 && power.tipo_dano === "Nenhum") {
    findings.push(finding("ERRO", "OFENSIVA_SEM_TIPO_DANO", power, `dano_base=${power.dano_base} com tipo_dano=Nenhum.`));
  }
  if ((power.cura_base ?? 0) > 0 && (power.dano_base ?? 0) === 0 && (power.affinity_id != null || power.added_affinity_id != null)) {
    findings.push(finding("ERRO", "CURA_COM_AFINIDADE_OFENSIVA", power, `cura_base=${power.cura_base} mas affinity_id=${power.affinity_id}/added_affinity_id=${power.added_affinity_id} setados.`));
  }
  if (power.tipo_dano === "Verdadeiro" && !POWERS_VERDADEIRO_APROVADAS.includes(power.nome)) {
    findings.push(finding("ALERTA", "VERDADEIRO_NAO_APROVADO", power, `tipo_dano=Verdadeiro sem aprovação explícita em POWERS_VERDADEIRO_APROVADAS — Verdadeiro é excepcional (§4), nunca "forte = Verdadeiro".`));
  }
  if (!TIPOS_DANO_VALIDOS.includes(power.tipo_dano)) {
    findings.push(finding("ERRO", "TIPO_DANO_INVALIDO", power, `tipo_dano="${power.tipo_dano}".`));
  }
  if (!AFFINITY_MODES_VALIDOS.includes(power.affinity_mode)) {
    findings.push(finding("ERRO", "AFFINITY_MODE_INVALIDO", power, `affinity_mode="${power.affinity_mode}".`));
  }
  if (power.affinity_mode === "EXPLICIT" && power.affinity_id == null) {
    findings.push(finding("ERRO", "EXPLICIT_SEM_AFFINITY_ID", power, "affinity_mode=EXPLICIT sem affinity_id."));
  }
  if (["Nenhum", "Verdadeiro"].includes(power.tipo_dano) && (power.affinity_id != null || power.added_affinity_id != null)) {
    findings.push(finding("ERRO", "TIPO_DANO_COM_AFINIDADE_OFENSIVA", power, `tipo_dano=${power.tipo_dano} com affinity_id=${power.affinity_id}/added_affinity_id=${power.added_affinity_id}.`));
  }
  if (Number(power.added_damage_pct) > 0 && power.added_affinity_id == null) {
    findings.push(finding("ERRO", "ADDED_DAMAGE_PCT_SEM_AFFINITY", power, `added_damage_pct=${power.added_damage_pct} sem added_affinity_id.`));
  }
  if (Number(power.imbue_damage_pct) > 0 && power.imbue_affinity_id == null) {
    findings.push(finding("ERRO", "IMBUE_DAMAGE_PCT_SEM_AFFINITY", power, `imbue_damage_pct=${power.imbue_damage_pct} sem imbue_affinity_id.`));
  }
  if (power.usage_scope === "MONSTER" && power.acquisition_scope === "UNIQUE_FEAT") {
    findings.push(finding("ERRO", "MONSTER_COM_UNIQUE_FEAT", power, "usage_scope=MONSTER não pode ter acquisition_scope=UNIQUE_FEAT (Proeza Única é sempre pra personagem)."));
  }
}

// ------------------------------------------------ STATUS/COMBAT EFFECT ROWS
function auditarStatusEffect(efeito, power, findings) {
  if (!CHAVES_VALIDAS.includes(efeito.status_key)) {
    findings.push(finding("ERRO", "STATUS_KEY_INVALIDA", power, `PowerStatusEffect#${efeito.id} status_key="${efeito.status_key}".`));
  }
  if (!["Enemy", "Self"].includes(efeito.target)) {
    findings.push(finding("ERRO", "STATUS_TARGET_INVALIDO", power, `PowerStatusEffect#${efeito.id} target="${efeito.target}".`));
  }
  if (!Number.isInteger(efeito.chance_ppm) || efeito.chance_ppm <= 0 || efeito.chance_ppm > 1_000_000) {
    findings.push(finding("ERRO", "STATUS_CHANCE_PPM_INVALIDA", power, `PowerStatusEffect#${efeito.id} chance_ppm=${efeito.chance_ppm}.`));
  }
  if (!Number.isInteger(efeito.duration_turns) || efeito.duration_turns < 1) {
    findings.push(finding("ERRO", "STATUS_DURATION_INVALIDA", power, `PowerStatusEffect#${efeito.id} duration_turns=${efeito.duration_turns}.`));
  }
}

function auditarCombatEffect(efeito, power, findings) {
  if (!effectKeyValida(efeito.effect_key)) {
    findings.push(finding("ERRO", "COMBAT_EFFECT_KEY_INVALIDA", power, `PowerCombatEffect#${efeito.id} effect_key="${efeito.effect_key}".`));
  }
  if (!targetValido(efeito.target)) {
    findings.push(finding("ERRO", "COMBAT_EFFECT_TARGET_INVALIDO", power, `PowerCombatEffect#${efeito.id} target="${efeito.target}".`));
  }
  if (!triggerValido(efeito.trigger)) {
    findings.push(finding("ERRO", "COMBAT_EFFECT_TRIGGER_INVALIDO", power, `PowerCombatEffect#${efeito.id} trigger="${efeito.trigger}".`));
  }
  if (!reapplyPolicyValida(efeito.reapply_policy)) {
    findings.push(finding("ERRO", "COMBAT_EFFECT_REAPPLY_POLICY_INVALIDA", power, `PowerCombatEffect#${efeito.id} reapply_policy="${efeito.reapply_policy}".`));
  }
  if (efeito.reapply_policy === "STACK" && efeito.max_stacks == null) {
    findings.push(finding("ERRO", "COMBAT_EFFECT_STACK_SEM_MAX_STACKS", power, `PowerCombatEffect#${efeito.id} reapply_policy=STACK sem max_stacks.`));
  }
  // §6 — `sourcePowerId` só existe na linha EFÊMERA que
  // combatModifierService monta em memória (nunca uma coluna desta
  // tabela: toda linha aqui já pertence a UM id_power). Alvo SELF em
  // ON_CAST/ON_HIT dispara pra QUALQUER Power usada enquanto estiver no
  // loadout, não só a própria — provavelmente devia ser ON_POWER_CAST/
  // ON_POWER_HIT. Heurística, não ERRO: ON_CAST/ON_HIT em SELF também é
  // o jeito certo de reagir ao que o PRÓPRIO personagem faz com OUTRAS
  // Powers (ex.: Fluxo Arcano reagindo a qualquer cast) — exige leitura
  // humana da intenção, nunca reescrito automaticamente aqui.
  if (["ON_CAST", "ON_HIT"].includes(efeito.trigger) && efeito.target === "SELF") {
    findings.push(finding("ALERTA", "POSSIVEL_EFEITO_INTRINSECO_EM_ON_CAST_OU_ON_HIT", power, `PowerCombatEffect#${efeito.id} trigger=${efeito.trigger} target=SELF — confirmar se é reativo ao loadout (correto) ou intrínseco desta Power (nesse caso devia ser ON_POWER_${efeito.trigger === "ON_CAST" ? "CAST" : "HIT"}).`));
  }
}

// ------------------------------------------------------- ORIGEM DE AQUISIÇÃO
// §2 — toda Power CHARACTER/BOTH com acquisition_scope=NORMAL precisa
// de pelo menos uma origem real (classe/raça/natureza/evolução/livro).
// UNIQUE_FEAT tem origem própria (o claim da Proeza, nunca estas
// tabelas) — nunca contado aqui.
async function auditarOrigens(powers, findings) {
  const idsNormais = powers
    .filter((p) => ["CHARACTER", "BOTH"].includes(p.usage_scope) && p.acquisition_scope === "NORMAL")
    .map((p) => p.id);
  if (!idsNormais.length) return;

  const [classAb, raceAb, natureAb, evolucoes, livros] = await Promise.all([
    ClassAbilities.findAll({ attributes: ["id_poder"], raw: true }),
    RaceAbilities.findAll({ attributes: ["id_power"], raw: true }),
    NatureAbilities.findAll({ attributes: ["id_poder"], raw: true }),
    Evolution.findAll({ attributes: ["id_power_concedido"], raw: true }),
    PowerBook.findAll({ attributes: ["id_power"], raw: true }),
  ]);
  const comOrigem = new Set([
    ...classAb.map((r) => r.id_poder),
    ...raceAb.map((r) => r.id_power),
    ...natureAb.map((r) => r.id_poder),
    ...evolucoes.map((r) => r.id_power_concedido).filter((id) => id != null),
    ...livros.map((r) => r.id_power),
  ]);

  const porId = new Map(powers.map((p) => [p.id, p]));
  for (const id of idsNormais) {
    if (!comOrigem.has(id)) {
      findings.push(finding("ERRO", "ORPHAN_NORMAL_POWER", porId.get(id), "acquisition_scope=NORMAL sem nenhum vínculo em ClassAbilities/RaceAbilities/NatureAbilities/Evolution.id_power_concedido/PowerBook."));
    }
  }
}

// §2/§31 — o inverso do orphan check: uma Power usage_scope=MONSTER
// nunca pode estar em NENHUMA das vias normais de aquisição de
// personagem, nem ser o reward de uma Proeza Única.
async function auditarPowersDeMonstroAcquiriveisPorPersonagem(powers, findings) {
  const porId = new Map(powers.map((p) => [p.id, p]));
  const idsMonstro = new Set(powers.filter((p) => p.usage_scope === "MONSTER").map((p) => p.id));
  if (!idsMonstro.size) return;

  const [classAb, raceAb, natureAb, evolucoes, livros, proezas] = await Promise.all([
    ClassAbilities.findAll({ attributes: ["id_poder"], raw: true }),
    RaceAbilities.findAll({ attributes: ["id_power"], raw: true }),
    NatureAbilities.findAll({ attributes: ["id_poder"], raw: true }),
    Evolution.findAll({ attributes: ["id_power_concedido"], raw: true }),
    PowerBook.findAll({ attributes: ["id_power"], raw: true }),
    UniqueFeat.findAll({ attributes: ["id_power_reward"], raw: true }),
  ]);
  const vinculos = [
    ...classAb.map((r) => ["ClassAbilities", r.id_poder]),
    ...raceAb.map((r) => ["RaceAbilities", r.id_power]),
    ...natureAb.map((r) => ["NatureAbilities", r.id_poder]),
    ...evolucoes.filter((r) => r.id_power_concedido != null).map((r) => ["Evolution", r.id_power_concedido]),
    ...livros.map((r) => ["PowerBook", r.id_power]),
    ...proezas.map((r) => ["UniqueFeat", r.id_power_reward]),
  ];
  for (const [origem, idPower] of vinculos) {
    if (idsMonstro.has(idPower)) {
      findings.push(finding("ERRO", "MONSTER_POWER_ACQUIRIVEL_POR_PERSONAGEM", porId.get(idPower), `usage_scope=MONSTER mas tem vínculo de aquisição normal em ${origem}.`));
    }
  }
}

// §24 — Evolution/NatureAbilities não podem referenciar Power
// incompatível (MONSTER, ou UNIQUE_FEAT fora do fluxo de Proeza).
async function auditarEvolutionsENatureAbilities(powers, findings) {
  const porId = new Map(powers.map((p) => [p.id, p]));
  const evolucoes = await Evolution.findAll({ raw: true });
  for (const evolucao of evolucoes) {
    if (evolucao.id_power_concedido == null) continue;
    const power = porId.get(evolucao.id_power_concedido);
    if (!power) {
      findings.push(finding("ERRO", "EVOLUTION_POWER_INEXISTENTE", null, `Evolution#${evolucao.id} (${evolucao.nome}) aponta pra id_power_concedido=${evolucao.id_power_concedido} que não existe.`));
      continue;
    }
    if (!["CHARACTER", "BOTH"].includes(power.usage_scope)) {
      findings.push(finding("ERRO", "EVOLUTION_INCOMPATIVEL", power, `Evolution#${evolucao.id} (${evolucao.nome}) concede Power com usage_scope=${power.usage_scope}.`));
    }
    if (power.acquisition_scope === "UNIQUE_FEAT") {
      findings.push(finding("ERRO", "EVOLUTION_CONCEDE_UNIQUE_FEAT", power, `Evolution#${evolucao.id} (${evolucao.nome}) concede uma Power de Proeza Única — nunca pode, Proeza só pelo claim.`));
    }
  }

  const naturezas = await NatureAbilities.findAll({ raw: true });
  for (const vinculo of naturezas) {
    const power = porId.get(vinculo.id_poder);
    if (!power) {
      findings.push(finding("ERRO", "NATURE_ABILITY_POWER_INEXISTENTE", null, `NatureAbilities(${vinculo.natureza_magica}, id_poder=${vinculo.id_poder}) aponta pra Power inexistente.`));
      continue;
    }
    if (!["CHARACTER", "BOTH"].includes(power.usage_scope)) {
      findings.push(finding("ERRO", "NATURE_ABILITY_INCOMPATIVEL", power, `NatureAbilities(${vinculo.natureza_magica}) vincula Power com usage_scope=${power.usage_scope}.`));
    }
    if (power.acquisition_scope === "UNIQUE_FEAT") {
      findings.push(finding("ERRO", "NATURE_ABILITY_CONCEDE_UNIQUE_FEAT", power, `NatureAbilities(${vinculo.natureza_magica}) concede uma Power de Proeza Única de graça.`));
    }
  }
}

// ---------------------------------------------------------------- PÚBLICA
async function auditarCatalogoDePowers() {
  const findings = [];
  const powers = await Power.findAll({
    include: [
      { model: PowerStatusEffect, as: "efeitosDeStatus" },
      { model: PowerCombatEffect, as: "efeitosDeCombate" },
    ],
  });

  for (const power of powers) {
    auditarPower(power, findings);
    for (const efeito of power.efeitosDeStatus ?? []) auditarStatusEffect(efeito, power, findings);
    for (const efeito of power.efeitosDeCombate ?? []) auditarCombatEffect(efeito, power, findings);
  }

  await auditarOrigens(powers, findings);
  await auditarPowersDeMonstroAcquiriveisPorPersonagem(powers, findings);
  await auditarEvolutionsENatureAbilities(powers, findings);

  return findings;
}

function gravesFalham(findings) {
  return findings.filter((f) => f.severidade === "ERRO");
}

module.exports = {
  auditarCatalogoDePowers,
  gravesFalham,
  POWERS_VERDADEIRO_APROVADAS,
};
