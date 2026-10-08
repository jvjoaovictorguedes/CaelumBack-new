const partyBattleConfig = require("../config/partyBattleConfig");
const { poderesPublicos } = require("./pvpPayloads");

function montarPayloadBatalha(batalha) {
  return {
    battleId: batalha.id,
    zona: batalha.zona,
    inimigo: {
      nome: batalha.inimigo.nome,
      nivel: batalha.inimigo.nivel,
      vida_atual: batalha.inimigo.vida_atual,
      vida_maxima: batalha.inimigo.vida_maxima,
      imagem_url: batalha.inimigo.imagem_url,
    },
    membros: batalha.ordem.map((id) => {
      const m = batalha.membros.get(id);
      return {
        id: m.id,
        nome: m.nome,
        genero: m.genero,
        classe: m.classe,
        vidaMax: m.vidaMax,
        manaMax: m.manaMax,
        vida: m.estado.vida_atual,
        mana: m.estado.mana_atual,
        poderes: poderesPublicos(m.poderes),
        consumiveis: m.consumiveis,
      };
    }),
    ordem: batalha.ordem,
    turnoDe: batalha.ordem[batalha.turnoIndex],
    rodada: batalha.rodada,
    prazoSegundos: partyBattleConfig.PRAZO_TURNO_MS / 1000,
    // Transparência: se a recompensa vai sair reduzida pela diferença de
    // nível dentro do grupo, o grupo sabe disso ANTES de lutar (e
    // continua sabendo depois de um F5), não só ao ver o número final
    // menor em party:batalha-fim.
    penalidadeDiferencaNivel: batalha.penalidadeDiferencaNivel?.aplicada
      ? {
          multiplicador: batalha.penalidadeDiferencaNivel.multiplicador,
          diferencaNivel: batalha.penalidadeDiferencaNivel.diferenca,
        }
      : null,
  };
}

module.exports = { montarPayloadBatalha };
