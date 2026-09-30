// Bug real: "com a chegada das ferramentas do ferreiro e receitas é
// necessário a criação dos itens tipo ferramenta e receita, lembrando
// que ferramenta tá limitado somente com linha e tudo mais, precisa
// ser separado" — createAdminItem/updateAdminItem forçavam TODO Item
// tipo_item "Ferramenta" a nascer como Vara de Pesca
// (FishingRodProperties obrigatório, sem alternativa) e o enum do
// model nunca foi atualizado com "Receita" (a migration já tinha
// adicionado o valor no Postgres, mas o Sequelize seguia rejeitando).
// Esta suíte prova que agora: (1) "Ferramenta" aceita o subtipo
// Ferramenta de Ferraria (ForgeToolProperties) como alternativa real à
// Vara de Pesca, nunca as duas ao mesmo tempo; (2) "Receita" é
// aceito como tipo_item de primeira classe na criação do Item.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const FishingRodProperties = require("../src/models/FishingRodProperties");
const ForgeToolProperties = require("../src/models/ForgeToolProperties");
const ForgeToolEffect = require("../src/models/ForgeToolEffect");
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
    await Promise.all([
      FishingRodProperties.destroy({ where: { id_item: itensCriados } }),
      ForgeToolEffect.destroy({ where: { id_item: itensCriados } }),
      ForgeToolProperties.destroy({ where: { id_item: itensCriados } }),
    ]);
    await Item.destroy({ where: { id: itensCriados } });
    itensCriados.length = 0;
  }
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});

function payloadFerramentaBase(overrides = {}) {
  return {
    nome: `Ferramenta Teste ${sufixo()}`,
    descricao: "d",
    tipo_item: "Ferramenta",
    raridade: "Comum",
    valor_compra: 10,
    valor_venda: 5,
    tier_equipamento: 3,
    ...overrides,
  };
}

testeComBanco("criar Item Ferramenta com forgeTool gera ForgeToolProperties, nunca FishingRodProperties", async () => {
  const item = await adminItemService.createAdminItem(
    payloadFerramentaBase({ forgeTool: { slot: "Martelo", nivel_ferreiro_minimo: 5, efeitos: [{ effect_key: "CRAFTING_QUALITY_BONUS_PPM", valor_ppm: 20000 }] } }),
    { idAdmin: admin.id },
  );
  itensCriados.push(item.id);

  const [vara, ferramenta] = await Promise.all([
    FishingRodProperties.findByPk(item.id),
    ForgeToolProperties.findByPk(item.id, { include: [{ model: ForgeToolEffect, as: "efeitos" }] }),
  ]);
  assert.equal(vara, null, "não pode criar FishingRodProperties quando o admin escolheu forgeTool");
  assert.ok(ferramenta, "ForgeToolProperties precisa existir");
  assert.equal(ferramenta.slot, "Martelo");
  assert.equal(ferramenta.nivel_ferreiro_minimo, 5);
  assert.equal(ferramenta.efeitos.length, 1);
  assert.equal(ferramenta.efeitos[0].effect_key, "CRAFTING_QUALITY_BONUS_PPM");
});

testeComBanco("criar Item Ferramenta com fishingRod continua funcionando (Vara de Pesca não regrediu)", async () => {
  const item = await adminItemService.createAdminItem(
    payloadFerramentaBase({ fishingRod: { forca_linha: 10, controle: 10, recolhimento: 10, precisao: 10, estabilidade: 10, nivel_pesca_minimo: 1 } }),
    { idAdmin: admin.id },
  );
  itensCriados.push(item.id);

  const [vara, ferramenta] = await Promise.all([
    FishingRodProperties.findByPk(item.id),
    ForgeToolProperties.findByPk(item.id),
  ]);
  assert.ok(vara, "FishingRodProperties precisa existir");
  assert.equal(ferramenta, null, "não pode criar ForgeToolProperties quando o admin escolheu fishingRod");
});

testeComBanco("criar Item Ferramenta sem escolher subtipo é rejeitado", async () => {
  await assert.rejects(
    () => adminItemService.createAdminItem(payloadFerramentaBase(), { idAdmin: admin.id }),
    /exige escolher/,
  );
});

testeComBanco("criar Item Ferramenta com os dois subtipos ao mesmo tempo é rejeitado", async () => {
  await assert.rejects(
    () =>
      adminItemService.createAdminItem(
        payloadFerramentaBase({
          fishingRod: { forca_linha: 10, controle: 10, recolhimento: 10, precisao: 10, estabilidade: 10, nivel_pesca_minimo: 1 },
          forgeTool: { slot: "Fole", nivel_ferreiro_minimo: 1 },
        }),
        { idAdmin: admin.id },
      ),
    /não pode ser Vara de Pesca e Ferramenta de Ferraria ao mesmo tempo/,
  );
});

testeComBanco("criar Item Receita funciona (tipo_item de primeira classe, sem exigir propriedades)", async () => {
  const item = await adminItemService.createAdminItem(
    {
      nome: `Receita Teste ${sufixo()}`,
      descricao: "d",
      tipo_item: "Receita",
      raridade: "Raro",
      valor_compra: 0,
      valor_venda: 0,
    },
    { idAdmin: admin.id },
  );
  itensCriados.push(item.id);
  assert.equal(item.tipo_item, "Receita");
});

testeComBanco("editar Item Ferramenta: anexar forgeTool depois e depois trocar só os efeitos", async () => {
  const item = await adminItemService.createAdminItem(
    payloadFerramentaBase({ forgeTool: { slot: "Tenaz", nivel_ferreiro_minimo: 2 } }),
    { idAdmin: admin.id },
  );
  itensCriados.push(item.id);

  const atualizado = await adminItemService.updateAdminItem(
    item.id,
    { nome: item.nome, forgeTool: { nivel_ferreiro_minimo: 8, efeitos: [{ effect_key: "SMELTING_BONUS_BAR_PPM", valor_ppm: 50000 }] } },
    { idAdmin: admin.id },
  );
  assert.equal(atualizado.forgeToolProperties.nivel_ferreiro_minimo, 8);
  assert.equal(atualizado.forgeToolProperties.slot, "Tenaz", "campo não enviado no patch precisa permanecer intacto");
  assert.equal(atualizado.forgeToolProperties.efeitos.length, 1);
  assert.equal(atualizado.forgeToolProperties.efeitos[0].effect_key, "SMELTING_BONUS_BAR_PPM");
});

testeComBanco("duplicar Item Ferramenta de Ferraria copia ForgeToolProperties + efeitos pra cópia", async () => {
  const original = await adminItemService.createAdminItem(
    payloadFerramentaBase({ forgeTool: { slot: "Fole", nivel_ferreiro_minimo: 3, efeitos: [{ effect_key: "REFINEMENT_SUCCESS_BONUS_PPM", valor_ppm: 15000 }] } }),
    { idAdmin: admin.id },
  );
  itensCriados.push(original.id);

  const copia = await adminItemService.duplicateAdminItem(original.id, { idAdmin: admin.id });
  itensCriados.push(copia.id);

  const ferramentaCopia = await ForgeToolProperties.findByPk(copia.id, { include: [{ model: ForgeToolEffect, as: "efeitos" }] });
  assert.ok(ferramentaCopia, "a cópia precisa ter suas próprias ForgeToolProperties");
  assert.equal(ferramentaCopia.slot, "Fole");
  assert.equal(ferramentaCopia.efeitos.length, 1);
  assert.equal(ferramentaCopia.efeitos[0].effect_key, "REFINEMENT_SUCCESS_BONUS_PPM");
});
