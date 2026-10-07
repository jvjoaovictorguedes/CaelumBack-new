const rankedTierService = require("../services/rankedTierService");
const { poderesPublicos } = require("./pvpPayloads");

function montarPayloadInicio(duelo, ehResync = false, prazoTurnoMs = 5000) {
  return {
    duelId: duelo.id,
    arena: "Arena Ranqueada de Caelum",
    ranked: true,
    assincrono: true,
    rankedMatchId: duelo.rankedMatchId,
    temporada: { id: duelo.seasonId },
    a: { id: duelo.a.id, nome: duelo.a.nome, genero: duelo.a.genero, classe: duelo.a.classe, chave: "A" },
    b: {
      id: duelo.b.id,
      nome: duelo.b.nome,
      genero: duelo.b.genero,
      classe: duelo.b.classe,
      chave: "B",
      controladoPorIA: true,
    },
    ratingA: duelo.ratingAntes.A,
    ratingB: duelo.ratingAntes.B,
    tierA: rankedTierService.resumoTier(duelo.ratingAntes.A),
    tierB: rankedTierService.resumoTier(duelo.ratingAntes.B),
    vidaMaxA: duelo.a.vidaMax,
    vidaMaxB: duelo.b.vidaMax,
    manaMaxA: duelo.a.manaMax,
    manaMaxB: duelo.b.manaMax,
    vidaA: duelo.a.estado.vida_atual,
    vidaB: duelo.b.estado.vida_atual,
    manaA: duelo.a.estado.mana_atual,
    manaB: duelo.b.estado.mana_atual,
    poderesA: poderesPublicos(duelo.a.poderes),
    poderesB: poderesPublicos(duelo.b.poderes),
    // §10 — consumíveis desabilitados no ranqueado: a lista vai vazia
    // pro cliente nem oferecer o botão, e o servidor rejeita de novo
    // caso alguém mande mesmo assim (pvpLiveSocket.js).
    consumiveisA: [],
    consumiveisB: [],
    consumiveisHabilitados: false,
    turnoDe: duelo.turnoDe,
    prazoSegundos: prazoTurnoMs / 1000,
    resync: ehResync,
  };
}

function montarPayloadRating({ duelId, duelo, resultado }) {
  return {
      duelId,
      ratingAntes: resultado.ratingAntes,
      ratingDepois: resultado.ratingDepois,
      delta: resultado.delta,
      tierAntes: rankedTierService.resumoTier(resultado.ratingAntes),
      tierDepois: rankedTierService.resumoTier(resultado.ratingDepois),
      // §8 — explicitado no payload pra não restar dúvida no cliente.
      defensorControladoPorIA: true,
      ratingDefensorInalterado: duelo.ratingAntes[duelo.ia],
    };
}

module.exports = { montarPayloadInicio, montarPayloadRating };
