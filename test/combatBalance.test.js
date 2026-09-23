// Integração do motor de Status/Cooldown no combate PvE solo (§79 —
// regressão; §76-78 cobertos de ponto de vista de integração real).
// Chama o controller igual o Express chamaria, com req/res falsos —
// mesmo padrão já usado pros testes de torneio/admin.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
const combatController = require("../src/controllers/combatController");
const Power = require("../src/models/Power");
const PowerStatusEffect = require("../src/models/PowerStatusEffect");
const CharacterAbilities = require("../src/models/CharacterAbilities");

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

async function chamarExecutarTurno(characterId, action) {
  let statusCode = null;
  let corpo = null;
  const req = { personagemAtual: { id: characterId }, body: { action } };
  const res = {
    status(codigo) {
      statusCode = codigo;
      return this;
    },
    json(payload) {
      corpo = payload;
      return this;
    },
  };
  await combatController.executarTurno(req, res);
  return { statusCode, corpo };
}

const statsPersonagemPadrao = (personagem) => ({
  nivel: personagem.nivel,
  forca: personagem.forca,
  vitalidade: personagem.vitalidade,
  agilidade: personagem.agilidade,
  inteligencia: personagem.inteligencia,
  velocidade: personagem.velocidade,
  defesa: 0,
  arma_equipada: null,
  multiplicador_vida_por_nivel: 1,
  multiplicador_mana_por_nivel: 1,
  multiplicador_dano_fisico: 1,
  multiplicador_dano_magico: 1,
});

async function encontroDeTreino(personagem, overrides = {}) {
  personagem.encontro_pve = {
    nome: "Boneco de Treino",
    nivel: 1,
    forca: 1,
    vitalidade: 1,
    agilidade: 0,
    velocidade: 1,
    vida_maxima: 1000,
    vida_atual: 1000,
    dano_base: 1,
    defesa: 0,
    criadoEm: Date.now(),
    statsPersonagem: statsPersonagemPadrao(personagem),
    statusEffects: { player: [], enemy: [] },
    cooldowns: { player: {}, enemy: {} },
    combatTurn: 0,
    ...overrides,
  };
  personagem.vida_atual = 200;
  personagem.mana_atual = 100;
  await personagem.save();
}

async function criarPoderComStatus({ statusKey, cooldown, chancePpm = 1_000_000 }) {
  const power = await Power.create({
    nome: `Poder ${statusKey} ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    custo_mana: 10,
    dano_base: 15,
    escala_atributo: "Inteligencia",
    valor_escala: 1,
    cooldown,
  });
  await PowerStatusEffect.create({
    id_power: power.id,
    status_key: statusKey,
    chance_ppm: chancePpm,
    duration_turns: 2,
    potency_base: 8,
    potency_scale_value: 0,
    target: "Enemy",
  });
  return power;
}

testeComBanco("ataque básico continua funcionando sem nenhum status/cooldown envolvido (regressão)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });

  // Mesma ressalva do teste de poder abaixo: 5% de chance base de
  // esquiva mesmo em vantagem total de Agilidade.
  let r = null;
  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    await encontroDeTreino(personagem);
    // eslint-disable-next-line no-await-in-loop
    r = await chamarExecutarTurno(personagem.id, { type: "attack" });
    if (r.corpo.data.log.some((l) => l.includes("Você atacou"))) break;
  }

  assert.equal(r.statusCode, 200);
  assert.equal(r.corpo.data.done, false);
  assert.ok(r.corpo.data.log.some((l) => l.includes("Você atacou")), "ataque não acertou em 10 tentativas — investigar");
  assert.deepEqual(r.corpo.data.statusEffects, { player: [], enemy: [] });
});

testeComBanco("usar um poder com efeito de status aplica o status no inimigo e inicia cooldown", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const power = await criarPoderComStatus({ statusKey: "BURN", cooldown: 2 });
  await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id, is_active: true, nivel_habilidade: 1 });

  // chanceDeEsquiva tem uma chance BASE mínima de 5% mesmo com o
  // atacante em vantagem total de Agilidade (ver combatFormulas.js) —
  // então "o golpe acerta" não é 100% garantido nem com chance_ppm do
  // status em 1_000_000 (essa chance só vale DEPOIS de acertar). Tenta
  // de novo em uma encontro NOVO (reseta cooldown) até um golpe
  // acertar; ~(0.05)^10 de chance de esgotar as tentativas por puro
  // azar, não vale a pena travar o teste nisso.
  let r = null;
  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    await encontroDeTreino(personagem);
    // eslint-disable-next-line no-await-in-loop
    r = await chamarExecutarTurno(personagem.id, { type: "power", powerId: power.id });
    if (r.corpo.data.log.some((l) => l.includes("Queimadura"))) break;
  }

  assert.equal(r.statusCode, 200);
  assert.ok(r.corpo.data.log.some((l) => l.includes("Queimadura")), "golpe não acertou em 10 tentativas — investigar");
  assert.ok(r.corpo.data.statusEffects.enemy.some((s) => s.key === "BURN"));

  const bloqueada = await chamarExecutarTurno(personagem.id, { type: "power", powerId: power.id });
  assert.equal(bloqueada.statusCode, 400);
});

testeComBanco("cooldown 2 bloqueia exatamente 2 turnos e libera no 3º", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const power = await criarPoderComStatus({ statusKey: "WEAKEN", cooldown: 2 });
  await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id, is_active: true, nivel_habilidade: 1 });
  await encontroDeTreino(personagem);

  await chamarExecutarTurno(personagem.id, { type: "power", powerId: power.id });
  const t1 = await chamarExecutarTurno(personagem.id, { type: "attack" });
  assert.equal(t1.statusCode, 200);
  const bloqueadaNoT1 = await chamarExecutarTurno(personagem.id, { type: "power", powerId: power.id });
  assert.equal(bloqueadaNoT1.statusCode, 400);

  const t2 = await chamarExecutarTurno(personagem.id, { type: "attack" });
  assert.equal(t2.statusCode, 200);
  const liberadaNoT2 = await chamarExecutarTurno(personagem.id, { type: "power", powerId: power.id });
  assert.equal(liberadaNoT2.statusCode, 200);
});

testeComBanco("Silêncio bloqueia poder mas não ataque básico", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const power = await criarPoderComStatus({ statusKey: "BURN", cooldown: 0 });
  await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id, is_active: true, nivel_habilidade: 1 });
  await encontroDeTreino(personagem, {
    statusEffects: {
      player: [
        { key: "SILENCE", sourceActorId: "enemy", sourcePowerId: null, sourceItemId: null, remainingTurns: 2, stacks: 1, potency: 0, appliedAtTurn: 1 },
      ],
      enemy: [],
    },
  });

  const rPoder = await chamarExecutarTurno(personagem.id, { type: "power", powerId: power.id });
  assert.equal(rPoder.statusCode, 403);

  const rAtaque = await chamarExecutarTurno(personagem.id, { type: "attack" });
  assert.equal(rAtaque.statusCode, 200);
});

testeComBanco("DoT pode terminar o combate em vitória antes do contra-ataque do inimigo", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  await encontroDeTreino(personagem, {
    vida_maxima: 30,
    vida_atual: 30,
    statusEffects: {
      player: [],
      enemy: [
        { key: "BURN", sourceActorId: "player", sourcePowerId: null, sourceItemId: null, remainingTurns: 2, stacks: 1, potency: 999, appliedAtTurn: 1 },
      ],
    },
  });

  const r = await chamarExecutarTurno(personagem.id, { type: "attack" });
  assert.equal(r.statusCode, 200);
  assert.equal(r.corpo.data.victory, true);
  assert.equal(r.corpo.data.done, true);
});

testeComBanco("Enfraquecimento reduz o dano de saída de quem está afetado", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5, forca: 50 });

  // Ataque básico sem enfraquecimento, pra ter uma referência — repete
  // em caso de esquiva (5% de chance base, ver testes acima) até um
  // golpe acertar de verdade (dano > 0).
  let danoSemWeaken = 0;
  for (let tentativa = 0; tentativa < 10 && danoSemWeaken === 0; tentativa += 1) {
    // eslint-disable-next-line no-await-in-loop
    await encontroDeTreino(personagem, { vida_maxima: 100_000, vida_atual: 100_000 });
    // eslint-disable-next-line no-await-in-loop
    const semWeaken = await chamarExecutarTurno(personagem.id, { type: "attack" });
    danoSemWeaken = 100_000 - semWeaken.corpo.data.enemy.vida_atual;
  }
  assert.ok(danoSemWeaken > 0, "ataque de referência não acertou em 10 tentativas — investigar");

  let danoComWeaken = null;
  for (let tentativa = 0; tentativa < 10 && danoComWeaken === null; tentativa += 1) {
    // eslint-disable-next-line no-await-in-loop
    await encontroDeTreino(personagem, {
      vida_maxima: 100_000,
      vida_atual: 100_000,
      statusEffects: {
        player: [
          { key: "WEAKEN", sourceActorId: "enemy", sourcePowerId: null, sourceItemId: null, remainingTurns: 2, stacks: 1, potency: 50, appliedAtTurn: 1 },
        ],
        enemy: [],
      },
    });
    // eslint-disable-next-line no-await-in-loop
    const comWeaken = await chamarExecutarTurno(personagem.id, { type: "attack" });
    if (!comWeaken.corpo.data.log.some((l) => l.includes("esquivou"))) {
      danoComWeaken = 100_000 - comWeaken.corpo.data.enemy.vida_atual;
    }
  }
  assert.ok(danoComWeaken !== null, "ataque enfraquecido não acertou em 10 tentativas — investigar");

  assert.ok(danoComWeaken < danoSemWeaken, "50% de Enfraquecimento precisa reduzir o dano causado");
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
