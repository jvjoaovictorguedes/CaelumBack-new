// Item 8 (pedido: Mural da guilda — líder e o cargo logo abaixo dele
// podem postar/remover mensagem; o resto só lê).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
const Guild = require("../src/models/Guild");
const GuildMember = require("../src/models/GuildMember");
require("../src/controllers/guildController");
const guildMuralController = require("../src/controllers/guildMuralController");

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

async function criarGuildComMembro(cargo) {
  const { personagem: fundador } = await criarPersonagem({ nivel: 10 });
  const chave = sufixo();
  const sigla = Math.random().toString(36).slice(2, 7).toUpperCase();
  const guild = await Guild.create({
    nome: `Guilda ${chave}`.slice(0, 24),
    sigla,
    id_fundador: fundador.id,
    id_lider: fundador.id,
  });
  await GuildMember.create({ id_guild: guild.id, id_personagem: fundador.id, cargo: "Fundador" });

  if (cargo === "Fundador") return { guild, personagem: fundador };

  const { personagem: outro } = await criarPersonagem({ nivel: 10 });
  await GuildMember.create({ id_guild: guild.id, id_personagem: outro.id, cargo });
  return { guild, personagem: outro };
}

function reqRes({ params = {}, body = {}, personagemAtual }) {
  let statusCode = null;
  let corpo = null;
  const req = { params, body, personagemAtual };
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

testeComBanco("Fundador consegue postar e remover mensagem no mural", async () => {
  const { guild, personagem } = await criarGuildComMembro("Fundador");

  const post = reqRes({ params: { id: String(guild.id) }, body: { texto: "Bem-vindos!" }, personagemAtual: { id: personagem.id } });
  await guildMuralController.criar(post.req, post.res);
  const { statusCode: statusPost, corpo: corpoPost } = post.resultado();
  assert.equal(statusPost, 201);
  assert.equal(corpoPost.data.mensagem.texto, "Bem-vindos!");
  assert.equal(corpoPost.data.mensagem.nomeAutor, personagem.nome);

  const idMensagem = corpoPost.data.mensagem.id;
  const del = reqRes({ params: { id: String(guild.id), messageId: String(idMensagem) }, personagemAtual: { id: personagem.id } });
  await guildMuralController.deletar(del.req, del.res);
  assert.equal(del.resultado().statusCode, 200);
});

testeComBanco("Oficial (cargo logo abaixo do líder) também consegue postar", async () => {
  const { guild, personagem } = await criarGuildComMembro("Oficial");

  const post = reqRes({ params: { id: String(guild.id) }, body: { texto: "Aviso do oficial" }, personagemAtual: { id: personagem.id } });
  await guildMuralController.criar(post.req, post.res);
  assert.equal(post.resultado().statusCode, 201);
});

testeComBanco("Veterano NÃO consegue postar (403) — só Fundador/Oficial gerenciam o mural", async () => {
  const { guild, personagem } = await criarGuildComMembro("Veterano");

  const post = reqRes({ params: { id: String(guild.id) }, body: { texto: "Tentando postar" }, personagemAtual: { id: personagem.id } });
  await guildMuralController.criar(post.req, post.res);
  assert.equal(post.resultado().statusCode, 403);
});

testeComBanco("Membro comum NÃO consegue remover mensagem alheia (403)", async () => {
  const { guild, personagem: fundador } = await criarGuildComMembro("Fundador");
  const { personagem: membroComum } = await criarPersonagem({ nivel: 5 });
  await GuildMember.create({ id_guild: guild.id, id_personagem: membroComum.id, cargo: "Membro" });

  const post = reqRes({ params: { id: String(guild.id) }, body: { texto: "Aviso oficial" }, personagemAtual: { id: fundador.id } });
  await guildMuralController.criar(post.req, post.res);
  const idMensagem = post.resultado().corpo.data.mensagem.id;

  const del = reqRes({ params: { id: String(guild.id), messageId: String(idMensagem) }, personagemAtual: { id: membroComum.id } });
  await guildMuralController.deletar(del.req, del.res);
  assert.equal(del.resultado().statusCode, 403);
});

testeComBanco("qualquer membro consegue LISTAR o mural (view-only)", async () => {
  const { guild, personagem: fundador } = await criarGuildComMembro("Fundador");
  await guildMuralController.criar(
    reqRes({ params: { id: String(guild.id) }, body: { texto: "Mensagem 1" }, personagemAtual: { id: fundador.id } }).req,
    reqRes({ params: { id: String(guild.id) }, body: { texto: "Mensagem 1" }, personagemAtual: { id: fundador.id } }).res,
  );

  const list = reqRes({ params: { id: String(guild.id) } });
  await guildMuralController.listar(list.req, list.res);
  const { statusCode, corpo } = list.resultado();
  assert.equal(statusCode, 200);
  assert.ok(Array.isArray(corpo.data.mensagens));
});

testeComBanco("mensagem vazia é rejeitada (400)", async () => {
  const { guild, personagem } = await criarGuildComMembro("Fundador");

  const post = reqRes({ params: { id: String(guild.id) }, body: { texto: "   " }, personagemAtual: { id: personagem.id } });
  await guildMuralController.criar(post.req, post.res);
  assert.equal(post.resultado().statusCode, 400);
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
