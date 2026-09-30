// Profissão de Ferreiro (Especificação Ferreiro/Ferraria/Receitas v1) —
// cobertura dos testes obrigatórios do §18: progressão/anti-farm,
// Receitas, Ferraria e Perfil/Admin. Reaproveita os helpers já
// estabelecidos em test/helpers/db.js e o padrão de
// comSorteioForcado/definirNivelForja/criarEquipamento/prepararRecursos
// já usado em test/forgeRefinementScroll.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");
require("../src/controllers/guildController"); // registra Guild<->GuildMember (obterPerfilPublico usa)

const Item = require("../src/models/Item");
const ForgeBlueprint = require("../src/models/ForgeBlueprint");
const ForgeBlueprintIngredient = require("../src/models/ForgeBlueprintIngredient");
const ForgeRecipe = require("../src/models/ForgeRecipe");
const CharacterForgeRecipeUnlock = require("../src/models/CharacterForgeRecipeUnlock");
const CharacterForgeProgress = require("../src/models/CharacterForgeProgress");
const CharacterForgeQueue = require("../src/models/CharacterForgeQueue");
const CharacterForgeToolLoadout = require("../src/models/CharacterForgeToolLoadout");
const CharacterInventory = require("../src/models/CharacterInventory");
const CharacterEquipmentInstance = require("../src/models/CharacterEquipmentInstance");
const ForgeToolProperties = require("../src/models/ForgeToolProperties");
const ForgeToolEffect = require("../src/models/ForgeToolEffect");
const ExpeditionResource = require("../src/models/ExpeditionResource");
const ForgeBarItem = require("../src/models/ForgeBarItem");

const forgeConfig = require("../src/config/forgeConfig");
const { XP_TOTAL_PARA_NIVEL } = forgeConfig;
const { nivelPorXpTotal, tituloPorNivel } = require("../src/services/forgeProgressionService");
const forgeSmeltingService = require("../src/services/forgeSmeltingService");
const forgeCraftingService = require("../src/services/forgeCraftingService");
const forgeRefinementService = require("../src/services/forgeRefinementService");
const forgeService = require("../src/services/forgeService");
const forgeRecipeService = require("../src/services/forgeRecipeService");
const forgeToolService = require("../src/services/forgeToolService");
const forgeStatsService = require("../src/services/forgeStatsService");
const equipmentInstanceService = require("../src/services/equipmentInstanceService");
const adminForgeService = require("../src/services/adminForgeService");
const characterProfileService = require("../src/services/characterProfileService");

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

async function definirNivelForja(idPersonagem, nivel) {
  await CharacterForgeProgress.create({ id_personagem: idPersonagem, nivel, experiencia: XP_TOTAL_PARA_NIVEL[nivel] });
}

async function comSorteioForcado(sucesso, fn) {
  const original = crypto.randomInt;
  crypto.randomInt = () => (sucesso ? 0 : 999_999);
  try {
    return await fn();
  } finally {
    crypto.randomInt = original;
  }
}

// Blueprint de Fabricação real e completo (ingrediente resolvível via
// Barra de Ferro Comum, já seedada no catálogo base — ver
// ForgeBarItem/ExpeditionResource).
async function criarBlueprintFabricacao({ nivelForjaMinimo = 1, tierEquipamento = 3, modoDesbloqueio = "Auto" } = {}) {
  const recursoFerro = await ExpeditionResource.findOne({ where: { nome: "Ferro", profissao: "Mineracao" } });
  const barraComum = await ForgeBarItem.findOne({ where: { id_recurso: recursoFerro.id, qualidade: "Comum" } });

  const itemResultado = await Item.create({
    nome: `Espada Ferreiro Teste ${sufixo()}`,
    descricao: "teste",
    tipo_item: "Arma",
    raridade: "Comum",
    valor_compra: 0,
    valor_venda: 0,
    peso: 1,
    tier_equipamento: tierEquipamento,
  });
  const blueprint = await ForgeBlueprint.create({
    nome: `Blueprint Ferreiro Teste ${sufixo()}`,
    categoria_equipamento: "Arma",
    nivel_forja_minimo: nivelForjaMinimo,
    ativo: true,
    tier_equipamento: tierEquipamento,
    id_item_resultado: itemResultado.id,
    modo_desbloqueio: modoDesbloqueio,
  });
  await ForgeBlueprintIngredient.create({
    id_blueprint: blueprint.id,
    tipo_insumo: "Barra",
    id_recurso: recursoFerro.id,
    quantidade_base: 1,
  });
  return { blueprint, itemResultado, idItemBarra: barraComum.id_item };
}

async function darBarras(idPersonagem, idItemBarra, quantidade) {
  await CharacterInventory.create({ id_personagem: idPersonagem, id_item: idItemBarra, quantidade });
}

async function forcarFilaProntaAgora(idPersonagem, slot) {
  const entrada = await CharacterForgeQueue.findOne({ where: { id_personagem: idPersonagem, slot } });
  entrada.pronto_em = new Date(Date.now() - 1000);
  await entrada.save();
  return entrada;
}

// ---------------------------------------------------------------------
// §18.1 — Progressão (anti-farm e curva são funções puras: rodam mesmo
// sem TEST_DATABASE_URL).
// ---------------------------------------------------------------------

test("multiplicadorAntiFarmXp reduz XP quando o nível de Forja está muito acima do esperado pra qualidade", () => {
  assert.equal(forgeConfig.multiplicadorAntiFarmXp(1, "Comum"), 1); // nivel esperado 1, diferença 0
  assert.equal(forgeConfig.multiplicadorAntiFarmXp(3, "Comum"), 1); // diferença 2 -> ainda 100%
  assert.equal(forgeConfig.multiplicadorAntiFarmXp(6, "Comum"), 0.5); // diferença 5 -> 50%
  assert.equal(forgeConfig.multiplicadorAntiFarmXp(9, "Comum"), 0.1); // diferença 8 -> 10%
  assert.equal(forgeConfig.multiplicadorAntiFarmXp(10, "Comum"), 0); // diferença 9 -> 0%
});

test("multiplicadorAntiFarmRefinamentoXp reduz XP de sucesso quando o alvo está muito abaixo do nível de Forja", () => {
  assert.equal(forgeConfig.multiplicadorAntiFarmRefinamentoXp(1, 1), 1);
  assert.equal(forgeConfig.multiplicadorAntiFarmRefinamentoXp(10, 1), 0); // alvo+1 espera nível 1, personagem nível 10 -> diferença 9
});

test("nivelPorXpTotal permanece consistente com XP_TOTAL_PARA_NIVEL em todos os degraus", () => {
  for (let nivel = 1; nivel <= forgeConfig.NIVEL_MAXIMO; nivel += 1) {
    assert.equal(nivelPorXpTotal(XP_TOTAL_PARA_NIVEL[nivel]), nivel);
    if (XP_TOTAL_PARA_NIVEL[nivel] > 0) assert.equal(nivelPorXpTotal(XP_TOTAL_PARA_NIVEL[nivel] - 1), nivel - 1);
  }
});

test("tituloPorNivel segue a tabela §3.2 (Aprendiz -> Grão-Mestre Ferreiro)", () => {
  assert.equal(tituloPorNivel(1), "Aprendiz");
  assert.equal(tituloPorNivel(4), "Ferreiro");
  assert.equal(tituloPorNivel(6), "Artesão");
  assert.equal(tituloPorNivel(8), "Mestre Ferreiro");
  assert.equal(tituloPorNivel(9), "Mestre Artesão");
  assert.equal(tituloPorNivel(10), "Grão-Mestre Ferreiro");
});

testeComBanco("Fundição concede XP correto e reduzido pelo anti-farm quando nível muito acima", async () => {
  const { personagem } = await criarPersonagem();
  await definirNivelForja(personagem.id, 1);
  const recursoFerro = await ExpeditionResource.findOne({ where: { nome: "Ferro", profissao: "Mineracao" } });
  const fragmentoComum = await require("../src/models/ExpeditionResourceItem").findOne({
    where: { id_recurso: recursoFerro.id, qualidade: "Comum" },
  });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: fragmentoComum.id_item, quantidade: 1000 });

  const resultado = await comSorteioForcado(false, () =>
    forgeSmeltingService.fundir(personagem.id, { id_recurso: recursoFerro.id, qualidade: "Comum", quantidadeBarras: 1 }),
  );
  assert.equal(resultado.xp_ganho, forgeConfig.XP_FUNDICAO_POR_QUALIDADE_BARRA.Comum); // nível 1 == esperado -> 100%

  // Nível 10 fundindo Comum (esperado nível 1): diferença 9 -> anti-farm zera o XP.
  const { personagem: personagemAlto } = await criarPersonagem();
  await definirNivelForja(personagemAlto.id, 10);
  await CharacterInventory.create({ id_personagem: personagemAlto.id, id_item: fragmentoComum.id_item, quantidade: 1000 });
  const resultadoAlto = await comSorteioForcado(false, () =>
    forgeSmeltingService.fundir(personagemAlto.id, { id_recurso: recursoFerro.id, qualidade: "Comum", quantidadeBarras: 1 }),
  );
  assert.equal(resultadoAlto.xp_ganho, 0);
});

testeComBanco("Fabricação: XP não é concedido ao iniciar, só na coleta", async () => {
  const { personagem } = await criarPersonagem();
  await definirNivelForja(personagem.id, 1);
  const { blueprint, idItemBarra } = await criarBlueprintFabricacao();
  await darBarras(personagem.id, idItemBarra, 10);

  await forgeCraftingService.iniciarFabricacao(personagem.id, { id_blueprint: blueprint.id, qualidade: "Comum" });
  const progressoAposIniciar = await CharacterForgeProgress.findOne({ where: { id_personagem: personagem.id } });
  assert.equal(progressoAposIniciar.experiencia, XP_TOTAL_PARA_NIVEL[1]);

  await forcarFilaProntaAgora(personagem.id, "Forja");
  const resultadoColeta = await comSorteioForcado(false, () => forgeService.coletar(personagem.id, "Forja"));
  assert.ok(resultadoColeta.xp_ganho > 0, "coleta precisa conceder XP > 0");
  const progressoAposColeta = await CharacterForgeProgress.findOne({ where: { id_personagem: personagem.id } });
  assert.ok(progressoAposColeta.experiencia > progressoAposIniciar.experiencia);
});

testeComBanco("Refinamento: sucesso concede XP com anti-farm, falha concede sempre 0", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem.id, 4);
  const item = await Item.create({
    nome: `Espada Refino Teste ${sufixo()}`, descricao: "teste", tipo_item: "Arma", raridade: "Raro",
    valor_compra: 0, valor_venda: 0, peso: 1,
  });
  const instancia = await CharacterEquipmentInstance.create({
    id_personagem: personagem.id, id_item: item.id, refinamento: 0, estado: "Inventario",
  });
  const info = await forgeRefinementService.calcularMateriaisNecessarios(instancia, null);
  for (const material of info.materiais) {
    await CharacterInventory.create({ id_personagem: personagem.id, id_item: material.id_item, quantidade: material.quantidade * 10 });
  }
  personagem.dinheiro = info.ouro * 10;
  await personagem.save();

  await comSorteioForcado(true, () => forgeRefinementService.iniciarRefinamento(personagem.id, { id_instancia: instancia.id }));
  await forcarFilaProntaAgora(personagem.id, "Forja");
  const resultadoSucesso = await forgeService.coletar(personagem.id, "Forja");
  assert.equal(resultadoSucesso.sucesso, true);
  assert.ok(resultadoSucesso.xp_ganho > 0, "sucesso precisa conceder XP > 0");

  // Mesmo alvo, personagem diferente (CharacterInventory tem unique
  // (id_personagem, id_item) — reusar o mesmo personagem duplicaria a
  // linha de material já criada acima), tentativa forçada a falhar:
  // precisa conceder exatamente 0 XP (spec §3: nunca mais um percentual
  // do sucesso).
  const { personagem: personagem2 } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem2.id, 4);
  const item2 = await Item.create({
    nome: `Espada Refino Falha Teste ${sufixo()}`, descricao: "teste", tipo_item: "Arma", raridade: "Raro",
    valor_compra: 0, valor_venda: 0, peso: 1,
  });
  const instancia2 = await CharacterEquipmentInstance.create({
    id_personagem: personagem2.id, id_item: item2.id, refinamento: 6, estado: "Inventario", // alvo 7 — não é garantido (só 1/2/3)
  });
  const info2 = await forgeRefinementService.calcularMateriaisNecessarios(instancia2, null);
  for (const material of info2.materiais) {
    await CharacterInventory.create({ id_personagem: personagem2.id, id_item: material.id_item, quantidade: material.quantidade * 10 });
  }
  personagem2.dinheiro = info2.ouro * 10;
  await personagem2.save();

  await comSorteioForcado(false, () => forgeRefinementService.iniciarRefinamento(personagem2.id, { id_instancia: instancia2.id }));
  await forcarFilaProntaAgora(personagem2.id, "Forja");
  const resultadoFalha = await forgeService.coletar(personagem2.id, "Forja");
  assert.equal(resultadoFalha.sucesso, false);
  assert.equal(resultadoFalha.xp_ganho, 0, "falha de Refinamento sempre concede 0 XP");
});

// ---------------------------------------------------------------------
// §18.2 — Receitas
// ---------------------------------------------------------------------

async function criarReceita({ nivelForjaMinimo = 5, raridade = "Raro" } = {}) {
  const { blueprint, itemResultado, idItemBarra } = await criarBlueprintFabricacao({ nivelForjaMinimo, modoDesbloqueio: "Receita" });
  const itemReceita = await Item.create({
    nome: `Projeto Teste ${sufixo()}`, descricao: "teste", tipo_item: "Receita", raridade,
    valor_compra: 0, valor_venda: 0, peso: 0,
  });
  const receita = await ForgeRecipe.create({
    id_blueprint: blueprint.id, id_item: itemReceita.id, raridade_receita: raridade,
    negociavel: true, consome_ao_aprender: true, ativo: true,
  });
  return { blueprint, itemResultado, idItemBarra, itemReceita, receita };
}

testeComBanco("Receita: personagem abaixo do nível não consegue aprender e não perde o Item", async () => {
  const { personagem } = await criarPersonagem();
  await definirNivelForja(personagem.id, 3);
  const { itemReceita } = await criarReceita({ nivelForjaMinimo: 5 });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: itemReceita.id, quantidade: 1 });

  await assert.rejects(() => forgeRecipeService.aprenderReceita(personagem.id, itemReceita.id), /Nível de Ferreiro/);
  const entrada = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: itemReceita.id } });
  assert.equal(entrada.quantidade, 1, "item de Receita não pode ser consumido numa tentativa que falhou por nível");
});

testeComBanco("Receita: personagem no nível correto aprende, consome o Item e cria unlock único", async () => {
  const { personagem } = await criarPersonagem();
  await definirNivelForja(personagem.id, 5);
  const { blueprint, itemReceita } = await criarReceita({ nivelForjaMinimo: 5 });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: itemReceita.id, quantidade: 1 });

  await forgeRecipeService.aprenderReceita(personagem.id, itemReceita.id);
  const entrada = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: itemReceita.id } });
  assert.equal(entrada, null, "item de Receita precisa ser consumido ao aprender");

  const unlocks = await CharacterForgeRecipeUnlock.findAll({ where: { id_personagem: personagem.id, id_blueprint: blueprint.id } });
  assert.equal(unlocks.length, 1);
});

testeComBanco("Receita: duplicata já conhecida nunca é consumida de novo", async () => {
  const { personagem } = await criarPersonagem();
  await definirNivelForja(personagem.id, 5);
  const { blueprint, itemReceita } = await criarReceita({ nivelForjaMinimo: 5 });
  await CharacterForgeRecipeUnlock.create({ id_personagem: personagem.id, id_blueprint: blueprint.id, source_type: "OTHER" });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: itemReceita.id, quantidade: 1 });

  await assert.rejects(() => forgeRecipeService.aprenderReceita(personagem.id, itemReceita.id), /já conhece/);
  const entrada = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: itemReceita.id } });
  assert.equal(entrada.quantidade, 1, "duplicata de Receita já conhecida não pode ser consumida");
  const unlocks = await CharacterForgeRecipeUnlock.count({ where: { id_personagem: personagem.id, id_blueprint: blueprint.id } });
  assert.equal(unlocks, 1, "nunca cria um segundo unlock pro mesmo blueprint");
});

testeComBanco("Blueprint em modo Receita continua bloqueado pra fabricar sem o unlock, e fica INVISÍVEL na listagem (não é um card bloqueado, o jogador nem deve saber que existe)", async () => {
  const { personagem } = await criarPersonagem();
  await definirNivelForja(personagem.id, 10); // nível de sobra — só falta a Receita
  const { blueprint, idItemBarra } = await criarReceita({ nivelForjaMinimo: 1 });
  await darBarras(personagem.id, idItemBarra, 10);

  await assert.rejects(
    () => forgeCraftingService.iniciarFabricacao(personagem.id, { id_blueprint: blueprint.id, qualidade: "Comum" }),
    /Receita/,
  );

  const listagemAntes = await forgeCraftingService.listarBlueprints(personagem.id, "Arma");
  assert.equal(
    listagemAntes.find((b) => b.id === blueprint.id),
    undefined,
    "sem o unlock, o blueprint nem aparece na listagem — spoiler de item secreto",
  );

  await CharacterForgeRecipeUnlock.create({ id_personagem: personagem.id, id_blueprint: blueprint.id, source_type: "OTHER" });
  const resultado = await forgeCraftingService.iniciarFabricacao(personagem.id, { id_blueprint: blueprint.id, qualidade: "Comum" });
  assert.ok(resultado.pronto_em, "com o unlock, a fabricação precisa funcionar normalmente");

  const listagemDepois = await forgeCraftingService.listarBlueprints(personagem.id, "Arma");
  const linha = listagemDepois.find((b) => b.id === blueprint.id);
  assert.ok(linha, "com o unlock, o blueprint passa a aparecer na listagem");
  assert.equal(linha.requires_recipe, true);
  assert.equal(linha.recipe_learned, true);
  assert.equal(linha.can_craft, true);
  assert.equal(linha.block_reason, null);
});

testeComBanco("listarBlueprints: Receita não aprendida fica invisível mesmo com nível de sobra; nível insuficiente some junto até aprender a Receita", async () => {
  const { personagem } = await criarPersonagem();
  await definirNivelForja(personagem.id, 1);
  const { blueprint } = await criarReceita({ nivelForjaMinimo: 8 });

  const listagemSemUnlock = await forgeCraftingService.listarBlueprints(personagem.id, "Arma");
  assert.equal(
    listagemSemUnlock.find((b) => b.id === blueprint.id),
    undefined,
    "Receita não aprendida esconde o blueprint mesmo faltando também o nível",
  );

  await CharacterForgeRecipeUnlock.create({ id_personagem: personagem.id, id_blueprint: blueprint.id, source_type: "OTHER" });
  const listagemComUnlock = await forgeCraftingService.listarBlueprints(personagem.id, "Arma");
  const linha = listagemComUnlock.find((b) => b.id === blueprint.id);
  assert.ok(linha, "depois do unlock, o blueprint aparece (mesmo ainda bloqueado por nível)");
  assert.equal(linha.block_reason, "LEVEL_TOO_LOW", "com a Receita já aprendida, volta a valer o bloqueio normal de nível");
});

// ---------------------------------------------------------------------
// §18.3 — Ferraria
// ---------------------------------------------------------------------

async function criarFerramenta({ slot = "Fole", nivelMinimo = 1, effectKey = "SMELTING_BONUS_BAR_PPM", valorPpm = 50_000 } = {}) {
  const item = await Item.create({
    nome: `Ferramenta Teste ${sufixo()}`, descricao: "teste", tipo_item: "Ferramenta", raridade: "Comum",
    valor_compra: 0, valor_venda: 0, peso: 1,
  });
  await ForgeToolProperties.create({ id_item: item.id, slot, nivel_ferreiro_minimo: nivelMinimo, ativo: true });
  await ForgeToolEffect.create({ id_item: item.id, effect_key: effectKey, valor_ppm: valorPpm });
  return item;
}

testeComBanco("Ferramenta respeita slot e nível mínimo — equipar com nível insuficiente falha", async () => {
  const { personagem } = await criarPersonagem();
  await definirNivelForja(personagem.id, 3);
  const item = await criarFerramenta({ slot: "Fole", nivelMinimo: 8 });
  const instancia = await sequelize.transaction((t) => equipmentInstanceService.create({ idPersonagem: personagem.id, idItem: item.id, raridade: "Comum" }, t));

  await assert.rejects(() => forgeToolService.equiparFerramenta(personagem.id, instancia.id), /Nível de Ferreiro/);
});

testeComBanco("Ferramenta nunca desbloqueia Blueprint/Receita acima do Nível de Ferreiro real", async () => {
  const { personagem } = await criarPersonagem();
  await definirNivelForja(personagem.id, 10); // nível de Ferreiro alto
  const ferramenta = await criarFerramenta({ slot: "Martelo", nivelMinimo: 1, effectKey: "CRAFTING_QUALITY_BONUS_PPM", valorPpm: 100_000 });
  const instancia = await sequelize.transaction((t) => equipmentInstanceService.create({ idPersonagem: personagem.id, idItem: ferramenta.id, raridade: "Comum" }, t));
  await forgeToolService.equiparFerramenta(personagem.id, instancia.id);

  const { blueprint, idItemBarra } = await criarReceita({ nivelForjaMinimo: 1 }); // exige Receita, nunca ferramenta
  await darBarras(personagem.id, idItemBarra, 10);
  await assert.rejects(
    () => forgeCraftingService.iniciarFabricacao(personagem.id, { id_blueprint: blueprint.id, qualidade: "Comum" }),
    /Receita/,
    "Martelo equipado não pode substituir o desbloqueio de Receita",
  );
});

testeComBanco("Bônus da Ferraria é calculado pelo backend e afeta a Fundição real", async () => {
  const { personagem } = await criarPersonagem();
  await definirNivelForja(personagem.id, 1); // CHANCE_BARRA_BONUS_PPM_POR_NIVEL[1] = 0
  const ferramenta = await criarFerramenta({ slot: "Fole", nivelMinimo: 1, effectKey: "SMELTING_BONUS_BAR_PPM", valorPpm: 1_000_000 }); // garante bônus
  const instancia = await sequelize.transaction((t) => equipmentInstanceService.create({ idPersonagem: personagem.id, idItem: ferramenta.id, raridade: "Comum" }, t));
  await forgeToolService.equiparFerramenta(personagem.id, instancia.id);

  const recursoFerro = await ExpeditionResource.findOne({ where: { nome: "Ferro", profissao: "Mineracao" } });
  const fragmentoComum = await require("../src/models/ExpeditionResourceItem").findOne({ where: { id_recurso: recursoFerro.id, qualidade: "Comum" } });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: fragmentoComum.id_item, quantidade: 1000 });

  // Sem a ferramenta, nível 1 nunca rola bônus (chance 0) — com Fole
  // dando +100% (1_000_000 ppm), toda barra produz +1 garantido mesmo
  // que o sorteio caia no valor mais alto possível.
  const resultado = await comSorteioForcado(false, () =>
    forgeSmeltingService.fundir(personagem.id, { id_recurso: recursoFerro.id, qualidade: "Comum", quantidadeBarras: 1 }),
  );
  assert.equal(resultado.barras_bonus, 1, "o bônus da ferramenta precisa valer na Fundição real, não só num preview");
});

testeComBanco("Cap de Refinamento continua sendo aplicado mesmo com bônus grande de ferramenta", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await definirNivelForja(personagem.id, 10);
  const ferramenta = await criarFerramenta({ slot: "Tenaz", nivelMinimo: 1, effectKey: "REFINEMENT_SUCCESS_BONUS_PPM", valorPpm: 1_000_000 });
  const instancia = await sequelize.transaction((t) => equipmentInstanceService.create({ idPersonagem: personagem.id, idItem: ferramenta.id, raridade: "Comum" }, t));
  await forgeToolService.equiparFerramenta(personagem.id, instancia.id);

  const itemArma = await Item.create({
    nome: `Espada Cap Teste ${sufixo()}`, descricao: "teste", tipo_item: "Arma", raridade: "Raro",
    valor_compra: 0, valor_venda: 0, peso: 1,
  });
  const instanciaArma = await CharacterEquipmentInstance.create({
    id_personagem: personagem.id, id_item: itemArma.id, refinamento: 6, estado: "Inventario", // alvo 7
  });
  const info = await forgeRefinementService.calcularMateriaisNecessarios(instanciaArma, null);
  for (const material of info.materiais) {
    await CharacterInventory.create({ id_personagem: personagem.id, id_item: material.id_item, quantidade: material.quantidade * 10 });
  }
  personagem.dinheiro = info.ouro * 10;
  await personagem.save();

  const previa = await forgeRefinementService.previaRefinamento(personagem.id, { id_instancia: instanciaArma.id, id_item_pergaminho: null });
  assert.equal(previa.chance_percentual, forgeConfig.CAP_CHANCE_REFINAMENTO_PPM / 10_000, "bônus somado (base+forja+ferramenta) precisa ser travado no cap vigente");
});

testeComBanco("Trocar a ferramenta depois de iniciar Fabricação não muda o resultado já persistido", async () => {
  const { personagem } = await criarPersonagem();
  await definirNivelForja(personagem.id, 1);
  const { blueprint, idItemBarra } = await criarBlueprintFabricacao();
  await darBarras(personagem.id, idItemBarra, 10);

  const ferramentaFraca = await criarFerramenta({ slot: "Martelo", nivelMinimo: 1, effectKey: "CRAFTING_QUALITY_BONUS_PPM", valorPpm: 0 });
  const instanciaFraca = await sequelize.transaction((t) => equipmentInstanceService.create({ idPersonagem: personagem.id, idItem: ferramentaFraca.id, raridade: "Comum" }, t));
  await forgeToolService.equiparFerramenta(personagem.id, instanciaFraca.id);

  await forgeCraftingService.iniciarFabricacao(personagem.id, { id_blueprint: blueprint.id, qualidade: "Comum" });
  const filaAposIniciar = await CharacterForgeQueue.findOne({ where: { id_personagem: personagem.id, slot: "Forja" } });
  const qualidadeCongelada = filaAposIniciar.payload_resultado.qualidade_final;

  // Troca pra uma ferramenta muito mais forte DEPOIS de já ter iniciado.
  const ferramentaForte = await criarFerramenta({ slot: "Martelo", nivelMinimo: 1, effectKey: "CRAFTING_QUALITY_BONUS_PPM", valorPpm: 900_000 });
  const instanciaForte = await sequelize.transaction((t) => equipmentInstanceService.create({ idPersonagem: personagem.id, idItem: ferramentaForte.id, raridade: "Comum" }, t));
  await forgeToolService.desequiparFerramenta(personagem.id, "Martelo");
  await forgeToolService.equiparFerramenta(personagem.id, instanciaForte.id);

  await forcarFilaProntaAgora(personagem.id, "Forja");
  const resultado = await forgeService.coletar(personagem.id, "Forja");
  assert.equal(resultado.instancia.raridade, qualidadeCongelada, "resultado sorteado no início nunca muda por trocar ferramenta depois");
});

testeComBanco("Ferramenta equipada na Ferraria não pode ser anunciada no Mercado sem desequipar", async () => {
  const { personagem } = await criarPersonagem();
  await definirNivelForja(personagem.id, 1);
  const ferramenta = await criarFerramenta({ slot: "Tenaz", nivelMinimo: 1 });
  const instancia = await sequelize.transaction((t) => equipmentInstanceService.create({ idPersonagem: personagem.id, idItem: ferramenta.id, raridade: "Comum" }, t));
  await forgeToolService.equiparFerramenta(personagem.id, instancia.id);

  await assert.rejects(
    () => sequelize.transaction((t) => equipmentInstanceService.reserveForMarket(personagem.id, instancia.id, t)),
    /Ferraria/,
  );

  await forgeToolService.desequiparFerramenta(personagem.id, "Tenaz");
  const reservada = await sequelize.transaction((t) => equipmentInstanceService.reserveForMarket(personagem.id, instancia.id, t));
  assert.equal(reservada.estado, "Mercado");
});

// ---------------------------------------------------------------------
// §18.4 — Perfil / UI / Admin
// ---------------------------------------------------------------------

testeComBanco("Ferreiro aparece no perfil (nível, título, XP, receitas conhecidas)", async () => {
  const { personagem, usuario } = await criarPersonagem();
  await definirNivelForja(personagem.id, 4);
  const { blueprint, itemReceita } = await criarReceita({ nivelForjaMinimo: 1, raridade: "Lendario" });
  await CharacterForgeRecipeUnlock.create({ id_personagem: personagem.id, id_blueprint: blueprint.id, source_type: "OTHER" });
  void itemReceita;

  const perfil = await characterProfileService.obterPerfilPublico(personagem.id, usuario.id);
  assert.equal(perfil.progression.forja.nivel, 4);
  assert.equal(perfil.progression.forja.titulo, "Ferreiro");
  assert.equal(perfil.progression.forja.receitas_conhecidas, 1);
  assert.equal(perfil.progression.forja.receitas_lendarias, 1);
});

testeComBanco("Habilidades de Ferreiro: Livro de Receitas e stats batem com os eventos reais", async () => {
  const { personagem } = await criarPersonagem();
  await definirNivelForja(personagem.id, 5);
  const { blueprint, itemReceita } = await criarReceita({ nivelForjaMinimo: 5, raridade: "Comum" });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: itemReceita.id, quantidade: 1 });
  await forgeRecipeService.aprenderReceita(personagem.id, itemReceita.id);

  const livro = await forgeRecipeService.listarLivroReceitas(personagem.id);
  assert.equal(livro.resumo.total, 1);
  assert.equal(livro.resumo.Comum, 1);
  assert.ok(livro.conhecidas.some((c) => c.id_blueprint === blueprint.id));

  const resumoStats = await forgeStatsService.obterResumo(personagem.id);
  assert.equal(resumoStats.receitas_aprendidas.Comum, 1);
});

testeComBanco("Admin: criar e editar Receita sem editar código (adminForgeService)", async () => {
  const { blueprint, itemResultado } = await criarBlueprintFabricacao({ nivelForjaMinimo: 6 });
  void itemResultado;
  const itemReceita = await Item.create({
    nome: `Projeto Admin Teste ${sufixo()}`, descricao: "teste", tipo_item: "Receita", raridade: "Raro",
    valor_compra: 0, valor_venda: 0, peso: 0,
  });

  const receita = await adminForgeService.criarReceitaAdmin(
    { id_blueprint: blueprint.id, id_item: itemReceita.id, raridade_receita: "Raro" },
    { idAdmin: 1 },
  );
  assert.equal(receita.raridade_receita, "Raro");

  const atualizada = await adminForgeService.atualizarReceitaAdmin(receita.id, { ativo: false }, { idAdmin: 1 });
  assert.equal(atualizada.ativo, false);

  // Sem Receita ATIVA vinculada, nunca pode exigir Receita pro Blueprint.
  await assert.rejects(
    () => adminForgeService.setModoDesbloqueioBlueprintAdmin(blueprint.id, "Receita", { idAdmin: 1 }),
    /ative uma Receita/,
  );

  await adminForgeService.atualizarReceitaAdmin(receita.id, { ativo: true }, { idAdmin: 1 });
  const resultadoModo = await adminForgeService.setModoDesbloqueioBlueprintAdmin(blueprint.id, "Receita", { idAdmin: 1, grandfatherElegiveis: false });
  assert.equal(resultadoModo.blueprint.modo_desbloqueio, "Receita");
});

testeComBanco("Admin: setModoDesbloqueioBlueprintAdmin com grandfathering concede unlock só a quem já tinha nível suficiente", async () => {
  const { blueprint } = await criarBlueprintFabricacao({ nivelForjaMinimo: 5 });
  const itemReceita = await Item.create({
    nome: `Projeto Grandfather Teste ${sufixo()}`, descricao: "teste", tipo_item: "Receita", raridade: "Comum",
    valor_compra: 0, valor_venda: 0, peso: 0,
  });
  await ForgeRecipe.create({ id_blueprint: blueprint.id, id_item: itemReceita.id, raridade_receita: "Comum", ativo: true });

  const { personagem: elegivel } = await criarPersonagem();
  await definirNivelForja(elegivel.id, 7); // acima do nivel_forja_minimo (5)
  const { personagem: naoElegivel } = await criarPersonagem();
  await definirNivelForja(naoElegivel.id, 2); // abaixo

  const resultado = await adminForgeService.setModoDesbloqueioBlueprintAdmin(blueprint.id, "Receita", { idAdmin: 1, grandfatherElegiveis: true });
  assert.ok(resultado.personagens_grandfathered >= 1);

  const unlockElegivel = await CharacterForgeRecipeUnlock.findOne({ where: { id_personagem: elegivel.id, id_blueprint: blueprint.id } });
  const unlockNaoElegivel = await CharacterForgeRecipeUnlock.findOne({ where: { id_personagem: naoElegivel.id, id_blueprint: blueprint.id } });
  assert.ok(unlockElegivel, "personagem com nível suficiente precisa receber o unlock automaticamente");
  assert.equal(unlockNaoElegivel, null, "personagem sem nível suficiente nunca recebe grandfathering");
});

testeComBanco("Simulador do Admin usa a mesma função de gameplay real (chanceFinalRefinamentoPpm)", async () => {
  const { chanceFinalRefinamentoPpm } = require("../src/services/forgeRollService");
  const resultado = await adminForgeService.previewRefinamentoAdmin({
    categoria: "Arma", qualidade: "Raro", refinamentoAtual: 6, nivelForja: 5, bonusFerramentaPercentual: 3,
  });
  const chanceReal = chanceFinalRefinamentoPpm(7, 5, 0, 30_000); // 3% = 30_000 ppm
  assert.equal(resultado.chance_final_percentual, chanceReal / 10_000);
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
