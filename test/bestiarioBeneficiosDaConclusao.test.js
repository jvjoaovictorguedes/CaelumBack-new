// Bestiário — "mostrar benefícios da conclusão": ao derrotar o ÚLTIMO
// monstro que faltava descobrir numa área, a resposta de vitória do
// combate real (mesmo caminho HTTP de combatController) deve trazer
// `data.bestiarioCompletoAgora` com o nome da zona e a tabela de bônus
// por nível de Maestria (bestiaryConfig.BONUS_POR_NIVEL) — nas vitórias
// anteriores (bestiário ainda incompleto), esse campo deve ser null.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
const combatController = require("../src/controllers/combatController");
const adventureService = require("../src/services/adventureService");
const AdventureZone = require("../src/models/AdventureZone");
const AdventureMonster = require("../src/models/AdventureMonster");
const Character = require("../src/models/Character");
const { BONUS_POR_NIVEL } = require("../src/config/bestiaryConfig");
require("../src/controllers/characterController");

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

function reqRes(characterId, body) {
  let statusCode = null;
  let corpo = null;
  const req = { personagemAtual: { id: characterId }, body };
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
  return { req, res, resultado: () => ({ statusCode, corpo }) };
}

// Gera um encontro real (mesmo caminho do jogo), mas força a IDENTIDADE
// do monstro (nome/id_monstro) direto no encontro_pve persistido — sem
// isso o sorteio ponderado da zona tornaria não-determinístico qual dos
// 4 monstros apareceria em cada chamada. Mesma técnica já usada por
// aventuraExpansaoCombateReal.test.js pra vida_maxima=1 (enfraquecer o
// encontro JÁ REAL em vez de inventar um falso).
async function gerarEForcarMonstro(characterId, monstro) {
  const gerar = reqRes(characterId, {});
  await combatController.gerarInimigoParaPersonagem(gerar.req, gerar.res);
  assert.equal(gerar.resultado().statusCode, 200, JSON.stringify(gerar.resultado().corpo));

  const personagemDb = await Character.findByPk(characterId);
  personagemDb.encontro_pve = {
    ...personagemDb.encontro_pve,
    nome: monstro.nome,
    id_monstro: monstro.id,
    vida_maxima: 1,
    vida_atual: 1,
  };
  await personagemDb.save();
}

async function lutarAteVitoria(characterId) {
  let ultimaResposta = null;
  for (let turno = 0; turno < 15; turno += 1) {
    const ataque = reqRes(characterId, { action: { type: "attack" } });
    // eslint-disable-next-line no-await-in-loop
    await combatController.executarTurno(ataque.req, ataque.res);
    ultimaResposta = ataque.resultado();
    if (ultimaResposta.corpo?.data?.done) break;
  }
  assert.equal(ultimaResposta?.corpo?.data?.victory, true, `não venceu — resposta final: ${JSON.stringify(ultimaResposta?.corpo)}`);
  return ultimaResposta.corpo.data;
}

testeComBanco(
  "derrotar o último monstro descoberto da área traz bestiarioCompletoAgora com os benefícios; antes disso vem null",
  async () => {
    const { personagem } = await criarPersonagem({ nivel: 5 });

    const zona = await AdventureZone.findOne({ where: { nome: "Campos dos Viajantes" } });
    assert.ok(zona, "área 'Campos dos Viajantes' não encontrada — migrations da expansão rodaram?");

    const nomesDaArea = ["Rato das Campinas", "Javali Selvagem", "Goblin Batedor", "Lobo Alfa da Campina"];
    const monstros = await AdventureMonster.findAll({ where: { nome: nomesDaArea } });
    assert.equal(monstros.length, 4, "esperava os 4 monstros de Campos dos Viajantes cadastrados");

    await adventureService.entrarNaZona(personagem.id, zona.id);

    for (let i = 0; i < monstros.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await gerarEForcarMonstro(personagem.id, monstros[i]);
      // eslint-disable-next-line no-await-in-loop
      const dados = await lutarAteVitoria(personagem.id);

      if (i < monstros.length - 1) {
        assert.equal(
          dados.bestiarioCompletoAgora,
          null,
          `bestiário não devia estar completo ainda (faltam monstros) — abate ${i + 1}/${monstros.length}`,
        );
      } else {
        assert.ok(dados.bestiarioCompletoAgora, "último monstro descoberto devia completar o Bestiário da área");
        assert.equal(dados.bestiarioCompletoAgora.zona.id, zona.id);
        assert.equal(dados.bestiarioCompletoAgora.zona.nome, "Campos dos Viajantes");
        assert.deepEqual(dados.bestiarioCompletoAgora.beneficiosPorNivel, BONUS_POR_NIVEL);
      }

      // Preparar o próximo encontro só se ainda houver monstro a descobrir.
      if (i < monstros.length - 1) {
        // eslint-disable-next-line no-await-in-loop
        await adventureService.entrarNaZona(personagem.id, zona.id);
      }
    }
  },
);

testeComBanco("matar de novo um monstro já descoberto não reenvia bestiarioCompletoAgora", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const zona = await AdventureZone.findOne({ where: { nome: "Campos dos Viajantes" } });
  const monstro = await AdventureMonster.findOne({ where: { nome: "Rato das Campinas" } });

  await adventureService.entrarNaZona(personagem.id, zona.id);
  await gerarEForcarMonstro(personagem.id, monstro);
  await lutarAteVitoria(personagem.id);

  await adventureService.entrarNaZona(personagem.id, zona.id);
  await gerarEForcarMonstro(personagem.id, monstro);
  const dados = await lutarAteVitoria(personagem.id);

  assert.equal(dados.bestiarioCompletoAgora, null, "segunda derrota do mesmo monstro não é uma descoberta nova");
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
