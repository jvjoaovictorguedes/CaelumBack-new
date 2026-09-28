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
const crypto = require("crypto");
const { JWT_SECRET } = require("../config/jwt");

const VALIDADE_TICKET = "10m"; // dá tempo de terminar o resto do wizard de criação
const PROPOSITO_RACA = "raca-rara";
const PROPOSITO_CLASSE = "classe-rara";

// Mesmas chances que existiam antes — só a AUTORIDADE da decisão migrou
// pro servidor, o balanceamento não mudou. Base 10.000 pra representar
// exatamente 0.9% (90/10.000) e 0.01% (1/10.000) sem perda de precisão.
const CHANCE_RACA_RARA_BASE10000 = 90;
const CHANCE_CLASSE_RARA_BASE10000 = 1;
const BASE_SORTEIO = 10000;

// crypto.randomInt (CSPRNG) em vez de Math.random(): Math.random() usa
// um gerador determinístico não pensado pra imprevisibilidade
// criptográfica — nada aqui sugere que já foi explorado, mas pra uma
// decisão de "ganhou algo raro" que vale a pena tentar prever/manipular,
// a fonte de aleatoriedade correta é a criptográfica, não a de uso geral.
function sortearRacaRaraGanhou() {
  return crypto.randomInt(0, BASE_SORTEIO) < CHANCE_RACA_RARA_BASE10000;
}

function sortearClasseRaraGanhou() {
  return crypto.randomInt(0, BASE_SORTEIO) < CHANCE_CLASSE_RARA_BASE10000;
}

// Escolhe um índice aleatório entre 0 e tamanho-1 (usado pra sortear
// QUAL opção rara entre várias, depois de já decidido que ganhou algo)
// — mesma fonte criptográfica, por consistência.
function indiceAleatorio(tamanho) {
  return crypto.randomInt(0, tamanho);
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
  indiceAleatorio,
  emitirTicket,
  verificarTicket,
};
