// Pedido do jogador: responder uma mensagem específica do chat global,
// igual WhatsApp. Cobre a congelação de nome/texto da mensagem citada
// (globalChatService.persistirMensagem) e o mapeamento de volta em
// buscarHistorico, inclusive o caso de citar um id inválido/inexistente
// (nunca deve travar o envio, só vira uma mensagem sem citação).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const GlobalChatMessage = require("../src/models/GlobalChatMessage");
const Character = require("../src/models/Character");
const User = require("../src/models/User");
const globalChatService = require("../src/services/globalChatService");

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

const personagensCriados = [];
const usuariosCriados = [];
const mensagensCriadas = [];

test.after(async () => {
  if (!temBanco) return;
  if (mensagensCriadas.length > 0) await GlobalChatMessage.destroy({ where: { id: mensagensCriadas } });
  if (personagensCriados.length > 0) await Character.destroy({ where: { id: personagensCriados } });
  if (usuariosCriados.length > 0) await User.destroy({ where: { id: usuariosCriados } });
  await sequelize.close();
});

async function novoPersonagem() {
  const { usuario, personagem } = await criarPersonagem({ nivel: 5 });
  usuariosCriados.push(usuario.id);
  personagensCriados.push(personagem.id);
  return personagem;
}

testeComBanco("persistirMensagem sem idMensagemRespondida grava respondendoA nulo", async () => {
  const autor = await novoPersonagem();
  const criada = await globalChatService.persistirMensagem({
    idPersonagem: autor.id,
    nomePersonagem: autor.nome,
    texto: `Oi geral ${sufixo()}`,
  });
  mensagensCriadas.push(criada.id);

  assert.equal(criada.respondendoA, null);

  const linha = await GlobalChatMessage.findByPk(criada.id);
  assert.equal(linha.id_mensagem_respondida, null);
  assert.equal(linha.nome_personagem_respondido, null);
});

testeComBanco("persistirMensagem com reply congela nome/texto da mensagem citada", async () => {
  const autorOriginal = await novoPersonagem();
  const textoOriginal = `Vendo espada rara ${sufixo()}`;
  const original = await globalChatService.persistirMensagem({
    idPersonagem: autorOriginal.id,
    nomePersonagem: autorOriginal.nome,
    texto: textoOriginal,
  });
  mensagensCriadas.push(original.id);

  const autorResposta = await novoPersonagem();
  const resposta = await globalChatService.persistirMensagem({
    idPersonagem: autorResposta.id,
    nomePersonagem: autorResposta.nome,
    texto: "Quanto você quer?",
    idMensagemRespondida: original.id,
  });
  mensagensCriadas.push(resposta.id);

  assert.deepEqual(resposta.respondendoA, {
    id: original.id,
    nome: autorOriginal.nome,
    texto: textoOriginal,
  });

  // Congelado no banco, não um join ao vivo — mudar o nome do personagem
  // original depois não deveria afetar a citação já persistida.
  const linhaResposta = await GlobalChatMessage.findByPk(resposta.id);
  assert.equal(linhaResposta.nome_personagem_respondido, autorOriginal.nome);
  assert.equal(linhaResposta.texto_respondido, textoOriginal);
});

testeComBanco("persistirMensagem com id de mensagem inexistente ignora a citação em vez de falhar", async () => {
  const autor = await novoPersonagem();
  const criada = await globalChatService.persistirMensagem({
    idPersonagem: autor.id,
    nomePersonagem: autor.nome,
    texto: "Respondendo algo que já sumiu",
    idMensagemRespondida: 999999999,
  });
  mensagensCriadas.push(criada.id);

  assert.equal(criada.respondendoA, null);
});

testeComBanco("buscarHistorico mapeia respondendoA corretamente (com e sem citação)", async () => {
  const autorOriginal = await novoPersonagem();
  const original = await globalChatService.persistirMensagem({
    idPersonagem: autorOriginal.id,
    nomePersonagem: autorOriginal.nome,
    texto: `Mensagem original ${sufixo()}`,
  });
  mensagensCriadas.push(original.id);

  const autorResposta = await novoPersonagem();
  const resposta = await globalChatService.persistirMensagem({
    idPersonagem: autorResposta.id,
    nomePersonagem: autorResposta.nome,
    texto: "Resposta",
    idMensagemRespondida: original.id,
  });
  mensagensCriadas.push(resposta.id);

  const historico = await globalChatService.buscarHistorico();
  const linhaOriginal = historico.find((m) => m.id === original.id);
  const linhaResposta = historico.find((m) => m.id === resposta.id);

  assert.ok(linhaOriginal);
  assert.equal(linhaOriginal.respondendoA, null);

  assert.ok(linhaResposta);
  assert.deepEqual(linhaResposta.respondendoA, {
    id: original.id,
    nome: autorOriginal.nome,
    texto: original.texto,
  });
});
