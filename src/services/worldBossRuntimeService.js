// Ameaça Mundial V2 — Etapa 3: relógio global do Boss (§3.2/§9). O Boss
// age no seu próprio ritmo (next_action_at), independente de quantos
// jogadores estão atacando — nunca um contra-ataque "por hit recebido"
// (§23.2). Só o ataque básico entra aqui (dano_min/dano_max da fase +
// Fúria, §5.1/§5.2); a IA de habilidades/Power fica pra Etapa 5 —
// quando nenhuma habilidade for elegível, o "ataque básico" resolvido
// aqui já é exatamente o fallback que a Etapa 5 vai usar (§6.3 passo 6).
//
// Lock multi-instância (§9.2/CRÍTICO): SELECT ... FOR UPDATE na ÚNICA
// linha ACTIVE do servidor inteiro — mesmo padrão já usado em
// worldBossCombatService.executarAcao (serializa toda ação de jogador
// contra o boss). Aqui serializa as próprias ações do boss: com dois
// processos/containers batendo tick ao mesmo tempo, o segundo sempre
// vê next_action_at já empurrado pra frente pelo primeiro (dentro da
// MESMA transação que persiste o resultado) e vira no-op, nunca
// duplica boss_action_seq.
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Class = require("../models/Class");
const WorldBossEvent = require("../models/WorldBossEvent");
const WorldBossCombatSession = require("../models/WorldBossCombatSession");
const WorldBossContribution = require("../models/WorldBossContribution");
const {
  aplicarMitigacaoDeDefesa,
  calcularDanoBasico,
  calcularEfeitoPoder,
  custoManaEfetivo,
  resolverResultadoDeAcerto,
  comMultiplicadoresDeClasse,
  vidaMaximaDe,
} = require("./combatFormulas");
const { personagemComBonus, buscarBonusDeAtributos } = require("./equipmentBonusService");
const statusEffectService = require("./statusEffectService");
const { resolverEfeitosDoUso } = require("./combatEffectResolver");
const { ACTION_TYPE } = require("../config/statusEffectConfig");
const { emitGlobal } = require("../socket/worldBossSocket");
const combatModifierService = require("./combatModifierService");
const { EVENT_STATUS, COMBAT_SESSION_STATUS } = require("../config/worldBossConfig");
const crypto = require("crypto");

// Ordena as fases do snapshot por hp_percentual_max crescente e acha a
// primeira cujo limiar cobre o hp% atual — mesma regra já usada pelo
// Boss Global v1 (adminWorldBossValidationService: faixas não se
// sobrepõem, validado na hora de salvar o catálogo).
function faseAtualDe(fases, hpPercentual) {
  if (!Array.isArray(fases) || fases.length === 0) return null;
  const ordenadas = [...fases].sort((a, b) => a.hp_percentual_max - b.hp_percentual_max);
  return ordenadas.find((f) => hpPercentual <= f.hp_percentual_max) ?? ordenadas[ordenadas.length - 1];
}

// §5.2 passo 3 — recalculado a cada ação a partir de phase_action_seq
// (nunca incrementado direto), pra nunca dessincronizar de um recovery
// (§9.1): reconstruir do zero a partir do que está persistido sempre dá
// o mesmo resultado.
function furiaPctDe(phaseActionSeq, fase) {
  const bruta = phaseActionSeq * Number(fase.furia_por_acao_pct || 0);
  if (fase.limite_furia_pct === null || fase.limite_furia_pct === undefined) return bruta;
  return Math.min(bruta, Number(fase.limite_furia_pct));
}

// Alvo do ataque básico (Etapa 3): ALEATORIO entre participantes com
// sessão Ativa — o mesmo tipo_alvo mais simples de §6.4, e exatamente o
// que a Etapa 5 também usaria como fallback quando nenhuma habilidade
// especial for elegível. Seleção via ORDER BY random() direto no banco
// (não em memória) pra não carregar centenas de sessões só pra
// descartar quase todas.
async function selecionarAlvoAleatorio(eventId, transaction) {
  return WorldBossCombatSession.findOne({
    where: { event_id: eventId, status: COMBAT_SESSION_STATUS.ATIVO },
    order: sequelize.random(),
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
}

async function carregarPersonagemEfetivo(characterId, transaction) {
  const personagem = await Character.findByPk(characterId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!personagem) return null;
  personagem.Class = personagem.id_classe ? await Class.findByPk(personagem.id_classe, { transaction }) : null;
  const bonus = await buscarBonusDeAtributos(personagem.id, transaction);
  const base = comMultiplicadoresDeClasse(personagemComBonus(personagem.toJSON(), bonus), personagem.Class);
  return { personagem, base, vidaMax: vidaMaximaDe(base) };
}

// --- Ameaça Mundial V2 — Etapa 6: Status/resistência (§7) ---
//
// OBRIGATÓRIO da spec: nunca criar um segundo sistema de status. Toda
// regra de duração/potência/stack/tick/bloqueio de ação continua vindo
// de statusEffectService (o MESMO motor do PvP/PvE) — a única coisa que
// esta camada decide é SE um status recebido pelo Boss chega a entrar
// na lista, e com que resistência (§7.1/§7.2).

function resistenciaDoStatus(statusResistances, statusKey) {
  return (statusResistances || []).find((r) => r.status_key === statusKey && r.ativo !== false) ?? null;
}

// imune nunca deixa entrar; resistencia_pct é uma chance extra de
// RESISTIR (rolada uma vez por tentativa), nunca reduz potência/duração
// — essas continuam inteiramente do motor existente. Sem resistência
// cadastrada pra aquele status_key, entra normalmente (comportamento
// "personagem comum" — §7.2 é sobre DEFAULTS sugeridos pro admin
// cadastrar, não um piso hardcoded aqui).
function aplicarStatusNoBoss(lista, instancia, statusResistances) {
  const resistencia = resistenciaDoStatus(statusResistances, instancia.key);
  if (resistencia?.imune) return lista;
  if (resistencia?.resistencia_pct > 0) {
    const resistiu = crypto.randomInt(0, 10000) < Number(resistencia.resistencia_pct) * 100;
    if (resistiu) return lista;
  }
  return statusEffectService.aplicarStatus(lista, instancia);
}

// Resolve o ataque básico do boss contra UM alvo já travado — devolve
// null se o alvo esquivou (nada a persistir além do que o chamador já
// for salvar do relógio em si). Nunca decide sozinho DERROTADO/
// contribution: só calcula dano e deixa a persistência pro chamador,
// que já está dentro da mesma transação/lock.
// Habilidades V2.0 §7/§9/§11/§26 (Fase 5) — `multiplicadorDanoRecebido`
// (DAMAGE_TAKEN_PCT passivo do alvo) default 1 faz esta função se
// comportar exatamente como antes pra quem não resolveu modificadores;
// `alvoDefesa` já vem com DEFENSE_FLAT somado por quem chama (mesmo
// padrão de bonusDefesaDefensor em duelEngine.js).
function resolverDanoBasico({ snapshot, fase, furiaPct, alvoBase, alvoDefesa, multiplicadorDanoRecebido = 1 }) {
  const atacante = {
    forca: snapshot.forca,
    agilidade: snapshot.agilidade,
    // Velocidade (Precisão/Crítico) — faltava aqui (só o ataque de
    // HABILIDADE, resolverEfeitoDeHabilidade abaixo, já levava isso em
    // conta), então o ataque básico do Boss corria com Precisão/chance
    // de crítico sempre no piso (5% base), nunca escalando com a
    // Velocidade de verdade cadastrada no snapshot dele.
    velocidade: snapshot.velocidade,
    arma_equipada: { dano_min: fase.dano_min, dano_max: fase.dano_max },
  };
  const defensor = { agilidade: alvoBase.agilidade || 0 };

  const resultadoAcerto = resolverResultadoDeAcerto({ atacante, defensor });
  if (!resultadoAcerto.hit) return { dano: 0, esquivou: true, critico: false };

  const contextoCritico = {};
  const danoBase = calcularDanoBasico(atacante, contextoCritico);
  const danoFase = danoBase * (1 + Number(fase.modificador_dano_percentual || 0) / 100);
  const danoComFuria = danoFase * (1 + furiaPct / 100);
  const danoMitigado = aplicarMitigacaoDeDefesa(Math.round(danoComFuria), { defesa: alvoDefesa });
  const danoFinal = Math.max(1, Math.round(danoMitigado * multiplicadorDanoRecebido));

  return { dano: danoFinal, esquivou: false, critico: Boolean(contextoCritico.critico) };
}

// --- Ameaça Mundial V2 — Etapa 5: Habilidades do Boss + IA (§6) ---

// cooldown_override/Power.cooldown reaproveitam a MESMA unidade já usada
// pelo resto do jogo (cooldownService.js — "cooldown 3 bloqueia
// exatamente os 3 PRÓXIMOS turnos"): número de AÇÕES do ator, nunca
// milissegundos (§4.3 — nunca criar uma fórmula paralela). Aqui "ação"
// é um boss_action_seq. Guardado como o boss_action_seq em que a
// habilidade volta a ficar elegível (threshold fixo), não um contador
// decrescente — sobrevive a um restart sem precisar decrementar nada a
// cada tick (§9.1), e casa com o resto do runtime_state (tudo aqui é
// "quando" já persistido, nunca "quanto falta").
function cooldownDaHabilidade(ability) {
  return ability.cooldown_override ?? ability.power_snapshot?.cooldown ?? 0;
}

function custoManaDaHabilidade(ability) {
  return custoManaEfetivo(ability.power_snapshot, 1);
}

function habilidadeDisponivel(cooldowns, ability, bossActionSeqDaAcao) {
  const threshold = cooldowns?.[String(ability.id_ability)];
  return !threshold || bossActionSeqDaAcao >= threshold;
}

// §6.3 passos 2/3 — fases_permitidas guarda id de WorldBossPhase (não
// ordem); só bate com faseId se o snapshot tiver congelado esse id em
// cada fase (worldBossLifecycleService.montarSnapshot). NULL/vazio =
// elegível em toda fase.
function habilidadesElegiveis(abilities, { faseId, manaAtual, cooldowns, bossActionSeqDaAcao }) {
  return (abilities || []).filter((ability) => {
    if (!ability.power_snapshot) return false;
    if (Array.isArray(ability.fases_permitidas) && ability.fases_permitidas.length > 0 && !ability.fases_permitidas.includes(faseId)) {
      return false;
    }
    if (!habilidadeDisponivel(cooldowns, ability, bossActionSeqDaAcao)) return false;
    if (custoManaDaHabilidade(ability) > manaAtual) return false;
    return true;
  });
}

// §6.3 passo 4 — só concorrem entre si as de MAIOR prioridade elegível;
// o sorteio por peso_uso decide só entre essas, nunca entre todas.
function escolherHabilidade(elegiveis) {
  if (elegiveis.length === 0) return null;
  const maiorPrioridade = Math.max(...elegiveis.map((a) => a.prioridade || 0));
  const candidatas = elegiveis.filter((a) => (a.prioridade || 0) === maiorPrioridade);
  const pesoTotal = candidatas.reduce((soma, a) => soma + Math.max(1, a.peso_uso || 1), 0);
  let alvo = Math.random() * pesoTotal;
  for (const candidata of candidatas) {
    alvo -= Math.max(1, candidata.peso_uso || 1);
    if (alvo < 0) return candidata;
  }
  return candidatas[candidatas.length - 1];
}

// §6.4 — seleção de alvo sempre no SERVIDOR, nunca aceita do cliente.
// TODOS (§19.2) fica dentro da MESMA transação/lock de qualquer outra
// ação — aceitável no volume atual; revisar em lote se a contagem real
// de participantes simultâneos crescer muito (a spec permite adiar esse
// desenho pro volume real de produção).
async function selecionarAlvos(tipoAlvo, quantidadeAlvos, eventId, transaction) {
  if (tipoAlvo === "SELF") return [];

  if (tipoAlvo === "TODOS") {
    return WorldBossCombatSession.findAll({
      where: { event_id: eventId, status: COMBAT_SESSION_STATUS.ATIVO },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }

  if (tipoAlvo === "N_ALEATORIOS") {
    return WorldBossCombatSession.findAll({
      where: { event_id: eventId, status: COMBAT_SESSION_STATUS.ATIVO },
      order: sequelize.random(),
      limit: Math.max(1, quantidadeAlvos || 1),
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }

  if (tipoAlvo === "MAIOR_DANO") {
    const sessoesAtivas = await WorldBossCombatSession.findAll({
      where: { event_id: eventId, status: COMBAT_SESSION_STATUS.ATIVO },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (sessoesAtivas.length === 0) return [];
    const contribuicoes = await WorldBossContribution.findAll({
      where: { event_id: eventId, character_id: sessoesAtivas.map((s) => s.character_id) },
      transaction,
    });
    const danoPorPersonagem = new Map(contribuicoes.map((c) => [c.character_id, Number(c.damage_total)]));
    const [maior] = [...sessoesAtivas].sort(
      (a, b) => (danoPorPersonagem.get(b.character_id) || 0) - (danoPorPersonagem.get(a.character_id) || 0),
    );
    return maior ? [maior] : [];
  }

  if (tipoAlvo === "MENOR_VIDA") {
    const sessoesAtivas = await WorldBossCombatSession.findAll({
      where: { event_id: eventId, status: COMBAT_SESSION_STATUS.ATIVO },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (sessoesAtivas.length === 0) return [];
    let escolhida = null;
    let menorPercentual = Infinity;
    for (const sessao of sessoesAtivas) {
      const efetivo = await carregarPersonagemEfetivo(sessao.character_id, transaction);
      if (!efetivo || efetivo.vidaMax <= 0) continue;
      const percentual = efetivo.personagem.vida_atual / efetivo.vidaMax;
      if (percentual < menorPercentual) {
        menorPercentual = percentual;
        escolhida = sessao;
      }
    }
    return escolhida ? [escolhida] : [];
  }

  // ALEATORIO (default)
  const alvo = await selecionarAlvoAleatorio(eventId, transaction);
  return alvo ? [alvo] : [];
}

// §4.3/§6.1 — reaproveita calcularEfeitoPoder (mesma fórmula de
// PvE/PvP), nunca uma conta paralela só pro Boss. modificador_dano_
// percentual da fase entra igual entra no ataque básico
// (resolverDanoBasico): o Boss fica mais forte na fase seguinte
// independente do tipo de ataque. escala_com_furia decide só o dano —
// cura/buff do Boss nunca escala com Fúria (§5.5).
function resolverEfeitoDeHabilidade({ snapshot, fase, furiaPct, ability, alvoBase, alvoDefesa, multiplicadorDanoRecebido = 1 }) {
  const atacante = {
    forca: snapshot.forca,
    agilidade: snapshot.agilidade,
    inteligencia: snapshot.inteligencia,
    vitalidade: snapshot.vitalidade,
    velocidade: snapshot.velocidade,
    nivel: snapshot.nivel,
  };
  const defensor = { agilidade: alvoBase?.agilidade || 0 };

  const resultadoAcerto = resolverResultadoDeAcerto({ atacante, defensor });
  if (!resultadoAcerto.hit) return { dano: 0, cura: 0, esquivou: true, critico: false };

  const contextoCritico = {};
  const efeito = calcularEfeitoPoder(ability.power_snapshot, atacante, 1, contextoCritico);
  const modificadorFase = 1 + Number(fase.modificador_dano_percentual || 0) / 100;
  const escalaFuria = ability.escala_com_furia ? 1 + furiaPct / 100 : 1;

  const danoFinal =
    efeito.dano > 0
      ? Math.max(
          1,
          Math.round(
            aplicarMitigacaoDeDefesa(Math.round(efeito.dano * modificadorFase * escalaFuria), { defesa: alvoDefesa }) *
              multiplicadorDanoRecebido,
          ),
        )
      : 0;

  return { dano: danoFinal, cura: efeito.cura, esquivou: false, critico: Boolean(contextoCritico.critico) };
}

// Cura/buff SELF (§6.4) — o Boss nunca esquiva de si mesmo, e cura
// nunca escala com Fúria (§5.5) nem com o modificador de dano da fase
// (esse modificador é só pra dano ofensivo).
function resolverEfeitoSelf({ snapshot, ability }) {
  const atacante = {
    forca: snapshot.forca,
    agilidade: snapshot.agilidade,
    inteligencia: snapshot.inteligencia,
    vitalidade: snapshot.vitalidade,
    velocidade: snapshot.velocidade,
    nivel: snapshot.nivel,
  };
  return calcularEfeitoPoder(ability.power_snapshot, atacante, 1);
}

// Aplica o efeito de UMA habilidade (já escolhida/paga) numa lista de
// characterId — reaproveitado tanto pelo caminho instantâneo quanto
// pela resolução de um cast pendente (§6.6), pra nunca duplicar a
// lógica de "aplica dano, clampa em zero, marca DERROTADO". Update
// estático na sessão (não `.save()` de uma instância já carregada em
// outro ponto) — mesma correção já aplicada nos testes da Etapa 3 pra
// nunca depender de um objeto Sequelize potencialmente desatualizado.
async function aplicarEfeitoDeHabilidadeEmAlvos({ characterIds, snapshot, fase, furiaPct, ability, evento, transaction, agora }) {
  // §6.1/§7 — Powers reutilizados já podem ter PowerStatusEffect
  // configurado (mesmo cadastro do PvP/PvE); rolado UMA VEZ pra este
  // uso da habilidade (não por alvo — mesmo critério de "uma nova de
  // área proc-a igual pra quem for atingido"), nunca um sistema
  // paralelo. `target: "Enemy"` é quem importa aqui — "Self" é tratado
  // fora, por quem chama (a cura/buff SELF do próprio Boss).
  const bossComoAtacante = {
    forca: snapshot.forca,
    agilidade: snapshot.agilidade,
    inteligencia: snapshot.inteligencia,
    vitalidade: snapshot.vitalidade,
    velocidade: snapshot.velocidade,
    nivel: snapshot.nivel,
  };
  const efeitosDeStatusNoInimigo = ability.power_snapshot?.id
    ? (
        await resolverEfeitosDoUso({
          power: { id: ability.power_snapshot.id },
          personagemCaster: bossComoAtacante,
          casterActorId: "BOSS",
          turno: evento.boss_action_seq + 1,
        })
      ).filter((efeito) => efeito.target !== "Self")
    : [];

  const detalhes = [];
  for (const characterId of characterIds) {
    const efetivo = await carregarPersonagemEfetivo(characterId, transaction);
    if (!efetivo) continue;
    const { personagem, base, vidaMax } = efetivo;
    // Habilidades V2.0 §7/§9/§11/§26 (Fase 5) — modificadores PASSIVOS
    // do alvo (DEFENSE_FLAT soma na Defesa, DAMAGE_TAKEN_PCT multiplica
    // o dano já mitigado), mesmo contexto WORLD_BOSS do teto de DoT.
    const modificadoresAlvo = await combatModifierService.resolverModificadoresDoPersonagem(base, "WORLD_BOSS");
    const efeito = resolverEfeitoDeHabilidade({
      snapshot,
      fase,
      furiaPct,
      ability,
      alvoBase: base,
      alvoDefesa: (base.defesa || 0) + combatModifierService.bonusDefesa(modificadoresAlvo),
      multiplicadorDanoRecebido: combatModifierService.multiplicadorDanoRecebido(modificadoresAlvo),
    });
    let derrotado = false;

    if (!efeito.esquivou && efeito.dano > 0) {
      const vidaAntes = personagem.vida_atual;
      const vidaDepois = Math.max(0, vidaAntes - efeito.dano);
      personagem.vida_atual = vidaDepois;
      personagem.ultima_atualizacao_vida = agora;
      await personagem.save({ transaction });

      if (vidaDepois === 0 && vidaAntes > 0) {
        derrotado = true;
        await WorldBossCombatSession.update(
          { status: COMBAT_SESSION_STATUS.DERROTADO, derrotado_at: agora },
          { where: { event_id: evento.id, character_id: characterId, status: COMBAT_SESSION_STATUS.ATIVO }, transaction },
        );
      }
    }

    // Só quem foi de fato atingido (nunca esquivou) recebe o status —
    // mesmo critério do motor existente (proc de arma/poder só no hit).
    if (!efeito.esquivou && efeitosDeStatusNoInimigo.length > 0 && !derrotado) {
      const sessaoDoAlvo = await WorldBossCombatSession.findOne({
        where: { event_id: evento.id, character_id: characterId, status: COMBAT_SESSION_STATUS.ATIVO },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (sessaoDoAlvo) {
        let statusDoAlvo = sessaoDoAlvo.state?.status ?? [];
        for (const instancia of efeitosDeStatusNoInimigo) {
          statusDoAlvo = statusEffectService.aplicarStatus(statusDoAlvo, instancia);
        }
        await WorldBossCombatSession.update(
          { state: { ...(sessaoDoAlvo.state ?? {}), status: statusDoAlvo } },
          { where: { id: sessaoDoAlvo.id }, transaction },
        );
      }
    }

    detalhes.push({
      character_id: characterId,
      nome: personagem.nome,
      dano: efeito.dano,
      esquivou: efeito.esquivou,
      critico: Boolean(efeito.critico),
      vida_atual: personagem.vida_atual,
      vida_max: vidaMax,
      derrotado,
    });
  }
  return detalhes;
}

// Ameaça Mundial V2 — Etapa 12 (§14.1): métricas pós-evento que não
// merecem coluna própria (nunca lidas pelo motor de combate em si, só
// pelo painel admin) — vivem dentro de runtime_state, mesmo critério já
// usado por cooldowns_habilidades/cast_pendente/status_boss. Chamado
// UMA VEZ por ação de verdade (nunca em no-op), nos dois pontos em que
// evento.runtime_state é persistido: a ação normal e a resolução de um
// cast pendente.
function mesclarMetricasDeAcao(runtimeStateAtual, { furiaPct, faseOrdem, entrouNaFaseEm, danoNestaAcao, idsAbilityDerrota }) {
  const anterior = runtimeStateAtual ?? {};
  const habilidadeDerrotas = { ...(anterior.habilidade_derrotas ?? {}) };
  for (const idAbility of idsAbilityDerrota) {
    const chave = idAbility === null || idAbility === undefined ? "basico" : String(idAbility);
    habilidadeDerrotas[chave] = (habilidadeDerrotas[chave] ?? 0) + 1;
  }
  return {
    furia_maxima_pct: Math.max(Number(anterior.furia_maxima_pct || 0), furiaPct ?? 0),
    dano_total_recebido_jogadores: Number(anterior.dano_total_recebido_jogadores || 0) + (danoNestaAcao || 0),
    habilidade_derrotas: habilidadeDerrotas,
    fase_timestamps: entrouNaFaseEm
      ? { ...(anterior.fase_timestamps ?? {}), [String(faseOrdem)]: entrouNaFaseEm }
      : (anterior.fase_timestamps ?? {}),
  };
}

// Uma única ação oficial do Boss — chamada pelo scheduler (Etapa 3) em
// intervalo curto; no-op na grande maioria das chamadas (só executa de
// verdade quando next_action_at já passou). Sempre commita a transação
// mesmo em no-op — nunca lança erro pra fora, quem chama só precisa
// saber "aconteceu alguma coisa (broadcast) ou não".
async function processarProximaAcao() {
  let resultado = null;

  await sequelize.transaction(async (transaction) => {
    const evento = await WorldBossEvent.findOne({
      where: { status: EVENT_STATUS.ACTIVE },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!evento) return;

    const agora = new Date();
    if (evento.next_action_at && new Date(evento.next_action_at).getTime() > agora.getTime()) return;

    const snapshot = evento.config_snapshot ?? {};
    const hpMax = Number(evento.hp_max) || 0;
    const hpAtual = Math.max(0, Number(evento.hp_current) || 0);
    const hpPercentual = hpMax > 0 ? (hpAtual / hpMax) * 100 : 0;
    const fase = faseAtualDe(snapshot.fases, hpPercentual);
    if (!fase) {
      // Catálogo sem nenhuma fase configurada (V1 legado ou erro de
      // cadastro) — nunca trava o relógio numa exceção; só adia a
      // próxima checagem pelo intervalo base do catálogo.
      evento.next_action_at = new Date(agora.getTime() + (snapshot.intervalo_acao_ms || 3000));
      await evento.save({ transaction });
      return;
    }

    // §5.3 — troca de fase reinicia phase_action_seq/Fúria; runtime_state
    // guarda a última fase vista (por ordem, não id) porque o snapshot
    // não tem id de fase persistido, só a ordem/nome congelados.
    const faseAnteriorOrdem = evento.runtime_state?.fase_atual_ordem ?? null;
    const mudouFase = faseAnteriorOrdem !== fase.ordem;

    // Etapa 5/§6.6 — resolve um cast em andamento ANTES de qualquer
    // outra coisa: next_action_at já foi sobrescrito pra resolves_at na
    // hora que o cast começou, então chegar aqui com next_action_at no
    // passado É o sinal de "hora de resolver". Uma troca de fase no
    // meio do cast descarta ele (Mana/cooldown já gastos não voltam —
    // mais simples e seguro que tentar "adaptar" um cast antigo pra uma
    // fase nova) e cai pro fluxo normal de novo, como se nada estivesse
    // pendente.
    const castPendente = evento.runtime_state?.cast_pendente ?? null;
    if (castPendente && !mudouFase) {
      const abilityDoCast = { power_snapshot: castPendente.power_snapshot, escala_com_furia: castPendente.escala_com_furia };
      let detalhesAlvos = [];
      let curaAplicada = 0;

      if (castPendente.self) {
        const efeito = resolverEfeitoSelf({ snapshot, ability: abilityDoCast });
        if (efeito.cura > 0) {
          const hpAntesCura = Math.max(0, Number(evento.hp_current));
          const hpDepoisCura = Math.min(hpMax, hpAntesCura + efeito.cura);
          evento.hp_current = hpDepoisCura;
          curaAplicada = hpDepoisCura - hpAntesCura;
        }
      } else {
        detalhesAlvos = await aplicarEfeitoDeHabilidadeEmAlvos({
          characterIds: castPendente.alvo_character_ids || [],
          snapshot,
          fase,
          furiaPct: castPendente.furia_pct_no_cast,
          ability: abilityDoCast,
          evento,
          transaction,
          agora,
        });
      }

      const intervaloMs = fase.intervalo_acao_ms ?? snapshot.intervalo_acao_ms ?? 3000;
      evento.next_action_at = new Date(agora.getTime() + Math.max(1, intervaloMs));
      const danoDoCast = detalhesAlvos.reduce((soma, alvo) => soma + (alvo.dano || 0), 0);
      const idsAbilityDerrotaCast = detalhesAlvos.filter((alvo) => alvo.derrotado).map(() => castPendente.id_ability);
      evento.runtime_state = {
        ...(evento.runtime_state ?? {}),
        fase_atual_ordem: fase.ordem,
        cast_pendente: null,
        ...mesclarMetricasDeAcao(evento.runtime_state, {
          furiaPct: castPendente.furia_pct_no_cast,
          danoNestaAcao: danoDoCast,
          idsAbilityDerrota: idsAbilityDerrotaCast,
        }),
      };
      await evento.save({ transaction });

      resultado = {
        event_id: evento.id,
        boss_action_seq: evento.boss_action_seq,
        phase_action_seq: evento.phase_action_seq,
        furia_current_pct: Number(evento.furia_current_pct),
        mana_current: evento.mana_current,
        fase: { ordem: fase.ordem, nome_fase: fase.nome_fase },
        castResolvido: true,
        habilidade: {
          id_ability: castPendente.id_ability,
          power: castPendente.power_snapshot ? { id: castPendente.power_snapshot.id, nome: castPendente.power_snapshot.nome } : null,
          alvos: detalhesAlvos,
          cura_self: curaAplicada || undefined,
        },
      };
      return;
    }

    let phaseActionSeq = mudouFase ? 0 : evento.phase_action_seq;
    let manaAtual = evento.mana_current;
    if (mudouFase) {
      if (fase.mana_ao_entrar !== null && fase.mana_ao_entrar !== undefined) {
        manaAtual = Math.max(0, Math.min(snapshot.mana_maxima || 0, fase.mana_ao_entrar));
      }
      resultado = { ...(resultado ?? {}), mudouFase: true, fase };
    }
    phaseActionSeq += 1;

    const furiaPct = furiaPctDe(phaseActionSeq, fase);

    // Regeneração de Mana só quando a ação termina (§6.5) — mantém a
    // reserva persistida evoluindo mesmo em ticks que caem no ataque
    // básico (sem nenhuma habilidade elegível).
    manaAtual = Math.min(snapshot.mana_maxima || 0, manaAtual + (snapshot.regeneracao_mana_por_acao || 0));

    // §6.3 — fluxo de IA: filtra elegíveis (fase/cooldown/Mana), sorteia
    // por prioridade+peso, resolve alvo no servidor. Sem alvo válido pra
    // habilidade escolhida (ninguém Ativo agora), cai pro ataque básico
    // sem gastar Mana/cooldown de uma habilidade que não teve efeito.
    const bossActionSeqDaAcao = evento.boss_action_seq + 1;

    // §7 — o Boss "combate como um personagem": sofre DoT e pode ser
    // hard-CC'd pelos MESMOS status que recebe de armas/poderes de
    // jogador (aplicados em worldBossCombatService, gated por
    // WorldBossStatusResistance). DoT NÃO tica mais aqui, no início do
    // "turno" do Boss — bug reportado (mesmo caso do PvP/PvE): ticava
    // antes da própria ação do Boss, grudado visualmente na ação
    // anterior. Agora tica no fim do turno dele, depois de agir (ver
    // bloco logo antes de persistir runtime_state, mais abaixo). DoT
    // nunca entrega o Golpe Final por conta própria (§11.4 exige um hit
    // rastreado de UM personagem específico) — só chipa até 1 de HP,
    // nunca zera.
    let statusBoss = evento.runtime_state?.status_boss ?? [];

    const controleBoss = statusEffectService.resolverAcoesBloqueadasDoTurno(statusBoss, bossActionSeqDaAcao);
    statusBoss = controleBoss.lista;
    // Hard CC (FREEZE/STUN/PARALYZE) bloqueia ATÉ o ataque básico — o
    // Boss simplesmente perde a ação nesta vez. SILENCE bloqueia só
    // Power (§7.2 "hard CC pode iniciar como imune" é sobre a
    // resistência cadastrada, não uma regra hardcoded aqui).
    const bossTotalmenteBloqueado = controleBoss.bloqueadas.has(ACTION_TYPE.BASIC_ATTACK);
    const bossSilenciado = controleBoss.bloqueadas.has(ACTION_TYPE.POWER);

    const cooldownsAtuais = evento.runtime_state?.cooldowns_habilidades ?? {};
    let abilityEscolhida = null;
    if (!bossTotalmenteBloqueado && !bossSilenciado) {
      const elegiveis = habilidadesElegiveis(snapshot.abilities, {
        faseId: fase.id,
        manaAtual,
        cooldowns: cooldownsAtuais,
        bossActionSeqDaAcao,
      });
      abilityEscolhida = escolherHabilidade(elegiveis);
    }

    let alvosDaHabilidade = [];
    if (abilityEscolhida && abilityEscolhida.tipo_alvo !== "SELF") {
      alvosDaHabilidade = await selecionarAlvos(abilityEscolhida.tipo_alvo, abilityEscolhida.quantidade_alvos, evento.id, transaction);
      if (alvosDaHabilidade.length === 0) abilityEscolhida = null;
    }

    let cooldownsNovos = cooldownsAtuais;
    let detalhesAlvosHabilidade = [];
    let curaAplicadaSelf = 0;
    let castIniciado = null;

    if (abilityEscolhida) {
      manaAtual = Math.max(0, manaAtual - custoManaDaHabilidade(abilityEscolhida));

      const cooldownEmAcoes = cooldownDaHabilidade(abilityEscolhida);
      if (cooldownEmAcoes > 0) {
        cooldownsNovos = { ...cooldownsAtuais, [String(abilityEscolhida.id_ability)]: bossActionSeqDaAcao + cooldownEmAcoes + 1 };
      }

      if (abilityEscolhida.tempo_conjuracao_ms > 0) {
        // §6.6 — telegraph: persiste o cast (nunca um setTimeout — tem
        // que sobreviver a restart/reconexão). next_action_at abaixo é
        // sobrescrito pra resolves_at, então o próprio relógio já
        // acorda na hora certa de resolver, sem agendamento extra.
        const resolvesAt = new Date(agora.getTime() + abilityEscolhida.tempo_conjuracao_ms);
        castIniciado = {
          id_ability: abilityEscolhida.id_ability,
          power_snapshot: abilityEscolhida.power_snapshot,
          escala_com_furia: abilityEscolhida.escala_com_furia,
          self: abilityEscolhida.tipo_alvo === "SELF",
          alvo_character_ids: alvosDaHabilidade.map((s) => s.character_id),
          furia_pct_no_cast: furiaPct,
          started_at: agora.toISOString(),
          resolves_at: resolvesAt.toISOString(),
          boss_action_seq: bossActionSeqDaAcao,
        };
      } else if (abilityEscolhida.tipo_alvo === "SELF") {
        const efeito = resolverEfeitoSelf({ snapshot, ability: abilityEscolhida });
        if (efeito.cura > 0) {
          const hpAntesCura = Math.max(0, Number(evento.hp_current));
          const hpDepoisCura = Math.min(hpMax, hpAntesCura + efeito.cura);
          evento.hp_current = hpDepoisCura;
          curaAplicadaSelf = hpDepoisCura - hpAntesCura;
        }
      } else {
        detalhesAlvosHabilidade = await aplicarEfeitoDeHabilidadeEmAlvos({
          characterIds: alvosDaHabilidade.map((s) => s.character_id),
          snapshot,
          fase,
          furiaPct,
          ability: abilityEscolhida,
          evento,
          transaction,
          agora,
        });
      }
    }

    // Ataque básico — fallback do passo 6 (§6.3): nenhuma habilidade
    // elegível (ou nenhuma com alvo válido) nunca deixa o Boss "parado".
    // Hard CC (bossTotalmenteBloqueado) é a ÚNICA situação em que nem
    // isso acontece — o Boss perde a ação de verdade.
    let danoInfo = null;
    if (!abilityEscolhida && !bossTotalmenteBloqueado) {
      const alvoBasico = await selecionarAlvoAleatorio(evento.id, transaction);
      if (alvoBasico) {
        const efetivo = await carregarPersonagemEfetivo(alvoBasico.character_id, transaction);
        if (efetivo) {
          const { personagem, base, vidaMax } = efetivo;
          // Habilidades V2.0 §7/§9/§11/§26 (Fase 5) — mesmo critério de
          // aplicarEfeitoDeHabilidadeEmAlvos acima.
          const modificadoresAlvo = await combatModifierService.resolverModificadoresDoPersonagem(base, "WORLD_BOSS");
          danoInfo = resolverDanoBasico({
            snapshot,
            fase,
            furiaPct,
            alvoBase: base,
            alvoDefesa: (base.defesa || 0) + combatModifierService.bonusDefesa(modificadoresAlvo),
            multiplicadorDanoRecebido: combatModifierService.multiplicadorDanoRecebido(modificadoresAlvo),
          });
          let alvoDerrotado = false;

          if (!danoInfo.esquivou && danoInfo.dano > 0) {
            const vidaAntes = personagem.vida_atual;
            const vidaDepois = Math.max(0, vidaAntes - danoInfo.dano);
            personagem.vida_atual = vidaDepois;
            personagem.ultima_atualizacao_vida = agora;
            await personagem.save({ transaction });

            if (vidaDepois === 0 && vidaAntes > 0) {
              alvoDerrotado = true;
              alvoBasico.status = COMBAT_SESSION_STATUS.DERROTADO;
              alvoBasico.derrotado_at = agora;
              await alvoBasico.save({ transaction });
            }
          }

          resultado = {
            ...(resultado ?? {}),
            alvo: {
              character_id: alvoBasico.character_id,
              nome: personagem.nome,
              dano: danoInfo.dano,
              esquivou: danoInfo.esquivou,
              critico: Boolean(danoInfo.critico),
              vida_atual: personagem.vida_atual,
              vida_max: vidaMax,
              derrotado: alvoDerrotado,
            },
          };
        }
      }
    }

    const intervaloMs = fase.intervalo_acao_ms ?? snapshot.intervalo_acao_ms ?? 3000;

    // §14.1 — dano recebido/derrotas desta ação: só existe efeito de
    // verdade quando NÃO é um cast recém-iniciado (telegraph resolve
    // depois, contabilizado no branch de resolução acima).
    const danoDaHabilidade = detalhesAlvosHabilidade.reduce((soma, alvo) => soma + (alvo.dano || 0), 0);
    const danoNestaAcao = castIniciado ? 0 : (resultado?.alvo?.dano || 0) + danoDaHabilidade;
    const idsAbilityDerrota = castIniciado
      ? []
      : [
          ...(resultado?.alvo?.derrotado ? [null] : []),
          ...detalhesAlvosHabilidade.filter((alvo) => alvo.derrotado).map(() => abilityEscolhida?.id_ability ?? null),
        ];

    // §7 — fim do turno do Boss: DoT tica AGORA, depois que ele já agiu
    // (ver comentário lá em cima, antes de `statusBoss` ser lido). Nunca
    // entrega o Golpe Final sozinho (§11.4) — só chipa até 1 de HP.
    const hpAntesDoDot = Math.max(0, Number(evento.hp_current));
    evento.hp_current = Math.max(
      1,
      statusEffectService.processarTicksDeInicio({
        vidaAtual: hpAntesDoDot,
        vidaMaxima: hpMax,
        defensor: { defesa: snapshot.defesa || 0 },
        lista: statusBoss,
        log: [],
        nomeAlvo: snapshot.nome || "Ameaça Mundial",
        contexto: "WORLD_BOSS",
      }),
    );

    evento.boss_action_seq = bossActionSeqDaAcao;
    evento.phase_action_seq = phaseActionSeq;
    evento.furia_current_pct = furiaPct;
    evento.mana_current = manaAtual;
    evento.next_action_at = castIniciado ? new Date(castIniciado.resolves_at) : new Date(agora.getTime() + Math.max(1, intervaloMs));
    evento.runtime_state = {
      ...(evento.runtime_state ?? {}),
      fase_atual_ordem: fase.ordem,
      cooldowns_habilidades: cooldownsNovos,
      cast_pendente: castIniciado,
      // §7 — fim do turno do Boss: decrementa a duração de todo status
      // que ele está sofrendo, uma vez só por ação (nunca por hit
      // recebido — quem aplica é worldBossCombatService, quem decrementa
      // é sempre aqui).
      status_boss: statusEffectService.decrementarDuracoes(statusBoss),
      ...mesclarMetricasDeAcao(evento.runtime_state, {
        furiaPct,
        faseOrdem: fase.ordem,
        entrouNaFaseEm: mudouFase ? agora.toISOString() : null,
        danoNestaAcao,
        idsAbilityDerrota,
      }),
    };
    await evento.save({ transaction });

    resultado = {
      ...(resultado ?? {}),
      event_id: evento.id,
      boss_action_seq: evento.boss_action_seq,
      phase_action_seq: phaseActionSeq,
      furia_current_pct: furiaPct,
      mana_current: manaAtual,
      fase: { ordem: fase.ordem, nome_fase: fase.nome_fase },
      boss_bloqueado: bossTotalmenteBloqueado ? controleBoss.motivoBloqueioTotal : undefined,
    };

    if (abilityEscolhida && !castIniciado) {
      resultado.habilidade = {
        id_ability: abilityEscolhida.id_ability,
        power: abilityEscolhida.power_snapshot ? { id: abilityEscolhida.power_snapshot.id, nome: abilityEscolhida.power_snapshot.nome } : null,
        alvos: detalhesAlvosHabilidade,
        cura_self: curaAplicadaSelf || undefined,
      };
    }
    if (castIniciado) {
      resultado.castIniciado = {
        id_ability: castIniciado.id_ability,
        power: castIniciado.power_snapshot
          ? { id: castIniciado.power_snapshot.id, nome: castIniciado.power_snapshot.nome, imagem_url: castIniciado.power_snapshot.imagem_url }
          : null,
        alvo_character_ids: castIniciado.alvo_character_ids,
        started_at: castIniciado.started_at,
        resolves_at: castIniciado.resolves_at,
      };
    }
  });

  if (resultado) {
    if (resultado.mudouFase) {
      emitGlobal("worldboss:fase", { fase: resultado.fase.nome_fase, ordem: resultado.fase.ordem, texto_alerta: resultado.fase.texto_alerta });
    }
    emitGlobal("worldboss:boss-acao", resultado);

    if (resultado.castIniciado) {
      emitGlobal("worldboss:cast-start", {
        event_id: resultado.event_id,
        boss_action_seq: resultado.boss_action_seq,
        power: resultado.castIniciado.power,
        target_preview: resultado.castIniciado.alvo_character_ids,
        started_at: resultado.castIniciado.started_at,
        resolves_at: resultado.castIniciado.resolves_at,
      });
    }

    const derrotados = [
      ...(resultado.alvo?.derrotado ? [resultado.alvo] : []),
      ...(resultado.habilidade?.alvos || []).filter((a) => a.derrotado),
    ];
    for (const derrotado of derrotados) {
      emitGlobal("worldboss:participante-derrotado", { character_id: derrotado.character_id, nome: derrotado.nome, boss_action_seq: resultado.boss_action_seq });
    }
  }

  return resultado;
}

module.exports = {
  processarProximaAcao,
  faseAtualDe,
  furiaPctDe,
  resolverDanoBasico,
  habilidadesElegiveis,
  escolherHabilidade,
  selecionarAlvos,
  resolverEfeitoDeHabilidade,
  resolverEfeitoSelf,
  cooldownDaHabilidade,
  custoManaDaHabilidade,
  resistenciaDoStatus,
  aplicarStatusNoBoss,
};
