// Expansão Aventura Beta — smoke test de ponta a ponta: sessão de caça
// real numa área NOVA (Campos dos Viajantes) → encontro real sorteado
// do catálogo novo → combate via combatController (mesmo caminho que o
// Express usa) até vitória → confere que a resposta (§ combatController
// "espolios" no plural, substituindo "espolio" singular) e a
// persistência de recompensa continuam funcionando de ponta a ponta.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
const combatController = require("../src/controllers/combatController");
const adventureService = require("../src/services/adventureService");
const AdventureZone = require("../src/models/AdventureZone");
const Character = require("../src/models/Character");
const CharacterInventoryItem = require("../src/models/CharacterInventory");
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

testeComBanco("combate real numa área nova até vitória concede espólios em array e persiste no inventário", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });

  const zona = await AdventureZone.findOne({ where: { nome: "Campos dos Viajantes" } });
  assert.ok(zona, "área 'Campos dos Viajantes' não encontrada — migrations da expansão rodaram?");

  await adventureService.entrarNaZona(personagem.id, zona.id);

  const gerar = reqRes(personagem.id, {});
  await combatController.gerarInimigoParaPersonagem(gerar.req, gerar.res);
  assert.equal(gerar.resultado().statusCode, 200, JSON.stringify(gerar.resultado().corpo));

  // gerarInimigo CALIBRA o inimigo em cima dos atributos do jogador
  // (luta sempre ~equilibrada, de propósito) — inflar atributo do
  // personagem só infla o inimigo junto. Pra garantir vitória
  // determinística no teste sem depender de sorte de dano/esquiva,
  // enfraquece a vida do encontro JÁ REAL (mesmo id_area/id_monstro
  // sorteado do catálogo novo) direto no banco, em vez de inventar um
  // encontro falso — mantém a integração real com loot/sessão de zona.
  const personagemDb = await Character.findByPk(personagem.id);
  personagemDb.encontro_pve = { ...personagemDb.encontro_pve, vida_maxima: 1, vida_atual: 1 };
  await personagemDb.save();

  let vitoria = false;
  let ultimaResposta = null;
  for (let turno = 0; turno < 15 && !vitoria; turno += 1) {
    const ataque = reqRes(personagem.id, { action: { type: "attack" } });
    // eslint-disable-next-line no-await-in-loop
    await combatController.executarTurno(ataque.req, ataque.res);
    ultimaResposta = ataque.resultado();
    if (ultimaResposta.corpo?.data?.done) {
      vitoria = ultimaResposta.corpo.data.victory === true;
      break;
    }
  }

  assert.ok(vitoria, `não venceu em 15 turnos — resposta final: ${JSON.stringify(ultimaResposta?.corpo)}`);
  const dados = ultimaResposta.corpo.data;
  assert.ok(Array.isArray(dados.espolios), "data.espolios devia ser um array (substituiu o antigo 'espolio' singular)");

  for (const espolio of dados.espolios) {
    assert.ok(espolio.id_item);
    assert.ok(espolio.nome);
    assert.ok(espolio.quantidade >= 1);

    // eslint-disable-next-line no-await-in-loop
    const noInventario = await CharacterInventoryItem.findOne({
      where: { id_personagem: personagem.id, id_item: espolio.id_item },
    });
    assert.ok(noInventario, `espólio ${espolio.nome} não foi encontrado no inventário do personagem`);
  }
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
