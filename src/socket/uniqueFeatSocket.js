// Sistema de Proezas Únicas §12.1 — anúncio global "UMA NOVA LENDA FOI
// ESCRITA" pra TODO MUNDO conectado, não uma sala específica (todo
// personagem em Caelum tem interesse em saber que uma Proeza acabou de
// ser escrita na história do servidor). Emitido SÓ depois do COMMIT
// (nunca de dentro da transaction que fez o claim) — ver
// uniqueFeatPublicService.anunciarConquistas, chamado pelos próprios
// pontos de integração (uniqueFeatTriggerRegistry/uniqueFeatService)
// depois que a transaction de origem já resolveu.
let ioRegistrado = null;

function emitGlobal(evento, payload) {
  ioRegistrado?.emit(evento, payload);
}

module.exports = function registerUniqueFeatHandlers(io) {
  ioRegistrado = io;
};

module.exports.emitGlobal = emitGlobal;
