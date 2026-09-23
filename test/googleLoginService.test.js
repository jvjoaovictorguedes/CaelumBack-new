// Fila: login com Google. googleAuthService.verificarIdTokenGoogle
// (verificação de assinatura real contra as chaves públicas do Google)
// não dá pra testar sem um ID token assinado de verdade pelo Google —
// por isso a lógica de vínculo/criação de conta fica isolada em
// googleLoginService.js, testável aqui contra um Postgres de verdade a
// partir de um "perfil" já verificado (o formato que
// verificarIdTokenGoogle devolveria).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
const User = require("../src/models/User");
const { resolverOuCriarUsuarioGoogle, gerarUsernameDisponivel } = require("../src/services/googleLoginService");

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

testeComBanco("primeiro login com Google cria uma conta nova, vinculada e sem senha usável", async () => {
  const chave = sufixo();
  const perfil = { googleId: `google-${chave}`, email: `novo-${chave}@teste.local`, nome: "Jogador Novo" };

  const user = await resolverOuCriarUsuarioGoogle(perfil);

  assert.equal(user.googleId, perfil.googleId);
  assert.equal(user.email, perfil.email);
  assert.ok(user.username, "deveria ter gerado um username");
  assert.ok(user.passwordHash, "coluna NOT NULL precisa de algum hash");
  assert.equal(await user.comparePassword(""), false);
  assert.equal(await user.comparePassword(user.passwordHash), false, "hash aleatório não pode bater com ele mesmo em texto puro");
});

testeComBanco("login com Google repetido (mesmo googleId) retorna a MESMA conta, não cria duplicata", async () => {
  const chave = sufixo();
  const perfil = { googleId: `google-${chave}`, email: `repete-${chave}@teste.local`, nome: "Repete" };

  const primeiro = await resolverOuCriarUsuarioGoogle(perfil);
  const segundo = await resolverOuCriarUsuarioGoogle(perfil);

  assert.equal(segundo.id, primeiro.id);
  const total = await User.count({ where: { googleId: perfil.googleId } });
  assert.equal(total, 1);
});

testeComBanco("conta já existente (cadastro por senha) com o MESMO e-mail é vinculada, não duplicada", async () => {
  const chave = sufixo();
  const email = `vincular-${chave}@teste.local`;

  const contaOriginal = await User.create({
    username: `original_${chave}`,
    email,
    passwordHash: "SenhaForte123",
  });
  assert.equal(contaOriginal.googleId, null);

  const perfil = { googleId: `google-${chave}`, email, nome: "Qualquer Nome" };
  const vinculada = await resolverOuCriarUsuarioGoogle(perfil);

  assert.equal(vinculada.id, contaOriginal.id, "deveria linkar a conta existente, não criar outra");
  assert.equal(vinculada.username, `original_${chave}`, "username da conta original não muda ao vincular");
  assert.equal(vinculada.googleId, perfil.googleId);

  const total = await User.count({ where: { email } });
  assert.equal(total, 1, "não pode existir uma segunda conta com o mesmo e-mail");
});

testeComBanco("username sugerido já em uso gera um username alternativo disponível", async () => {
  const chave = sufixo();
  const usernameBase = `colidiu${chave.replace(/[^a-zA-Z0-9]/g, "")}`.slice(0, 30);
  await User.create({
    username: usernameBase,
    email: `dono-original-${chave}@teste.local`,
    passwordHash: "SenhaForte123",
  });

  const disponivel = await gerarUsernameDisponivel(usernameBase, `outro-${chave}@teste.local`);
  assert.notEqual(disponivel, usernameBase);
  assert.ok(disponivel.startsWith(usernameBase));

  const jaEmUso = await User.findOne({ where: { username: disponivel } });
  assert.equal(jaEmUso, null);
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
