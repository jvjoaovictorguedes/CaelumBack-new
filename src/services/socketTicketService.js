// Sockets não conseguem mandar um header Authorization como uma
// requisição HTTP normal, e o JWT de sessão é httpOnly (o browser nunca
// tem acesso a ele em JS) — então o cliente busca, via rota HTTP comum
// (authMiddleware, igual a qualquer outra), um "ticket" de curtíssima
// duração e manda ele no handshake do socket. O servidor do socket troca
// o ticket pelo personagem do dono de verdade; nunca mais confia num
// characterId que o próprio cliente informe.
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/jwt");

const VALIDADE_TICKET = "30s";
const PROPOSITO = "socket";

function emitirTicket(idUsuario) {
  return jwt.sign({ id: idUsuario, proposito: PROPOSITO }, JWT_SECRET, {
    expiresIn: VALIDADE_TICKET,
  });
}

function verificarTicket(ticket) {
  const decoded = jwt.verify(ticket, JWT_SECRET);
  if (decoded.proposito !== PROPOSITO) {
    throw new Error("Token não é um ticket de socket válido.");
  }
  return decoded;
}

module.exports = { emitirTicket, verificarTicket };
