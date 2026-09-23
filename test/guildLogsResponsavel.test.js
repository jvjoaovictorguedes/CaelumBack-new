// Bug relatado: "o logs só aparece o que foi feito e não quem" —
// GuildLog sempre guardou id_personagem_responsavel/id_personagem_alvo,
// mas listarLogs nunca resolvia esses IDs pra nome antes de responder.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
const Guild = require("../src/models/Guild");
const GuildMember = require("../src/models/GuildMember");
const guildController = require("../src/controllers/guildController");

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

testeComBanco("listarLogs devolve o nome de quem fez a ação (e do alvo, quando existe)", async () => {
  const { personagem: fundador } = await criarPersonagem({ nivel: 10 });
  const { personagem: outro } = await criarPersonagem({ nivel: 8 });
  const chave = sufixo();
  const guild = await Guild.create({
    nome: `Guilda ${chave}`.slice(0, 24),
    sigla: Math.random().toString(36).slice(2, 7).toUpperCase(),
    id_fundador: fundador.id,
    id_lider: fundador.id,
  });
  await GuildMember.create({ id_guild: guild.id, id_personagem: fundador.id, cargo: "Fundador" });
  await GuildMember.create({ id_guild: guild.id, id_personagem: outro.id, cargo: "Membro" });

  // Edição de identidade registra só o responsável (sem alvo).
  const edicao = reqRes({
    params: { id: String(guild.id) },
    body: { descricao: "Nova descrição" },
    personagemAtual: { id: fundador.id },
  });
  await guildController.editarGuild(edicao.req, edicao.res);
  assert.equal(edicao.resultado().statusCode, 200, JSON.stringify(edicao.resultado().corpo));

  // Expulsão registra responsável E alvo (dois personagens diferentes).
  const expulsao = reqRes({
    params: { id: String(guild.id), characterId: String(outro.id) },
    personagemAtual: { id: fundador.id },
  });
  await guildController.expulsar(expulsao.req, expulsao.res);
  assert.equal(expulsao.resultado().statusCode, 200, JSON.stringify(expulsao.resultado().corpo));

  const listagem = reqRes({ params: { id: String(guild.id) } });
  await guildController.listarLogs(listagem.req, listagem.res);
  const { statusCode, corpo } = listagem.resultado();
  assert.equal(statusCode, 200);

  const logs = corpo.data.logs;
  assert.ok(logs.length >= 2);

  const logEdicao = logs.find((l) => l.tipo === "edicao_identidade");
  assert.ok(logEdicao, "esperava um log de edicao_identidade");
  assert.equal(logEdicao.nome_responsavel, fundador.nome);
  assert.equal(logEdicao.nome_alvo, null);

  const logExpulsao = logs.find((l) => l.tipo === "expulsao");
  assert.ok(logExpulsao, "esperava um log de expulsao");
  assert.equal(logExpulsao.nome_responsavel, fundador.nome);
  assert.equal(logExpulsao.nome_alvo, outro.nome);
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
