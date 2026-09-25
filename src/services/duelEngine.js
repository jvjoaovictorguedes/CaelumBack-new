// src/services/duelEngine.js
//
// Resolve UMA ação de duelo (ataque básico ou poder) sobre o estado de
// dois lutadores. Usado tanto pelo PVP assíncrono (pvpController, que
// escolhe a ação sozinho a cada turno) quanto pelo PVP ao vivo
// (pvpLiveSocket, onde é o jogador de verdade que escolhe a ação),
// pra garantir que os dois modos usem exatamente a mesma matemática.

const {
  calcularDanoBasico,
  calcularEfeitoPoder,
  custoManaEfetivo,
  aplicarMitigacaoDeDefesa,
  resolverResultadoDeAcerto,
} = require("./combatFormulas");
const statusEffectService = require("./statusEffectService");
const { resolverEfeitosDoUso } = require("./combatEffectResolver");
const { resolverEfeitosDeArmaNoHit } = require("./weaponEffectResolver");
const { definicaoDoStatus, ACTION_TYPE } = require("../config/statusEffectConfig");

// acao: { tipo: "attack" }, { tipo: "power", power: <Power> } ou
// { tipo: "item", item: <Item>, efeito: <ConsumableProperties> }. Quando
// o poder vem de buscarPoderesDoPersonagem (pvpController.js) ele já
// traz `power.nivel_habilidade` grudado — sem isso o duelo assíncrono e
// o PVP ao vivo ignorariam totalmente o nível investido na habilidade.
//
// `blindPotency`/`multiplicadorDano` vêm de quem chama (resolverTurnoComStatus,
// abaixo) — esta função nunca lê status effect nenhum sozinha, pra não
// duplicar a fonte de verdade de statusEffectService (Evolução do Motor
// de Status §17/§45, mesmo critério do PvE em combatController.js).
function aplicarAcao({
  atacante,
  defensor,
  acao,
  vidaMaxAtacante,
  manaMaxAtacante,
  blindPotency = 0,
  multiplicadorDano = 1,
}) {
  let dano = 0;
  let cura = 0;
  let manaCurada = 0;
  let esquivou = false;
  let motivoEsquiva = null;
  let nomeAcao = "Ataque básico";

  if (acao.tipo === "power" && acao.power) {
    const nivelHabilidade = acao.power.nivel_habilidade ?? 1;
    nomeAcao = acao.power.nome;
    atacante.mana_atual -= custoManaEfetivo(acao.power, nivelHabilidade);
    const efeito = calcularEfeitoPoder(acao.power, atacante, nivelHabilidade);
    dano = Math.round(efeito.dano * multiplicadorDano);
    cura = efeito.cura;
  } else if (acao.tipo === "item" && acao.efeito) {
    // Consumível como ação de duelo — consome o turno igual um ataque ou
    // poder (o oponente ainda age depois) e usa a MESMA fórmula percentual
    // (não pontos fixos) do PvE (combatController.js) e do uso fora de
    // combate (characterInventoryController.js): sempre % da vida/mana
    // MÁXIMA, nunca da atual.
    nomeAcao = acao.item?.nome ?? "Usar item";
    if (acao.efeito.efeito_vida) {
      cura = Math.round((vidaMaxAtacante ?? atacante.vida_atual) * (acao.efeito.efeito_vida / 100));
    }
    if (acao.efeito.efeito_mana) {
      manaCurada = Math.round((manaMaxAtacante ?? atacante.mana_atual) * (acao.efeito.efeito_mana / 100));
    }
  }

  if (dano > 0 || acao.tipo === "attack") {
    // Cegueira (§17) unifica com a esquiva num único resultado de
    // acerto — precisa rolar mesmo em ataque básico sem dano "pré-
    // calculado" (dano vira 0 aqui e o cálculo de verdade só acontece
    // se acertar, no branch `acao.tipo === "attack"` abaixo).
    const resultadoAcerto = resolverResultadoDeAcerto({ atacante, defensor, blindPotency });
    if (!resultadoAcerto.hit) {
      esquivou = true;
      motivoEsquiva = resultadoAcerto.reason;
      dano = 0;
    } else if (acao.tipo === "attack") {
      // Mitigação pela defesa do alvo — sem isso, equipar armadura não
      // tinha efeito nenhum no dano recebido (a defesa era somada em
      // equipmentBonusService.js mas nunca lida por nenhum código de
      // combate). Aplica tanto no ataque básico quanto em poder que causa
      // dano (branch abaixo), já que o jogo só tem um stat de defesa
      // (sem resistência mágica separada).
      const danoBase = Math.round(calcularDanoBasico(atacante) * multiplicadorDano);
      dano = aplicarMitigacaoDeDefesa(danoBase, defensor);
      defensor.vida_atual = Math.max(0, defensor.vida_atual - dano);
    } else {
      dano = aplicarMitigacaoDeDefesa(dano, defensor);
      defensor.vida_atual = Math.max(0, defensor.vida_atual - dano);
    }
  }

  // Mesmo critério do PvE (combatController.js): um poder com dano E
  // cura ("rouba vida") só cura se o golpe realmente acertou —
  // `esquivou` só fica true quando um golpe COM dano foi de fato
  // resolvido e errou; poder de cura pura (dano === 0) ou item nunca
  // passam pelo bloco de acerto acima, então continuam curando sempre.
  if (cura > 0 && !esquivou) {
    const teto = vidaMaxAtacante ?? atacante.vida_atual + cura;
    atacante.vida_atual = Math.min(teto, atacante.vida_atual + cura);
  }

  if (manaCurada > 0) {
    const tetoMana = manaMaxAtacante ?? atacante.mana_atual + manaCurada;
    atacante.mana_atual = Math.min(tetoMana, atacante.mana_atual + manaCurada);
  }

  return { nomeAcao, dano, cura, manaCurada, esquivou, motivoEsquiva };
}

// Envolve aplicarAcao com o Motor de Status inteiro (Evolução do Motor
// de Status), pro PvP — ao vivo e assíncrono — passar a se comportar
// exatamente como o PvE em combatController.js: DoT no início do turno
// do atacante, bloqueio de ação por Freeze/Stun/Paralyze/Silêncio,
// efeitos "Self" de poder (sempre, mesmo sem acertar), Enfraquecimento
// reduzindo o dano de saída, quebra de Freeze por dano direto, e proc
// de status de arma/poder no alvo quando o golpe acerta. Cada instância
// de status carrega `sourceActorId` — por isso `casterActorId` (a
// chave "A"/"B" do atacante) é obrigatório aqui, diferente de
// aplicarAcao (que nunca precisou saber "de qual lado" veio o golpe).
//
// `statusAtacante`/`statusDefensor` são as listas ATUAIS (nunca
// mutadas — statusEffectService é todo funções puras); quem chama é
// responsável por persistir as listas devolvidas de volta no estado do
// duelo. `armaEfeitosAtacante` é a config de WeaponStatusEffect da arma
// equipada do atacante, pré-carregada uma vez no início do duelo (zero
// N+1 por hit, mesmo princípio do PvE).
async function resolverTurnoComStatus({
  atacante,
  defensor,
  acao,
  vidaMaxAtacante,
  manaMaxAtacante,
  statusAtacante,
  statusDefensor,
  turno,
  casterActorId,
  armaEfeitosAtacante,
  itemIdArmaAtacante,
  nomeAtacante,
  nomeDefensor,
}) {
  const log = [];
  let listaAtacante = statusAtacante;
  let listaDefensor = statusDefensor;

  // 1) Ticks de início de turno (Burn/Bleed/Poison) no próprio atacante
  // — pode matá-lo antes de agir; nesse caso a ação nem acontece.
  atacante.vida_atual = statusEffectService.processarTicksDeInicio({
    vidaAtual: atacante.vida_atual,
    defensor: atacante,
    lista: listaAtacante,
    log,
    nomeAlvo: nomeAtacante,
  });
  if (atacante.vida_atual <= 0) {
    return {
      nomeAcao: null,
      dano: 0,
      cura: 0,
      manaCurada: 0,
      esquivou: false,
      morteAntesDeAgir: true,
      statusAtacante: listaAtacante,
      statusDefensor: listaDefensor,
      log,
    };
  }

  // 2) Política central de bloqueio de ação — resolve de uma vez
  // (inclusive a única rolagem de Paralyze do turno) se o atacante
  // consegue executar o tipo de ação pedido.
  const tipoAcao =
    acao.tipo === "power" ? ACTION_TYPE.POWER : acao.tipo === "item" ? ACTION_TYPE.ITEM : ACTION_TYPE.BASIC_ATTACK;
  const controle = statusEffectService.resolverAcoesBloqueadasDoTurno(listaAtacante, turno);
  listaAtacante = controle.lista;
  if (controle.bloqueadas.has(tipoAcao)) {
    log.push(`${nomeAtacante} está ${definicaoDoStatus(controle.motivoBloqueioTotal).nomeUi} e não conseguiu agir!`);
    listaAtacante = statusEffectService.decrementarDuracoes(listaAtacante);
    return {
      nomeAcao: "Ação bloqueada",
      dano: 0,
      cura: 0,
      manaCurada: 0,
      esquivou: false,
      bloqueado: true,
      statusAtacante: listaAtacante,
      statusDefensor: listaDefensor,
      log,
    };
  }
  // Silêncio bloqueia só Power especificamente (ataque básico e item
  // continuam liberados) — já coberto por `controle.bloqueadas` acima,
  // então nenhum check adicional é necessário aqui.

  // 3) Efeitos "Self" configurados no poder usado — aplicam sempre que
  // a Power é de fato usada, dano ou não (não existe "esquivar do
  // próprio buff"). Os de alvo "Enemy" só entram depois, se o golpe
  // acertar (passo 5).
  let efeitosNoInimigo = [];
  if (acao.tipo === "power" && acao.power) {
    const configurados = await resolverEfeitosDoUso({
      power: acao.power,
      personagemCaster: atacante,
      casterActorId,
      turno,
    });
    const efeitosEmSiMesmo = configurados.filter((e) => e.target === "Self");
    efeitosNoInimigo = configurados.filter((e) => e.target !== "Self");
    for (const efeito of efeitosEmSiMesmo) {
      listaAtacante = statusEffectService.aplicarStatus(listaAtacante, efeito);
      log.push(`${nomeAtacante} recebeu ${definicaoDoStatus(efeito.key).nomeUi} por ${efeito.remainingTurns} turno(s).`);
    }
  }

  // 4) Resolve a ação em si — Cegueira do atacante afeta o acerto,
  // Enfraquecimento do atacante reduz o dano de saída.
  const blindDoAtacante = listaAtacante.find((s) => s.key === "BLIND");
  const resultado = aplicarAcao({
    atacante,
    defensor,
    acao,
    vidaMaxAtacante,
    manaMaxAtacante,
    blindPotency: blindDoAtacante?.potency ?? 0,
    multiplicadorDano: statusEffectService.multiplicadorDeDanoDeSaida(listaAtacante),
  });

  if (resultado.esquivou && resultado.motivoEsquiva === "BLIND_MISS") {
    log.push(`Cego, ${nomeAtacante} errou o golpe contra ${nomeDefensor}!`);
  }

  // 5) Dano DIRETO quebra Freeze existente no defensor (antes de
  // qualquer efeito novo deste mesmo golpe) e libera os efeitos de
  // status configurados (poder alvo Enemy + proc de arma em ataque
  // básico), só quando o golpe de fato acerta e causa dano.
  if (resultado.dano > 0) {
    const quebraFreeze = statusEffectService.removerFreezeAoReceberDanoDireto(listaDefensor, resultado.dano);
    listaDefensor = quebraFreeze.lista;
    if (quebraFreeze.quebrou) log.push(`${nomeDefensor} descongelou com o impacto!`);

    for (const efeito of efeitosNoInimigo) {
      listaDefensor = statusEffectService.aplicarStatus(listaDefensor, efeito);
      log.push(`${nomeDefensor} recebeu ${definicaoDoStatus(efeito.key).nomeUi} por ${efeito.remainingTurns} turno(s).`);
    }

    if (acao.tipo === "attack" && armaEfeitosAtacante?.length > 0) {
      const novosEfeitosDeArma = resolverEfeitosDeArmaNoHit({
        efeitosDaArma: armaEfeitosAtacante,
        personagemCaster: atacante,
        casterActorId,
        itemId: itemIdArmaAtacante ?? null,
        turno,
      });
      for (const efeito of novosEfeitosDeArma) {
        listaDefensor = statusEffectService.aplicarStatus(listaDefensor, efeito);
        log.push(
          `A arma de ${nomeAtacante} aplicou ${definicaoDoStatus(efeito.key).nomeUi} em ${nomeDefensor} por ${efeito.remainingTurns} turno(s)!`,
        );
      }
    }
  }

  // 6) Fim do turno do atacante — decrementa a duração do que ele
  // carrega (nunca a do defensor, que ainda não jogou esta rodada).
  listaAtacante = statusEffectService.decrementarDuracoes(listaAtacante);

  return { ...resultado, statusAtacante: listaAtacante, statusDefensor: listaDefensor, log };
}

module.exports = { aplicarAcao, resolverTurnoComStatus };
