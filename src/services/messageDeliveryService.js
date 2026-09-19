// Mensagens em Tempo Real v2 — lógica de envio/leitura compartilhada
// entre a rota REST (messageController.js, fallback/carga inicial) e o
// socket (messagesSocket.js, caminho ao vivo). Persistência SEMPRE
// acontece aqui antes de qualquer emit — nunca depende só do socket
// (spec §3/§7): se `io` não for passado (ou destinatário não estiver
// na sala), a mensagem já está gravada e será recuperada via REST.
const { Op } = require("sequelize");
const Message = require("../models/Message");
const User = require("../models/User");

const LIMITE_CONTEUDO = 2000;

function salaDoUsuario(idUsuario) {
  return `user:${idUsuario}`;
}

// Resumo de UMA conversa do ponto de vista de `idDono` (usado tanto na
// inbox REST quanto no evento inbox:update) — mesmo shape dos dois.
async function resumoConversaPara(idDono, idOutro) {
  const condicaoPar = {
    [Op.or]: [
      { id_remetente: idDono, id_destinatario: idOutro },
      { id_remetente: idOutro, id_destinatario: idDono },
    ],
  };

  const [ultima, naoLidas, outroUsuario] = await Promise.all([
    Message.findOne({ where: condicaoPar, order: [["createdAt", "DESC"]] }),
    Message.count({ where: { id_remetente: idOutro, id_destinatario: idDono, lida: false } }),
    User.findByPk(idOutro, { attributes: ["id", "username"] }),
  ]);

  if (!outroUsuario) return null;

  return {
    usuario: { id: outroUsuario.id, username: outroUsuario.username },
    ultimaMensagem: ultima?.conteudo ?? null,
    ultimaMensagemEm: ultima?.createdAt ?? null,
    naoLidas,
  };
}

// Envia (persiste) uma mensagem e, se `io` for passado, notifica em
// tempo real: message:new pro destinatário, inbox:update pros dois
// lados (§5/§7). `clientMessageId` garante idempotência (§6) — reenviar
// o mesmo id pelo mesmo remetente devolve a mensagem já criada, nunca
// duplica.
async function enviarMensagem({ idRemetente, idDestinatario, conteudo, clientMessageId, io }) {
  if (!idDestinatario || !conteudo?.trim()) {
    return { erro: "id_destinatario e conteudo são obrigatórios." };
  }

  if (String(idRemetente) === String(idDestinatario)) {
    return { erro: "Não é possível enviar mensagem para si mesmo." };
  }

  if (conteudo.length > LIMITE_CONTEUDO) {
    return { erro: `Mensagem muito longa (máximo ${LIMITE_CONTEUDO} caracteres).` };
  }

  if (clientMessageId) {
    const existente = await Message.findOne({
      where: { id_remetente: idRemetente, client_message_id: clientMessageId },
    });
    if (existente) {
      return { mensagem: existente, duplicada: true };
    }
  }

  const [remetente, destinatario] = await Promise.all([
    User.findByPk(idRemetente),
    User.findByPk(idDestinatario),
  ]);
  if (!remetente) return { erro: "Remetente não encontrado." };
  if (!destinatario) return { erro: "Destinatário não encontrado." };

  const mensagem = await Message.create({
    id_remetente: idRemetente,
    id_destinatario: idDestinatario,
    conteudo: conteudo.trim(),
    client_message_id: clientMessageId ?? null,
  });

  if (io) {
    io.to(salaDoUsuario(idDestinatario)).emit("message:new", mensagem);

    const [resumoDestinatario, resumoRemetente] = await Promise.all([
      resumoConversaPara(idDestinatario, idRemetente),
      resumoConversaPara(idRemetente, idDestinatario),
    ]);
    if (resumoDestinatario) io.to(salaDoUsuario(idDestinatario)).emit("inbox:update", resumoDestinatario);
    if (resumoRemetente) io.to(salaDoUsuario(idRemetente)).emit("inbox:update", resumoRemetente);
  }

  return { mensagem, duplicada: false };
}

// Marca como lidas as mensagens que `idOutroUsuario` mandou pra
// `idUsuario` e notifica os dois lados (§9): message:read pro
// remetente original (confirmação de leitura) e inbox:update pra quem
// leu (zera o não-lidas dessa conversa na lista).
async function marcarConversaComoLida({ idUsuario, idOutroUsuario, io }) {
  const [quantidade] = await Message.update(
    { lida: true },
    { where: { id_remetente: idOutroUsuario, id_destinatario: idUsuario, lida: false } },
  );

  if (quantidade > 0 && io) {
    io.to(salaDoUsuario(idOutroUsuario)).emit("message:read", { porUsuario: Number(idUsuario) });
    const resumoParaLeitor = await resumoConversaPara(idUsuario, idOutroUsuario);
    if (resumoParaLeitor) io.to(salaDoUsuario(idUsuario)).emit("inbox:update", resumoParaLeitor);
  }

  return quantidade;
}

module.exports = {
  salaDoUsuario,
  resumoConversaPara,
  enviarMensagem,
  marcarConversaComoLida,
  LIMITE_CONTEUDO,
};
