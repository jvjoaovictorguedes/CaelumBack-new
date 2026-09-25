// Boss Global — Fase 4: Combate (§9/§13/§31). Sessão INDIVIDUAL (uma
// por personagem, "Ativo" garantido único pelo índice parcial
// world_boss_combat_sessions_um_ativo_idx) contra o MESMO HP global
// compartilhado por todo mundo (WorldBossEvent.hp_current).
//
// Decisões de arquitetura (documentadas aqui por não terem um lugar
// mais óbvio no código):
//
// 1. Reaproveita duelEngine.aplicarAcao (dano/cura PURO, sem status) —
//    NUNCA resolverTurnoComStatus. É essa escolha que dá imunidade a
//    status pro boss "de graça": aplicarAcao nunca chama
//    statusEffectService/combatEffectResolver/weaponEffectResolver
//    sozinha (só resolverTurnoComStatus faz isso), então nenhum proc de
//    status de arma/poder tem CHANCE de ser direcionado ao boss — não
//    existe lista de status do boss pra popular, por construção, nunca
//    por um `if (alvo === boss) pula`. O efeito colateral é que
//    autobuffs "Self" de poder (também só aplicados dentro de
//    resolverTurnoComStatus) não disparam aqui nesta v1 — mesmo
//    critério de escopo já usado noutras partes desta sessão pra
//    Taverna (PVE_DAMAGE_PCT etc. documentados como não plugados):
//    plugar o motor de status inteiro só pro boss global, sob prazo,
//    seria mexer numa engrenagem de alto risco (o duelo PvP/PvE) por
//    um ganho incremental baixo aqui. `state` na sessão já fica
//    reservado (JSONB) pra isso evoluir sem migration nova.
//
// 2. SEM contra-ataque do boss: WorldBossConfig não tem nenhum campo de
//    dano-base (diferente de GuildBossConfig.dano_base_ataque) — dado
//    que a "luta" é contra um alvo com HP compartilhado por um número
//    não previsível de jogadores simultâneos, retaliação individual
//    por ataque nunca fez sentido de design aqui. O jogador nunca
//    arrisca vida lutando a Ameaça Mundial.
//
// 3. Golpe Final atômico: a MESMA transação que teve hp_antes > 0 e
//    calculou hp_depois = 0 já marca o evento DEFEATED e grava
//    final_blow_character_id — nunca um segundo passo/segunda query
//    depois. Overkill nunca conta: o dano creditado na contribuição é
//    sempre hp_antes - hp_depois (hp_depois já vem clampado em 0 por
//    aplicarAcao), nunca o `dano` bruto calculado.
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Class = require("../models/Class");
const WorldBossEvent = require("../models/WorldBossEvent");
const WorldBossCombatSession = require("../models/WorldBossCombatSession");
const WorldBossContribution = require("../models/WorldBossContribution");
const { aplicarAcao } = require("./duelEngine");
const { custoManaEfetivo, vidaMaximaDe, manaMaximaDe, comMultiplicadoresDeClasse } = require("./combatFormulas");
const { personagemComBonus, buscarBonusDeAtributos } = require("./equipmentBonusService");
const { buscarPoderesDoPersonagem } = require("../controllers/pvpController");
const worldBossStatusService = require("./worldBossStatusService");
const worldBossRewardService = require("./worldBossRewardService");
const { emitGlobal } = require("../socket/worldBossSocket");
const { EVENT_STATUS, COMBAT_SESSION_STATUS } = require("../config/worldBossConfig");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

// Mesmo bug/fix já documentado em tavernRestService.confirmarDescanso:
// FOR UPDATE não pode ser aplicado numa query com LEFT OUTER JOIN pro
// lado nullable (id_classe) — trava o Character sozinho, carrega a
// Class à parte, dentro da MESMA transação.
async function carregarPersonagemTravado(characterId, transaction) {
  const personagem = await Character.findByPk(characterId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!personagem) return null;
  personagem.Class = personagem.id_classe ? await Class.findByPk(personagem.id_classe, { transaction }) : null;
  return personagem;
}

async function personagemEfetivoDe(personagem, transaction) {
  const bonus = await buscarBonusDeAtributos(personagem.id, transaction);
  const base = comMultiplicadoresDeClasse(personagemComBonus(personagem.toJSON(), bonus), personagem.Class);
  return { base, vidaMax: vidaMaximaDe(base), manaMax: manaMaximaDe(base) };
}

function estadoLutador(personagem, base, vidaMax, manaMax) {
  return {
    vida_atual: personagem.vida_atual,
    mana_atual: personagem.mana_atual,
    vida_max: vidaMax,
    mana_max: manaMax,
    forca: base.forca,
    agilidade: base.agilidade,
    nivel: base.nivel,
  };
}

async function obterEventoAtivo(transaction) {
  return WorldBossEvent.findOne({ where: { status: EVENT_STATUS.ACTIVE }, transaction });
}

// Entra (ou retoma) a sessão individual do personagem contra o evento
// ATIVO no momento. Idempotente: chamar de novo com uma sessão já
// aberta só devolve o estado atual, nunca cria uma segunda (o índice
// único parcial também garante isso no banco, esta checagem só evita
// a query extra de tentar e falhar).
async function entrar(characterId) {
  return sequelize.transaction(async (transaction) => {
    const evento = await obterEventoAtivo(transaction);
    if (!evento) throw erro("Não há Ameaça Mundial ativa agora.");

    let sessao = await WorldBossCombatSession.findOne({
      where: { character_id: characterId, status: COMBAT_SESSION_STATUS.ATIVO },
      transaction,
    });
    if (sessao && sessao.event_id !== evento.id) {
      // Sessão órfã de um ciclo anterior (evento já não é mais o
      // atual) — encerra e abre uma nova pro evento de agora.
      sessao.status = COMBAT_SESSION_STATUS.ENCERRADA;
      await sessao.save({ transaction });
      sessao = null;
    }
    if (!sessao) {
      sessao = await WorldBossCombatSession.create(
        { event_id: evento.id, character_id: characterId, status: COMBAT_SESSION_STATUS.ATIVO, action_seq: 0, state: {} },
        { transaction },
      );
    }

    await WorldBossContribution.findOrCreate({
      where: { event_id: evento.id, character_id: characterId },
      defaults: { event_id: evento.id, character_id: characterId },
      transaction,
    });

    const personagem = await Character.findByPk(characterId, { include: [{ model: Class }], transaction });
    const { base, vidaMax, manaMax } = await personagemEfetivoDe(personagem, transaction);
    const poderes = await buscarPoderesDoPersonagem(characterId);

    return {
      sessao: { id: sessao.id, action_seq: sessao.action_seq },
      lutador: estadoLutador(personagem, base, vidaMax, manaMax),
      poderes: poderes.map((p) => ({
        id: p.id,
        nome: p.nome,
        imagem_url: p.imagem_url ?? null,
        custo_mana: custoManaEfetivo(p, p.nivel_habilidade ?? 1),
        dano_base: p.dano_base,
        nivel_habilidade: p.nivel_habilidade ?? 1,
      })),
      status: await worldBossStatusService.obterStatusPublico(),
    };
  });
}

async function sair(characterId) {
  return sequelize.transaction(async (transaction) => {
    const sessao = await WorldBossCombatSession.findOne({
      where: { character_id: characterId, status: COMBAT_SESSION_STATUS.ATIVO },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!sessao) return null;
    sessao.status = COMBAT_SESSION_STATUS.ENCERRADA;
    await sessao.save({ transaction });
    return { encerrada: true };
  });
}

// Uma ação de combate: ataque básico ou poder. SEM "item" de propósito
// (mesma decisão do guildBossSocket — consumíveis não fazem sentido
// contra uma Ameaça Mundial). Trava a linha do WorldBossEvent (única
// linha ACTIVE do servidor inteiro) — isso serializa toda ação de
// TODO jogador contra o boss num fila implícita, o que é exatamente o
// que o Golpe Final atômico precisa (hp_antes>0 && hp_depois=0 na
// MESMA transação que decide vencedor).
async function executarAcao(characterId, { tipo, idPoder } = {}) {
  // A transação PRECISA sempre COMMITAR, mesmo quando a ação acaba
  // rejeitada — senão o `sessao.status = ENCERRADA` de uma sessão
  // órfã (evento que não é mais ACTIVE) seria desfeito junto com o
  // resto no rollback automático que um `throw` dentro do callback de
  // sequelize.transaction dispara. Por isso o erro nunca é lançado
  // DENTRO da transação: fica guardado em `erroPendente` e só é
  // lançado depois que a transação (com a limpeza da sessão, se for o
  // caso) já commitou de verdade.
  let erroPendente = null;
  const contexto = await sequelize.transaction(async (transaction) => {
    const sessao = await WorldBossCombatSession.findOne({
      where: { character_id: characterId, status: COMBAT_SESSION_STATUS.ATIVO },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!sessao) {
      erroPendente = erro("Você não está numa sessão de combate contra a Ameaça Mundial.");
      return null;
    }

    const evento = await WorldBossEvent.findOne({
      where: { id: sessao.event_id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!evento || evento.status !== EVENT_STATUS.ACTIVE) {
      sessao.status = COMBAT_SESSION_STATUS.ENCERRADA;
      await sessao.save({ transaction });
      erroPendente = erro("A Ameaça Mundial não está mais ativa.");
      return null;
    }

    const personagem = await carregarPersonagemTravado(characterId, transaction);
    if (!personagem) throw erro("Personagem não encontrado.", 404);
    const { base, vidaMax, manaMax } = await personagemEfetivoDe(personagem, transaction);
    const atacanteEstado = { ...base, vida_atual: personagem.vida_atual, mana_atual: personagem.mana_atual };

    let acao = { tipo: "attack" };
    if (tipo === "power") {
      const poderes = await buscarPoderesDoPersonagem(characterId);
      const power = poderes.find((p) => p.id === Number(idPoder));
      if (!power) throw erro("Poder inválido.");
      if (custoManaEfetivo(power, power.nivel_habilidade ?? 1) > atacanteEstado.mana_atual) {
        throw erro("Mana insuficiente para esse poder.");
      }
      acao = { tipo: "power", power };
    } else if (tipo !== "attack") {
      throw erro("Ação inválida — só ataque básico ou poder valem contra a Ameaça Mundial.");
    }

    const snapshot = evento.config_snapshot ?? {};
    const hpAntes = Math.max(0, Number(evento.hp_current));
    const bossDefensor = { defesa: snapshot.defesa ?? 0, agilidade: 0, vida_atual: hpAntes };

    const resultado = aplicarAcao({
      atacante: atacanteEstado,
      defensor: bossDefensor,
      acao,
      vidaMaxAtacante: vidaMax,
      manaMaxAtacante: manaMax,
    });

    const hpDepois = Math.max(0, Math.round(bossDefensor.vida_atual));
    const danoEfetivo = Math.max(0, hpAntes - hpDepois);

    personagem.vida_atual = Math.max(0, Math.min(Math.round(atacanteEstado.vida_atual), vidaMax));
    personagem.mana_atual = Math.max(0, Math.min(Math.round(atacanteEstado.mana_atual), manaMax));
    await personagem.save({ transaction });

    sessao.action_seq += 1;
    await sessao.save({ transaction });

    evento.hp_current = hpDepois;
    let golpeFinal = false;
    if (hpAntes > 0 && hpDepois === 0) {
      golpeFinal = true;
      evento.status = EVENT_STATUS.DEFEATED;
      evento.final_blow_character_id = characterId;
      evento.defeated_at = new Date();
    }
    await evento.save({ transaction });

    const [contribuicao] = await WorldBossContribution.findOrCreate({
      where: { event_id: evento.id, character_id: characterId },
      defaults: { event_id: evento.id, character_id: characterId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    contribuicao.damage_total = Number(contribuicao.damage_total) + danoEfetivo;
    contribuicao.attacks_count += 1;
    contribuicao.last_action_seq = sessao.action_seq;
    contribuicao.last_action_at = new Date();
    await contribuicao.save({ transaction });

    if (golpeFinal) {
      sessao.status = COMBAT_SESSION_STATUS.ENCERRADA;
      await sessao.save({ transaction });
    }

    return {
      nomeAcao: resultado.nomeAcao,
      dano: danoEfetivo,
      esquivou: resultado.esquivou,
      cura: resultado.cura,
      manaCurada: resultado.manaCurada,
      golpeFinal,
      lutador: {
        vida_atual: personagem.vida_atual,
        mana_atual: personagem.mana_atual,
        vida_max: vidaMax,
        mana_max: manaMax,
      },
      boss: {
        event_id: evento.id,
        hp_max: Number(evento.hp_max),
        hp_current: hpDepois,
        hp_percentual: Number(evento.hp_max) > 0 ? Math.round((hpDepois / Number(evento.hp_max)) * 10000) / 100 : 0,
        derrotado: golpeFinal,
      },
      // action_seq resolvido dentro da MESMA transação que a query de
      // status usaria — evitar outra ida ao banco pós-commit é só
      // otimização; o payload de status completo (com fase, mensagens
      // etc.) o cliente já tem de sobra vindo do GET /status/socket.
    };
  });

  if (erroPendente) throw erroPendente;

  if (contexto.golpeFinal) {
    const status = await worldBossStatusService.obterStatusPublico();
    emitGlobal("worldboss:derrotado", status);
    // Fase 5 (§16) — "fire and forget": processarRecompensas roda em
    // transações PRÓPRIAS (nunca a do combate, já finalizada aqui em
    // cima) e é idempotente, então mesmo se isso falhar ou o processo
    // cair no meio, o scheduler retoma sozinho no próximo tick — a
    // resposta HTTP do golpe final nunca fica esperando o lote inteiro
    // de recompensas terminar.
    worldBossRewardService
      .processarRecompensas(contexto.boss.event_id)
      .catch((error) => console.error("[worldBossCombatService] falha ao disparar recompensas:", error));
  } else {
    emitGlobal("worldboss:hp-atualizado", {
      hp_max: contexto.boss.hp_max,
      hp_current: contexto.boss.hp_current,
      hp_percentual: contexto.boss.hp_percentual,
    });
  }
  return contexto;
}

module.exports = { entrar, sair, executarAcao };
