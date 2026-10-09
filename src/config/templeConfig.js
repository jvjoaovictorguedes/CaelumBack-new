// Templo do Véu Celestial (templo_veu_celestial_v1_caelum.docx) —
// constantes da máquina de estados e whitelists seguras. O banco NUNCA
// guarda status/estado livre executável: todo campo enum precisa bater
// com uma destas listas antes de ser aceito. Mesmo princípio de
// worldBossConfig.js/guildConfig.js — nenhuma IA/Power/Status/
// equipamento/motor paralelo é criado aqui, só o catálogo do evento.

// §3.1 — ciclo de vida de uma Convergência. Transições válidas:
// DRAFT -> SCHEDULED -> ACTIVE -> RELICARY_ONLY -> ENDED
// SCHEDULED/ACTIVE/RELICARY_ONLY -> CANCELLED (admin, motivo obrigatório)
const EVENT_STATUS = {
  DRAFT: "DRAFT",
  SCHEDULED: "SCHEDULED",
  ACTIVE: "ACTIVE",
  RELICARY_ONLY: "RELICARY_ONLY",
  ENDED: "ENDED",
  CANCELLED: "CANCELLED",
};

// §12.3 — "Somente um evento ACTIVE/RELICARY_ONLY por Templo na V1",
// garantido pelo BANCO (índice único parcial em TempleEvents), nunca só
// por um if no service — mesmo padrão de world_boss_events_um_aberto_idx.
const EVENT_STATUS_ABERTOS = [EVENT_STATUS.ACTIVE, EVENT_STATUS.RELICARY_ONLY];

// §4.1 — categorias de TempleMission. PROVACAO_FINAL NUNCA é uma linha
// de TempleMission (não é "missão de contador": é o estado do Guardião
// individual, modelado em CharacterTempleProgress/TempleBossAttempt —
// ver §8.1). Mantido aqui só pra documentar o enum completo do §4.1 e
// pra qualquer validação que precise rejeitar essa categoria em
// TempleMission explicitamente.
const MISSION_CATEGORY = {
  RITO_DIARIO: "RITO_DIARIO",
  PROVACAO_PRINCIPAL: "PROVACAO_PRINCIPAL",
};
const MISSION_CATEGORY_NAO_PERMITIDA_EM_TEMPLE_MISSION = "PROVACAO_FINAL";

// §4.2 — whitelist de objective_type (§4.2 "devem ser whitelist e
// baseados em IDs/contexto, nunca texto de nome"). Cada chave aqui
// precisa ter um gancho real em templeObjectiveService.registrarProgresso,
// chamado DENTRO da transaction do evento real que gerou o progresso —
// nunca um endpoint que aceite "+N progresso" do cliente (§4.3).
const OBJECTIVE_TYPE = {
  WIN_ADVENTURE_NO_CONSUMABLE: "WIN_ADVENTURE_NO_CONSUMABLE",
  APPLY_STATUS: "APPLY_STATUS",
  DEFEAT_AFFECTED_BY_STATUS: "DEFEAT_AFFECTED_BY_STATUS",
  WIN_DISTINCT_ZONES: "WIN_DISTINCT_ZONES",
  FINAL_BLOW_WITH_POWER: "FINAL_BLOW_WITH_POWER",
  CRAFT_RARITY_OR_HIGHER: "CRAFT_RARITY_OR_HIGHER",
  COMPLETE_EXPEDITIONS: "COMPLETE_EXPEDITIONS",
  PARTY_ADVENTURE_WINS: "PARTY_ADVENTURE_WINS",
  DELIVER_ITEM: "DELIVER_ITEM",
  CLEANSE_STATUS: "CLEANSE_STATUS",
};

// §4.2 — objetivos cujo state_json guarda um SET server-owned (ex.: ids
// de zonas distintas já vencidas). Tamanho/campos validados em
// templeObjectiveService antes de persistir — nunca um array livre do
// cliente.
const OBJECTIVE_TYPES_COM_SET = [OBJECTIVE_TYPE.WIN_DISTINCT_ZONES];

// §11.1 TempleRewardEntry.reward_kind — tipos de recompensa do
// Relicário (§6.2). "Equipamento"/"StackableItem" cobrem praticamente
// tudo preferindo Item (§6.2 "V1 deve preferir recompensas
// representadas por Item pra reduzir branches especiais"); os dois
// extras existem só pra não esconder uma recompensa não-Item futura
// atrás de um Item fake.
const REWARD_KIND = {
  STACKABLE_ITEM: "STACKABLE_ITEM",
  EQUIPMENT: "EQUIPMENT",
};

// §7.2 — política de duplicata de recompensa única (Power/Título/
// conhecimento já possuído). FALLBACK: sai da lista elegível e o pool
// precisa ter uma entry de fallback configurada; a V1 não cria uma
// terceira moeda de "pó".
const DUPLICATE_POLICY = { FALLBACK: "FALLBACK" };

// §11.1 TempleBossAttempt.status — ciclo de uma tentativa individual
// contra o Guardião (§8.1 "Boss reinicia: derrota encerra attempt; nova
// tentativa começa Boss em 100% HP").
const BOSS_ATTEMPT_STATUS = { ATIVA: "Ativa", VITORIA: "Vitoria", DERROTA: "Derrota", ABANDONADA: "Abandonada" };

// §11.1 TempleBossRewardGrant — mesmo formato idempotente de
// WorldBossRewardGrant (Pending/Granted/Failed), unique constraint por
// (event, character) pra primeira vitória nunca pagar duas vezes (§8.1
// "Uma vitória recompensada").
const REWARD_GRANT_STATUS = { PENDING: "Pending", GRANTED: "Granted", FAILED: "Failed" };

// §9.2 — GameSettings operacionais, com o mesmo default hardcoded usado
// como fallback por gameSettingCache.obter antes de qualquer admin
// salvar uma config (mesmo padrão de worldBossConfig/tavernConfig).
const GAME_SETTINGS_DEFAULT = {
  "temple.enabled": false,
  // §9.2 — metas de calibração do Guardião: HP/EHP alvo do Boss ~=
  // player.dpr * target_turns_to_kill; dano alvo do Boss ~=
  // player.ehp / target_boss_actions_survivable. Defaults conservadores
  // (luta nem instantânea nem eterna) — Admin ajusta por Convergência
  // via TempleBossConfig, isto é só o fallback de produto.
  "temple.boss.target_turns_to_kill": 8,
  "temple.boss.target_boss_actions_survivable": 6,
  // Clamps de scaling (§9.2) — nunca deixar o Guardião ficar
  // absurdamente fraco/forte mesmo com um playerPowerSnapshot extremo.
  "temple.boss.scaling_min_multiplier": 0.5,
  "temple.boss.scaling_max_multiplier": 3,
  // §14.1 — intervalo mínimo entre ações do jogador contra o Guardião
  // (mesmo espírito do worldboss.player_action_cooldown_ms — um gesto
  // de cada vez, sem fila de outros jogadores porque a luta é solo).
  "temple.boss.player_action_cooldown_ms": 1500,
  // §3.2 — scheduler promove estado nessas datas; intervalo do próprio
  // job (mesmo espírito de worldboss, ciclo mais lento que combate).
  "temple.scheduler.tick_interval_ms": 15000,
};

module.exports = {
  EVENT_STATUS,
  EVENT_STATUS_ABERTOS,
  MISSION_CATEGORY,
  MISSION_CATEGORY_NAO_PERMITIDA_EM_TEMPLE_MISSION,
  OBJECTIVE_TYPE,
  OBJECTIVE_TYPES_COM_SET,
  REWARD_KIND,
  DUPLICATE_POLICY,
  BOSS_ATTEMPT_STATUS,
  REWARD_GRANT_STATUS,
  GAME_SETTINGS_DEFAULT,
};
