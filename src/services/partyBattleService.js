// Persistência de vida/mana ao fim de uma batalha de grupo (Party da
// Aventura) — extraído do finalizarBatalha de partySocket.js só pra
// poder ser testado sem precisar levantar um servidor socket.io de
// verdade (partySocket.js não exporta nada além do registrador de
// handlers). Sem efeito colateral próprio: só muta o `character` que
// recebe, quem chama decide quando salvar (mesmo padrão de
// regenService.js).
function persistirEstadoFinalDoMembro(character, membro) {
  if (!character || !membro) return;

  character.vida_atual = Math.max(0, Math.min(membro.estado.vida_atual, membro.vidaMax));
  character.mana_atual = Math.max(0, Math.min(membro.estado.mana_atual, membro.manaMax));
  character.ultima_atualizacao_vida = new Date();
  character.ultima_atualizacao_mana = new Date();
}

module.exports = { persistirEstadoFinalDoMembro };
