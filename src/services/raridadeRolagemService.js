// Sorteio (e verificação) de raça/classe rara — inteiramente no
// servidor. Antes o frontend sorteava sozinho (Math.random) se a opção
// rara aparecia, e depois simplesmente mandava o id da raça/classe
// escolhida em POST /characters: nada impedia um cliente de pular o
// sorteio e mandar direto o id de uma raça/classe marcada como `raro`.
//
// Agora: o cliente pede um sorteio (POST /races/sortear-raro ou
// /classes/sortear-raro), o SERVIDOR decide se ganhou e qual opção rara
// foi liberada, e — só se ganhou — devolve um ticket JWT de curta
// duração amarrado a (usuário, id da opção). createCharacter exige esse
// ticket, validado aqui, antes de aceitar um id_raca/id_classe marcado
// como raro. O cliente nunca escolhe a rara só informando o ID.
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/jwt");

const VALIDADE_TICKET = "10m"; // dá tempo de terminar o resto do wizard de criação
const PROPOSITO_RACA = "raca-rara";
const PROPOSITO_CLASSE = "classe-rara";

// Mesmas chances que existiam no frontend antes desta mudança — só a
// AUTORIDADE da decisão migrou pro servidor, o balanceamento não mudou.
const CHANCE_RACA_RARA_PERCENTUAL = 0.9;
const CHANCE_CLASSE_RARA_PERCENTUAL = 0.01;

function sortearRacaRaraGanhou() {
  return Math.random() * 100 <= CHANCE_RACA_RARA_PERCENTUAL;
}

function sortearClasseRaraGanhou() {
  return Math.random() * 100 <= CHANCE_CLASSE_RARA_PERCENTUAL;
}

function emitirTicket(proposito, idUsuario, idOpcao) {
  return jwt.sign({ proposito, idUsuario, idOpcao }, JWT_SECRET, {
    expiresIn: VALIDADE_TICKET,
  });
}

function verificarTicket(ticket, proposito, idUsuario, idOpcao) {
  if (!ticket) return false;
  try {
    const decoded = jwt.verify(ticket, JWT_SECRET);
    return (
      decoded.proposito === proposito &&
      Number(decoded.idUsuario) === Number(idUsuario) &&
      Number(decoded.idOpcao) === Number(idOpcao)
    );
  } catch {
    return false;
  }
}

module.exports = {
  PROPOSITO_RACA,
  PROPOSITO_CLASSE,
  sortearRacaRaraGanhou,
  sortearClasseRaraGanhou,
  emitirTicket,
  verificarTicket,
};
