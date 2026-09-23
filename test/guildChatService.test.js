// Item 7 (bug/pedido: chat de guilda não guardava histórico nenhum —
// agora guarda, mas apaga tudo todo mês).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
const Guild = require("../src/models/Guild");
const GuildChatMessage = require("../src/models/GuildChatMessage");
const { persistirMensagem, buscarHistorico } = require("../src/services/guildChatService");

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

async function criarGuild() {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  const chave = sufixo();
  // sigla precisa ser única e curta (STRING(5)) — sufixo() cru colide
  // fácil quando truncado pros 5 primeiros caracteres (mesmo pid, mesmo
  // segundo em chamadas seguidas dentro do mesmo teste).
  const sigla = Math.random().toString(36).slice(2, 7).toUpperCase();
  const guild = await Guild.create({
    nome: `Guilda ${chave}`.slice(0, 24),
    sigla,
    id_fundador: personagem.id,
    id_lider: personagem.id,
  });
  return { guild, personagem };
}

testeComBanco("persiste e devolve o histórico em ordem cronológica", async () => {
  const { guild, personagem } = await criarGuild();

  await persistirMensagem({ idGuild: guild.id, idPersonagem: personagem.id, nomePersonagem: personagem.nome, texto: "oi" });
  await persistirMensagem({ idGuild: guild.id, idPersonagem: personagem.id, nomePersonagem: personagem.nome, texto: "tudo bem?" });

  const historico = await buscarHistorico(guild.id);

  assert.equal(historico.length, 2);
  assert.equal(historico[0].texto, "oi");
  assert.equal(historico[1].texto, "tudo bem?");
  assert.equal(historico[0].idPersonagem, personagem.id);
  assert.equal(historico[0].nome, personagem.nome);
  assert.ok(historico[0].data);
});

testeComBanco("mensagem de mês anterior é apagada ao buscar o histórico", async () => {
  const { guild, personagem } = await criarGuild();

  await persistirMensagem({ idGuild: guild.id, idPersonagem: personagem.id, nomePersonagem: personagem.nome, texto: "mensagem antiga" });
  const [mensagemAntiga] = await GuildChatMessage.findAll({ where: { id_guild: guild.id } });
  const mesPassado = new Date();
  mesPassado.setMonth(mesPassado.getMonth() - 1);
  // Sequelize ignora createdAt em .update()/.save() por ser um campo de
  // timestamp gerenciado automaticamente — precisa de SQL cru pra
  // simular "essa mensagem é de um mês anterior" no teste.
  await sequelize.query(`UPDATE "GuildChatMessages" SET "createdAt" = :data WHERE id = :id`, {
    replacements: { data: mesPassado, id: mensagemAntiga.id },
  });

  await persistirMensagem({ idGuild: guild.id, idPersonagem: personagem.id, nomePersonagem: personagem.nome, texto: "mensagem nova" });

  const historico = await buscarHistorico(guild.id);

  assert.equal(historico.length, 1);
  assert.equal(historico[0].texto, "mensagem nova");

  const restantesNoBanco = await GuildChatMessage.count({ where: { id_guild: guild.id } });
  assert.equal(restantesNoBanco, 1, "a mensagem do mês anterior devia ter sido DELETADA, não só filtrada");
});

testeComBanco("histórico de uma guilda nunca mistura mensagem de outra", async () => {
  const guildA = await criarGuild();
  const guildB = await criarGuild();

  await persistirMensagem({ idGuild: guildA.guild.id, idPersonagem: guildA.personagem.id, nomePersonagem: guildA.personagem.nome, texto: "da guilda A" });
  await persistirMensagem({ idGuild: guildB.guild.id, idPersonagem: guildB.personagem.id, nomePersonagem: guildB.personagem.nome, texto: "da guilda B" });

  const historicoA = await buscarHistorico(guildA.guild.id);

  assert.equal(historicoA.length, 1);
  assert.equal(historicoA[0].texto, "da guilda A");
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
