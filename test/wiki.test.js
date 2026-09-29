// Wiki do Jogo — CRUD admin (adminWikiService) + leitura pública
// (wikiController, via require direto do controller, mesmo padrão de
// market.test.js/expeditionCooldownGlobal.test.js pra chamar um
// controller Express sem servidor de verdade).
const test = require("node:test");
const assert = require("node:assert/strict");

const { sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const WikiArticle = require("../src/models/WikiArticle");
const adminWikiService = require("../src/services/adminWikiService");
const wikiController = require("../src/controllers/wikiController");

let temBanco = false;
test.before(async () => {
  try {
    await sequelize.authenticate();
    temBanco = true;
  } catch {
    temBanco = false;
  }
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

function fakeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

const artigosCriados = [];
const usuariosCriados = [];

test.after(async () => {
  if (!temBanco) return;
  if (artigosCriados.length > 0) await WikiArticle.destroy({ where: { id: artigosCriados } });
  if (usuariosCriados.length > 0) await User.destroy({ where: { id: usuariosCriados } });
  await sequelize.close();
});

async function criarUsuarioAdmin() {
  const chave = sufixo();
  const admin = await User.create({
    username: `admin_wiki_${chave}`,
    email: `admin_wiki_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin: true,
  });
  usuariosCriados.push(admin.id);
  return admin;
}

testeComBanco("createAdminWikiArticle: gera slug a partir do título e impede slug duplicado", async () => {
  const admin = await criarUsuarioAdmin();
  const chave = sufixo();

  const artigo = await adminWikiService.createAdminWikiArticle(
    { categoria: `Categoria Teste ${chave}`, titulo: `Como Funciona a Forja ${chave}`, conteudo: "Texto de teste." },
    { idAdmin: admin.id },
  );
  artigosCriados.push(artigo.id);
  assert.ok(artigo.slug.startsWith("como-funciona-a-forja-"), `slug gerado errado: ${artigo.slug}`);
  assert.equal(artigo.publicado, true, "artigo deveria nascer publicado por padrão");

  await assert.rejects(
    () =>
      adminWikiService.createAdminWikiArticle(
        { categoria: "Outra", titulo: "Outro título", conteudo: "x", slug: artigo.slug },
        { idAdmin: admin.id },
      ),
    (erro) => {
      assert.equal(erro.statusCode, 400);
      assert.match(erro.message, /já existe/i);
      return true;
    },
  );
});

testeComBanco("updateAdminWikiArticle: edita e permite despublicar (virar rascunho)", async () => {
  const admin = await criarUsuarioAdmin();
  const chave = sufixo();
  const artigo = await adminWikiService.createAdminWikiArticle(
    { categoria: "Guildas", titulo: `Boss da Guilda ${chave}`, conteudo: "Conteúdo original." },
    { idAdmin: admin.id },
  );
  artigosCriados.push(artigo.id);

  const editado = await adminWikiService.updateAdminWikiArticle(
    artigo.id,
    { conteudo: "Conteúdo revisado.", publicado: false },
    { idAdmin: admin.id },
  );
  assert.equal(editado.conteudo, "Conteúdo revisado.");
  assert.equal(editado.publicado, false);
});

testeComBanco("wikiController: lista só publicado=true, agrupado por categoria, e 404 pra rascunho por slug", async () => {
  const admin = await criarUsuarioAdmin();
  const chave = sufixo();

  const publicado = await adminWikiService.createAdminWikiArticle(
    { categoria: `Aventura ${chave}`, titulo: `Artigo Publicado ${chave}`, conteudo: "x" },
    { idAdmin: admin.id },
  );
  artigosCriados.push(publicado.id);

  const rascunho = await adminWikiService.createAdminWikiArticle(
    { categoria: `Aventura ${chave}`, titulo: `Artigo Rascunho ${chave}`, conteudo: "x", publicado: false },
    { idAdmin: admin.id },
  );
  artigosCriados.push(rascunho.id);

  const reqLista = { query: {} };
  const resLista = fakeRes();
  await wikiController.listarArtigos(reqLista, resLista);
  assert.equal(resLista.statusCode, 200);
  const categoriaEncontrada = resLista.body.data.categorias.find((c) => c.categoria === `Aventura ${chave}`);
  assert.ok(categoriaEncontrada, "categoria deveria aparecer na listagem pública");
  const titulos = categoriaEncontrada.artigos.map((a) => a.titulo);
  assert.ok(titulos.includes(`Artigo Publicado ${chave}`));
  assert.ok(!titulos.includes(`Artigo Rascunho ${chave}`), "rascunho nunca deveria aparecer na listagem pública");

  const resPublicado = fakeRes();
  await wikiController.obterArtigo({ params: { slug: publicado.slug } }, resPublicado);
  assert.equal(resPublicado.statusCode, 200);
  assert.equal(resPublicado.body.data.artigo.titulo, `Artigo Publicado ${chave}`);

  const resRascunho = fakeRes();
  await wikiController.obterArtigo({ params: { slug: rascunho.slug } }, resRascunho);
  assert.equal(resRascunho.statusCode, 404, "rascunho por slug precisa devolver 404, não vazar o conteúdo");
});

testeComBanco("duplicateAdminWikiArticle: copia como rascunho com slug único", async () => {
  const admin = await criarUsuarioAdmin();
  const chave = sufixo();
  const original = await adminWikiService.createAdminWikiArticle(
    { categoria: "Expedição", titulo: `Cooldown de Coleta ${chave}`, conteudo: "Original." },
    { idAdmin: admin.id },
  );
  artigosCriados.push(original.id);

  const copia = await adminWikiService.duplicateAdminWikiArticle(original.id, { idAdmin: admin.id });
  artigosCriados.push(copia.id);
  assert.notEqual(copia.slug, original.slug);
  assert.equal(copia.publicado, false, "cópia precisa nascer como rascunho, nunca substituir o original no ar");
  assert.equal(copia.conteudo, "Original.");
});
