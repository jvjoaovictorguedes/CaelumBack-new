// Caçadas §3.3/§10/§16 — aceitar, abandonar e consultar o estado
// (oferta da janela atual + Caçada Ativa, se houver) de um personagem.
const CharacterAdventureHunt = require("../models/CharacterAdventureHunt");
const { garantirOfertaAtual } = require("./adventureHuntRotationService");
const { inicioDaJanelaDeCacada } = require("../config/huntConfig");

function erroCacada(statusCode, mensagem) {
  return Object.assign(new Error(mensagem), { statusCode });
}

async function obterCacadaAtiva(idPersonagem, transaction) {
  return CharacterAdventureHunt.findOne({
    where: { id_personagem: idPersonagem, status: "Active" },
    transaction,
  });
}

// GET /hunt — garante a oferta da janela atual (gera se preciso) e
// devolve junto a Caçada Ativa, se existir.
async function obterEstado(idPersonagem, transaction) {
  const [oferta, ativa] = await Promise.all([
    garantirOfertaAtual(idPersonagem, transaction),
    obterCacadaAtiva(idPersonagem, transaction),
  ]);
  return { oferta, ativa };
}

// §3.3/§19 — aceitar exige: oferta existe, pertence ao personagem,
// ainda está "Offered", ainda é da janela ATUAL, e não existe outra
// Caçada Ativa (o índice único parcial garante isso no banco; a
// checagem aqui só existe pra devolver um 409 limpo em vez de deixar o
// erro de constraint estourar como 500).
async function aceitarOferta(idPersonagem, idOferta, transaction) {
  const jaAtiva = await obterCacadaAtiva(idPersonagem, transaction);
  if (jaAtiva) {
    throw erroCacada(409, "Você já tem uma Caçada Ativa — conclua ou abandone antes de aceitar outra.");
  }

  const oferta = await CharacterAdventureHunt.findOne({
    where: { id: idOferta, id_personagem: idPersonagem },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!oferta) throw erroCacada(404, "Caçada não encontrada.");
  if (oferta.status !== "Offered") {
    throw erroCacada(409, "Esta oferta não está mais disponível para aceite.");
  }

  const janelaAtual = inicioDaJanelaDeCacada();
  if (oferta.rotation_start.getTime() !== janelaAtual.getTime()) {
    throw erroCacada(409, "Esta oferta já não faz parte da janela atual.");
  }

  oferta.status = "Active";
  oferta.accepted_at = new Date();
  try {
    await oferta.save({ transaction });
  } catch (erro) {
    // Último cinto de segurança contra corrida (duas abas aceitando ao
    // mesmo tempo) — o índice único parcial (status='Active') do banco
    // rejeita a segunda em vez de deixar as duas ativas.
    if (erro.name === "SequelizeUniqueConstraintError") {
      throw erroCacada(409, "Você já tem uma Caçada Ativa — conclua ou abandone antes de aceitar outra.");
    }
    throw erro;
  }

  return oferta;
}

// §10 — abandono perde todo progresso e não concede nada; o modificador
// deixa de se aplicar imediatamente porque o próximo encontro só olha
// pra Caçadas com status='Active' (ver adventureHuntCombatService.js).
async function abandonarCacada(idPersonagem, idCacada, transaction) {
  const cacada = await CharacterAdventureHunt.findOne({
    where: { id: idCacada, id_personagem: idPersonagem, status: "Active" },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!cacada) throw erroCacada(404, "Caçada Ativa não encontrada.");

  cacada.status = "Abandoned";
  cacada.abandoned_at = new Date();
  await cacada.save({ transaction });
  return cacada;
}

module.exports = { obterEstado, obterCacadaAtiva, aceitarOferta, abandonarCacada };
