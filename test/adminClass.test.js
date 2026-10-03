// Painel Administrativo — Classes V2 Fase 2 (§100/§101). Cobre
// adminClassService: identidade de Classe, árvore de evolução (2
// estágios), requirements/abilities/effects extensíveis, validador e
// simulador. Mesmos helpers de fixture dos demais testes admin (ver
// test/adminAlchemy.test.js).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize, criarPersonagem } = require("./helpers/db");
// slug só aceita [a-z0-9-] — sufixo() traz "_" (pid_timestamp_contador),
// então os testes usam esta variante pra montar slugs válidos.
function sufixoSlug() {
  return sufixo().replace(/_/g, "-");
}
require("../src/models/associations");

const Class = require("../src/models/Class");
const Power = require("../src/models/Power");
const User = require("../src/models/User");
const ClassEvolutionPath = require("../src/models/ClassEvolutionPath");
const ClassEvolutionRequirement = require("../src/models/ClassEvolutionRequirement");
const ClassEvolutionAbility = require("../src/models/ClassEvolutionAbility");
const ClassEvolutionEffect = require("../src/models/ClassEvolutionEffect");
const CharacterClassEvolution = require("../src/models/CharacterClassEvolution");
const CharacterAbilities = require("../src/models/CharacterAbilities");
const Character = require("../src/models/Character");
const adminClassService = require("../src/services/adminClassService");
const characterController = require("../src/controllers/characterController");

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

const classesCriadas = [];
const powersCriados = [];

test.after(async () => {
  if (!temBanco) return;
  for (const idClasse of classesCriadas) {
    const caminhos = await ClassEvolutionPath.findAll({ where: { id_classe: idClasse } });
    // Filhos antes dos pais (FK id_evolucao_pai) — ordena por estágio
    // decrescente pra nunca tentar apagar um pai com filho ainda vivo.
    caminhos.sort((a, b) => b.estagio - a.estagio);
    for (const caminho of caminhos) {
      await ClassEvolutionRequirement.destroy({ where: { id_evolucao: caminho.id } });
      await ClassEvolutionAbility.destroy({ where: { id_evolucao: caminho.id } });
      await ClassEvolutionEffect.destroy({ where: { id_evolucao: caminho.id } });
      await caminho.destroy();
    }
  }
  if (classesCriadas.length > 0) await Class.destroy({ where: { id: classesCriadas } });
  if (powersCriados.length > 0) await Power.destroy({ where: { id: powersCriados } });
  await sequelize.close();
});

async function criarClasseTeste() {
  const classe = await Class.create({ nome: `ClasseAdminTeste_${sufixo()}`, descricao: "classe de teste", raro: false });
  classesCriadas.push(classe.id);
  return classe;
}

async function criarPowerTeste(overrides = {}) {
  const power = await Power.create({
    nome: `PoderAdminTeste_${sufixo()}`,
    descricao: "poder de teste",
    tipo_poder: "Ativo",
    custo_mana: 5,
    dano_base: 5,
    escala_atributo: "Forca",
    valor_escala: 1,
    tipo_dano: "Fisico",
    ...overrides,
  });
  powersCriados.push(power.id);
  return power;
}

testeComBanco("atualizarClasse: valida atributo_principal e persiste identidade", async () => {
  const classe = await criarClasseTeste();
  const atualizada = await adminClassService.atualizarClasse(classe.id, { papel: "Combatente", atributo_principal: "Forca" }, ctx);
  assert.equal(atualizada.papel, "Combatente");

  await assert.rejects(
    () => adminClassService.atualizarClasse(classe.id, { atributo_principal: "Sorte" }, ctx),
    (err) => err.statusCode === 400,
  );
});

testeComBanco("criarCaminho: valida linhagem de estágio 2 (§5.2)", async () => {
  const classe = await criarClasseTeste();
  const caminho1 = await adminClassService.criarCaminho(
    classe.id,
    { slug: `c1-${sufixoSlug()}`, nome: "Caminho 1", descricao: "x", estagio: 1, bonus_forca: 5 },
    ctx,
  );

  await assert.rejects(
    () => adminClassService.criarCaminho(classe.id, { slug: `sem-pai-${sufixoSlug()}`, nome: "X", descricao: "x", estagio: 2 }, ctx),
    (err) => err.statusCode === 400,
  );

  const caminho2 = await adminClassService.criarCaminho(
    classe.id,
    { slug: `c2-${sufixoSlug()}`, nome: "Caminho 2", descricao: "x", estagio: 2, id_evolucao_pai: caminho1.id, bonus_forca: 10 },
    ctx,
  );
  assert.equal(caminho2.id_evolucao_pai, caminho1.id);

  await assert.rejects(
    () =>
      adminClassService.criarCaminho(
        classe.id,
        { slug: `linhagem-errada-${sufixoSlug()}`, nome: "X", descricao: "x", estagio: 2, id_evolucao_pai: caminho2.id },
        ctx,
      ),
    (err) => err.statusCode === 400,
  );
});

testeComBanco("atualizarCaminho: estagio e id_evolucao_pai são imutáveis", async () => {
  const classe = await criarClasseTeste();
  const caminho = await adminClassService.criarCaminho(
    classe.id,
    { slug: `imut-${sufixoSlug()}`, nome: "Caminho", descricao: "x", estagio: 1 },
    ctx,
  );
  await assert.rejects(
    () => adminClassService.atualizarCaminho(caminho.id, { estagio: 2 }, ctx),
    (err) => err.statusCode === 400,
  );
  const editado = await adminClassService.atualizarCaminho(caminho.id, { nome: "Novo Nome" }, ctx);
  assert.equal(editado.nome, "Novo Nome");
});

testeComBanco("requirements: rejeita REPUTATION/QUEST e valida reference_key/reference_id", async () => {
  const classe = await criarClasseTeste();
  const caminho = await adminClassService.criarCaminho(classe.id, { slug: `req-${sufixoSlug()}`, nome: "Caminho", descricao: "x", estagio: 1 }, ctx);

  await assert.rejects(
    () => adminClassService.criarRequisito(caminho.id, { tipo: "REPUTATION", quantidade: 1 }, ctx),
    (err) => err.statusCode === 400,
  );
  await assert.rejects(
    () => adminClassService.criarRequisito(caminho.id, { tipo: "MONSTER_KILL", quantidade: 1, reference_key: "Monstro Inexistente XPTO" }, ctx),
    (err) => err.statusCode === 404,
  );
  await assert.rejects(
    () => adminClassService.criarRequisito(caminho.id, { tipo: "ADVENTURE_GUILD_RANK", quantidade: 1, reference_key: "Z" }, ctx),
    (err) => err.statusCode === 400,
  );

  const requisito = await adminClassService.criarRequisito(caminho.id, { tipo: "LEVEL", quantidade: 40 }, ctx);
  assert.equal(requisito.quantidade, 40);
});

testeComBanco("abilities: rejeita Power UNIQUE_FEAT (§9)", async () => {
  const classe = await criarClasseTeste();
  const caminho = await adminClassService.criarCaminho(classe.id, { slug: `hab-${sufixoSlug()}`, nome: "Caminho", descricao: "x", estagio: 1 }, ctx);
  const power = await criarPowerTeste();
  const powerUnico = await criarPowerTeste({ acquisition_scope: "UNIQUE_FEAT" });

  const habilidade = await adminClassService.criarHabilidade(caminho.id, { id_power: power.id }, ctx);
  assert.equal(habilidade.id_power, power.id);

  await assert.rejects(
    () => adminClassService.criarHabilidade(caminho.id, { id_power: powerUnico.id }, ctx),
    (err) => err.statusCode === 400,
  );
});

testeComBanco("effects: catálogo fechado só aceita effect_key implementada (§10)", async () => {
  const classe = await criarClasseTeste();
  const caminho = await adminClassService.criarCaminho(classe.id, { slug: `efe-${sufixoSlug()}`, nome: "Caminho", descricao: "x", estagio: 1 }, ctx);

  const efeito = await adminClassService.criarEfeito(caminho.id, { effect_key: "DAMAGE_REDUCTION", valor: 15 }, ctx);
  assert.equal(efeito.valor, 15);

  // RAGE_STACK/LOW_HP_DAMAGE/SHIELD_ON_CAST são as únicas 3 effect_keys
  // ainda fora de EFFECT_KEYS_IMPLEMENTADAS (item 8 da Habilidades V2.0
  // implementou as outras 7 — ver classEvolutionCombatModifiers.test.js).
  await assert.rejects(
    () => adminClassService.criarEfeito(caminho.id, { effect_key: "RAGE_STACK", valor: 10 }, ctx),
    (err) => err.statusCode === 400,
  );

  const catalogo = adminClassService.catalogoEfeitos();
  assert.equal(catalogo.length, 11);
  assert.ok(catalogo.find((e) => e.effect_key === "DAMAGE_REDUCTION").implementado);
  assert.ok(catalogo.find((e) => e.effect_key === "LIFESTEAL").implementado);
  assert.ok(!catalogo.find((e) => e.effect_key === "RAGE_STACK").implementado);
});

testeComBanco("buscarClasseComArvore: retorna caminhos com requisitos/habilidades/efeitos aninhados", async () => {
  const classe = await criarClasseTeste();
  const caminho = await adminClassService.criarCaminho(classe.id, { slug: `arv-${sufixoSlug()}`, nome: "Caminho", descricao: "x", estagio: 1 }, ctx);
  await adminClassService.criarRequisito(caminho.id, { tipo: "LEVEL", quantidade: 10 }, ctx);
  const power = await criarPowerTeste();
  await adminClassService.criarHabilidade(caminho.id, { id_power: power.id }, ctx);
  await adminClassService.criarEfeito(caminho.id, { effect_key: "DAMAGE_REDUCTION", valor: 5 }, ctx);

  const { caminhos } = await adminClassService.buscarClasseComArvore(classe.id);
  const encontrado = caminhos.find((c) => c.id === caminho.id);
  assert.equal(encontrado.requisitos.length, 1);
  assert.equal(encontrado.habilidadesConcedidas.length, 1);
  assert.equal(encontrado.efeitos.length, 1);
});

testeComBanco("simularEvolucao: soma bônus/efeitos dos 2 estágios e valida linhagem", async () => {
  const classe = await criarClasseTeste();
  const caminho1 = await adminClassService.criarCaminho(classe.id, { slug: `sim1-${sufixoSlug()}`, nome: "C1", descricao: "x", estagio: 1, bonus_forca: 5 }, ctx);
  const caminho2 = await adminClassService.criarCaminho(
    classe.id,
    { slug: `sim2-${sufixoSlug()}`, nome: "C2", descricao: "x", estagio: 2, id_evolucao_pai: caminho1.id, bonus_forca: 10 },
    ctx,
  );
  await adminClassService.criarEfeito(caminho1.id, { effect_key: "DAMAGE_REDUCTION", valor: 20 }, ctx);

  const resultado = await adminClassService.simularEvolucao({ id_classe: classe.id, id_caminho_estagio1: caminho1.id, id_caminho_estagio2: caminho2.id });
  assert.equal(resultado.bonus_total.forca, 15);
  assert.equal(resultado.bonus_total.defesa, 20);

  const caminhoOrfao = await adminClassService.criarCaminho(classe.id, { slug: `orfao-${sufixoSlug()}`, nome: "Órfão", descricao: "x", estagio: 1 }, ctx);
  await assert.rejects(() =>
    adminClassService.simularEvolucao({ id_classe: classe.id, id_caminho_estagio1: caminhoOrfao.id, id_caminho_estagio2: caminho2.id }),
  );
});

testeComBanco("excluirCaminho: FK protege caminho com filho ou já adquirido por personagem", async () => {
  const classe = await criarClasseTeste();
  const caminho1 = await adminClassService.criarCaminho(classe.id, { slug: `del1-${sufixoSlug()}`, nome: "C1", descricao: "x", estagio: 1 }, ctx);
  const caminho2 = await adminClassService.criarCaminho(
    classe.id,
    { slug: `del2-${sufixoSlug()}`, nome: "C2", descricao: "x", estagio: 2, id_evolucao_pai: caminho1.id },
    ctx,
  );

  await assert.rejects(
    () => adminClassService.excluirCaminho(caminho1.id, ctx),
    (err) => err.statusCode === 409,
  );

  await adminClassService.excluirCaminho(caminho2.id, ctx);
  await adminClassService.excluirCaminho(caminho1.id, ctx);
  const restante = await ClassEvolutionPath.findByPk(caminho1.id);
  assert.equal(restante, null);
});

testeComBanco("evoluir de classe concede o poder de ClassEvolutionAbility e ele aparece em getPoderesDisponiveis (bug real: poder gravado mas invisível na aba Habilidades)", async () => {
  const classe = await criarClasseTeste();
  const caminho = await adminClassService.criarCaminho(classe.id, { slug: `hab-jog-${sufixoSlug()}`, nome: "Caminho com Poder", descricao: "x", estagio: 1 }, ctx);
  const power = await criarPowerTeste();
  await adminClassService.criarHabilidade(caminho.id, { id_power: power.id }, ctx);

  const { personagem } = await criarPersonagem({ nivel: 40 });
  await Character.update({ id_classe: classe.id, dinheiro: 1000 }, { where: { id: personagem.id } });

  const evolucao = reqRes({ id: String(personagem.id) }, { id_caminho: caminho.id });
  await characterController.evolveClass(evolucao.req, evolucao.res);
  assert.equal(evolucao.resultado().statusCode, 200, JSON.stringify(evolucao.resultado().corpo));

  const habilidades = reqRes({ id: String(personagem.id) }, {});
  await characterController.getPoderesDisponiveis(habilidades.req, habilidades.res);
  const { statusCode, corpo } = habilidades.resultado();
  assert.equal(statusCode, 200);

  const entrada = corpo.data.poderes.find((p) => p.id_power === power.id);
  assert.ok(entrada, "poder concedido pela evolução de classe devia aparecer em GET .../powers");
  assert.equal(entrada.origem, "evolucao");
  assert.equal(entrada.aprendido, true);

  // Sem isso, o teste deixa um Character apontando (id_evolucao_classe)
  // pro caminho criado aqui — o cleanup global (test.after) tenta
  // apagar os caminhos de classesCriadas direto e estoura FK. Apagar o
  // personagem primeiro é suficiente (CASCADE cuida de
  // CharacterClassEvolution).
  await personagem.destroy();
  await User.destroy({ where: { id: personagem.id_usuario } });
});

testeComBanco("excluirCaminho force=true desfaz a evolução do personagem (histórico + poder concedido) antes de excluir", async () => {
  const classe = await criarClasseTeste();
  const caminho = await adminClassService.criarCaminho(classe.id, { slug: `force-del-${sufixoSlug()}`, nome: "Caminho de Teste", descricao: "x", estagio: 1 }, ctx);
  const power = await criarPowerTeste();
  await adminClassService.criarHabilidade(caminho.id, { id_power: power.id }, ctx);

  const { personagem } = await criarPersonagem({ nivel: 40 });
  await Character.update({ id_classe: classe.id, dinheiro: 1000 }, { where: { id: personagem.id } });
  const evolucao = reqRes({ id: String(personagem.id) }, { id_caminho: caminho.id });
  await characterController.evolveClass(evolucao.req, evolucao.res);
  assert.equal(evolucao.resultado().statusCode, 200);

  // Sem force, continua bloqueado (comportamento original preservado).
  await assert.rejects(
    () => adminClassService.excluirCaminho(caminho.id, ctx),
    (err) => err.statusCode === 409,
  );

  const resultado = await adminClassService.excluirCaminho(caminho.id, { ...ctx, force: true });
  assert.equal(resultado.personagensDesvinculados, 1);
  assert.equal(await ClassEvolutionPath.findByPk(caminho.id), null);

  const evolucaoRestante = await CharacterClassEvolution.findOne({ where: { id_personagem: personagem.id } });
  assert.equal(evolucaoRestante, null, "histórico de evolução do personagem devia ter sido removido");

  const personagemAtualizado = await Character.findByPk(personagem.id);
  assert.equal(personagemAtualizado.id_evolucao_classe, null, "ponteiro legado devia ter sido limpo");

  const habilidade = await CharacterAbilities.findOne({ where: { id_personagem: personagem.id, id_power: power.id } });
  assert.equal(habilidade, null, "poder concedido só por essa evolução devia ter sido removido junto");

  await personagem.destroy();
  await User.destroy({ where: { id: personagem.id_usuario } });
});

testeComBanco("excluirHabilidade: revoga o poder já concedido de quem está no caminho, sem tocar em quem aprendeu por outra via (bug real: poder ficava vinculado depois de excluir a evolução)", async () => {
  const classe = await criarClasseTeste();
  const caminho = await adminClassService.criarCaminho(classe.id, { slug: `hab-excl-${sufixoSlug()}`, nome: "Caminho de Teste", descricao: "x", estagio: 1 }, ctx);
  const power = await criarPowerTeste();
  const habilidade = await adminClassService.criarHabilidade(caminho.id, { id_power: power.id }, ctx);

  const { personagem } = await criarPersonagem({ nivel: 40 });
  await Character.update({ id_classe: classe.id, dinheiro: 1000 }, { where: { id: personagem.id } });
  const evolucao = reqRes({ id: String(personagem.id) }, { id_caminho: caminho.id });
  await characterController.evolveClass(evolucao.req, evolucao.res);
  assert.equal(evolucao.resultado().statusCode, 200);

  // Outro personagem aprendeu o MESMO Power por outra via (nunca por
  // esta evolução) — excluir o vínculo não pode tocar nele.
  const { personagem: outro } = await criarPersonagem({ nivel: 40 });
  await CharacterAbilities.create({ id_personagem: outro.id, id_power: power.id, is_active: true, nivel_habilidade: 1 });

  await adminClassService.excluirHabilidade(habilidade.id, ctx);

  assert.equal(await ClassEvolutionAbility.findByPk(habilidade.id), null);

  const habilidadeDoEvoluido = await CharacterAbilities.findOne({ where: { id_personagem: personagem.id, id_power: power.id } });
  assert.equal(habilidadeDoEvoluido, null, "poder concedido só por essa evolução devia ter sido revogado");

  const habilidadeDoOutro = await CharacterAbilities.findOne({ where: { id_personagem: outro.id, id_power: power.id } });
  assert.ok(habilidadeDoOutro, "poder aprendido por outra via nunca pode ser revogado por essa exclusão");

  await personagem.destroy();
  await User.destroy({ where: { id: personagem.id_usuario } });
  await CharacterAbilities.destroy({ where: { id_personagem: outro.id } });
  await outro.destroy();
  await User.destroy({ where: { id: outro.id_usuario } });
});

testeComBanco("validarIntegridade: roda sem quebrar e sinaliza classe sem papel/slug", async () => {
  const classe = await criarClasseTeste();
  await Class.update({ disponivel_criacao: true }, { where: { id: classe.id } });

  const resultado = await adminClassService.validarIntegridade();
  assert.equal(typeof resultado.total_problemas, "number");
  assert.ok(resultado.problemas.some((p) => p.entidade === "Class" && p.id === classe.id));
});
