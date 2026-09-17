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

module.exports = { personagemViaTicket };
