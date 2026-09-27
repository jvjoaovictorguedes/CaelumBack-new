// Simulador de Balanceamento da Aventura (Admin) — "Simulador de
// Balanceamento V2" mencionado como fase futura em adminAdventureRoutes.js,
// agora construído. Roda N combates PvE completos entre um personagem
// real (snapshot de atributos/equipamento/habilidades, igual
// pvpLiveSocket.carregarLutador) e um monstro cadastrado, reaproveitando
// as MESMAS peças do combate de verdade — nenhuma fórmula reimplementada
// aqui:
//   - combatFormulas.js: dano/cura/esquiva/mitigação de defesa (as
//     mesmas funções que combatController.js usa no PvE real);
//   - duelEngine.aplicarAcao: resolve o turno do personagem (ataque
//     básico ou poder) — o mesmo motor que resolve PvP casual/ranqueado;
//   - rankedAiService.escolherAcaoIA: mesma política de decisão já usada
//     pelo defensor assíncrono da Arena Ranqueada (cura com vida baixa,
//     reserva de mana, eficiência de dano por mana).
// O turno do monstro replica exatamente combatController.js: acerto via
// resolverResultadoDeAcerto, dano explícito no intervalo
// dano_min..dano_max (sem variação oculta extra), mitigado pela defesa
// do personagem.
//
// Fora do escopo desta V1 (deliberado, não esquecido): Motor de
// Status (Burn/Stun/Freeze/etc.), cooldown de poder, consumíveis e
// buffs de Taverna/Guilda/Global — suficiente pra calibrar dificuldade
// BASE de monstro (vida/dano/esquiva), que é o pedido original; uma
// simulação com status effects completos é um projeto à parte.
const crypto = require("crypto");
const Character = require("../models/Character");
const Class = require("../models/Class");
const AdventureMonster = require("../models/AdventureMonster");
const { buscarPoderesDoPersonagem } = require("../controllers/pvpController");
const { buscarBonusDeAtributos, personagemComBonus } = require("./equipmentBonusService");
const {
  vidaMaximaDe,
  manaMaximaDe,
  comMultiplicadoresDeClasse,
  resolverResultadoDeAcerto,
  aplicarMitigacaoDeDefesa,
} = require("./combatFormulas");
const { aplicarAcao } = require("./duelEngine");
const { escolherAcaoIA } = require("./rankedAiService");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

const SIMULACOES_PADRAO = 200;
const SIMULACOES_MAXIMAS = 1000;
// Segurança contra empate infinito (ex.: personagem sem nenhum poder
// ofensivo comprado contra um monstro com defesa alta demais) — um
// combate real de PvE nunca chega nem perto disso.
const MAX_TURNOS_POR_COMBATE = 60;

async function carregarPersonagemParaSimulacao(idPersonagem) {
  const personagem = await Character.findByPk(idPersonagem, { include: [{ model: Class }] });
  if (!personagem) throw erro("Personagem não encontrado.", 404);

  const [poderes, bonus] = await Promise.all([
    buscarPoderesDoPersonagem(idPersonagem),
    buscarBonusDeAtributos(idPersonagem),
  ]);

  const base = comMultiplicadoresDeClasse(personagemComBonus(personagem.toJSON(), bonus), personagem.Class);
  const vidaMax = vidaMaximaDe(base);
  const manaMax = manaMaximaDe(base);
  return { base, poderes, vidaMax, manaMax, nome: personagem.nome, classe: personagem.Class?.nome ?? null };
}

async function carregarMonstro(idMonstro) {
  const monstro = await AdventureMonster.findByPk(idMonstro);
  if (!monstro) throw erro("Monstro não encontrado.", 404);
  if (monstro.vida_maxima == null || monstro.dano_min == null || monstro.dano_max == null) {
    throw erro("Este monstro ainda não tem vida/dano configurados.", 400);
  }
  return monstro;
}

// Um combate completo, do zero (vida/mana cheias) até alguém chegar a
// 0 de vida ou bater o teto de segurança de turnos.
function simularUmCombate(personagem, monstro) {
  const characterState = { ...personagem.base, vida_atual: personagem.vidaMax, mana_atual: personagem.manaMax };
  const monsterState = { vida_atual: monstro.vida_maxima, agilidade: monstro.agilidade ?? 0, defesa: 0 };

  let danoCausadoTotal = 0;
  let danoRecebidoTotal = 0;
  let turno = 0;

  while (turno < MAX_TURNOS_POR_COMBATE) {
    turno += 1;

    const { acao } = escolherAcaoIA({
      estado: { vida_atual: characterState.vida_atual, mana_atual: characterState.mana_atual },
      poderes: personagem.poderes,
      vidaMax: personagem.vidaMax,
      manaMax: personagem.manaMax,
    });
    const resultadoPersonagem = aplicarAcao({
      atacante: characterState,
      defensor: monsterState,
      acao,
      vidaMaxAtacante: personagem.vidaMax,
      manaMaxAtacante: personagem.manaMax,
    });
    danoCausadoTotal += resultadoPersonagem.dano;

    if (monsterState.vida_atual <= 0) {
      return {
        resultado: "vitoria",
        turnos: turno,
        danoCausado: danoCausadoTotal,
        danoRecebido: danoRecebidoTotal,
        vidaRestantePercentual: characterState.vida_atual / personagem.vidaMax,
      };
    }

    const acertouMonstro = resolverResultadoDeAcerto({ atacante: monsterState, defensor: characterState });
    if (acertouMonstro.hit) {
      const danoBruto = crypto.randomInt(monstro.dano_min, monstro.dano_max + 1);
      const danoFinal = aplicarMitigacaoDeDefesa(danoBruto, characterState);
      characterState.vida_atual = Math.max(0, characterState.vida_atual - danoFinal);
      danoRecebidoTotal += danoFinal;
    }

    if (characterState.vida_atual <= 0) {
      return {
        resultado: "derrota",
        turnos: turno,
        danoCausado: danoCausadoTotal,
        danoRecebido: danoRecebidoTotal,
        vidaRestantePercentual: 0,
      };
    }
  }

  return {
    resultado: "limite_turnos",
    turnos: turno,
    danoCausado: danoCausadoTotal,
    danoRecebido: danoRecebidoTotal,
    vidaRestantePercentual: characterState.vida_atual / personagem.vidaMax,
  };
}

function media(lista, campo) {
  if (lista.length === 0) return 0;
  return lista.reduce((acc, r) => acc + r[campo], 0) / lista.length;
}

function arredondar(valor, casas = 0) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

async function simularBalanceamento({ idPersonagem, idMonstro, quantidade }) {
  if (!idPersonagem || !idMonstro) {
    throw erro("Escolha um personagem e um monstro.");
  }
  const n = Math.min(SIMULACOES_MAXIMAS, Math.max(1, Number.parseInt(quantidade, 10) || SIMULACOES_PADRAO));

  const [personagem, monstro] = await Promise.all([
    carregarPersonagemParaSimulacao(idPersonagem),
    carregarMonstro(idMonstro),
  ]);

  const resultados = [];
  for (let i = 0; i < n; i += 1) {
    resultados.push(simularUmCombate(personagem, monstro));
  }

  const vitorias = resultados.filter((r) => r.resultado === "vitoria");
  const derrotas = resultados.filter((r) => r.resultado === "derrota");
  const semVencedor = resultados.filter((r) => r.resultado === "limite_turnos");

  return {
    personagem: {
      id: idPersonagem,
      nome: personagem.nome,
      classe: personagem.classe,
      vida_maxima: personagem.vidaMax,
      mana_maxima: personagem.manaMax,
      quantidade_poderes: personagem.poderes.length,
    },
    monstro: {
      id: monstro.id,
      nome: monstro.nome,
      nivel: monstro.nivel,
      vida_maxima: monstro.vida_maxima,
      dano_min: monstro.dano_min,
      dano_max: monstro.dano_max,
    },
    quantidade_simulacoes: n,
    taxa_vitoria_pct: arredondar((vitorias.length / n) * 100, 1),
    vitorias: vitorias.length,
    derrotas: derrotas.length,
    combates_sem_vencedor: semVencedor.length,
    turnos_medios_vitoria: arredondar(media(vitorias, "turnos"), 1),
    turnos_medios_derrota: arredondar(media(derrotas, "turnos"), 1),
    dano_medio_causado_por_combate: arredondar(media(resultados, "danoCausado")),
    dano_medio_recebido_por_combate: arredondar(media(resultados, "danoRecebido")),
    vida_media_restante_ao_vencer_pct: arredondar(media(vitorias, "vidaRestantePercentual") * 100, 1),
  };
}

module.exports = { simularBalanceamento };
