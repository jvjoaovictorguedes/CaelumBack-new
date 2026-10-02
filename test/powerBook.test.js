// Habilidades V2.0 §13 — Livro de Habilidade. Cobre powerLearningService
// (fluxo completo via item + requisitos) e o CRUD de PowerBook no Admin.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");
const Item = require("../src/models/Item");
const Power = require("../src/models/Power");
const PowerBook = require("../src/models/PowerBook");
const CharacterAbilities = require("../src/models/CharacterAbilities");
const CharacterInventory = require("../src/models/CharacterInventory");
const powerLearningService = require("../src/services/powerLearningService");
const adminPowerService = require("../src/services/adminPowerService");

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

const itensCriados = [];
const powersCriados = [];
test.after(async () => {
  if (!temBanco) return;
  if (itensCriados.length > 0) {
    await CharacterInventory.destroy({ where: { id_item: itensCriados } });
    await PowerBook.destroy({ where: { id_item: itensCriados } });
    await Item.destroy({ where: { id: itensCriados } });
  }
  if (powersCriados.length > 0) {
    await CharacterAbilities.destroy({ where: { id_power: powersCriados } });
    await PowerBook.destroy({ where: { id_power: powersCriados } });
    await Power.destroy({ where: { id: powersCriados } });
  }
  await sequelize.close();
});

async function criarLivro(nome) {
  const item = await Item.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "Livro de teste.",
    tipo_item: "LivroHabilidade",
    raridade: "Raro",
  });
  itensCriados.push(item.id);
  return item;
}

async function criarPower(nome, overrides = {}) {
  const power = await Power.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "Power de teste.",
    tipo_poder: "Passivo",
    escala_atributo: "Forca",
    ...overrides,
  });
  powersCriados.push(power.id);
  return power;
}

testeComBanco("aprenderPorLivro: fluxo feliz concede a Power e consome o item", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  const power = await criarPower("Passiva Rara");
  const livro = await criarLivro("Tomo Arcano");
  await PowerBook.create({ id_item: livro.id, id_power: power.id });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: livro.id, quantidade: 1 });

  const resultado = await powerLearningService.aprenderPorLivro(personagem.id, livro.id);
  assert.equal(resultado.aprendida, true);
  assert.equal(resultado.id_power, power.id);

  const aprendida = await CharacterAbilities.findOne({ where: { id_personagem: personagem.id, id_power: power.id } });
  assert.ok(aprendida, "CharacterAbilities foi criada");
  assert.equal(aprendida.is_active, true, "Power Passiva sempre nasce ativa (nunca ocupa slot)");

  const entrada = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: livro.id } });
  assert.equal(entrada, null, "item foi consumido (quantidade 1 -> 0 -> linha removida)");
});

testeComBanco("aprenderPorLivro: sem o item no inventário, rejeita", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  const power = await criarPower("Passiva Sem Item");
  const livro = await criarLivro("Tomo Vazio");
  await PowerBook.create({ id_item: livro.id, id_power: power.id });

  await assert.rejects(
    () => powerLearningService.aprenderPorLivro(personagem.id, livro.id),
    /não possui esse Livro/,
  );
});

testeComBanco("aprenderPorLivro: item sem PowerBook configurado (ou inativo), rejeita", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  const livro = await criarLivro("Tomo Sem Vínculo");
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: livro.id, quantidade: 1 });

  await assert.rejects(
    () => powerLearningService.aprenderPorLivro(personagem.id, livro.id),
    /não é um Livro de Habilidade configurado/,
  );
});

testeComBanco("aprenderPorLivro: nível mínimo não cumprido rejeita e NÃO consome o item", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const power = await criarPower("Passiva Alto Nível");
  const livro = await criarLivro("Tomo Lendário");
  await PowerBook.create({ id_item: livro.id, id_power: power.id, nivel_minimo: 60 });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: livro.id, quantidade: 1 });

  await assert.rejects(
    () => powerLearningService.aprenderPorLivro(personagem.id, livro.id),
    /exige nível 60/,
  );

  const entrada = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: livro.id } });
  assert.equal(entrada.quantidade, 1, "item não foi consumido numa tentativa rejeitada por requisito");
});

testeComBanco("aprenderPorLivro: natureza mágica incompatível rejeita", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 }); // natureza_magica: "Fogo"
  const power = await criarPower("Passiva de Luz");
  const livro = await criarLivro("Tomo da Luz");
  await PowerBook.create({ id_item: livro.id, id_power: power.id, natureza_magica: "Luz" });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: livro.id, quantidade: 1 });

  await assert.rejects(
    () => powerLearningService.aprenderPorLivro(personagem.id, livro.id),
    /Natureza Mágica Luz/,
  );
});

testeComBanco("aprenderPorLivro: Power pré-requisito não aprendida rejeita", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  const prereq = await criarPower("Escudo de Mana");
  const power = await criarPower("Passiva Avançada");
  const livro = await criarLivro("Tomo Avançado");
  await PowerBook.create({ id_item: livro.id, id_power: power.id, id_power_prerequisito: prereq.id });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: livro.id, quantidade: 1 });

  await assert.rejects(
    () => powerLearningService.aprenderPorLivro(personagem.id, livro.id),
    /pré-requisito que você ainda não aprendeu/,
  );
});

testeComBanco("aprenderPorLivro: nível da Power pré-requisito insuficiente rejeita", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  const prereq = await criarPower("Escudo de Mana Nv");
  const power = await criarPower("Passiva Avançada Nv");
  const livro = await criarLivro("Tomo Avançado Nv");
  await PowerBook.create({
    id_item: livro.id,
    id_power: power.id,
    id_power_prerequisito: prereq.id,
    nivel_power_prerequisito: 5,
  });
  await CharacterAbilities.create({ id_personagem: personagem.id, id_power: prereq.id, nivel_habilidade: 2 });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: livro.id, quantidade: 1 });

  await assert.rejects(
    () => powerLearningService.aprenderPorLivro(personagem.id, livro.id),
    /precisa estar no nível 5/,
  );
});

testeComBanco("aprenderPorLivro: já aprendida a Power do livro, rejeita (idempotente)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  const power = await criarPower("Passiva Repetida");
  const livro = await criarLivro("Tomo Repetido");
  await PowerBook.create({ id_item: livro.id, id_power: power.id });
  await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: livro.id, quantidade: 1 });

  await assert.rejects(
    () => powerLearningService.aprenderPorLivro(personagem.id, livro.id),
    /já aprendeu/,
  );
});

testeComBanco("aprenderPorLivro: Power Ativa respeita o teto de 5 habilidades ativas em combate", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  for (let i = 0; i < 5; i += 1) {
    const ativa = await criarPower(`Ativa Cheia ${i}`, { tipo_poder: "Ativo" });
    await CharacterAbilities.create({ id_personagem: personagem.id, id_power: ativa.id, is_active: true });
  }
  const powerLivro = await criarPower("Ativa do Livro", { tipo_poder: "Ativo" });
  const livro = await criarLivro("Tomo de Ativa");
  await PowerBook.create({ id_item: livro.id, id_power: powerLivro.id });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: livro.id, quantidade: 1 });

  const resultado = await powerLearningService.aprenderPorLivro(personagem.id, livro.id);
  assert.equal(resultado.aprendida, true, "aprende mesmo sem vaga — só não entra ativa");

  const aprendida = await CharacterAbilities.findOne({ where: { id_personagem: personagem.id, id_power: powerLivro.id } });
  assert.equal(aprendida.is_active, false, "sem vaga no loadout de combate — fica aprendida mas inativa");
});

// ---------------------------------------------------------------------
// Admin CRUD de PowerBook
// ---------------------------------------------------------------------

testeComBanco("admin: upsertAdminPowerBook cria, depois atualiza a mesma linha (nunca duplica)", async () => {
  const power = await criarPower("Passiva Admin");
  const power2 = await criarPower("Passiva Admin 2");
  const livro = await criarLivro("Tomo Admin");

  const criado = await adminPowerService.upsertAdminPowerBook(livro.id, { id_power: power.id, nivel_minimo: 10 }, { idAdmin: 1, req: {} });
  assert.equal(criado.id_power, power.id);
  assert.equal(criado.nivel_minimo, 10);

  const atualizado = await adminPowerService.upsertAdminPowerBook(livro.id, { id_power: power2.id, nivel_minimo: 20 }, { idAdmin: 1, req: {} });
  assert.equal(atualizado.id, criado.id, "mesma linha, nunca uma segunda");
  assert.equal(atualizado.id_power, power2.id);
  assert.equal(atualizado.nivel_minimo, 20);

  const todas = await PowerBook.findAll({ where: { id_item: livro.id } });
  assert.equal(todas.length, 1);
});

testeComBanco("admin: upsertAdminPowerBook rejeita item que não é LivroHabilidade", async () => {
  const power = await criarPower("Passiva Tipo Errado");
  const itemComum = await Item.create({
    nome: `Item Comum ${sufixo()}`,
    descricao: "Não é um livro.",
    tipo_item: "Material",
    raridade: "Comum",
  });
  itensCriados.push(itemComum.id);

  await assert.rejects(
    () => adminPowerService.upsertAdminPowerBook(itemComum.id, { id_power: power.id }, { idAdmin: 1, req: {} }),
    /Só itens do tipo "LivroHabilidade"/,
  );
});

testeComBanco("admin: removeAdminPowerBook remove a linha de verdade", async () => {
  const power = await criarPower("Passiva Pra Remover");
  const livro = await criarLivro("Tomo Pra Remover");
  await adminPowerService.upsertAdminPowerBook(livro.id, { id_power: power.id }, { idAdmin: 1, req: {} });

  const resultado = await adminPowerService.removeAdminPowerBook(livro.id, { idAdmin: 1, req: {} });
  assert.equal(resultado.removido, true);

  const encontrado = await adminPowerService.getAdminPowerBook(livro.id);
  assert.equal(encontrado, null);
});
