// Templo do Véu Celestial — Fase 5: Provação Final / Guardião solo
// (§8/§9/§10/§14.2). Mesmo padrão de infra de templeRelicary.test.js —
// constrói o config_snapshot.boss diretamente (Admin é Fase 8).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const AdventureMonster = require("../src/models/AdventureMonster");
const TempleEvent = require("../src/models/TempleEvent");
const CharacterTempleProgress = require("../src/models/CharacterTempleProgress");
const TempleBossAttempt = require("../src/models/TempleBossAttempt");
const TempleBossRewardGrant = require("../src/models/TempleBossRewardGrant");
const CharacterInventory = require("../src/models/CharacterInventory");
const templeBossAttemptService = require("../src/services/templeBossAttemptService");
const templeBossCombatService = require("../src/services/templeBossCombatService");
const { EVENT_STATUS } = require("../src/config/templeConfig");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

const itensCriados = [];
const eventosCriados = [];
const monstrosCriados = [];

async function criarItemSigilo() {
  const item = await Item.create({
    nome: `Sigilo Teste ${sufixo()}`,
    descricao: "Sigilo de teste",
    tipo_item: "Currencia",
    raridade: "Epico",
    disponivel_loja: false,
    negociavel_mercado: false,
  });
  itensCriados.push(item.id);
  return item;
}

async function criarMonstroBase(overrides = {}) {
  const monstro = await AdventureMonster.create({
    nome: `Guardião Teste ${sufixo()}`,
    nivel: 50,
    vida_maxima: 1000,
    dano_min: 40,
    dano_max: 60,
    agilidade: 0,
    velocidade: 0,
    defesa: 10,
    ai_profile: "ELITE_BOSS",
    temple_exclusive: true,
    disponivel_emboscada: false,
    ...overrides,
  });
  monstrosCriados.push(monstro.id);
  return monstro;
}

// bossOverrides.stats sobrescreve os stats escalados (pra testes
// determinísticos de vitória/derrota, sem depender da fórmula de
// scaling real) — mesmo formato que templeBossAttemptService monta.
async function criarEventoComBoss({ monstro, rewardSigilos = 10, statsOverride, phases = [] } = {}) {
  const itemSigilo = await criarItemSigilo();
  const monstroBase = monstro ?? (await criarMonstroBase());
  const evento = await TempleEvent.create({
    key: `convergencia_${sufixo()}`,
    nome: "Vigília do Eclipse",
    status: EVENT_STATUS.ACTIVE,
    id_currency_item: itemSigilo.id,
    config_snapshot: {
      schema_version: 1,
      nome: "Vigília do Eclipse",
      id_currency_item: itemSigilo.id,
      missions: [],
      relicary: null,
      boss: {
        boss_config_id: 1,
        id_monstro_base: monstroBase.id,
        nome_exibicao: "O Guardião",
        lore: "Lore de teste",
        imagem_url: null,
        ai_profile: monstroBase.ai_profile,
        base: {
          vida_maxima: monstroBase.vida_maxima,
          dano_min: monstroBase.dano_min,
          dano_max: monstroBase.dano_max,
          defesa: monstroBase.defesa,
          agilidade: 0,
          velocidade: 0,
        },
        scaling: {
          target_turns_to_kill: 8,
          target_boss_actions_survivable: 6,
          scaling_min_multiplier: 0.5,
          scaling_max_multiplier: 3,
        },
        reward_sigils_primeira_vitoria: rewardSigilos,
        phases,
        status_resistances: [],
        abilities: [],
      },
    },
  });
  eventosCriados.push(evento.id);
  if (statsOverride) evento.config_snapshot.boss.statsOverride = statsOverride;
  return { evento, itemSigilo, monstroBase };
}

async function desbloquearBoss(idEvent, characterId) {
  await CharacterTempleProgress.create({
    id_event: idEvent,
    character_id: characterId,
    boss_unlocked_at: new Date(),
  });
}

test.afterEach(async () => {
  if (!temBanco) return;
  if (eventosCriados.length > 0) {
    await TempleBossRewardGrant.destroy({ where: { id_event: eventosCriados } });
    await TempleBossAttempt.destroy({ where: { id_event: eventosCriados } });
    await CharacterTempleProgress.destroy({ where: { id_event: eventosCriados } });
    await TempleEvent.destroy({ where: { id: eventosCriados } });
    eventosCriados.length = 0;
  }
  if (monstrosCriados.length > 0) {
    await AdventureMonster.destroy({ where: { id: monstrosCriados } });
    monstrosCriados.length = 0;
  }
  if (itensCriados.length > 0) {
    await CharacterInventory.destroy({ where: { id_item: itensCriados } });
    await Item.destroy({ where: { id: itensCriados } });
    itensCriados.length = 0;
  }
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});

testeComBanco("obterStatusPublico: 'Nenhum' sem Convergência com Guardião", async () => {
  const status = await templeBossAttemptService.obterStatusPublico(999999);
  assert.equal(status.status, "Nenhum");
});

testeComBanco("obterStatusPublico: desbloqueado só depois de boss_unlocked_at", async () => {
  const { personagem } = await criarPersonagem({});
  const { evento } = await criarEventoComBoss();

  let status = await templeBossAttemptService.obterStatusPublico(personagem.id);
  assert.equal(status.status, "Disponivel");
  assert.equal(status.desbloqueado, false);

  await desbloquearBoss(evento.id, personagem.id);
  status = await templeBossAttemptService.obterStatusPublico(personagem.id);
  assert.equal(status.desbloqueado, true);
  assert.equal(status.ja_venceu, false);
});

testeComBanco("entrarOuRetomar: rejeita sem boss_unlocked_at", async () => {
  const { personagem } = await criarPersonagem({});
  await criarEventoComBoss();

  await assert.rejects(
    () => sequelize.transaction((t) => templeBossAttemptService.entrarOuRetomar(personagem.id, t)),
    /ainda não desbloqueou/,
  );
});

testeComBanco("entrarOuRetomar: cria attempt com snapshots congelados e resume (nunca duplica)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 20 });
  const { evento } = await criarEventoComBoss();
  await desbloquearBoss(evento.id, personagem.id);

  const { attempt: primeiro, retomada: retomadaPrimeira } = await sequelize.transaction((t) =>
    templeBossAttemptService.entrarOuRetomar(personagem.id, t),
  );
  assert.equal(retomadaPrimeira, false);
  assert.equal(primeiro.status, "Ativa");
  assert.ok(primeiro.player_snapshot.vidaMax > 0);
  assert.ok(primeiro.boss_snapshot.stats.vida_maxima > 0);
  assert.equal(primeiro.runtime_state.vida_atual_boss, primeiro.boss_snapshot.stats.vida_maxima);
  assert.equal(primeiro.runtime_state.vida_atual_jogador, primeiro.player_snapshot.estado.vida_atual);

  const { attempt: segundo, retomada: retomadaSegunda } = await sequelize.transaction((t) =>
    templeBossAttemptService.entrarOuRetomar(personagem.id, t),
  );
  assert.equal(retomadaSegunda, true);
  assert.equal(segundo.id, primeiro.id);

  const total = await TempleBossAttempt.count({ where: { id_event: evento.id, character_id: personagem.id } });
  assert.equal(total, 1, "nunca duplica — uma única linha Ativa por personagem+evento");
});

testeComBanco("resolverTurno: rejeita ação de item (Guardião não aceita consumível)", async () => {
  const { personagem } = await criarPersonagem({});
  const { evento } = await criarEventoComBoss();
  await desbloquearBoss(evento.id, personagem.id);
  const { attempt } = await sequelize.transaction((t) => templeBossAttemptService.entrarOuRetomar(personagem.id, t));

  await assert.rejects(() => templeBossCombatService.resolverTurno(attempt, { tipo: "item" }), /não aceita consumíveis/);
});

testeComBanco("resolverTurno: rejeita poder inválido/não aprendido", async () => {
  const { personagem } = await criarPersonagem({});
  const { evento } = await criarEventoComBoss();
  await desbloquearBoss(evento.id, personagem.id);
  const { attempt } = await sequelize.transaction((t) => templeBossAttemptService.entrarOuRetomar(personagem.id, t));

  await assert.rejects(
    () => templeBossCombatService.resolverTurno(attempt, { tipo: "power", idPoder: 999999 }),
    /Poder inválido/,
  );
});

testeComBanco("resolverTurno: ataque básico resolve os dois lados e avança o turno", async () => {
  const { personagem } = await criarPersonagem({ nivel: 30 });
  const { evento } = await criarEventoComBoss();
  await desbloquearBoss(evento.id, personagem.id);
  const { attempt } = await sequelize.transaction((t) => templeBossAttemptService.entrarOuRetomar(personagem.id, t));

  const turnoAntes = attempt.runtime_state.combat_turn;
  const resultado = await templeBossCombatService.resolverTurno(attempt, { tipo: "attack" });

  assert.ok(Array.isArray(resultado.log));
  assert.ok(resultado.log.length > 0);
  assert.ok(["Vitoria", "Derrota", null].includes(resultado.concluido));
  if (resultado.concluido === null) {
    assert.equal(resultado.runtime.combat_turn, turnoAntes + 1);
  }
});

testeComBanco(
  "primeira vitória concede Sigilos exatamente uma vez, mesmo com retry do grant (§8.1/§14.2)",
  async () => {
    const { personagem } = await criarPersonagem({ nivel: 50 });
    // Boss com 1 de vida — qualquer golpe que acerte já derrota, elimina
    // a variância de dano (só resta a pequena chance de esquiva, piso de
    // 5%, retestada abaixo com algumas tentativas em attempts frescos).
    const { evento, itemSigilo } = await criarEventoComBoss({ rewardSigilos: 25 });
    await desbloquearBoss(evento.id, personagem.id);

    let attemptVencido = null;
    let resultadoVencido = null;
    for (let tentativa = 0; tentativa < 15 && !attemptVencido; tentativa++) {
      const { attempt } = await sequelize.transaction((t) => templeBossAttemptService.entrarOuRetomar(personagem.id, t));
      attempt.runtime_state.vida_atual_boss = 1;
      await attempt.save();
      const resultado = await templeBossCombatService.resolverTurno(attempt, { tipo: "attack" });
      if (resultado.concluido === "Vitoria") {
        attemptVencido = attempt;
        resultadoVencido = resultado;
      } else {
        // Abandona esta tentativa (esquivou) pra poder abrir outra —
        // apaga a linha Ativa pra não colidir com o índice único.
        await attempt.destroy();
      }
    }
    assert.ok(attemptVencido, "deveria vencer em até 15 tentativas (piso de esquiva é só 5%)");

    const primeiraRecompensa = await sequelize.transaction((t) => {
      attemptVencido.runtime_state = resultadoVencido.runtime;
      return templeBossAttemptService.finalizarVitoria(attemptVencido, t);
    });
    assert.equal(primeiraRecompensa.sigilosGanhos, 25);
    assert.equal(primeiraRecompensa.idempotente, false);

    const saldoApos1a = await CharacterInventory.findOne({
      where: { id_personagem: personagem.id, id_item: itemSigilo.id },
    });
    assert.equal(saldoApos1a.quantidade, 25);

    // Retry do mesmo grant (ex.: reconexão reprocessando o fim da luta)
    // nunca paga de novo — idempotente via UNIQUE (id_event, character_id).
    const segundaRecompensa = await sequelize.transaction((t) => templeBossAttemptService.finalizarVitoria(attemptVencido, t));
    assert.equal(segundaRecompensa.idempotente, true);

    const saldoApos2a = await CharacterInventory.findOne({
      where: { id_personagem: personagem.id, id_item: itemSigilo.id },
    });
    assert.equal(saldoApos2a.quantidade, 25, "nunca paga duas vezes");

    const grants = await TempleBossRewardGrant.count({ where: { id_event: evento.id, character_id: personagem.id } });
    assert.equal(grants, 1);
  },
);

testeComBanco("finalizarDerrota: marca Derrota e nunca concede recompensa", async () => {
  const { personagem } = await criarPersonagem({});
  const { evento, itemSigilo } = await criarEventoComBoss();
  await desbloquearBoss(evento.id, personagem.id);
  const { attempt } = await sequelize.transaction((t) => templeBossAttemptService.entrarOuRetomar(personagem.id, t));

  await sequelize.transaction((t) => templeBossAttemptService.finalizarDerrota(attempt, t));
  await attempt.reload();
  assert.equal(attempt.status, "Derrota");
  assert.ok(attempt.finished_at);

  const grant = await TempleBossRewardGrant.findOne({ where: { id_event: evento.id, character_id: personagem.id } });
  assert.equal(grant, null);
  const saldo = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: itemSigilo.id } });
  assert.equal(saldo, null);
});
