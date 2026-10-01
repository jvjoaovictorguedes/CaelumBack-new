// Ideia #3 da fila de melhorias — monstro causa status effect ao acertar
// o jogador (mesmo padrão de proc de arma, só que do outro lado). Mesmo
// estilo de combatEvolucaoStatusIntegracao.test.js: chama
// combatController real como o Express chamaria, "Boneco de Treino"
// como encontro determinístico (dano_base fixo = intervalo degenerado,
// sem RNG de dano).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
const combatController = require("../src/controllers/combatController");

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

function statsPersonagemPadrao(personagem) {
  return {
    nivel: personagem.nivel,
    forca: personagem.forca,
    vitalidade: personagem.vitalidade,
    agilidade: personagem.agilidade,
    inteligencia: personagem.inteligencia,
    velocidade: personagem.velocidade,
    defesa: 0,
    arma_equipada: null,
    armaEquipadaEfeitos: [],
    multiplicador_vida_por_nivel: 1,
    multiplicador_mana_por_nivel: 1,
    multiplicador_dano_fisico: 1,
    multiplicador_dano_magico: 1,
  };
}

async function encontroDeTreino(personagem, efeitosDeStatus) {
  personagem.encontro_pve = {
    nome: "Boneco de Treino Venenoso",
    nivel: 1,
    forca: 1,
    vitalidade: 1,
    // agilidade 0 e velocidade bem acima do jogador — maximiza a chance
    // do ataque do monstro acertar sem precisar mockar a fórmula de
    // esquiva; o teste ainda tolera falha ocasional via retry abaixo.
    agilidade: 0,
    velocidade: 50,
    vida_maxima: 1000,
    vida_atual: 1000,
    dano_base: 5,
    defesa: 0,
    efeitosDeStatus,
    criadoEm: Date.now(),
    statsPersonagem: statsPersonagemPadrao(personagem),
    statusEffects: { player: [], enemy: [] },
    cooldowns: { player: {}, enemy: {} },
    combatTurn: 0,
  };
  personagem.vida_atual = 500;
  personagem.mana_atual = 100;
  await personagem.save();
}

testeComBanco("monstro com efeito configurado aplica status no jogador ao acertar", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });

  const efeitosDeStatus = [
    {
      status_key: "POISON",
      chance_ppm: 1_000_000, // sempre dispara se o ataque acertar
      duration_turns: 3,
      potency_base: 5,
      ativo: true,
    },
  ];

  let r = null;
  let aplicou = false;
  for (let tentativa = 0; tentativa < 15 && !aplicou; tentativa += 1) {
    // eslint-disable-next-line no-await-in-loop
    await encontroDeTreino(personagem, efeitosDeStatus);
    // eslint-disable-next-line no-await-in-loop
    r = await chamarExecutarTurno(personagem.id, { type: "attack" });
    aplicou = r.corpo?.data?.statusEffects?.player?.some((s) => s.key === "POISON") ?? false;
  }

  assert.equal(r.statusCode, 200, JSON.stringify(r.corpo));
  assert.ok(aplicou, `POISON nunca apareceu em statusEffects.player depois de 15 tentativas — log final: ${JSON.stringify(r.corpo?.data?.log)}`);
  assert.ok(
    r.corpo.data.log.some((l) => l.includes("aplicou") && l.includes("Veneno")),
    "esperava uma linha de log anunciando o status aplicado pelo monstro",
  );
});

testeComBanco("monstro sem nenhum efeito configurado nunca aplica status (comportamento opt-in)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });

  let r = null;
  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    // eslint-disable-next-line no-await-in-loop
    await encontroDeTreino(personagem, []);
    // eslint-disable-next-line no-await-in-loop
    r = await chamarExecutarTurno(personagem.id, { type: "attack" });
    assert.equal(r.corpo?.data?.statusEffects?.player?.length ?? 0, 0, `tentativa ${tentativa}: não devia haver status nenhum no jogador`);
  }
});

testeComBanco("chance_ppm = 0 nunca aplica o status mesmo configurado e ativo", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });

  const efeitosDeStatus = [
    { status_key: "BLEED", chance_ppm: 0, duration_turns: 3, potency_base: 5, ativo: true },
  ];

  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    // eslint-disable-next-line no-await-in-loop
    await encontroDeTreino(personagem, efeitosDeStatus);
    // eslint-disable-next-line no-await-in-loop
    const r = await chamarExecutarTurno(personagem.id, { type: "attack" });
    assert.equal(r.corpo?.data?.statusEffects?.player?.length ?? 0, 0, `tentativa ${tentativa}: chance_ppm=0 nunca devia disparar`);
  }
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
