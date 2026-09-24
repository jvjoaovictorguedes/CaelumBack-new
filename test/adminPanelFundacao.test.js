// Painel Administrativo — fundação (permissões granulares, auditoria,
// módulo de Itens). Cobre: allowlist/validação do adminItemService,
// transação (Item + propriedades juntos ou nada), desativar exige
// motivo, requireAdminPermission bloqueia sem a permissão certa, e
// concessão/revogação de role com log de auditoria.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
const User = require("../src/models/User");
const Item = require("../src/models/Item");
const WeaponProperties = require("../src/models/WeaponProperties");
const AdminActionLog = require("../src/models/AdminActionLog");
const AdminRole = require("../src/models/AdminRole");
const UserAdminRole = require("../src/models/UserAdminRole");
const adminItemService = require("../src/services/adminItemService");
const adminRoleService = require("../src/services/adminRoleService");
const requireAdminPermission = require("../src/middlewares/requireAdminPermission");

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

async function criarUsuarioAdmin({ isAdmin = true } = {}) {
  const chave = sufixo();
  return User.create({
    username: `admin_${chave}`,
    email: `admin_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin,
  });
}

function reqRes({ userId, body, query } = {}) {
  let statusCode = null;
  let corpo = null;
  const req = { user: userId ? { id: userId } : undefined, body: body ?? {}, query: query ?? {}, ip: "127.0.0.1", get: () => "teste-agent" };
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

testeComBanco("createAdminItem rejeita Arma sem propriedades de arma (validação antes de tocar o banco)", async () => {
  const admin = await criarUsuarioAdmin();
  await assert.rejects(
    () =>
      adminItemService.createAdminItem(
        { nome: `Espada ${sufixo()}`, descricao: "teste", tipo_item: "Arma", raridade: "Comum" },
        { idAdmin: admin.id },
      ),
    /exige propriedades de arma/,
  );
});

testeComBanco("createAdminItem cria Item + WeaponProperties na mesma transação e registra auditoria", async () => {
  const admin = await criarUsuarioAdmin();
  const nome = `Espada de Teste ${sufixo()}`;
  const item = await adminItemService.createAdminItem(
    {
      nome,
      descricao: "teste",
      tipo_item: "Arma",
      raridade: "Raro",
      valor_compra: 100,
      valor_venda: 50,
      peso: 1,
      weapon: { dano_min: 5, dano_max: 10, tipo_dano: "Fisico", tipo_arma: "Espada", bonus_atributo: "Forca", valor_bonus_atributo: 1 },
    },
    { idAdmin: admin.id },
  );

  assert.equal(item.nome, nome);
  assert.equal(item.ativo, true);
  assert.equal(item.disponivel_loja, false, "item novo não entra na Loja automaticamente");

  const propriedades = await WeaponProperties.findByPk(item.id);
  assert.ok(propriedades, "WeaponProperties devia ter sido criado junto");
  assert.equal(propriedades.dano_min, 5);

  const log = await AdminActionLog.findOne({ where: { entidade: "Item", id_entidade: item.id, acao: "criar" } });
  assert.ok(log, "auditoria devia ter registrado a criação");
  assert.equal(log.id_admin, admin.id);
});

testeComBanco("createAdminItem falhando na criação das propriedades não deixa Item órfão (tudo ou nada)", async () => {
  const admin = await criarUsuarioAdmin();
  const nome = `Item Quebrado ${sufixo()}`;
  await assert.rejects(() =>
    adminItemService.createAdminItem(
      {
        nome,
        descricao: "teste",
        tipo_item: "Arma",
        raridade: "Comum",
        // tipo_dano inválido força o INSERT de WeaponProperties a falhar
        // (ENUM não aceita) — o Item não pode sobreviver a isso.
        weapon: { dano_min: 1, dano_max: 2, tipo_dano: "NaoExiste", tipo_arma: "Espada", bonus_atributo: "Forca", valor_bonus_atributo: 0 },
      },
      { idAdmin: admin.id },
    ),
  );

  const itemOrfao = await Item.findOne({ where: { nome } });
  assert.equal(itemOrfao, null, "transação devia ter revertido o Item junto com a falha das propriedades");
});

testeComBanco("deactivateAdminItem exige motivo e desativa (nunca deleta)", async () => {
  const admin = await criarUsuarioAdmin();
  const item = await Item.create({
    nome: `Material de Teste ${sufixo()}`,
    descricao: "teste",
    tipo_item: "Material",
    raridade: "Comum",
    valor_compra: 0,
    valor_venda: 1,
    peso: 0.1,
    disponivel_loja: true,
  });

  await assert.rejects(() => adminItemService.deactivateAdminItem(item.id, { idAdmin: admin.id }), /motivo é obrigatório/);

  const desativado = await adminItemService.deactivateAdminItem(item.id, {
    idAdmin: admin.id,
    motivo: "Item de teste — remover da Loja.",
  });
  assert.equal(desativado.ativo, false);
  assert.equal(desativado.disponivel_loja, false);

  const aindaExiste = await Item.findByPk(item.id);
  assert.ok(aindaExiste, "desativar nunca deleta a linha");

  const log = await AdminActionLog.findOne({ where: { entidade: "Item", id_entidade: item.id, acao: "desativar" } });
  assert.ok(log.motivo);
});

testeComBanco("requireAdminPermission bloqueia sem a permissão e libera com ela", async () => {
  const admin = await criarUsuarioAdmin();
  const middleware = requireAdminPermission("items.manage");

  const semPermissao = reqRes({ userId: admin.id });
  let chamouNext = false;
  await middleware(semPermissao.req, semPermissao.res, () => {
    chamouNext = true;
  });
  assert.equal(chamouNext, false);
  assert.equal(semPermissao.resultado().statusCode, 403);

  const role = await AdminRole.findOne({ where: { nome: "Conteudo" } });
  await adminRoleService.assignRole(admin.id, role.id, { idAdmin: admin.id });

  const comPermissao = reqRes({ userId: admin.id });
  chamouNext = false;
  await middleware(comPermissao.req, comPermissao.res, () => {
    chamouNext = true;
  });
  assert.equal(chamouNext, true, "Conteudo tem items.manage — devia liberar");
});

testeComBanco("assignRole/revokeRole registram auditoria e são idempotentes", async () => {
  const admin = await criarUsuarioAdmin();
  const role = await AdminRole.findOne({ where: { nome: "Suporte" } });

  await adminRoleService.assignRole(admin.id, role.id, { idAdmin: admin.id });
  await adminRoleService.assignRole(admin.id, role.id, { idAdmin: admin.id }); // idempotente, não duplica

  const vinculos = await UserAdminRole.findAll({ where: { id_user: admin.id, id_role: role.id } });
  assert.equal(vinculos.length, 1);

  const resultado = await adminRoleService.revokeRole(admin.id, role.id, { idAdmin: admin.id });
  assert.equal(resultado.removido, true);

  const logConcessao = await AdminActionLog.findOne({ where: { acao: "conceder-role", id_entidade: admin.id } });
  const logRevogacao = await AdminActionLog.findOne({ where: { acao: "revogar-role", id_entidade: admin.id } });
  assert.ok(logConcessao);
  assert.ok(logRevogacao);
});

testeComBanco("assignRole rejeita usuário sem isAdmin=true", async () => {
  const usuarioComum = await criarUsuarioAdmin({ isAdmin: false });
  const role = await AdminRole.findOne({ where: { nome: "Suporte" } });
  await assert.rejects(
    () => adminRoleService.assignRole(usuarioComum.id, role.id, { idAdmin: usuarioComum.id }),
    /isAdmin=true/,
  );
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
