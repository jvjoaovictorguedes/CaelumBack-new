// EQUIPAMENTOS TIER - Melhoria: "os equipamentos (armadura, capacete,
// arma, etc.) agora terão os tiers criados juntos". Antes desta
// correção, adminItemService.createAdminItem aceitava um equipamento
// sem tier_equipamento algum (o campo era opcional, só validado SE
// presente) — o admin só descobria o esquecimento bem depois, quando
// esse Item entrava como resultado de um ForgeBlueprint e a validação
// do blueprint reclamava "Tier —, esperado Tier X" (ver
// forgeAdminValidationService.js). Esta suíte prova que agora o
// próprio Painel de Itens já exige o Tier na hora de criar.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const adminItemService = require("../src/services/adminItemService");

let temBanco = false;
let admin = null;
test.before(async () => {
  temBanco = await bancoDisponivel();
  if (temBanco) {
    const { usuario } = await criarPersonagem({ nivel: 1, isAdmin: true });
    admin = usuario;
  }
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

const itensCriados = [];
test.afterEach(async () => {
  if (!temBanco) return;
  if (itensCriados.length > 0) {
    // WeaponProperties/ArmorProperties -> Items é NO ACTION (nunca
    // CASCADE — a própria adminItemService nunca deleta Item de
    // verdade em produção, só desativa, então isso nunca precisou ser
    // resolvido lá; aqui no teste precisa limpar a propriedade
    // específica primeiro pra não estourar FK).
    const WeaponProperties = require("../src/models/WeaponProperties");
    const ArmorProperties = require("../src/models/ArmorProperties");
    const ConsumableProperties = require("../src/models/ConsumableProperties");
    const FishingRodProperties = require("../src/models/FishingRodProperties");
    await Promise.all([
      WeaponProperties.destroy({ where: { id_item: itensCriados } }),
      ArmorProperties.destroy({ where: { id_item: itensCriados } }),
      ConsumableProperties.destroy({ where: { id_item: itensCriados } }),
      FishingRodProperties.destroy({ where: { id_item: itensCriados } }),
    ]);
    await Item.destroy({ where: { id: itensCriados } });
    itensCriados.length = 0;
  }
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});

function payloadArma(overrides = {}) {
  return {
    nome: `Espada Teste ${sufixo()}`,
    descricao: "d",
    tipo_item: "Arma",
    raridade: "Comum",
    valor_compra: 10,
    valor_venda: 5,
    weapon: { dano_min: 1, dano_max: 3, tipo_dano: "Fisico", tipo_arma: "Espada", bonus_atributo: "Forca", valor_bonus_atributo: 0 },
    ...overrides,
  };
}

function payloadArmadura(overrides = {}) {
  return {
    nome: `Capacete Teste ${sufixo()}`,
    descricao: "d",
    tipo_item: "Capacete",
    raridade: "Comum",
    valor_compra: 10,
    valor_venda: 5,
    armor: { slot_equipamento: "Cabeca", defesa: 1 },
    ...overrides,
  };
}

function payloadVara(overrides = {}) {
  return {
    nome: `Vara Teste ${sufixo()}`,
    descricao: "d",
    tipo_item: "Ferramenta",
    raridade: "Comum",
    valor_compra: 10,
    valor_venda: 5,
    fishingRod: { forca_linha: 1, controle: 1, recolhimento: 1, precisao: 1, estabilidade: 1, nivel_pesca_minimo: 1 },
    ...overrides,
  };
}

function payloadPocao(overrides = {}) {
  return {
    nome: `Poção Teste ${sufixo()}`,
    descricao: "d",
    tipo_item: "Consumivel",
    raridade: "Comum",
    valor_compra: 10,
    valor_venda: 5,
    consumable: { efeito_vida: 10 },
    ...overrides,
  };
}

// ------------------------------------------------------- CRIAÇÃO

testeComBanco("createAdminItem: Arma sem tier_equipamento é rejeitada", async () => {
  await assert.rejects(
    () => adminItemService.createAdminItem(payloadArma()),
    /tier_equipamento é obrigatório/,
  );
});

testeComBanco("createAdminItem: Capacete (Armadura) sem tier_equipamento é rejeitado", async () => {
  await assert.rejects(
    () => adminItemService.createAdminItem(payloadArmadura()),
    /tier_equipamento é obrigatório/,
  );
});

testeComBanco("createAdminItem: Ferramenta (Vara de Pesca) sem tier_equipamento é rejeitada", async () => {
  await assert.rejects(
    () => adminItemService.createAdminItem(payloadVara()),
    /tier_equipamento é obrigatório/,
  );
});

testeComBanco("createAdminItem: Arma COM tier_equipamento válido é criada normalmente", async () => {
  const item = await adminItemService.createAdminItem(payloadArma({ tier_equipamento: 3 }), { idAdmin: admin.id });
  itensCriados.push(item.id);
  assert.equal(item.tier_equipamento, 3);
});

testeComBanco("createAdminItem: tier_equipamento fora de 1-5 continua rejeitado (regra antiga preservada)", async () => {
  await assert.rejects(
    () => adminItemService.createAdminItem(payloadArma({ tier_equipamento: 7 })),
    /tier_equipamento deve ser um inteiro de 1 a 5/,
  );
});

testeComBanco("createAdminItem: Consumível (Poção) NUNCA exige tier_equipamento", async () => {
  const item = await adminItemService.createAdminItem(payloadPocao(), { idAdmin: admin.id });
  itensCriados.push(item.id);
  assert.equal(item.tier_equipamento, null);
});

testeComBanco("createAdminItem: Material/QuestItem/Espolio/Currencia também nunca exigem tier_equipamento", async () => {
  for (const tipo of ["Material", "QuestItem", "Espolio", "Currencia"]) {
    // eslint-disable-next-line no-await-in-loop -- sequencial de propósito, cada criação é independente
    const item = await adminItemService.createAdminItem(
      {
        nome: `${tipo} Teste ${sufixo()}`,
        descricao: "d",
        tipo_item: tipo,
        raridade: "Comum",
        valor_compra: 0,
        valor_venda: 0,
      },
      { idAdmin: admin.id },
    );
    itensCriados.push(item.id);
    assert.equal(item.tier_equipamento, null, `${tipo} não devia exigir tier`);
  }
});

// ------------------------------------------------------- EDIÇÃO

testeComBanco("updateAdminItem: NÃO trava edição de equipamento legado que já não tinha tier (não exige retroativamente)", async () => {
  // Simula um equipamento anterior à regra: cria direto pelo Model,
  // sem passar por createAdminItem (que já bloquearia isto agora).
  const item = await Item.create({
    nome: `Escudo Legado ${sufixo()}`,
    descricao: "d",
    tipo_item: "Escudo",
    raridade: "Comum",
    valor_compra: 0,
    valor_venda: 0,
    tier_equipamento: null,
  });
  const ArmorProperties = require("../src/models/ArmorProperties");
  await ArmorProperties.create({ id_item: item.id, slot_equipamento: "Acessorio1", defesa: 1 });
  itensCriados.push(item.id);

  const atualizado = await adminItemService.updateAdminItem(item.id, { nome: item.nome, valor_venda: 99 }, { idAdmin: admin.id });
  assert.equal(atualizado.valor_venda, 99);
  assert.equal(atualizado.tier_equipamento, null, "edição que não toca tier_equipamento não pode exigi-lo retroativamente");
});

testeComBanco("updateAdminItem: bloqueia remover (null) o tier de um equipamento que já tinha um definido", async () => {
  const criado = await adminItemService.createAdminItem(payloadArmadura({ tier_equipamento: 2 }), { idAdmin: admin.id });
  itensCriados.push(criado.id);

  await assert.rejects(
    () => adminItemService.updateAdminItem(criado.id, { nome: criado.nome, tier_equipamento: null }, { idAdmin: admin.id }),
    /tier_equipamento não pode ser removido/,
  );

  const aindaComTier = await Item.findByPk(criado.id);
  assert.equal(aindaComTier.tier_equipamento, 2, "tier não pode ter sido apagado pela tentativa rejeitada");
});

testeComBanco("updateAdminItem: permite TROCAR o tier de um Tier pra outro", async () => {
  const criado = await adminItemService.createAdminItem(payloadVara({ tier_equipamento: 5 }), { idAdmin: admin.id });
  itensCriados.push(criado.id);

  const atualizado = await adminItemService.updateAdminItem(criado.id, { nome: criado.nome, tier_equipamento: 2 }, { idAdmin: admin.id });
  assert.equal(atualizado.tier_equipamento, 2);
});

testeComBanco("updateAdminItem: Consumível pode ter tier_equipamento null sem nenhum bloqueio (regra não se aplica)", async () => {
  const criado = await adminItemService.createAdminItem(payloadPocao(), { idAdmin: admin.id });
  itensCriados.push(criado.id);

  const atualizado = await adminItemService.updateAdminItem(criado.id, { nome: criado.nome, tier_equipamento: null, valor_venda: 1 }, { idAdmin: admin.id });
  assert.equal(atualizado.tier_equipamento, null);
});
