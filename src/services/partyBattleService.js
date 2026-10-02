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

// Pedido do jogador: penalidade de XP/ouro pro GRUPO INTEIRO quando a
// DIFERENÇA DE NÍVEL DENTRO DO PRÓPRIO GRUPO é grande demais
// (power-leveling: carregar um personagem fraco escondido atrás de quem
// carrega, não importa o nível da zona em si). Compara o maior nível
// do grupo com o MENOR — um grupo todo parecido nunca é penalizado,
// mesmo numa zona muito acima ou abaixo do nível deles; só quando
// alguém destoa MUITO dos próprios companheiros.
function calcularPenalidadeDiferencaNivel({ niveisDosMembros, config }) {
  const niveis = (niveisDosMembros ?? []).filter((n) => Number.isFinite(n));
  if (niveis.length === 0) {
    return { multiplicador: 1, diferenca: 0, aplicada: false };
  }

  const maiorNivel = Math.max(...niveis);
  const menorNivel = Math.min(...niveis);
  const diferenca = maiorNivel - menorNivel;

  if (diferenca <= config.LIMIAR_DIFERENCA_NIVEL_PARTY) {
    return { multiplicador: 1, diferenca, aplicada: false };
  }

  const niveisAlemDoLimiar = diferenca - config.LIMIAR_DIFERENCA_NIVEL_PARTY;
  const multiplicador = Math.max(
    config.PISO_MULTIPLICADOR_RECOMPENSA,
    1 - niveisAlemDoLimiar * config.REDUCAO_RECOMPENSA_POR_NIVEL_EXCEDENTE,
  );
  return { multiplicador, diferenca, aplicada: true };
}

module.exports = { persistirEstadoFinalDoMembro, calcularPenalidadeDiferencaNivel };
