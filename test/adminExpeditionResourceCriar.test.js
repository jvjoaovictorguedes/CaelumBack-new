// Painel Admin de Expedição — pedido do jogador: poder criar um recurso
// NOVO (nunca só mexer em peso/ativo dos recursos já cadastrados),
// opcionalmente já vinculado a um Item real por qualidade.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");
const Item = require("../src/models/Item");
const ExpeditionResource = require("../src/models/ExpeditionResource");
const ExpeditionResourceItem = require("../src/models/ExpeditionResourceItem");
const adminExpeditionResourceService = require("../src/services/adminExpeditionResourceService");

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
const recursosCriados = [];
test.after(async () => {
  if (!temBanco) return;
  if (recursosCriados.length > 0) {
    await ExpeditionResourceItem.destroy({ where: { id_recurso: recursosCriados } });
    await ExpeditionResource.destroy({ where: { id: recursosCriados } });
  }
  if (itensCriados.length > 0) await Item.destroy({ where: { id: itensCriados } });
  await sequelize.close();
});

async function criarItem(nome) {
  const item = await Item.create({ nome: `${nome} ${sufixo()}`, descricao: "Item de teste.", tipo_item: "Material", raridade: "Comum" });
  itensCriados.push(item.id);
  return item;
}

testeComBanco("criarRecurso: cria o recurso e vincula só as qualidades informadas (outras ficam sem vínculo)", async () => {
  const itemComum = await criarItem("Minério Teste");
  const itemRaro = await criarItem("Minério Raro Teste");

  const resultado = await adminExpeditionResourceService.criarRecurso(
    {
      profissao: "Mineracao",
      nome: `Minério Teste ${sufixo()}`,
      itensPorQualidade: { Comum: itemComum.id, Raro: itemRaro.id },
    },
    { idAdmin: 1, req: {} },
  );
  recursosCriados.push(resultado.id);

  assert.ok(resultado.id);
  assert.equal(resultado.profissao, "Mineracao");
  assert.equal(resultado.ativo, true);

  const vinculos = await ExpeditionResourceItem.findAll({ where: { id_recurso: resultado.id } });
  assert.equal(vinculos.length, 2);
  assert.ok(vinculos.some((v) => v.qualidade === "Comum" && v.id_item === itemComum.id));
  assert.ok(vinculos.some((v) => v.qualidade === "Raro" && v.id_item === itemRaro.id));
});

testeComBanco("criarRecurso: sem nenhuma qualidade informada, cria o recurso sem vínculo nenhum (nunca obrigatório)", async () => {
  const resultado = await adminExpeditionResourceService.criarRecurso(
    { profissao: "Silvicultura", nome: `Madeira Teste ${sufixo()}`, itensPorQualidade: {} },
    { idAdmin: 1, req: {} },
  );
  recursosCriados.push(resultado.id);

  const vinculos = await ExpeditionResourceItem.findAll({ where: { id_recurso: resultado.id } });
  assert.equal(vinculos.length, 0);
});

testeComBanco("criarRecurso: rejeita item inexistente", async () => {
  await assert.rejects(
    () =>
      adminExpeditionResourceService.criarRecurso(
        { profissao: "Exploracao", nome: `Recurso Teste ${sufixo()}`, itensPorQualidade: { Comum: 99999999 } },
        { idAdmin: 1, req: {} },
      ),
    (err) => err.statusCode === 400,
  );
});

testeComBanco("criarRecurso: rejeita profissão inválida e nome vazio", async () => {
  await assert.rejects(
    () => adminExpeditionResourceService.criarRecurso({ profissao: "Pesca", nome: "X" }, { idAdmin: 1, req: {} }),
    (err) => err.statusCode === 400,
  );
  await assert.rejects(
    () => adminExpeditionResourceService.criarRecurso({ profissao: "Mineracao", nome: "" }, { idAdmin: 1, req: {} }),
    (err) => err.statusCode === 400,
  );
});
