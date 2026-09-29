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
const { aplicarMitigacaoDeDefesa, calcularDanoBasico, resolverResultadoDeAcerto, comMultiplicadoresDeClasse, vidaMaximaDe } = require("./combatFormulas");
const { personagemComBonus, buscarBonusDeAtributos } = require("./equipmentBonusService");
const { emitGlobal } = require("../socket/worldBossSocket");
const { EVENT_STATUS, COMBAT_SESSION_STATUS } = require("../config/worldBossConfig");

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

// Resolve o ataque básico do boss contra UM alvo já travado — devolve
// null se o alvo esquivou (nada a persistir além do que o chamador já
// for salvar do relógio em si). Nunca decide sozinho DERROTADO/
// contribution: só calcula dano e deixa a persistência pro chamador,
// que já está dentro da mesma transação/lock.
function resolverDanoBasico({ snapshot, fase, furiaPct, alvoBase, alvoDefesa }) {
  const atacante = {
    forca: snapshot.forca,
    agilidade: snapshot.agilidade,
    arma_equipada: { dano_min: fase.dano_min, dano_max: fase.dano_max },
  };
  const defensor = { agilidade: alvoBase.agilidade || 0 };

  const resultadoAcerto = resolverResultadoDeAcerto({ atacante, defensor });
  if (!resultadoAcerto.hit) return { dano: 0, esquivou: true };

  const danoBase = calcularDanoBasico(atacante);
  const danoFase = danoBase * (1 + Number(fase.modificador_dano_percentual || 0) / 100);
  const danoComFuria = danoFase * (1 + furiaPct / 100);
  const danoFinal = aplicarMitigacaoDeDefesa(Math.round(danoComFuria), { defesa: alvoDefesa });

  return { dano: danoFinal, esquivou: false };
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

    // Regeneração de Mana só quando a ação termina (§6.5) — mesmo sem
    // habilidade nenhuma sendo usada ainda (Etapa 5), já mantém a
    // reserva persistida evoluindo pra quando a IA começar a gastar.
    manaAtual = Math.min(snapshot.mana_maxima || 0, manaAtual + (snapshot.regeneracao_mana_por_acao || 0));

    const alvo = await selecionarAlvoAleatorio(evento.id, transaction);
    let danoInfo = null;
    let alvoDerrotado = false;

    if (alvo) {
      const efetivo = await carregarPersonagemEfetivo(alvo.character_id, transaction);
      if (efetivo) {
        const { personagem, base, vidaMax } = efetivo;
        danoInfo = resolverDanoBasico({ snapshot, fase, furiaPct, alvoBase: base, alvoDefesa: base.defesa || 0 });

        if (!danoInfo.esquivou && danoInfo.dano > 0) {
          const vidaAntes = personagem.vida_atual;
          const vidaDepois = Math.max(0, vidaAntes - danoInfo.dano);
          personagem.vida_atual = vidaDepois;
          personagem.ultima_atualizacao_vida = agora;
          await personagem.save({ transaction });

          if (vidaDepois === 0 && vidaAntes > 0) {
            alvoDerrotado = true;
            alvo.status = COMBAT_SESSION_STATUS.DERROTADO;
            alvo.derrotado_at = agora;
            await alvo.save({ transaction });
          }
        }

        resultado = {
          ...(resultado ?? {}),
          alvo: { character_id: alvo.character_id, nome: personagem.nome, dano: danoInfo.dano, esquivou: danoInfo.esquivou, vida_atual: personagem.vida_atual, vida_max: vidaMax, derrotado: alvoDerrotado },
        };
      }
    }

    const intervaloMs = fase.intervalo_acao_ms ?? snapshot.intervalo_acao_ms ?? 3000;

    evento.boss_action_seq += 1;
    evento.phase_action_seq = phaseActionSeq;
    evento.furia_current_pct = furiaPct;
    evento.mana_current = manaAtual;
    evento.next_action_at = new Date(agora.getTime() + Math.max(1, intervaloMs));
    evento.runtime_state = { ...(evento.runtime_state ?? {}), fase_atual_ordem: fase.ordem };
    await evento.save({ transaction });

    resultado = {
      ...(resultado ?? {}),
      event_id: evento.id,
      boss_action_seq: evento.boss_action_seq,
      phase_action_seq: phaseActionSeq,
      furia_current_pct: furiaPct,
      mana_current: manaAtual,
      fase: { ordem: fase.ordem, nome_fase: fase.nome_fase },
    };
  });

  if (resultado) {
    if (resultado.mudouFase) {
      emitGlobal("worldboss:fase", { fase: resultado.fase.nome_fase, ordem: resultado.fase.ordem, texto_alerta: resultado.fase.texto_alerta });
    }
    emitGlobal("worldboss:boss-acao", resultado);
    if (resultado.alvo?.derrotado) {
      emitGlobal("worldboss:participante-derrotado", { character_id: resultado.alvo.character_id, nome: resultado.alvo.nome, boss_action_seq: resultado.boss_action_seq });
    }
  }

  return resultado;
}

module.exports = { processarProximaAcao, faseAtualDe, furiaPctDe, resolverDanoBasico };
