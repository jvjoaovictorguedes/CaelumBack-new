// Classes V2 (spec "Melhoria Classe") — Fase 1: schema em estágios
// (CharacterClassEvolution), bônus de evolução resolvido sob demanda
// (nunca mais materializado em Character), e tipo_dano separado da
// escala_atributo no motor de combate. Cobre exatamente as 4 regras
// finais mandatórias da spec que já se aplicam nesta fase:
//   1. Não subtrair bônus históricos sem prova.
//   3. Não continuar gravando bônus de evolução nos atributos-base.
//   4. Não inferir tipo de dano só pela escala.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Class = require("../src/models/Class");
const ClassEvolutionPath = require("../src/models/ClassEvolutionPath");
const CharacterClassEvolution = require("../src/models/CharacterClassEvolution");
const Item = require("../src/models/Item");
const Character = require("../src/models/Character");
const { resolverBonusDeEvolucaoDeClasse } = require("../src/services/classEvolutionBonusService");
const { buscarBonusDeAtributos } = require("../src/services/equipmentBonusService");
const { calcularEfeitoPoder, multiplicadorDeClassePorTipoDano } = require("../src/services/combatFormulas");
const characterController = require("../src/controllers/characterController");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
});
test.after(async () => {
  if (temBanco) await sequelize.close();
});
function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

let contador = 0;
function sufixo() {
  contador += 1;
  return `classesv2_${process.pid}_${Date.now()}_${contador}`;
}

async function criarClasseEItem() {
  const chave = sufixo();
  const classe = await Class.create({ nome: `Classe ${chave}` });
  const item = await Item.create({
    nome: `Relíquia ${chave}`,
    descricao: "teste",
    tipo_item: "Material",
    raridade: "Mitico",
  });
  return { classe, item };
}

async function criarCaminho({ classe, item, estagio = 1, idEvolucaoPai = null, bonus = {} }) {
  const chave = sufixo();
  return ClassEvolutionPath.create({
    id_classe: classe.id,
    slug: `caminho-${chave}`,
    estagio,
    id_evolucao_pai: idEvolucaoPai,
    ativo: true,
    nome: `Caminho ${chave}`,
    descricao: "teste",
    nivel_necessario: 1,
    id_item_requisito: item.id,
    quantidade_item_requisito: 1,
    custo_ouro: 0,
    bonus_forca: bonus.forca ?? 5,
    bonus_vitalidade: bonus.vitalidade ?? 3,
    bonus_agilidade: bonus.agilidade ?? 0,
    bonus_inteligencia: bonus.inteligencia ?? 0,
    bonus_velocidade: bonus.velocidade ?? 0,
  });
}

testeComBanco("classEvolutionBonusService: soma bônus de evoluções V2 (não-legado) e ignora legado materializado", async () => {
  const { classe, item } = await criarClasseEItem();
  const { personagem } = await criarPersonagem();
  const caminho = await criarCaminho({ classe, item, bonus: { forca: 7, vitalidade: 4 } });
  const caminhoLegado = await criarCaminho({ classe, item, bonus: { forca: 999, vitalidade: 999 } });

  // Evolução "de verdade" (fluxo V2) — deve entrar na soma dinâmica.
  await CharacterClassEvolution.create({
    id_personagem: personagem.id,
    id_evolucao: caminho.id,
    estagio: 1,
    legacy_bonus_materializado: false,
  });

  const bonusAntesDoLegado = await resolverBonusDeEvolucaoDeClasse(personagem.id);
  assert.equal(bonusAntesDoLegado.forca, 7);
  assert.equal(bonusAntesDoLegado.vitalidade, 4);

  // Um segundo personagem simula o backfill de alguém já evoluído na V1
  // — bônus já materializado no Character, então o resolver dinâmico
  // NUNCA pode somar de novo (dobraria o bônus).
  const { personagem: personagemLegado } = await criarPersonagem();
  await CharacterClassEvolution.create({
    id_personagem: personagemLegado.id,
    id_evolucao: caminhoLegado.id,
    estagio: 1,
    legacy_bonus_materializado: true,
  });
  const bonusLegado = await resolverBonusDeEvolucaoDeClasse(personagemLegado.id);
  assert.equal(bonusLegado.forca, 0, "bônus já materializado não pode ser somado de novo dinamicamente");
  assert.equal(bonusLegado.vitalidade, 0);
});

testeComBanco("evolveClass (estágio 1): não soma mais bônus direto nos atributos-base do Character", async () => {
  const { classe, item } = await criarClasseEItem();
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await Character.update(
    { id_classe: classe.id, dinheiro: 1000 },
    { where: { id: personagem.id } },
  );
  const caminho = await criarCaminho({ classe, item, bonus: { forca: 10, vitalidade: 8 } });

  const CharacterInventory = require("../src/models/CharacterInventory");
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: item.id, quantidade: 1 });

  const forcaBase = personagem.forca;
  const vitalidadeBase = personagem.vitalidade;

  const req = { params: { id: String(personagem.id) }, body: { id_caminho: caminho.id } };
  let statusCode = null;
  let corpo = null;
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
  await characterController.evolveClass(req, res);
  assert.equal(statusCode, 200, `esperava 200, corpo: ${JSON.stringify(corpo)}`);

  const personagemAtualizado = await Character.findByPk(personagem.id);
  assert.equal(
    personagemAtualizado.forca,
    forcaBase,
    "atributo-base não pode mudar — regra final §3 da spec: bônus de evolução nunca mais materializado no Character",
  );
  assert.equal(personagemAtualizado.vitalidade, vitalidadeBase);
  assert.equal(personagemAtualizado.id_evolucao_classe, caminho.id, "ponteiro de leitura/compat continua sendo escrito");

  // Mas o bônus aparece dinamicamente via a mesma pipeline de
  // equipamento/passivas/sets — combate e perfil continuam vendo o
  // ganho de verdade, só que resolvido sob demanda.
  const bonus = await buscarBonusDeAtributos(personagem.id);
  assert.equal(bonus.forca, 10);
  assert.equal(bonus.vitalidade, 8);

  const evolucaoRegistrada = await CharacterClassEvolution.findOne({ where: { id_personagem: personagem.id } });
  assert.ok(evolucaoRegistrada, "precisa existir um registro em CharacterClassEvolution");
  assert.equal(evolucaoRegistrada.estagio, 1);
  assert.equal(evolucaoRegistrada.legacy_bonus_materializado, false);
});

testeComBanco("constraint única impede duas evoluções do mesmo estágio pro mesmo personagem (corrida concorrente)", async () => {
  const { classe, item } = await criarClasseEItem();
  const { personagem } = await criarPersonagem();
  const caminhoA = await criarCaminho({ classe, item });
  const caminhoB = await criarCaminho({ classe, item });

  await CharacterClassEvolution.create({ id_personagem: personagem.id, id_evolucao: caminhoA.id, estagio: 1 });
  await assert.rejects(
    () => CharacterClassEvolution.create({ id_personagem: personagem.id, id_evolucao: caminhoB.id, estagio: 1 }),
    /unique|constraint/i,
  );
});

test("multiplicadorDeClassePorTipoDano: tipo_dano manda, não a escala_atributo (bug real que a V2 corrige)", () => {
  const personagem = { multiplicador_dano_fisico: 1.2, multiplicador_dano_magico: 0.6 };

  // Poder de Agilidade só é mágico por causa do tipo_dano explícito —
  // antes da V2 isso era IMPOSSÍVEL (só Inteligência podia ser mágico).
  const laminaSombria = { escala_atributo: "Agilidade", tipo_dano: "Magico" };
  assert.equal(multiplicadorDeClassePorTipoDano(laminaSombria, personagem), 0.6);

  // Poder de Força mágico (Golpe Sagrado no exemplo da spec) — mesma ideia.
  const golpeSagrado = { escala_atributo: "Forca", tipo_dano: "Magico" };
  assert.equal(multiplicadorDeClassePorTipoDano(golpeSagrado, personagem), 0.6);

  // Poder físico comum continua físico.
  const corteBasico = { escala_atributo: "Forca", tipo_dano: "Fisico" };
  assert.equal(multiplicadorDeClassePorTipoDano(corteBasico, personagem), 1.2);

  // Verdadeiro ignora os dois multiplicadores (dano cheio).
  const danoVerdadeiro = { escala_atributo: "Forca", tipo_dano: "Verdadeiro" };
  assert.equal(multiplicadorDeClassePorTipoDano(danoVerdadeiro, personagem), 1);
});

test("calcularEfeitoPoder: cura nunca recebe multiplicador de dano, mesmo com tipo_dano setado", () => {
  const personagem = {
    forca: 10,
    vitalidade: 10,
    agilidade: 10,
    inteligencia: 10,
    velocidade: 10,
    multiplicador_dano_fisico: 2,
    multiplicador_dano_magico: 0.1,
    nivel: 1,
  };
  const poderDeCura = {
    escala_atributo: "Vitalidade",
    tipo_dano: "Nenhum",
    dano_base: 0,
    cura_base: 20,
    valor_escala: 1,
  };
  const { dano, cura } = calcularEfeitoPoder(poderDeCura, personagem, 1);
  assert.equal(dano, 0);
  assert.ok(cura > 0);
});
