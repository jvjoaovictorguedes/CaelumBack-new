// Jornal da Guilda dos Aventureiros — feed de novidades curado pelo
// Admin (nunca por gatilho automático de jogo), estilo Patch Notes:
// mesmo workflow Rascunho/Publicado/Agendado, mesma regra de
// visibilidade pública (Publicado sempre, Agendado só quando
// publicado_em já chegou).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const GuildJournalEntry = require("../src/models/GuildJournalEntry");
const adminGuildJournalService = require("../src/services/adminGuildJournalService");
const guildJournalController = require("../src/controllers/guildJournalController");

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

const entradasCriadas = [];
test.afterEach(async () => {
  if (!temBanco) return;
  if (entradasCriadas.length > 0) {
    await GuildJournalEntry.destroy({ where: { id: entradasCriadas } });
    entradasCriadas.length = 0;
  }
});

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

testeComBanco("admin: createAdminGuildJournalEntry rejeita sem titulo/descricao", async () => {
  await assert.rejects(
    () => adminGuildJournalService.createAdminGuildJournalEntry({}, { idAdmin: 1 }),
    /titulo.*obrigat|descricao.*obrigat/i,
  );
});

testeComBanco("admin: createAdminGuildJournalEntry cria com defaults (Rascunho, ordem incremental, categoria Outro)", async (t) => {
  const nota = await adminGuildJournalService.createAdminGuildJournalEntry(
    { titulo: `Nota ${sufixo()}`, descricao: "Descrição de teste." },
    { idAdmin: 1 },
  );
  entradasCriadas.push(nota.id);

  assert.equal(nota.status, "Rascunho");
  assert.equal(nota.categoria, "Outro");
  assert.equal(nota.destaque, false);
  assert.ok(nota.ordem > 0);
  assert.equal(nota.created_by_admin_id, 1);
});

testeComBanco("admin: createAdminGuildJournalEntry normaliza string vazia pra null em resumo/imagem_url/personagem_nome/guilda_nome", async () => {
  const nota = await adminGuildJournalService.createAdminGuildJournalEntry(
    {
      titulo: `Nota ${sufixo()}`,
      descricao: "Descrição de teste.",
      resumo: "",
      imagem_url: "",
      personagem_nome: "",
      guilda_nome: "",
    },
    { idAdmin: 1 },
  );
  entradasCriadas.push(nota.id);

  // Sem isso, "resumo || descricao" do lado do jogador nunca cairia no
  // fallback certo (string vazia é falsy, mas "" !== null passaria
  // ileso por um "resumo ?? descricao" com nullish coalescing).
  assert.equal(nota.resumo, null);
  assert.equal(nota.imagem_url, null);
  assert.equal(nota.personagem_nome, null);
  assert.equal(nota.guilda_nome, null);
});

testeComBanco("admin: createAdminGuildJournalEntry rejeita categoria inválida", async () => {
  await assert.rejects(
    () =>
      adminGuildJournalService.createAdminGuildJournalEntry(
        { titulo: "X", descricao: "Y", categoria: "NaoExiste" },
        { idAdmin: 1 },
      ),
    /categoria/i,
  );
});

testeComBanco("admin: updateAdminGuildJournalEntry publica uma nota e atualiza campos parcialmente", async () => {
  const nota = await adminGuildJournalService.createAdminGuildJournalEntry(
    {
      titulo: `HeroiTeste é o primeiro Rank S ${sufixo()}`,
      descricao: "Descrição original.",
      categoria: "ConquistaIndividual",
      personagem_nome: "HeroiTeste",
    },
    { idAdmin: 1 },
  );
  entradasCriadas.push(nota.id);

  const atualizada = await adminGuildJournalService.updateAdminGuildJournalEntry(
    nota.id,
    { status: "Publicado", destaque: true },
    { idAdmin: 1 },
  );

  assert.equal(atualizada.status, "Publicado");
  assert.equal(atualizada.destaque, true);
  // Campos não enviados no update parcial permanecem intactos.
  assert.equal(atualizada.descricao, "Descrição original.");
  assert.equal(atualizada.personagem_nome, "HeroiTeste");
});

testeComBanco("admin: updateAdminGuildJournalEntry em id inexistente lança 404", async () => {
  await assert.rejects(
    () => adminGuildJournalService.updateAdminGuildJournalEntry(999999999, { status: "Publicado" }, { idAdmin: 1 }),
    (err) => err.statusCode === 404,
  );
});

testeComBanco("admin: listAdminGuildJournalEntries filtra por status/categoria/nome e ordena por ordem DESC", async () => {
  const marca = sufixo();
  const a = await adminGuildJournalService.createAdminGuildJournalEntry(
    { titulo: `Alpha ${marca}`, descricao: "d", categoria: "ConquistaDeGuilda", status: "Publicado" },
    { idAdmin: 1 },
  );
  const b = await adminGuildJournalService.createAdminGuildJournalEntry(
    { titulo: `Beta ${marca}`, descricao: "d", categoria: "Evento", status: "Rascunho" },
    { idAdmin: 1 },
  );
  entradasCriadas.push(a.id, b.id);

  const porNome = await adminGuildJournalService.listAdminGuildJournalEntries({ nome: marca });
  assert.equal(porNome.total, 2);
  // ordem DESC — a mais recente (maior ordem/id) primeiro.
  assert.equal(porNome.itens[0].id, b.id);

  const porStatus = await adminGuildJournalService.listAdminGuildJournalEntries({ status: "Publicado", nome: marca });
  assert.equal(porStatus.total, 1);
  assert.equal(porStatus.itens[0].id, a.id);

  const porCategoria = await adminGuildJournalService.listAdminGuildJournalEntries({ categoria: "Evento", nome: marca });
  assert.equal(porCategoria.total, 1);
  assert.equal(porCategoria.itens[0].id, b.id);
});

testeComBanco("público: getGuildJournal só mostra Publicado e Agendado já vencido — nunca Rascunho ou Agendado futuro", async () => {
  const marca = sufixo();
  const publicado = await adminGuildJournalService.createAdminGuildJournalEntry(
    { titulo: `Pub ${marca}`, descricao: "d", status: "Publicado" },
    { idAdmin: 1 },
  );
  const rascunho = await adminGuildJournalService.createAdminGuildJournalEntry(
    { titulo: `Rasc ${marca}`, descricao: "d", status: "Rascunho" },
    { idAdmin: 1 },
  );
  const agendadoPassado = await adminGuildJournalService.createAdminGuildJournalEntry(
    {
      titulo: `AgPassado ${marca}`,
      descricao: "d",
      status: "Agendado",
      publicado_em: "2000-01-01",
    },
    { idAdmin: 1 },
  );
  const agendadoFuturo = await adminGuildJournalService.createAdminGuildJournalEntry(
    {
      titulo: `AgFuturo ${marca}`,
      descricao: "d",
      status: "Agendado",
      publicado_em: "2999-01-01",
    },
    { idAdmin: 1 },
  );
  entradasCriadas.push(publicado.id, rascunho.id, agendadoPassado.id, agendadoFuturo.id);

  const req = {};
  const res = fakeRes();
  await guildJournalController.getGuildJournal(req, res);

  const idsVisiveis = res.body.data.notas
    .filter((n) => n.titulo.includes(marca))
    .map((n) => n.id)
    .sort((x, y) => x - y);

  assert.deepEqual(idsVisiveis.sort((x, y) => x - y), [publicado.id, agendadoPassado.id].sort((x, y) => x - y));
});

testeComBanco("modelo: categorias e status inválidos são rejeitados pelo ENUM do Postgres", async () => {
  await assert.rejects(() =>
    GuildJournalEntry.create({
      ordem: 1,
      titulo: "X",
      descricao: "Y",
      categoria: "NaoExisteNoEnum",
      status: "Publicado",
      publicado_em: new Date().toISOString().slice(0, 10),
    }),
  );
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
