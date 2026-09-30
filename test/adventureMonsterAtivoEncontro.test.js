// Bug reportado pelo dono do produto: "Desativar" um monstro no Admin
// da Aventura (MonstersTab) não tirava ele de circulação — o sorteio de
// encontro (combatController.gerarInimigoParaPersonagem) só filtrava
// AdventureZoneMonster.ativo (o vínculo com a zona), nunca
// AdventureMonster.ativo (o monstro em si). Mesmo padrão de fixture
// isolada de adventureMonsterDefesaEncontro.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo } = require("./helpers/db");
require("../src/models/associations");

const AdventureZone = require("../src/models/AdventureZone");
const AdventureMonster = require("../src/models/AdventureMonster");
const AdventureZoneMonster = require("../src/models/AdventureZoneMonster");
const adventureService = require("../src/services/adventureService");
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

async function criarMonstro({ nome, ativo }) {
  return AdventureMonster.create({
    nome,
    nivel: 1,
    vida_maxima: 1000,
    dano_min: 1,
    dano_max: 1,
    agilidade: 1,
    velocidade: 1,
    xp_recompensa: 1,
    ouro_recompensa: 1,
    ativo,
  });
}

async function vincularNaZona(zona, monstro) {
  return AdventureZoneMonster.create({
    id_area: zona.id,
    id_monstro: monstro.id,
    peso_aparicao: 100,
    tipo_aparicao: "Comum",
    nivel_jogador_minimo: 1,
    ativo: true,
  });
}

testeComBanco("Aventura solo: monstro desativado (AdventureMonster.ativo=false) nunca é sorteado, mesmo com vínculo de zona ativo", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const zona = await AdventureZone.create({
    nome: `Zona Ativo Teste ${sufixo()}`,
    nivel_monstro_min: 1,
    nivel_monstro_max: 99,
    ativa: true,
  });
  const monstroDesativado = await criarMonstro({ nome: `Monstro Desativado ${sufixo()}`, ativo: false });
  await vincularNaZona(zona, monstroDesativado);

  await adventureService.entrarNaZona(personagem.id, zona.id);
  const gerar = reqRes(personagem.id, {});
  await combatController.gerarInimigoParaPersonagem(gerar.req, gerar.res);

  // Único monstro da zona está desativado -> não deveria sobrar nenhum
  // candidato elegível, igual já acontece hoje quando a zona não tem
  // nenhum vínculo configurado.
  assert.equal(gerar.resultado().statusCode, 500, JSON.stringify(gerar.resultado().corpo));
  assert.match(gerar.resultado().corpo.message, /sem monstros configurados/i);
});

testeComBanco("Aventura solo: com 1 monstro ativo e 1 desativado na mesma zona, só o ativo é sorteado", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const zona = await AdventureZone.create({
    nome: `Zona Ativo Teste ${sufixo()}`,
    nivel_monstro_min: 1,
    nivel_monstro_max: 99,
    ativa: true,
  });
  const monstroAtivo = await criarMonstro({ nome: `Monstro Ativo ${sufixo()}`, ativo: true });
  const monstroDesativado = await criarMonstro({ nome: `Monstro Desativado ${sufixo()}`, ativo: false });
  await vincularNaZona(zona, monstroAtivo);
  await vincularNaZona(zona, monstroDesativado);

  await adventureService.entrarNaZona(personagem.id, zona.id);

  for (let i = 0; i < 10; i++) {
    const gerar = reqRes(personagem.id, {});
    await combatController.gerarInimigoParaPersonagem(gerar.req, gerar.res);
    assert.equal(gerar.resultado().statusCode, 200, JSON.stringify(gerar.resultado().corpo));
    assert.equal(gerar.resultado().corpo.data.enemy.nome, monstroAtivo.nome);
  }
});
