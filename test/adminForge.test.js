// Painel Administrativo da Forja — cobertura do §18: permissões
// separadas (forge.manage/forge.balance), Blueprint (criar/editar/
// duplicar-inativo/desativar/reativar), transaction (falha em resultado
// não persiste parcial), resultados (6/6 pra ativar, raridade/Tier/
// categoria), Ferramenta (nunca vira Arma), ingredientes (resolução em
// todas qualidades), pergaminhos (ativo/cap), refinamento (preview
// Admin = cálculo real do service), RNG de fabricação (soma PPM =
// 1.000.000), progressão (preview de impacto) e auditoria.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const AdminRole = require("../src/models/AdminRole");
const AdminActionLog = require("../src/models/AdminActionLog");
const Item = require("../src/models/Item");
const WeaponProperties = require("../src/models/WeaponProperties");
const FishingRodProperties = require("../src/models/FishingRodProperties");
const ExpeditionResource = require("../src/models/ExpeditionResource");
const ExpeditionResourceItem = require("../src/models/ExpeditionResourceItem");
const ForgeBarItem = require("../src/models/ForgeBarItem");
const ForgeBlueprint = require("../src/models/ForgeBlueprint");
const ForgeBlueprintIngredient = require("../src/models/ForgeBlueprintIngredient");
const ForgeBlueprintResult = require("../src/models/ForgeBlueprintResult");
const ForgeScroll = require("../src/models/ForgeScroll");
const GameSetting = require("../src/models/GameSetting");
const CharacterForgeProgress = require("../src/models/CharacterForgeProgress");

const adminRoleService = require("../src/services/adminRoleService");
const requireAdminPermission = require("../src/middlewares/requireAdminPermission");
const adminForgeService = require("../src/services/adminForgeService");
const forgeRollService = require("../src/services/forgeRollService");
const forgeConfig = require("../src/config/forgeConfig");

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

async function criarUsuarioAdmin() {
  const chave = sufixo();
  return User.create({
    username: `admin_forja_${chave}`,
    email: `admin_forja_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin: true,
  });
}

function reqRes({ userId } = {}) {
  return { user: userId ? { id: userId } : undefined, body: {}, query: {}, ip: "127.0.0.1", get: () => "teste-agent" };
}

// Recursos/Items mínimos pra montar um blueprint completo e resolvível
// nas 6 qualidades (Barra de Ferro), sem depender de nenhum seed.
async function montarRecursoBarraCompleto() {
  const chave = sufixo();
  const recurso = await ExpeditionResource.create({ nome: `Minerio Teste ${chave}`, profissao: "Mineracao" });
  const itensPorQualidade = {};
  for (const qualidade of forgeConfig.ORDEM_QUALIDADE) {
    const item = await Item.create({
      nome: `Barra Teste ${chave} - ${qualidade}`,
      descricao: "Item descartável de teste.",
      tipo_item: "Material",
      raridade: qualidade,
      valor_compra: 0,
      valor_venda: 0,
      peso: 1,
      disponivel_loja: false,
    });
    await ForgeBarItem.create({ id_recurso: recurso.id, qualidade, id_item: item.id });
    itensPorQualidade[qualidade] = item;
  }
  return { recurso, itensPorQualidade };
}

async function criarItemArma(qualidade, tier) {
  const item = await Item.create({
    nome: `Espada Teste ${sufixo()}`,
    descricao: "Item descartável de teste.",
    tipo_item: "Arma",
    raridade: qualidade,
    tier_equipamento: tier,
    valor_compra: 0,
    valor_venda: 0,
    peso: 1,
    disponivel_loja: false,
  });
  await WeaponProperties.create({
    id_item: item.id,
    dano_min: 1,
    dano_max: 2,
    tipo_dano: "Fisico",
    tipo_arma: "Espada",
    bonus_atributo: "Forca",
    valor_bonus_atributo: 1,
  });
  return item;
}

async function criarItemVaraFerramenta(qualidade, tier) {
  const item = await Item.create({
    nome: `Vara Teste ${sufixo()}`,
    descricao: "Item descartável de teste.",
    tipo_item: "Ferramenta",
    raridade: qualidade,
    tier_equipamento: tier,
    valor_compra: 0,
    valor_venda: 0,
    peso: 1,
    disponivel_loja: false,
  });
  await FishingRodProperties.create({ id_item: item.id });
  return item;
}

const blueprintsCriados = [];
const scrollsCriados = [];

test.after(async () => {
  if (!temBanco) return;
  await ForgeBlueprintResult.destroy({ where: { id_blueprint: blueprintsCriados.length ? blueprintsCriados : [-1] } });
  await ForgeBlueprintIngredient.destroy({ where: { id_blueprint: blueprintsCriados.length ? blueprintsCriados : [-1] } });
  await ForgeBlueprint.destroy({ where: { id: blueprintsCriados.length ? blueprintsCriados : [-1] } });
  await ForgeScroll.destroy({ where: { id_item: scrollsCriados.length ? scrollsCriados : [-1] } });
  await sequelize.close();
});

// -----------------------------------------------------------------
// Permissões separadas (§2.1/§18)
// -----------------------------------------------------------------

testeComBanco("requireAdminPermission(forge.manage) bloqueia sem a permissão e libera com role Conteudo", async () => {
  const admin = await criarUsuarioAdmin();
  const middleware = requireAdminPermission("forge.manage");

  const semPermissao = reqRes({ userId: admin.id });
  let chamouNext = false;
  const res = { status() { return this; }, json() {} };
  await middleware(semPermissao, res, () => { chamouNext = true; });
  assert.equal(chamouNext, false, "sem role, forge.manage deve bloquear");

  const role = await AdminRole.findOne({ where: { nome: "Conteudo" } });
  await adminRoleService.assignRole(admin.id, role.id, { idAdmin: admin.id });

  const comPermissao = reqRes({ userId: admin.id });
  chamouNext = false;
  await middleware(comPermissao, res, () => { chamouNext = true; });
  assert.equal(chamouNext, true, "Conteudo tem forge.manage — devia liberar");
});

testeComBanco("forge.balance é uma permissão separada de forge.manage", async () => {
  const admin = await criarUsuarioAdmin();
  const middlewareBalance = requireAdminPermission("forge.balance");
  const res = { status() { return this; }, json() {} };

  // Sem nenhum role ainda — bloqueia.
  let chamouNext = false;
  await middlewareBalance(reqRes({ userId: admin.id }), res, () => { chamouNext = true; });
  assert.equal(chamouNext, false);

  const role = await AdminRole.findOne({ where: { nome: "Conteudo" } });
  await adminRoleService.assignRole(admin.id, role.id, { idAdmin: admin.id });
  chamouNext = false;
  await middlewareBalance(reqRes({ userId: admin.id }), res, () => { chamouNext = true; });
  assert.equal(chamouNext, true, "Conteudo também recebe forge.balance por padrão (§2.1)");
});

// -----------------------------------------------------------------
// Blueprint: ciclo de vida + transaction + resultados 6/6
// -----------------------------------------------------------------

testeComBanco("criarBlueprintAdmin: novo blueprint nasce SEMPRE inativo, mesmo se ativo:true for enviado", async () => {
  const admin = await criarUsuarioAdmin();
  const { recurso } = await montarRecursoBarraCompleto();

  const blueprint = await adminForgeService.criarBlueprintAdmin(
    {
      nome: `Blueprint Teste ${sufixo()}`,
      categoria_equipamento: "Arma",
      tier_equipamento: 3,
      multiplicador_tempo: 1,
      nivel_forja_minimo: 1,
      ativo: true,
      ingredientes: [{ tipo_insumo: "Barra", id_recurso: recurso.id, quantidade_base: 1 }],
    },
    { idAdmin: admin.id },
  );
  blueprintsCriados.push(blueprint.id);

  assert.equal(blueprint.ativo, false, "blueprint novo precisa nascer inativo mesmo com ativo:true no payload");

  const log = await AdminActionLog.findOne({ where: { entidade: "ForgeBlueprint", id_entidade: blueprint.id, acao: "CREATE_BLUEPRINT" } });
  assert.ok(log, "CREATE_BLUEPRINT precisa ser auditado");
  assert.equal(log.dados_depois.ativo, false);
});

testeComBanco("Ferramenta (Vara de Pesca): blueprint válido não é tratado como Arma", async () => {
  const admin = await criarUsuarioAdmin();
  const { recurso, itensPorQualidade } = await montarRecursoBarraCompleto();

  const blueprint = await adminForgeService.criarBlueprintAdmin(
    {
      nome: `Vara Teste ${sufixo()}`,
      categoria_equipamento: "Ferramenta",
      tier_equipamento: 5,
      multiplicador_tempo: 1,
      nivel_forja_minimo: 1,
      ingredientes: [{ tipo_insumo: "Barra", id_recurso: recurso.id, quantidade_base: 1 }],
    },
    { idAdmin: admin.id },
  );
  blueprintsCriados.push(blueprint.id);

  // Resultado usando um item de Arma (errado) deve falhar a validação —
  // categoria Ferramenta NUNCA aceita WeaponProperties.
  const itemArmaErrada = await criarItemArma("Comum", 5);
  await adminForgeService.atualizarBlueprintAdmin(blueprint.id, { resultados: { Comum: itemArmaErrada.id } }, { idAdmin: admin.id });
  let relatorio = await adminForgeService.validarBlueprintAdmin(blueprint.id);
  assert.ok(
    relatorio.resultadosValidacao.alertas.some((a) => a.nivel === "ERRO" && /WeaponProperties|FishingRodProperties/.test(a.mensagem)),
    "resultado com WeaponProperties pra categoria Ferramenta precisa ser rejeitado",
  );

  // Corrige com uma Vara de verdade — agora todas as 6 devem bater.
  const itensVara = {};
  for (const qualidade of forgeConfig.ORDEM_QUALIDADE) {
    itensVara[qualidade] = (await criarItemVaraFerramenta(qualidade, 5)).id;
  }
  await adminForgeService.atualizarBlueprintAdmin(blueprint.id, { resultados: itensVara }, { idAdmin: admin.id });
  relatorio = await adminForgeService.validarBlueprintAdmin(blueprint.id);
  assert.equal(relatorio.resultadosValidacao.completo, true, "6 Varas válidas devem fechar 6/6");
  assert.equal(relatorio.podeAtivar, true);

  const ativado = await adminForgeService.setAtivoBlueprintAdmin(blueprint.id, true, { idAdmin: admin.id });
  assert.equal(ativado.ativo, true);
  assert.equal(ativado.categoria_equipamento, "Ferramenta");
});

testeComBanco("Resultados: ativar exige 6/6, bloqueia com resultado incompleto/raridade divergente/Tier divergente", async () => {
  const admin = await criarUsuarioAdmin();
  const { recurso } = await montarRecursoBarraCompleto();
  const blueprint = await adminForgeService.criarBlueprintAdmin(
    {
      nome: `Blueprint Incompleto ${sufixo()}`,
      categoria_equipamento: "Arma",
      tier_equipamento: 2,
      multiplicador_tempo: 1,
      nivel_forja_minimo: 1,
      ingredientes: [{ tipo_insumo: "Barra", id_recurso: recurso.id, quantidade_base: 1 }],
    },
    { idAdmin: admin.id },
  );
  blueprintsCriados.push(blueprint.id);

  // Só 1 de 6 — não pode ativar.
  const itemComum = await criarItemArma("Comum", 2);
  await adminForgeService.atualizarBlueprintAdmin(blueprint.id, { resultados: { Comum: itemComum.id } }, { idAdmin: admin.id });
  await assert.rejects(() => adminForgeService.setAtivoBlueprintAdmin(blueprint.id, true, { idAdmin: admin.id }), /Não é possível ativar/);

  // 6/6, mas um com raridade errada (Incomum apontando pra item Raro).
  const itens = {};
  for (const qualidade of forgeConfig.ORDEM_QUALIDADE) itens[qualidade] = (await criarItemArma(qualidade, 2)).id;
  const idIncomumCorreto = itens.Incomum;
  const itemRaridadeErrada = await criarItemArma("Raro", 2);
  await adminForgeService.atualizarBlueprintAdmin(blueprint.id, { resultados: { ...itens, Incomum: itemRaridadeErrada.id } }, { idAdmin: admin.id });
  await assert.rejects(() => adminForgeService.setAtivoBlueprintAdmin(blueprint.id, true, { idAdmin: admin.id }), /Não é possível ativar/);

  // Corrige raridade mas erra o Tier (blueprint é Tier 2, item Tier 5).
  const itemTierErrado = await criarItemArma("Incomum", 5);
  await adminForgeService.atualizarBlueprintAdmin(blueprint.id, { resultados: { Incomum: itemTierErrado.id } }, { idAdmin: admin.id });
  await assert.rejects(() => adminForgeService.setAtivoBlueprintAdmin(blueprint.id, true, { idAdmin: admin.id }), /Não é possível ativar/);

  // Corrige tudo — agora ativa.
  await adminForgeService.atualizarBlueprintAdmin(blueprint.id, { resultados: { Incomum: idIncomumCorreto } }, { idAdmin: admin.id });
  const ativado = await adminForgeService.setAtivoBlueprintAdmin(blueprint.id, true, { idAdmin: admin.id });
  assert.equal(ativado.ativo, true);
});

testeComBanco("Ingredientes: matriz de resolução cobre as 6 qualidades (Barra)", async () => {
  const { recurso, itensPorQualidade } = await montarRecursoBarraCompleto();
  const matriz = await require("../src/services/forgeAdminValidationService").resolverMatrizIngredientes([
    { tipo_insumo: "Barra", id_recurso: recurso.id, quantidade_base: 1 },
  ]);
  assert.equal(matriz.length, 1);
  for (const qualidade of forgeConfig.ORDEM_QUALIDADE) {
    assert.equal(matriz[0].resolucao[qualidade].status, "OK");
    assert.equal(matriz[0].resolucao[qualidade].id_item, itensPorQualidade[qualidade].id);
  }
});

testeComBanco("Ingredientes: recurso sem ForgeBarItem em alguma qualidade fica 'Ausente' e bloqueia ativação", async () => {
  const admin = await criarUsuarioAdmin();
  const chave = sufixo();
  const recurso = await ExpeditionResource.create({ nome: `Minerio Furado ${chave}`, profissao: "Mineracao" });
  // Só cria a barra Comum — as outras 5 qualidades ficam sem mapeamento.
  const itemComum = await Item.create({
    nome: `Barra Furada ${chave}`, descricao: "teste", tipo_item: "Material", raridade: "Comum",
    valor_compra: 0, valor_venda: 0, peso: 1, disponivel_loja: false,
  });
  await ForgeBarItem.create({ id_recurso: recurso.id, qualidade: "Comum", id_item: itemComum.id });

  const blueprint = await adminForgeService.criarBlueprintAdmin(
    {
      nome: `Blueprint Furado ${sufixo()}`,
      categoria_equipamento: "Arma",
      tier_equipamento: 3,
      multiplicador_tempo: 1,
      nivel_forja_minimo: 1,
      ingredientes: [{ tipo_insumo: "Barra", id_recurso: recurso.id, quantidade_base: 1 }],
    },
    { idAdmin: admin.id },
  );
  blueprintsCriados.push(blueprint.id);

  const itens = {};
  for (const qualidade of forgeConfig.ORDEM_QUALIDADE) itens[qualidade] = (await criarItemArma(qualidade, 3)).id;
  await adminForgeService.atualizarBlueprintAdmin(blueprint.id, { resultados: itens }, { idAdmin: admin.id });

  const relatorio = await adminForgeService.validarBlueprintAdmin(blueprint.id);
  assert.equal(relatorio.podeAtivar, false, "ingrediente não resolvível em 5/6 qualidades deve bloquear ativação");
  await assert.rejects(() => adminForgeService.setAtivoBlueprintAdmin(blueprint.id, true, { idAdmin: admin.id }), /Não é possível ativar/);
});

testeComBanco("duplicarBlueprintAdmin: cópia nasce inativa e recebe nome provisório único", async () => {
  const admin = await criarUsuarioAdmin();
  const { recurso } = await montarRecursoBarraCompleto();
  const nomeOriginal = `Blueprint Duplicável ${sufixo()}`;
  const original = await adminForgeService.criarBlueprintAdmin(
    { nome: nomeOriginal, categoria_equipamento: "Escudo", tier_equipamento: 4, multiplicador_tempo: 1, nivel_forja_minimo: 1, ingredientes: [{ tipo_insumo: "Barra", id_recurso: recurso.id, quantidade_base: 1 }] },
    { idAdmin: admin.id },
  );
  blueprintsCriados.push(original.id);

  const copia = await adminForgeService.duplicarBlueprintAdmin(original.id, { idAdmin: admin.id });
  blueprintsCriados.push(copia.id);

  assert.equal(copia.ativo, false);
  assert.notEqual(copia.id, original.id);
  assert.notEqual(copia.nome, original.nome);
  assert.ok(copia.nome.startsWith(nomeOriginal));

  const log = await AdminActionLog.findOne({ where: { entidade: "ForgeBlueprint", id_entidade: copia.id, acao: "DUPLICATE_BLUEPRINT" } });
  assert.ok(log);
  assert.equal(log.dados_antes.origemId, original.id);
});

testeComBanco("desativar/reativar preserva histórico (nunca deleta fisicamente) e reativar revalida", async () => {
  const admin = await criarUsuarioAdmin();
  const { recurso } = await montarRecursoBarraCompleto();
  const blueprint = await adminForgeService.criarBlueprintAdmin(
    { nome: `Blueprint Ciclo ${sufixo()}`, categoria_equipamento: "Capacete", tier_equipamento: 1, multiplicador_tempo: 1, nivel_forja_minimo: 1, ingredientes: [{ tipo_insumo: "Barra", id_recurso: recurso.id, quantidade_base: 1 }] },
    { idAdmin: admin.id },
  );
  blueprintsCriados.push(blueprint.id);
  const itens = {};
  for (const qualidade of forgeConfig.ORDEM_QUALIDADE) {
    const item = await Item.create({
      nome: `Capacete Teste ${sufixo()} ${qualidade}`, descricao: "teste", tipo_item: "Capacete", raridade: qualidade, tier_equipamento: 1,
      valor_compra: 0, valor_venda: 0, peso: 1, disponivel_loja: false,
    });
    const ArmorProperties = require("../src/models/ArmorProperties");
    await ArmorProperties.create({ id_item: item.id, slot_equipamento: "Cabeca", defesa: 1 });
    itens[qualidade] = item.id;
  }
  await adminForgeService.atualizarBlueprintAdmin(blueprint.id, { resultados: itens }, { idAdmin: admin.id });
  await adminForgeService.setAtivoBlueprintAdmin(blueprint.id, true, { idAdmin: admin.id });

  const desativado = await adminForgeService.setAtivoBlueprintAdmin(blueprint.id, false, { idAdmin: admin.id, motivo: "teste" });
  assert.equal(desativado.ativo, false);
  const aindaExiste = await ForgeBlueprint.findByPk(blueprint.id);
  assert.ok(aindaExiste, "desativar nunca deleta fisicamente");

  const reativado = await adminForgeService.setAtivoBlueprintAdmin(blueprint.id, true, { idAdmin: admin.id });
  assert.equal(reativado.ativo, true);

  const logDesativar = await AdminActionLog.findOne({ where: { entidade: "ForgeBlueprint", id_entidade: blueprint.id, acao: "DEACTIVATE_BLUEPRINT" } });
  assert.ok(logDesativar);
  assert.equal(logDesativar.motivo, "teste");
});

// -----------------------------------------------------------------
// Bug "FORJA - CORREÇÃO EXCLUA TODOS OS BLUEPRINTS EXISTENTES NA
// FORJA, ATIVOS OU INATIVOS" — antes desta correção não existia
// exclusão de verdade nenhuma (só ativar/desativar).
// -----------------------------------------------------------------

testeComBanco("excluirBlueprintAdmin: exclui de verdade (não é desativar) e limpa ingredientes/resultados em cascata", async () => {
  const admin = await criarUsuarioAdmin();
  const { recurso } = await montarRecursoBarraCompleto();
  const blueprint = await adminForgeService.criarBlueprintAdmin(
    { nome: `Blueprint Excluir ${sufixo()}`, categoria_equipamento: "Arma", tier_equipamento: 3, multiplicador_tempo: 1, nivel_forja_minimo: 1, ingredientes: [{ tipo_insumo: "Barra", id_recurso: recurso.id, quantidade_base: 1 }] },
    { idAdmin: admin.id },
  );

  const resultado = await adminForgeService.excluirBlueprintAdmin(blueprint.id, { idAdmin: admin.id, motivo: "teste" });
  assert.deepEqual(resultado, { id: blueprint.id, excluido: true });

  assert.equal(await ForgeBlueprint.findByPk(blueprint.id), null, "excluir precisa remover de verdade, ao contrário de desativar");
  const ingredientesRestantes = await ForgeBlueprintIngredient.count({ where: { id_blueprint: blueprint.id } });
  assert.equal(ingredientesRestantes, 0, "ingredientes deviam ter sido removidos em cascata");

  const log = await AdminActionLog.findOne({ where: { entidade: "ForgeBlueprint", id_entidade: blueprint.id, acao: "DELETE_BLUEPRINT" } });
  assert.ok(log, "DELETE_BLUEPRINT precisa ser auditado");
  assert.equal(log.dados_depois, null);
  assert.equal(log.dados_antes.nome, blueprint.nome, "audit log precisa preservar o blueprint excluído (before)");
  assert.equal(log.motivo, "teste");
});

testeComBanco("excluirBlueprintAdmin: também exclui um blueprint ATIVO (nunca exige desativar primeiro)", async () => {
  const admin = await criarUsuarioAdmin();
  const { recurso } = await montarRecursoBarraCompleto();
  const blueprint = await adminForgeService.criarBlueprintAdmin(
    { nome: `Blueprint Ativo Excluir ${sufixo()}`, categoria_equipamento: "Capacete", tier_equipamento: 2, multiplicador_tempo: 1, nivel_forja_minimo: 1, ingredientes: [{ tipo_insumo: "Barra", id_recurso: recurso.id, quantidade_base: 1 }] },
    { idAdmin: admin.id },
  );
  const itens = {};
  const ArmorProperties = require("../src/models/ArmorProperties");
  for (const qualidade of forgeConfig.ORDEM_QUALIDADE) {
    const item = await Item.create({
      nome: `Capacete Excluir ${sufixo()} ${qualidade}`, descricao: "teste", tipo_item: "Capacete", raridade: qualidade, tier_equipamento: 2,
      valor_compra: 0, valor_venda: 0, peso: 1, disponivel_loja: false,
    });
    await ArmorProperties.create({ id_item: item.id, slot_equipamento: "Cabeca", defesa: 1 });
    itens[qualidade] = item.id;
  }
  await adminForgeService.atualizarBlueprintAdmin(blueprint.id, { resultados: itens }, { idAdmin: admin.id });
  await adminForgeService.setAtivoBlueprintAdmin(blueprint.id, true, { idAdmin: admin.id });

  await adminForgeService.excluirBlueprintAdmin(blueprint.id, { idAdmin: admin.id });
  assert.equal(await ForgeBlueprint.findByPk(blueprint.id), null);
});

testeComBanco("excluirBlueprintAdmin: blueprint inexistente lança 404", async () => {
  await assert.rejects(
    () => adminForgeService.excluirBlueprintAdmin(999999999, { idAdmin: 1 }),
    (erro) => erro.statusCode === 404,
  );
});

testeComBanco("excluirTodosBlueprintsAdmin: remove TODOS, ativos e inativos, com um audit log por blueprint", async () => {
  const admin = await criarUsuarioAdmin();
  const { recurso } = await montarRecursoBarraCompleto();

  const inativo = await adminForgeService.criarBlueprintAdmin(
    { nome: `Blueprint Massa Inativo ${sufixo()}`, categoria_equipamento: "Arma", tier_equipamento: 3, multiplicador_tempo: 1, nivel_forja_minimo: 1, ingredientes: [{ tipo_insumo: "Barra", id_recurso: recurso.id, quantidade_base: 1 }] },
    { idAdmin: admin.id },
  );
  const paraAtivar = await adminForgeService.criarBlueprintAdmin(
    { nome: `Blueprint Massa Ativo ${sufixo()}`, categoria_equipamento: "Acessorio1", tier_equipamento: 4, multiplicador_tempo: 1, nivel_forja_minimo: 1, ingredientes: [{ tipo_insumo: "Barra", id_recurso: recurso.id, quantidade_base: 1 }] },
    { idAdmin: admin.id },
  );
  const itens = {};
  const ArmorPropertiesMassa = require("../src/models/ArmorProperties");
  for (const qualidade of forgeConfig.ORDEM_QUALIDADE) {
    const item = await Item.create({
      nome: `Acessorio Massa ${sufixo()} ${qualidade}`, descricao: "teste", tipo_item: "Acessorio1", raridade: qualidade, tier_equipamento: 4,
      valor_compra: 0, valor_venda: 0, peso: 0.1, disponivel_loja: false,
    });
    await ArmorPropertiesMassa.create({ id_item: item.id, slot_equipamento: "Acessorio1", defesa: 1 });
    itens[qualidade] = item.id;
  }
  await adminForgeService.atualizarBlueprintAdmin(paraAtivar.id, { resultados: itens }, { idAdmin: admin.id });
  const ativo = await adminForgeService.setAtivoBlueprintAdmin(paraAtivar.id, true, { idAdmin: admin.id });
  assert.equal(ativo.ativo, true);

  const antesTotal = await ForgeBlueprint.count();
  assert.ok(antesTotal >= 2);

  const resultado = await adminForgeService.excluirTodosBlueprintsAdmin({ idAdmin: admin.id });
  assert.equal(resultado.total, antesTotal);
  assert.equal(resultado.excluidos, antesTotal);

  assert.equal(await ForgeBlueprint.count(), 0, "exclusão em massa precisa remover TODOS, sem sobrar nenhum ativo");

  const logInativo = await AdminActionLog.findOne({ where: { entidade: "ForgeBlueprint", id_entidade: inativo.id, acao: "DELETE_BLUEPRINT" } });
  const logAtivo = await AdminActionLog.findOne({ where: { entidade: "ForgeBlueprint", id_entidade: paraAtivar.id, acao: "DELETE_BLUEPRINT" } });
  assert.ok(logInativo, "cada blueprint excluído em massa precisa do próprio audit log individual");
  assert.ok(logAtivo, "o blueprint ATIVO também precisa ter sido excluído e auditado, não só os inativos");
});

testeComBanco("Transaction: falha ao atualizar resultados com qualidade inválida não persiste nada parcial", async () => {
  const admin = await criarUsuarioAdmin();
  const { recurso } = await montarRecursoBarraCompleto();
  const blueprint = await adminForgeService.criarBlueprintAdmin(
    { nome: `Blueprint Atômico ${sufixo()}`, categoria_equipamento: "Acessorio1", tier_equipamento: 3, multiplicador_tempo: 2, nivel_forja_minimo: 1, ingredientes: [{ tipo_insumo: "Barra", id_recurso: recurso.id, quantidade_base: 1 }] },
    { idAdmin: admin.id },
  );
  blueprintsCriados.push(blueprint.id);

  await assert.rejects(
    () => adminForgeService.atualizarBlueprintAdmin(blueprint.id, { multiplicador_tempo: 99, resultados: { QualidadeInvalida: 1 } }, { idAdmin: admin.id }),
    /Qualidade de resultado inválida/,
  );

  const recarregado = await ForgeBlueprint.findByPk(blueprint.id);
  assert.equal(recarregado.multiplicador_tempo, 2, "multiplicador_tempo não pode ter sido salvo — validação falhou ANTES da transaction abrir");
});

// -----------------------------------------------------------------
// Pergaminhos (§8)
// -----------------------------------------------------------------

testeComBanco("Pergaminhos: criar/editar/duplicar/desativar/reativar + ativo respeita cap de chance", async () => {
  const admin = await criarUsuarioAdmin();
  const itemPergaminho = await Item.create({
    nome: `Pergaminho Teste ${sufixo()}`, descricao: "teste", tipo_item: "Consumivel", raridade: "Raro",
    valor_compra: 0, valor_venda: 0, peso: 0.1, disponivel_loja: false,
  });

  const scroll = await adminForgeService.criarScrollAdmin(
    { id_item: itemPergaminho.id, bonus_percentual: 10, nivel_forja_minimo: 3, tempo_segundos: 60 },
    { idAdmin: admin.id },
  );
  scrollsCriados.push(scroll.id_item);
  assert.equal(scroll.ativo, true);

  await adminForgeService.setAtivoScrollAdmin(scroll.id_item, false, { idAdmin: admin.id });
  const listaAtivos = await adminForgeService.listarScrollsAdmin({ ativo: true });
  assert.ok(!listaAtivos.some((s) => s.id_item === scroll.id_item), "desativado não pode aparecer na listagem de ativos");

  const reativado = await adminForgeService.setAtivoScrollAdmin(scroll.id_item, true, { idAdmin: admin.id });
  assert.equal(reativado.ativo, true);

  // Cap de chance — bônus absurdo (200%) sozinho já estoura o cap vigente.
  const itemPergaminhoOp = await Item.create({
    nome: `Pergaminho OP ${sufixo()}`, descricao: "teste", tipo_item: "Consumivel", raridade: "Mitico",
    valor_compra: 0, valor_venda: 0, peso: 0.1, disponivel_loja: false,
  });
  const scrollOp = await adminForgeService.criarScrollAdmin(
    { id_item: itemPergaminhoOp.id, bonus_percentual: 200, nivel_forja_minimo: 10, tempo_segundos: 60 },
    { idAdmin: admin.id },
  );
  scrollsCriados.push(scrollOp.id_item);
  const listaComFlag = await adminForgeService.listarScrollsAdmin({});
  const linha = listaComFlag.find((s) => s.id_item === scrollOp.id_item);
  assert.equal(linha.excede_cap_sozinho, true, "bonus_percentual 200% precisa ser sinalizado — chanceFinalRefinamentoPpm sempre aplica o cap real de qualquer forma");

  const logCriar = await AdminActionLog.findOne({ where: { entidade: "ForgeScroll", id_entidade: scroll.id_item, acao: "CREATE_SCROLL" } });
  assert.ok(logCriar);
});

// -----------------------------------------------------------------
// Refinamento — preview Admin usa a MESMA função de gameplay (§9.1/§18)
// -----------------------------------------------------------------

testeComBanco("previewRefinamentoAdmin bate exatamente com forgeRollService.chanceFinalRefinamentoPpm (mesma função)", async () => {
  const preview = await adminForgeService.previewRefinamentoAdmin({
    categoria: "Arma",
    qualidade: "Raro",
    refinamentoAtual: 4,
    nivelForja: 7,
  });
  const chanceReal = forgeRollService.chanceFinalRefinamentoPpm(5, 7, 0);
  assert.equal(preview.alvo, 5);
  assert.equal(Math.round(preview.chance_final_percentual * 10_000), chanceReal, "preview precisa bater com a função real usada no gameplay");
});

testeComBanco("previewRefinamentoAdmin: alvo garantido (+1 a +3) sempre 100%, mesmo mudando nivelForja", async () => {
  const preview = await adminForgeService.previewRefinamentoAdmin({ categoria: "Armadura", qualidade: "Comum", refinamentoAtual: 0, nivelForja: 1 });
  assert.equal(preview.alvo, 1);
  assert.equal(preview.garantido, true);
  assert.equal(preview.chance_final_percentual, 100);
});

// -----------------------------------------------------------------
// RNG de fabricação — soma PPM = 1.000.000 (§11.1)
// -----------------------------------------------------------------

testeComBanco("updateBalanceamento(forge.crafting) bloqueia salvar se a soma de PPM não fechar 1.000.000", async () => {
  const admin = await criarUsuarioAdmin();
  await assert.rejects(
    () =>
      adminForgeService.updateBalanceamentoAdmin(
        "forge.crafting",
        { CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL: { 1: { mesma: 500_000, mais1: 100_000, mais2: 0, mais3: 0, mais4: 0, mais5: 0 } } },
        { idAdmin: admin.id },
      ),
    /precisa ser exatamente 1\.000\.000/,
  );
});

testeComBanco("updateBalanceamento(forge.crafting) salva quando a soma fecha 1.000.000 e aplica no forgeConfig ao vivo", async () => {
  const admin = await criarUsuarioAdmin();
  const tabelaOriginal = { ...forgeConfig.CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL[1] };
  try {
    const resultado = await adminForgeService.updateBalanceamentoAdmin(
      "forge.crafting",
      { CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL: { 1: { mesma: 900_000, mais1: 100_000, mais2: 0, mais3: 0, mais4: 0, mais5: 0 } } },
      { idAdmin: admin.id },
    );
    assert.equal(resultado.atual.CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL[1].mais1, 100_000);
    assert.equal(forgeConfig.CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL[1].mais1, 100_000, "override precisa valer AO VIVO sem reiniciar o processo");

    const log = await AdminActionLog.findOne({ where: { entidade: "GameSetting", acao: "UPDATE_FORGE_BALANCE" }, order: [["id", "DESC"]] });
    assert.ok(log);
  } finally {
    // devolve ao valor original pra não vazar estado entre testes/gameplay real.
    await adminForgeService.updateBalanceamentoAdmin(
      "forge.crafting",
      { CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL: { 1: tabelaOriginal } },
      { idAdmin: admin.id },
    );
    await GameSetting.destroy({ where: { chave: "forge.crafting" } });
  }
});

// -----------------------------------------------------------------
// Progressão — preview de impacto (§11.2)
// -----------------------------------------------------------------

testeComBanco("previewImpactoProgressaoAdmin: personagem no limiar do nível muda de lado quando a curva muda", async () => {
  const { personagem } = await criarPersonagem();
  const xpParaNivel3 = forgeConfig.XP_TOTAL_PARA_NIVEL[3];
  await CharacterForgeProgress.create({ id_personagem: personagem.id, nivel: 3, experiencia: xpParaNivel3 });

  const novaCurva = { ...forgeConfig.XP_NECESSARIO_POR_ETAPA };
  novaCurva[2] = novaCurva[2] + 10_000; // dobra bem o requisito do degrau 2->3, empurra esse personagem pra baixo

  const preview = await adminForgeService.previewImpactoProgressaoAdmin(novaCurva);
  assert.ok(preview.total_personagens >= 1);
  assert.ok(preview.personagens_descem >= 1, "aumentar o requisito de XP precisa derrubar quem estava exatamente no limiar");
  assert.equal(forgeConfig.XP_NECESSARIO_POR_ETAPA[2], forgeConfig.XP_NECESSARIO_POR_ETAPA[2], "preview nunca persiste nada — curva real continua igual");
});

testeComBanco("updateBalanceamento(forge.progression) exige confirmado:true", async () => {
  const admin = await criarUsuarioAdmin();
  await assert.rejects(
    () => adminForgeService.updateBalanceamentoAdmin("forge.progression", { XP_NECESSARIO_POR_ETAPA: { 1: 999 } }, { idAdmin: admin.id }),
    /confirmação explícita/,
  );
});
