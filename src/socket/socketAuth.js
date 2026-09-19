// Resolve o personagem de verdade por trás de um socket a partir do
// ticket de curta duração (ver socketTicketService), nunca do
// characterId que o cliente informar diretamente — é isso que fecha a
// brecha de qualquer socket conectado poder "se identificar" como
// qualquer personagem só mandando o ID certo.
const Character = require("../models/Character");
const { verificarTicket } = require("../services/socketTicketService");

async function personagemViaTicket(ticket) {
  if (!ticket) return null;
  let decoded;
  try {
    decoded = verificarTicket(ticket);
  } catch {
    return null;
  }
  const personagem = await Character.findOne({ where: { id_usuario: decoded.id } });
  return personagem ? String(personagem.id) : null;
}

// Mensagens (§4 da spec "Mensagens em Tempo Real v2") são por USUÁRIO,
// não por personagem — diferente de PvP/Guilda. O ticket já carrega o
// id do usuário (ver socketTicketService.emitirTicket), então isso
// nem precisa ir ao banco: só decodifica e confere o propósito. Ao
// contrário de personagemViaTicket, nunca retorna null por "usuário sem
// personagem" — mensagens funcionam pra qualquer conta autenticada.
async function usuarioViaTicket(ticket) {
  if (!ticket) return null;
  try {
    const decoded = verificarTicket(ticket);
    return decoded?.id ? String(decoded.id) : null;
  } catch {
    return null;
  }
}

module.exports = { personagemViaTicket, usuarioViaTicket };
