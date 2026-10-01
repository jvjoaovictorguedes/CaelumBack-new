// Bug real reportado por um jogador: "missões de ranking da guilda dos
// aventureiros não estão sendo contabilizadas" — causa raiz era que
// partySocket.js (Aventura em Grupo) nunca chamava
// adventureGuildObjectiveService.registrarProgressoContrato na vitória
// (só o encontro solo, combatController.js, fazia isso). XP/ouro/drop
// de grupo continuavam sendo concedidos normalmente, então pro jogador
// parecia uma vitória comum — só o progresso do contrato de Rank
// silenciosamente nunca avançava.
//
// Corrigido chamando registrarProgressoContrato (MatarInimigos e
// GanharOuro) dentro da MESMA transaction por membro em
// finalizarBatalha, com o mesmo formato de contexto que o encontro
// solo já usa ({ id_monstro, id_area }). Este teste não sobe um
// servidor socket.io de verdade — exercita o serviço exatamente como
// partySocket.js agora chama, com fixtures reais de
// AdventureGuildMission/CharacterAdventureGuildContract.
const test = require("node:test");
const assert = require("node:assert/strict");

const { sequelize, bancoDisponivel, criarPersonagem, sufixo } = require("./helpers/db");
const { registrarProgressoContrato } = require("../src/services/adventureGuildObjectiveService");
const AdventureGuildMission = require("../src/models/AdventureGuildMission");
const CharacterAdventureGuildContract = require("../src/models/CharacterAdventureGuildContract");
const AdventureMonster = require("../src/models/AdventureMonster");

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

async function criarMissao(overrides = {}) {
  return AdventureGuildMission.create({
    rank: "F",
    nome: `Missão ${sufixo()}`,
    descricao: "teste",
    tipo_objetivo: "MatarInimigos",
    quantidade_objetivo: 3,
    ...overrides,
  });
}

async function criarMonstro() {
  return AdventureMonster.create({
    nome: `Monstro Contrato Teste ${sufixo()}`,
    nivel: 1,
    vida_maxima: 10,
    dano_min: 1,
    dano_max: 2,
    agilidade: 1,
    velocidade: 1,
    xp_recompensa: 1,
    ouro_recompensa: 1,
    ativo: true,
  });
}

async function criarContratoAtivo(personagem, missao) {
  return CharacterAdventureGuildContract.create({
    id_personagem: personagem.id,
    id_mission: missao.id,
    progresso_atual: 0,
    status: "Ativo",
    aceito_em: new Date(),
    expira_em: new Date(Date.now() + 60 * 60 * 1000),
  });
}

testeComBanco(
  "vitória em grupo (mesmo formato de chamada de partySocket.js) avança contrato de MatarInimigos genérico",
  async () => {
    const { personagem } = await criarPersonagem();
    const missao = await criarMissao({ tipo_objetivo: "MatarInimigos", quantidade_objetivo: 3 });
    const contrato = await criarContratoAtivo(personagem, missao);

    await sequelize.transaction(async (transaction) => {
      await registrarProgressoContrato(
        personagem,
        "MatarInimigos",
        1,
        { id_monstro: 999, id_area: 123 },
        transaction,
      );
    });

    await contrato.reload();
    assert.equal(contrato.progresso_atual, 1);
    assert.equal(contrato.status, "Ativo");
  },
);

testeComBanco("vitória em grupo avança contrato de MatarMonstroEspecifico só quando o id_monstro bate", async () => {
  const { personagem } = await criarPersonagem();
  // id_monstro_alvo tem FK real pra AdventureMonsters (ver migration
  // 20260930750000-guilda-aventureiros-tabelas.js) — precisa de um
  // monstro de verdade, nunca um id inventado.
  const monstroAlvo = await criarMonstro();
  const idMonstroAlvo = monstroAlvo.id;
  const missaoCerta = await criarMissao({
    tipo_objetivo: "MatarMonstroEspecifico",
    id_monstro_alvo: idMonstroAlvo,
    quantidade_objetivo: 2,
  });
  const contratoCerto = await criarContratoAtivo(personagem, missaoCerta);

  // Monstro ERRADO — contrato não pode avançar.
  await sequelize.transaction(async (transaction) => {
    await registrarProgressoContrato(
      personagem,
      "MatarInimigos",
      1,
      { id_monstro: idMonstroAlvo + 1, id_area: 1 },
      transaction,
    );
  });
  await contratoCerto.reload();
  assert.equal(contratoCerto.progresso_atual, 0);

  // Monstro CERTO (exatamente o payload que partySocket.js monta a
  // partir de inimigo.id_monstro) — avança.
  await sequelize.transaction(async (transaction) => {
    await registrarProgressoContrato(
      personagem,
      "MatarInimigos",
      1,
      { id_monstro: idMonstroAlvo, id_area: 1 },
      transaction,
    );
  });
  await contratoCerto.reload();
  assert.equal(contratoCerto.progresso_atual, 1);
});

testeComBanco("vitória em grupo soma ouro da recompensa num contrato de GanharOuro", async () => {
  const { personagem } = await criarPersonagem();
  const missao = await criarMissao({ tipo_objetivo: "GanharOuro", quantidade_objetivo: 100 });
  const contrato = await criarContratoAtivo(personagem, missao);

  await sequelize.transaction(async (transaction) => {
    await registrarProgressoContrato(personagem, "GanharOuro", 40, {}, transaction);
  });

  await contrato.reload();
  assert.equal(contrato.progresso_atual, 40);
});
