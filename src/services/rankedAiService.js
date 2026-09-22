// IA da Arena Ranqueada (PvP v2 §9).
//
// O defensor de uma partida ranqueada assíncrona é um SNAPSHOT do
// personagem real (nível, classe, atributos, equipamento/refinamento,
// habilidades, passivas já aplicados por carregarLutador) — mas quem
// joga por ele é esta política de decisão. O `escolherAcao` do duelo
// casual (pvpController.js) continua intocado: lá a escolha é sorteio
// simples entre poderes ofensivos pagáveis, e mexer nisso mudaria o
// equilíbrio do casual.
//
// POR QUE cada regra existe (isto é decisão de balanceamento, não
// detalhe óbvio de implementação):
//
// - CURA COM HP BAIXO: sem isso, um build com poder de cura joga pior
//   que um sem, porque nunca usaria a cura. O limiar (35% por padrão,
//   IA_LIMIAR_CURA_PERCENTUAL) é baixo de propósito: curar cedo demais
//   desperdiça mana e alonga a partida sem aumentar a chance de vitória.
// - RESERVA DE MANA: a IA evita gastar a última mana num poder caro e
//   fraco. Sem reserva, ela "queimava" mana em turno 1 e passava o
//   resto do duelo só com ataque básico — perdia pra qualquer humano
//   que administrasse recurso.
// - EFICIÊNCIA (dano por mana, não dano bruto): usar sempre o poder de
//   maior dano parece forte mas é pior a médio prazo; o custo escala
//   mais rápido que o dano na maioria dos poderes do jogo.
// - ALEATORIEDADE PONDERADA no top-N: uma IA 100% determinística vira
//   um padrão decorável — o jogador aprende a sequência exata e joga
//   contra o script, não contra o build. O sorteio ponderado mantém a
//   escolha quase sempre boa, sem ser previsível.
// - NUNCA CONSUMÍVEIS: ranqueado tem consumível desabilitado (§10), e a
//   IA não pode nem tentar — inventário do defensor offline não é
//   consumido por uma partida que ele não está jogando.
const {
  custoManaEfetivo,
  vidaMaximaDe,
  manaMaximaDe,
} = require("./combatFormulas");
const {
  IA_LIMIAR_CURA_PERCENTUAL,
  IA_RESERVA_MANA_PERCENTUAL,
  IA_TAMANHO_TOP_ESCOLHAS,
} = require("../config/rankedConfig");

function poderesUsaveis(estado, poderes) {
  return (poderes ?? []).filter((p) => {
    if (p.tipo_poder && p.tipo_poder !== "Ativo") return false;
    return custoManaEfetivo(p, p.nivel_habilidade ?? 1) <= estado.mana_atual;
  });
}

// Sorteio ponderado: a opção melhor pontuada tem a maior chance, mas
// nunca 100%. Peso proporcional à pontuação (mínimo 1 pra nada ficar
// com chance zero).
function sortearPonderado(opcoes) {
  const pesos = opcoes.map((o) => Math.max(1, o.pontuacao));
  const total = pesos.reduce((acc, p) => acc + p, 0);
  let sorteio = Math.random() * total;
  for (let i = 0; i < opcoes.length; i += 1) {
    sorteio -= pesos[i];
    if (sorteio <= 0) return opcoes[i];
  }
  return opcoes[opcoes.length - 1];
}

// `lutador` no formato de pvpLiveSocket.carregarLutador:
// { estado, poderes, vidaMax, manaMax }.
// Retorna { acao, resumo } — `resumo` vai pro log (§18).
function escolherAcaoIA(lutador) {
  const estado = lutador.estado;
  const vidaMax = lutador.vidaMax ?? vidaMaximaDe(estado);
  const manaMax = lutador.manaMax ?? manaMaximaDe(estado);
  const percentualVida = vidaMax > 0 ? estado.vida_atual / vidaMax : 1;
  const manaReservada = manaMax * IA_RESERVA_MANA_PERCENTUAL;

  const usaveis = poderesUsaveis(estado, lutador.poderes);
  const curas = usaveis.filter((p) => (p.cura_base ?? 0) > 0);
  const ofensivos = usaveis.filter((p) => (p.dano_base ?? 0) > 0);

  // 1) Cura: só quando realmente está em perigo E a cura ainda tem o
  // que recuperar (curar com vida quase cheia é mana jogada fora).
  if (percentualVida <= IA_LIMIAR_CURA_PERCENTUAL && curas.length > 0) {
    const melhorCura = curas.sort((a, b) => (b.cura_base ?? 0) - (a.cura_base ?? 0))[0];
    return {
      acao: { tipo: "power", power: melhorCura },
      resumo: {
        decisao: "cura",
        poder: melhorCura.nome,
        percentualVida: Number(percentualVida.toFixed(2)),
      },
    };
  }

  // 2) Ofensivo eficiente. Pontuação = dano por ponto de mana, com uma
  // pitada de dano absoluto pra não preferir sempre o poder mais
  // baratinho e fraco quando sobra mana.
  const candidatos = ofensivos
    .map((p) => {
      const custo = Math.max(1, custoManaEfetivo(p, p.nivel_habilidade ?? 1));
      const sobraDepois = estado.mana_atual - custo;
      // Gastar abaixo da reserva é permitido, mas penalizado: a IA só
      // fura a reserva quando não há alternativa melhor.
      const penalidadeReserva = sobraDepois < manaReservada ? 0.6 : 1;
      const eficiencia = (p.dano_base ?? 0) / custo;
      return {
        power: p,
        pontuacao: (eficiencia * 10 + (p.dano_base ?? 0) * 0.2) * penalidadeReserva,
      };
    })
    .sort((a, b) => b.pontuacao - a.pontuacao)
    .slice(0, IA_TAMANHO_TOP_ESCOLHAS);

  // 3) Ataque básico quando não há poder ofensivo pagável — e também
  // como opção sempre presente no sorteio com peso baixo, pra IA não
  // ser um "lança-poder" perfeito.
  if (candidatos.length === 0) {
    return {
      acao: { tipo: "attack" },
      resumo: { decisao: "ataque-basico", motivo: "sem poder ofensivo pagável" },
    };
  }

  const pesoAtaqueBasico = candidatos[0].pontuacao * 0.25;
  const opcoes = [...candidatos, { power: null, pontuacao: pesoAtaqueBasico }];
  const escolhida = sortearPonderado(opcoes);

  if (!escolhida.power) {
    return {
      acao: { tipo: "attack" },
      resumo: { decisao: "ataque-basico", motivo: "variação deliberada" },
    };
  }

  return {
    acao: { tipo: "power", power: escolhida.power },
    resumo: {
      decisao: "poder-ofensivo",
      poder: escolhida.power.nome,
      manaAntes: estado.mana_atual,
      opcoesConsideradas: candidatos.length,
    },
  };
}

module.exports = { escolherAcaoIA, poderesUsaveis };
