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

// Ideia #4 da fila de melhorias — penalidade de XP/ouro pro GRUPO
// INTEIRO quando o membro de MAIOR nível está muito acima do teto de
// nível da zona (power-leveling: carregar um personagem fraco numa área
// fácil demais pra ele upar rápido escondido atrás de quem carrega).
//
// Usa SÓ o maior excesso do grupo (não a média, nem o excesso de cada
// um): um único "turista" de nível muito mais alto já é o problema
// inteiro, mesmo que o resto do grupo esteja no nível certo da zona —
// e um grupo todo parecido nunca é penalizado, mesmo se o nível deles
// for um pouco acima do recomendado (afinal "recomendado" não é um teto
// rígido, só uma referência de conteúdo).
//
// `tetoZona` é zona.nivel_monstro_max (o nível mais alto de monstro que
// o conteúdo da área foi desenhado pra entregar) — nunca
// nivel_jogador_minimo, que é só o piso de ENTRADA, não tem relação com
// "até onde essa área ainda vale a pena".
function calcularPenalidadePowerLeveling({ tetoZona, niveisDosMembros, config }) {
  const niveis = (niveisDosMembros ?? []).filter((n) => Number.isFinite(n));
  if (!Number.isFinite(tetoZona) || niveis.length === 0) {
    return { multiplicador: 1, excesso: 0, aplicada: false };
  }

  const maiorNivel = Math.max(...niveis);
  const excesso = Math.max(0, maiorNivel - tetoZona);

  if (excesso <= config.LIMIAR_NIVEL_ACIMA_DA_ZONA) {
    return { multiplicador: 1, excesso, aplicada: false };
  }

  const niveisAlemDoLimiar = excesso - config.LIMIAR_NIVEL_ACIMA_DA_ZONA;
  const multiplicador = Math.max(
    config.PISO_MULTIPLICADOR_RECOMPENSA,
    1 - niveisAlemDoLimiar * config.REDUCAO_RECOMPENSA_POR_NIVEL_EXCEDENTE,
  );
  return { multiplicador, excesso, aplicada: true };
}

module.exports = { persistirEstadoFinalDoMembro, calcularPenalidadePowerLeveling };
