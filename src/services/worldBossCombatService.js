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
const worldBossRankingService = require("./worldBossRankingService");
const worldBossRuntimeService = require("./worldBossRuntimeService");
const statusEffectService = require("./statusEffectService");
const cooldownService = require("./cooldownService");
const { resolverEfeitosDoUso } = require("./combatEffectResolver");
const { resolverEfeitosDeArmaNoHit } = require("./weaponEffectResolver");
const { ACTION_TYPE } = require("../config/statusEffectConfig");
const WeaponStatusEffect = require("../models/WeaponStatusEffect");
const { emitGlobal } = require("../socket/worldBossSocket");
const { EVENT_STATUS, COMBAT_SESSION_STATUS } = require("../config/worldBossConfig");
const uniqueFeatService = require("./uniqueFeatService");
const uniqueFeatPublicService = require("./uniqueFeatPublicService");

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

// §7 — resultado de uma "ação" que nunca chegou a golpear o Boss (morte
// por DoT antes de agir, ou ação bloqueada por Stun/Freeze/Paralyze/
// Silence): mesmo formato de um resultado normal (dano=0), pra quem
// consome a resposta (socket/REST) nunca precisar de um branch a mais
// só pra esse caso.
function montarResultadoSemAcao({ evento, personagem, vidaMax, manaMax, morreuAntesDeAgir = false, bloqueado = false, motivoBloqueio, actionSeq, cooldowns = {} }) {
  const hpAtual = Math.max(0, Number(evento.hp_current));
  return {
    nomeAcao: null,
    dano: 0,
    esquivou: false,
    cura: 0,
    manaCurada: 0,
    golpeFinal: false,
    proezasConquistadas: [],
    morreuAntesDeAgir,
    bloqueado,
    motivoBloqueio: bloqueado ? motivoBloqueio : undefined,
    action_seq: actionSeq,
    cooldowns,
    lutador: { vida_atual: personagem.vida_atual, mana_atual: personagem.mana_atual, vida_max: vidaMax, mana_max: manaMax },
    boss: {
      event_id: evento.id,
      hp_max: Number(evento.hp_max),
      hp_current: hpAtual,
      hp_percentual: Number(evento.hp_max) > 0 ? Math.round((hpAtual / Number(evento.hp_max)) * 10000) / 100 : 0,
      derrotado: false,
    },
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
      // §8.2 — reentrada configurável: DERROTADO neste MESMO evento
      // nunca reabre sessão de graça. Sem regra nenhuma cadastrada
      // (reentrada_permitida=false, default mais seguro), a derrota é
      // definitiva pro resto do ciclo — a contribuição acumulada até
      // ali permanece (§8.1), só o pool de alvos que não recebe ele de
      // volta.
      const derrotaAnterior = await WorldBossCombatSession.findOne({
        where: { character_id: characterId, event_id: evento.id, status: COMBAT_SESSION_STATUS.DERROTADO },
        order: [["derrotado_at", "DESC"]],
        transaction,
      });
      if (derrotaAnterior) {
        const snapshotReentrada = evento.config_snapshot ?? {};
        if (!snapshotReentrada.reentrada_permitida) {
          throw erro("Você foi derrotado pela Ameaça Mundial e não pode reentrar neste ciclo.");
        }
        const cooldownMs = Math.max(0, Number(snapshotReentrada.cooldown_reentrada_segundos) || 0) * 1000;
        const liberadoEm = new Date((derrotaAnterior.derrotado_at?.getTime() ?? 0) + cooldownMs);
        if (cooldownMs > 0 && liberadoEm.getTime() > Date.now()) {
          const restanteSegundos = Math.ceil((liberadoEm.getTime() - Date.now()) / 1000);
          throw erro(`Você poderá reentrar em ${restanteSegundos} segundo(s).`);
        }
        // §8.3 — nunca cura ao entrar; reentrar com HP ainda zerado (não
        // recuperado por outro meio, ex.: Taverna) só devolveria um
        // alvo morto pro pool. Rejeita explicitamente em vez de criar
        // uma sessão Ativa inútil.
        const personagemDerrotado = await Character.findByPk(characterId, { transaction });
        if (!personagemDerrotado || personagemDerrotado.vida_atual <= 0) {
          throw erro("Recupere sua vida antes de reentrar na Ameaça Mundial.");
        }
      }
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
        cooldown: p.cooldown,
        nivel_habilidade: p.nivel_habilidade ?? 1,
        escala_atributo: p.escala_atributo,
        valor_escala: p.valor_escala,
      })),
      // §18.1/§18.3 — cooldowns dos Powers do próprio jogador contra o
      // Boss: turnos restantes por power_id, exatamente o formato de
      // cooldownService (`power:<id>` -> turnos), pra reconexão
      // devolver o estado real sem o cliente ter que adivinhar.
      cooldowns: sessao.state?.cooldowns ?? {},
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

    // §7 — motor de status existente, nunca um paralelo: o jogador tem
    // sua PRÓPRIA lista de status contra esta Ameaça Mundial (debuffs
    // que o Boss aplicou nele via habilidade), isolada em
    // WorldBossCombatSession.state — nunca a mesma lista de um duelo
    // PvP/PvE em paralelo. "Turno" do jogador é a própria action_seq da
    // sessão dele (a próxima, ainda não persistida).
    const turnoJogador = sessao.action_seq + 1;
    let listaJogador = sessao.state?.status ?? [];
    let cooldownsJogador = sessao.state?.cooldowns ?? {};

    // 1) DoT de início de turno (§23 passo 1, mesmo critério do PvP/PvE)
    // — pode matar antes do jogador conseguir agir.
    const vidaAntesDoDot = atacanteEstado.vida_atual;
    atacanteEstado.vida_atual = statusEffectService.processarTicksDeInicio({
      vidaAtual: atacanteEstado.vida_atual,
      defensor: atacanteEstado,
      lista: listaJogador,
      log: [],
      nomeAlvo: personagem.nome,
    });
    personagem.vida_atual = Math.max(0, Math.min(Math.round(atacanteEstado.vida_atual), vidaMax));

    if (personagem.vida_atual <= 0 && vidaAntesDoDot > 0) {
      await personagem.save({ transaction });
      sessao.status = COMBAT_SESSION_STATUS.DERROTADO;
      sessao.derrotado_at = new Date();
      cooldownsJogador = cooldownService.decrementarCooldowns(cooldownsJogador);
      sessao.state = { ...(sessao.state ?? {}), status: statusEffectService.decrementarDuracoes(listaJogador), cooldowns: cooldownsJogador };
      await sessao.save({ transaction });
      return montarResultadoSemAcao({ evento, personagem, vidaMax, manaMax, morreuAntesDeAgir: true, actionSeq: sessao.action_seq, cooldowns: cooldownsJogador });
    }

    // 2) Política central de bloqueio de ação (Stun/Freeze/Paralyze
    // bloqueiam tudo; Silence só Power) — resolvida uma vez, ANTES de
    // decidir o que a ação pedida faz.
    const controleJogador = statusEffectService.resolverAcoesBloqueadasDoTurno(listaJogador, turnoJogador);
    listaJogador = controleJogador.lista;

    if (tipo !== "attack" && tipo !== "power") {
      throw erro("Ação inválida — só ataque básico ou poder valem contra a Ameaça Mundial.");
    }
    const tipoAcaoStatus = tipo === "power" ? ACTION_TYPE.POWER : ACTION_TYPE.BASIC_ATTACK;

    if (controleJogador.bloqueadas.has(tipoAcaoStatus)) {
      await personagem.save({ transaction });
      cooldownsJogador = cooldownService.decrementarCooldowns(cooldownsJogador);
      sessao.state = { ...(sessao.state ?? {}), status: statusEffectService.decrementarDuracoes(listaJogador), cooldowns: cooldownsJogador };
      await sessao.save({ transaction });
      return montarResultadoSemAcao({
        evento,
        personagem,
        vidaMax,
        manaMax,
        bloqueado: true,
        motivoBloqueio: controleJogador.motivoBloqueioTotal ?? "SILENCE",
        actionSeq: sessao.action_seq,
        cooldowns: cooldownsJogador,
      });
    }

    let acao = { tipo: "attack" };
    if (tipo === "power") {
      const poderes = await buscarPoderesDoPersonagem(characterId);
      const power = poderes.find((p) => p.id === Number(idPoder));
      if (!power) throw erro("Poder inválido.");
      if (custoManaEfetivo(power, power.nivel_habilidade ?? 1) > atacanteEstado.mana_atual) {
        throw erro("Mana insuficiente para esse poder.");
      }
      // §18.1/§34 — cooldown real do Power, mesma semântica/estado do
      // resto do jogo (cooldownService), isolado na sessão contra ESTA
      // Ameaça (nunca em Character como regra global).
      if (!cooldownService.podeUsar(cooldownsJogador, power.id)) {
        throw erro("Essa habilidade ainda está em cooldown.");
      }
      acao = { tipo: "power", power };
    }

    const snapshot = evento.config_snapshot ?? {};
    const hpAntes = Math.max(0, Number(evento.hp_current));
    const bossDefensor = { defesa: snapshot.defesa ?? 0, agilidade: 0, vida_atual: hpAntes };

    // 3) Efeitos "Self" do poder usado aplicam sempre, dano ou não — os
    // de alvo "Enemy" só entram depois (passo 5), se o golpe acertar.
    let efeitosConfigurados = [];
    if (acao.tipo === "power" && acao.power) {
      efeitosConfigurados = await resolverEfeitosDoUso({
        power: acao.power,
        personagemCaster: atacanteEstado,
        casterActorId: String(characterId),
        turno: turnoJogador,
      });
      for (const efeito of efeitosConfigurados.filter((e) => e.target === "Self")) {
        listaJogador = statusEffectService.aplicarStatus(listaJogador, efeito);
      }
    }
    const efeitosNoBoss = efeitosConfigurados.filter((e) => e.target && e.target !== "Self");

    const blindDoJogador = listaJogador.find((s) => s.key === "BLIND");
    const resultado = aplicarAcao({
      atacante: atacanteEstado,
      defensor: bossDefensor,
      acao,
      vidaMaxAtacante: vidaMax,
      manaMaxAtacante: manaMax,
      blindPotency: blindDoJogador?.potency ?? 0,
      multiplicadorDano: statusEffectService.multiplicadorDeDanoDeSaida(listaJogador),
    });

    const hpDepois = Math.max(0, Math.round(bossDefensor.vida_atual));
    const danoEfetivo = Math.max(0, hpAntes - hpDepois);

    // 5) Dano DIRETO quebra Freeze do Boss e libera proc de arma
    // (ataque básico) + efeitos de poder alvo Enemy — os dois passando
    // pela resistência do Boss (§7.1) antes de entrar de verdade.
    let statusBoss = evento.runtime_state?.status_boss ?? [];
    if (danoEfetivo > 0) {
      statusBoss = statusEffectService.removerFreezeAoReceberDanoDireto(statusBoss, danoEfetivo).lista;

      let novosNoBoss = [...efeitosNoBoss];
      if (acao.tipo === "attack" && base.arma_equipada?.id_item) {
        const efeitosDaArma = await WeaponStatusEffect.findAll({
          where: { id_item: base.arma_equipada.id_item, ativo: true },
          transaction,
        });
        novosNoBoss = novosNoBoss.concat(
          resolverEfeitosDeArmaNoHit({
            efeitosDaArma,
            personagemCaster: atacanteEstado,
            casterActorId: String(characterId),
            itemId: base.arma_equipada.id_item,
            turno: turnoJogador,
          }),
        );
      }
      for (const efeito of novosNoBoss) {
        statusBoss = worldBossRuntimeService.aplicarStatusNoBoss(statusBoss, efeito, snapshot.status_resistances);
      }
    }

    personagem.vida_atual = Math.max(0, Math.min(Math.round(atacanteEstado.vida_atual), vidaMax));
    personagem.mana_atual = Math.max(0, Math.min(Math.round(atacanteEstado.mana_atual), manaMax));
    await personagem.save({ transaction });

    sessao.action_seq += 1;
    // Fim do turno do jogador (§23 passos 8/9) — decrementa a duração
    // do que ELE está sofrendo; o status do Boss nunca decrementa aqui
    // (só no próprio tick do Boss, worldBossRuntimeService). Cooldown
    // segue a MESMA regra (§36): o Power recém-usado neste turno entra
    // no mapa mas não decrementa ainda — só os já ativos de turnos
    // anteriores.
    if (acao.tipo === "power" && acao.power.cooldown > 0) {
      cooldownsJogador = cooldownService.iniciarCooldown(cooldownsJogador, acao.power.id, acao.power.cooldown);
    }
    const chaveRecemAplicada = acao.tipo === "power" ? new Set([cooldownService.chaveDoPoder(acao.power.id)]) : undefined;
    cooldownsJogador = cooldownService.decrementarCooldowns(cooldownsJogador, chaveRecemAplicada);
    sessao.state = { ...(sessao.state ?? {}), status: statusEffectService.decrementarDuracoes(listaJogador), cooldowns: cooldownsJogador };
    await sessao.save({ transaction });

    evento.hp_current = hpDepois;
    evento.runtime_state = { ...(evento.runtime_state ?? {}), status_boss: statusBoss };
    let golpeFinal = false;
    if (hpAntes > 0 && hpDepois === 0) {
      golpeFinal = true;
      evento.status = EVENT_STATUS.DEFEATED;
      evento.final_blow_character_id = characterId;
      evento.defeated_at = new Date();
    }

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
    // §10.5 — desempate determinístico do ranking: atualizado SÓ quando
    // dano EFETIVO > 0, nunca numa esquiva/ação sem dano (diferente de
    // last_action_at, que sempre avança).
    if (danoEfetivo > 0) contribuicao.last_damage_at = new Date();
    await contribuicao.save({ transaction });

    if (golpeFinal) {
      // §10.7 — vencedor oficial (TOP_DAMAGE) CONGELADO na MESMA
      // transação que conclui o evento; depois disso o ranking final
      // nunca muda. Mesmo desempate do ranking ao vivo (§10.5): maior
      // damage_total, depois quem chegou lá primeiro, depois
      // character_id como fallback determinístico.
      const vencedor = await WorldBossContribution.findOne({
        where: { event_id: evento.id },
        order: [
          ["damage_total", "DESC"],
          ["last_damage_at", "ASC"],
          ["character_id", "ASC"],
        ],
        transaction,
      });
      if (vencedor && Number(vencedor.damage_total) > 0) {
        evento.top_damage_character_id = vencedor.character_id;
        evento.top_damage_total = vencedor.damage_total;
      }
    }
    await evento.save({ transaction });

    let proezasConquistadas = [];
    if (golpeFinal) {
      sessao.status = COMBAT_SESSION_STATUS.ENCERRADA;
      await sessao.save({ transaction });

      // Sistema de Proezas Únicas §16 — MESMO ponto que confirma o
      // Golpe Final de verdade (evento já marcado DEFEATED acima,
      // dentro desta MESMA transaction), nunca um evento derivado ou
      // fire-and-forget (processarRecompensas, logo abaixo, roda fora
      // desta transaction de propósito e não pode ser o gatilho).
      proezasConquistadas = await uniqueFeatService.check(
        "WORLD_BOSS_FINAL_BLOW",
        {
          bossConfigId: evento.id_world_boss_config,
          eventId: String(evento.id),
          finalBlow: true,
          contribution: Number(contribuicao.damage_total),
        },
        { transaction, characterId, sourceEventId: `worldboss:${evento.id}:${characterId}` },
      );
    }

    return {
      nomeAcao: resultado.nomeAcao,
      dano: danoEfetivo,
      esquivou: resultado.esquivou,
      cura: resultado.cura,
      manaCurada: resultado.manaCurada,
      golpeFinal,
      proezasConquistadas: proezasConquistadas.map((p) => ({ key: p.feat.key, nome: p.feat.nome })),
      // Ameaça Mundial V2 §17.2 — server_action_seq do ACK autenticado
      // (worldBossSocket, Etapa 4): sequência da SESSÃO do jogador
      // (WorldBossCombatSession.action_seq), não do boss_action_seq
      // global (esse é do relógio do boss, Etapa 3) — já resolvido
      // dentro desta MESMA transação, nunca uma query extra pós-commit.
      action_seq: sessao.action_seq,
      cooldowns: cooldownsJogador,
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
    };
  });

  if (erroPendente) throw erroPendente;

  // Sistema de Proezas Únicas §12.1 — SÓ depois do commit acima (nunca
  // de dentro da transaction), mesmo princípio do "worldboss:derrotado"
  // logo abaixo.
  await uniqueFeatPublicService.anunciarConquistas(contexto.proezasConquistadas);

  if (contexto.golpeFinal) {
    const status = await worldBossStatusService.obterStatusPublico();
    emitGlobal("worldboss:derrotado", status);
    // §10.7 — ranking oficial já está CONGELADO (top_damage_* setado na
    // mesma transação acima); este broadcast só informa quem estava
    // conectado no momento, nunca recalcula nada.
    worldBossRankingService
      .obterRanking({ eventId: contexto.boss.event_id })
      .then((ranking) => emitGlobal("worldboss:ranking-final", ranking))
      .catch((error) => console.error("[worldBossCombatService] falha ao emitir ranking final:", error));
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
