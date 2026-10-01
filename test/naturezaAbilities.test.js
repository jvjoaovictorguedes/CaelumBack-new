// Painel Admin de Habilidades — vínculo Habilidade <-> Natureza Mágica
// (mesmo padrão de ClassAbilities/RaceAbilities, ver adminPowerService.js).
// Cobre o CRUD admin (upsert/list/remove) e a integração real no fluxo do
// jogador: concederPoderesIniciais (auto-libera por nível), getPoderesDisponiveis
// (aparece com origem "natureza") e comprarPoder (custo_ouro opcional).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Power = require("../src/models/Power");
const NatureAbilities = require("../src/models/NatureAbilities");
const CharacterAbilities = require("../src/models/CharacterAbilities");
const Character = require("../src/models/Character");
const Evolution = require("../src/models/Evolution");
const CharacterEvolution = require("../src/models/CharacterEvolution");
const adminPowerService = require("../src/services/adminPowerService");
const characterController = require("../src/controllers/characterController");
const User = require("../src/models/User");

let temBanco = false;
let ctx = null;
test.before(async () => {
  temBanco = await bancoDisponivel();
  if (temBanco) {
    const admin = await User.create({
      username: `admin_${sufixo()}`,
      email: `admin_${sufixo()}@teste.local`,
      passwordHash: "hash-de-teste",
      isAdmin: true,
    });
    ctx = { idAdmin: admin.id, req: { ip: "127.0.0.1", get: () => "node:test" } };
  }
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

function reqRes(params, body) {
  let statusCode = null;
  let corpo = null;
  const req = { params, body };
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

const powersCriados = [];
const evolucoesCriadas = [];
async function criarPowerTeste(overrides = {}) {
  const power = await Power.create({
    nome: `PoderNaturezaTeste_${sufixo()}`,
    descricao: "poder de teste",
    tipo_poder: "Ativo",
    custo_mana: 5,
    escala_atributo: "Forca",
    valor_escala: 1,
    ...overrides,
  });
  powersCriados.push(power.id);
  return power;
}

test.after(async () => {
  if (!temBanco) return;
  if (evolucoesCriadas.length > 0) {
    await CharacterEvolution.destroy({ where: { id_evolucao: evolucoesCriadas } });
    await Evolution.destroy({ where: { id: evolucoesCriadas } });
  }
  if (powersCriados.length > 0) {
    await NatureAbilities.destroy({ where: { id_poder: powersCriados } });
    await CharacterAbilities.destroy({ where: { id_power: powersCriados } });
    await Power.destroy({ where: { id: powersCriados } });
  }
  await sequelize.close();
});

testeComBanco("upsertAdminNatureAbility: valida natureza_magica e nivel_aprendizagem obrigatórios", async () => {
  const power = await criarPowerTeste();
  await assert.rejects(
    () => adminPowerService.upsertAdminNatureAbility(power.id, { natureza_magica: "Fogo" }, ctx),
    (err) => err.statusCode === 400,
  );
  await assert.rejects(
    () => adminPowerService.upsertAdminNatureAbility(power.id, { natureza_magica: "Inventada", nivel_aprendizagem: 1 }, ctx),
    (err) => err.statusCode === 400,
  );
});

testeComBanco("upsertAdminNatureAbility: cria e depois atualiza o mesmo vínculo (upsert), lista e remove", async () => {
  const power = await criarPowerTeste();

  const criado = await adminPowerService.upsertAdminNatureAbility(
    power.id,
    { natureza_magica: "Raio", nivel_aprendizagem: 5 },
    ctx,
  );
  assert.equal(criado.natureza_magica, "Raio");
  assert.equal(criado.nivel_aprendizagem, 5);
  assert.equal(criado.custo_ouro, null);

  const atualizado = await adminPowerService.upsertAdminNatureAbility(
    power.id,
    { natureza_magica: "Raio", nivel_aprendizagem: 8, custo_ouro: 200 },
    ctx,
  );
  assert.equal(atualizado.nivel_aprendizagem, 8);
  assert.equal(atualizado.custo_ouro, 200);

  const listados = await adminPowerService.listAdminNatureAbilities(power.id);
  assert.equal(listados.length, 1);
  assert.equal(listados[0].natureza_magica, "Raio");

  const removido = await adminPowerService.removeAdminNatureAbility(power.id, "Raio", ctx);
  assert.equal(removido.removido, true);
  await assert.rejects(
    () => adminPowerService.removeAdminNatureAbility(power.id, "Raio", ctx),
    (err) => err.statusCode === 404,
  );
});

testeComBanco("concederPoderesIniciais: personagem com a Natureza certa e nível suficiente aprende de graça", async () => {
  const power = await criarPowerTeste();
  await NatureAbilities.create({ natureza_magica: "Fogo", id_poder: power.id, nivel_aprendizagem: 5, custo_ouro: null });

  // criarPersonagem já nasce com natureza_magica: "Fogo" (ver helpers/db.js).
  const { personagem } = await criarPersonagem({ nivel: 10 });

  const chamada = reqRes({ id: personagem.id }, {});
  await characterController.getPoderesDisponiveis(chamada.req, chamada.res);
  const { statusCode, corpo } = chamada.resultado();
  assert.equal(statusCode, 200, JSON.stringify(corpo));

  const entrada = corpo.data.poderes.find((p) => p.id_power === power.id);
  assert.ok(entrada, "poder vinculado à Natureza devia aparecer na lista");
  assert.equal(entrada.origem, "natureza");
  assert.equal(entrada.aprendido, true, "nível 10 >= nivel_aprendizagem 5, sem custo_ouro — devia liberar de graça");

  const ability = await CharacterAbilities.findOne({ where: { id_personagem: personagem.id, id_power: power.id } });
  assert.ok(ability, "CharacterAbilities devia ter sido criado por concederPoderesIniciais");
});

testeComBanco("concederPoderesIniciais: personagem com Natureza DIFERENTE nunca aprende, mesmo com nível de sobra", async () => {
  const power = await criarPowerTeste();
  await NatureAbilities.create({ natureza_magica: "Escuridao", id_poder: power.id, nivel_aprendizagem: 1, custo_ouro: null });

  // "Fogo" (default do helper) != "Escuridao" do vínculo.
  const { personagem } = await criarPersonagem({ nivel: 50 });

  const chamada = reqRes({ id: personagem.id }, {});
  await characterController.getPoderesDisponiveis(chamada.req, chamada.res);
  const { corpo } = chamada.resultado();

  const entrada = corpo.data.poderes.find((p) => p.id_power === power.id);
  assert.equal(entrada, undefined, "poder de outra Natureza não devia aparecer nem como bloqueado");

  const ability = await CharacterAbilities.findOne({ where: { id_personagem: personagem.id, id_power: power.id } });
  assert.equal(ability, null, "não devia ter sido concedido");
});

testeComBanco("concederPoderesIniciais: nível insuficiente aparece listado mas NÃO aprendido", async () => {
  const power = await criarPowerTeste();
  await NatureAbilities.create({ natureza_magica: "Fogo", id_poder: power.id, nivel_aprendizagem: 20, custo_ouro: null });

  const { personagem } = await criarPersonagem({ nivel: 5 });

  const chamada = reqRes({ id: personagem.id }, {});
  await characterController.getPoderesDisponiveis(chamada.req, chamada.res);
  const { corpo } = chamada.resultado();

  const entrada = corpo.data.poderes.find((p) => p.id_power === power.id);
  assert.ok(entrada, "devia aparecer mesmo bloqueado, pra UI mostrar 'requer nível X'");
  assert.equal(entrada.aprendido, false);
  assert.equal(entrada.nivel_necessario, 20);
});

testeComBanco("comprarPoder: compra um poder de Natureza marcado com custo_ouro", async () => {
  const power = await criarPowerTeste();
  await NatureAbilities.create({ natureza_magica: "Fogo", id_poder: power.id, nivel_aprendizagem: 1, custo_ouro: 150 });

  const { personagem } = await criarPersonagem({ nivel: 10 });
  const personagemDb = await Character.findByPk(personagem.id);
  personagemDb.dinheiro = 500;
  await personagemDb.save();

  const chamada = reqRes({ id: personagem.id, idPower: power.id }, {});
  await characterController.comprarPoder(chamada.req, chamada.res);
  const { statusCode, corpo } = chamada.resultado();
  assert.equal(statusCode, 201, JSON.stringify(corpo));
  assert.equal(corpo.data.dinheiro, 350);

  const ability = await CharacterAbilities.findOne({ where: { id_personagem: personagem.id, id_power: power.id } });
  assert.ok(ability, "compra devia ter criado CharacterAbilities");
});

testeComBanco("comprarPoder: rejeita compra de poder de Natureza que o personagem não tem", async () => {
  const power = await criarPowerTeste();
  await NatureAbilities.create({ natureza_magica: "Yin&Yang", id_poder: power.id, nivel_aprendizagem: 1, custo_ouro: 100 });

  const { personagem } = await criarPersonagem({ nivel: 10 });
  const personagemDb = await Character.findByPk(personagem.id);
  personagemDb.dinheiro = 500;
  await personagemDb.save();

  const chamada = reqRes({ id: personagem.id, idPower: power.id }, {});
  await characterController.comprarPoder(chamada.req, chamada.res);
  const { statusCode } = chamada.resultado();
  assert.equal(statusCode, 404);
});

// Bug reportado pelo usuário: um poder vinculado via NatureAbilities que
// TAMBÉM é o prêmio (id_power_concedido) de um nó da Árvore de Evolução
// daquela mesma natureza aparecia liberado pra comprar só por bater o
// nível — nunca exigindo ter adquirido a evolução. Isso deixava a
// evolução inteiramente opcional pro poder que deveria ser o prêmio dela.
async function criarEvolucaoQueConcede(personagem, power, { nivel_necessario = 1 } = {}) {
  const evolucao = await Evolution.create({
    nome: `Evolução de Teste ${sufixo()}`,
    descricao: "evolução de teste",
    id_classe: personagem.id_classe,
    natureza_magica: "Fogo",
    nivel_necessario,
    custo: 0,
    id_power_concedido: power.id,
  });
  evolucoesCriadas.push(evolucao.id);
  return evolucao;
}

testeComBanco("getPoderesDisponiveis: poder de Natureza que é prêmio de uma Evolução aparece BLOQUEADO (não comprável) sem a evolução", async () => {
  const power = await criarPowerTeste();
  await NatureAbilities.create({ natureza_magica: "Fogo", id_poder: power.id, nivel_aprendizagem: 1, custo_ouro: 150 });

  const { personagem } = await criarPersonagem({ nivel: 50 });
  const evolucao = await criarEvolucaoQueConcede(personagem, power);

  const chamada = reqRes({ id: personagem.id }, {});
  await characterController.getPoderesDisponiveis(chamada.req, chamada.res);
  const { corpo } = chamada.resultado();

  const entrada = corpo.data.poderes.find((p) => p.id_power === power.id);
  assert.ok(entrada, "precisa continuar LISTADO (não escondido), pra UI mostrar o que falta");
  assert.equal(entrada.aprendido, false);
  assert.equal(entrada.bloqueado_por_evolucao, true);
  assert.equal(entrada.evolucao_necessaria, evolucao.nome);
  assert.equal(entrada.pode_comprar, false, "nível já alcançado, mas sem a evolução não pode comprar");
});

testeComBanco("getPoderesDisponiveis: depois de adquirir a Evolução, o poder de Natureza libera pra compra normalmente", async () => {
  const power = await criarPowerTeste();
  await NatureAbilities.create({ natureza_magica: "Fogo", id_poder: power.id, nivel_aprendizagem: 1, custo_ouro: 150 });

  const { personagem } = await criarPersonagem({ nivel: 50 });
  const evolucao = await criarEvolucaoQueConcede(personagem, power);
  await CharacterEvolution.create({ id_personagem: personagem.id, id_evolucao: evolucao.id });

  const chamada = reqRes({ id: personagem.id }, {});
  await characterController.getPoderesDisponiveis(chamada.req, chamada.res);
  const { corpo } = chamada.resultado();

  const entrada = corpo.data.poderes.find((p) => p.id_power === power.id);
  assert.equal(entrada.bloqueado_por_evolucao, false);
  assert.equal(entrada.evolucao_necessaria, null);
  assert.equal(entrada.pode_comprar, true);
});

testeComBanco("concederPoderesIniciais: poder de Natureza GRATUITO (sem custo_ouro) que é prêmio de Evolução NÃO libera de graça sem a evolução", async () => {
  const power = await criarPowerTeste();
  await NatureAbilities.create({ natureza_magica: "Fogo", id_poder: power.id, nivel_aprendizagem: 1, custo_ouro: null });

  const { personagem } = await criarPersonagem({ nivel: 50 });
  await criarEvolucaoQueConcede(personagem, power);

  const chamada = reqRes({ id: personagem.id }, {});
  await characterController.getPoderesDisponiveis(chamada.req, chamada.res);
  const { corpo } = chamada.resultado();

  const entrada = corpo.data.poderes.find((p) => p.id_power === power.id);
  assert.equal(entrada.aprendido, false, "sem custo_ouro normalmente libera de graça por nível — mas não sem a evolução");
  assert.equal(entrada.bloqueado_por_evolucao, true);

  const ability = await CharacterAbilities.findOne({ where: { id_personagem: personagem.id, id_power: power.id } });
  assert.equal(ability, null, "concederPoderesIniciais não devia ter concedido de graça");
});

testeComBanco("concederPoderesIniciais: depois de adquirir a Evolução, o poder gratuito É concedido na próxima carga", async () => {
  const power = await criarPowerTeste();
  await NatureAbilities.create({ natureza_magica: "Fogo", id_poder: power.id, nivel_aprendizagem: 1, custo_ouro: null });

  const { personagem } = await criarPersonagem({ nivel: 50 });
  const evolucao = await criarEvolucaoQueConcede(personagem, power);
  await CharacterEvolution.create({ id_personagem: personagem.id, id_evolucao: evolucao.id });

  const chamada = reqRes({ id: personagem.id }, {});
  await characterController.getPoderesDisponiveis(chamada.req, chamada.res);
  const { corpo } = chamada.resultado();

  const entrada = corpo.data.poderes.find((p) => p.id_power === power.id);
  assert.equal(entrada.aprendido, true);

  const ability = await CharacterAbilities.findOne({ where: { id_personagem: personagem.id, id_power: power.id } });
  assert.ok(ability, "concederPoderesIniciais devia ter concedido assim que a evolução foi adquirida");
});

testeComBanco("comprarPoder: rejeita comprar poder de Natureza cuja Evolução ainda não foi adquirida", async () => {
  const power = await criarPowerTeste();
  await NatureAbilities.create({ natureza_magica: "Fogo", id_poder: power.id, nivel_aprendizagem: 1, custo_ouro: 150 });

  const { personagem } = await criarPersonagem({ nivel: 50 });
  await criarEvolucaoQueConcede(personagem, power);
  const personagemDb = await Character.findByPk(personagem.id);
  personagemDb.dinheiro = 500;
  await personagemDb.save();

  const chamada = reqRes({ id: personagem.id, idPower: power.id }, {});
  await characterController.comprarPoder(chamada.req, chamada.res);
  const { statusCode, corpo } = chamada.resultado();
  assert.equal(statusCode, 400);
  assert.match(corpo.message, /adquira essa evolução primeiro/);

  const ability = await CharacterAbilities.findOne({ where: { id_personagem: personagem.id, id_power: power.id } });
  assert.equal(ability, null, "compra bloqueada não pode ter criado CharacterAbilities");
});

testeComBanco("comprarPoder: permite comprar normalmente depois de adquirir a Evolução", async () => {
  const power = await criarPowerTeste();
  await NatureAbilities.create({ natureza_magica: "Fogo", id_poder: power.id, nivel_aprendizagem: 1, custo_ouro: 150 });

  const { personagem } = await criarPersonagem({ nivel: 50 });
  const evolucao = await criarEvolucaoQueConcede(personagem, power);
  await CharacterEvolution.create({ id_personagem: personagem.id, id_evolucao: evolucao.id });
  const personagemDb = await Character.findByPk(personagem.id);
  personagemDb.dinheiro = 500;
  await personagemDb.save();

  const chamada = reqRes({ id: personagem.id, idPower: power.id }, {});
  await characterController.comprarPoder(chamada.req, chamada.res);
  const { statusCode, corpo } = chamada.resultado();
  assert.equal(statusCode, 201, JSON.stringify(corpo));
  assert.equal(corpo.data.dinheiro, 350);
});
