// Sessão de Pesca — orquestrador central do minigame (spec §14/§15/§16).
//
// DECISÃO DE ARQUITETURA (spec §40 regra 13 — "se um ponto conflitar com
// restrições práticas, preservar a regra funcional, adaptar ao padrão
// arquitetural mais recente e documentar"): a spec recomenda um
// fishingSocket.js dedicado com ticks fixos a 10Hz via Socket.IO
// (§15/§15.3). Esta implementação usa endpoints HTTP síncronos e
// discretos (start/cast/hook/reel/abandon) em vez de um loop de tick ao
// vivo — redução de complexidade/risco deliberada para esta passada única
// de implementação. A regra funcional central é 100% preservada: o
// SERVIDOR decide espécie/peso/comportamento/tensão/resultado a cada
// chamada; o cliente nunca envia species/weight/score/tension/success,
// só a intenção (cast/hook/reel ON-OFF/abandon) — exatamente como
// duelEngine.js já faz pro PvP ao vivo. fishingSocket.js com tick
// contínuo fica para uma fase futura caso o jogo precise de gameplay
// "ao vivo" de fato (ver relatório final).
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const FishingSession = require("../models/FishingSession");
const FishingZone = require("../models/FishingZone");
const FishingBait = require("../models/FishingBait");
const FishingCatchRecord = require("../models/FishingCatchRecord");
const CharacterFishingSpeciesDiscovery = require("../models/CharacterFishingSpeciesDiscovery");
const CharacterEquipmentInstance = require("../models/CharacterEquipmentInstance");
const CharacterInventory = require("../models/CharacterInventory");
const CharacterNavigationState = require("../models/CharacterNavigationState");
const Item = require("../models/Item");
const FishingRodProperties = require("../models/FishingRodProperties");
const { propriedadesEfetivasVara } = require("./equipmentRefinementService");
const { sortearEspecie } = require("./fishingEncounterService");
const { resolverPassoDeReel } = require("./fishingEngine");
const { aplicarGanhoDeXp, garantirProgresso } = require("./fishingProgressionService");
const {
  sortearPesoGramas,
  qualidadeEspecime,
  xpPorCaptura,
  ESPERA_MORDIDA_MIN_MS,
  ESPERA_MORDIDA_MAX_MS,
  JANELA_MORDIDA_BASE_MS,
  SESSAO_EXPIRACAO_MS,
  TENSAO_MAXIMA,
  PROGRESSO_PARA_CAPTURA,
} = require("../config/fishingConfig");

const FASES_TERMINAIS = ["CAUGHT", "ESCAPED", "BROKEN_LINE", "EXPIRED", "ABORTED"];

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

function ehTerminal(fase) {
  return FASES_TERMINAIS.includes(fase);
}

function estadoPublico(session) {
  // NUNCA inclui id_species/weight_g/behavior_seed antes de CAUGHT (spec
  // §15.2/§31) — o que o cliente recebe é só o que ele tem permissão de
  // ver.
  const base = {
    id: session.id,
    fase: session.fase,
    tensao: session.tensao,
    progresso: session.progresso,
    sequence: session.sequence,
    expires_at: session.expires_at,
    mordida_disponivel_em: session.mordida_disponivel_em,
    janela_mordida_expira_em: session.janela_mordida_expira_em,
  };
  if (session.fase === "CAUGHT" && session.resultado_payload) {
    return { ...base, resultado: session.resultado_payload };
  }
  if (ehTerminal(session.fase)) {
    return { ...base, resultado: session.resultado_payload ?? { motivo: session.fase } };
  }
  return base;
}

async function buscarRodEfetivo(characterId, idInstanciaVara, transaction) {
  if (!idInstanciaVara) return null;
  const instancia = await CharacterEquipmentInstance.findOne({
    where: { id: idInstanciaVara, id_personagem: characterId },
    include: [{ model: Item, as: "item", include: [{ model: FishingRodProperties, as: "fishingRodProperties" }] }],
    transaction,
  });
  if (!instancia || instancia.item?.tipo_item !== "Ferramenta" || !instancia.item.fishingRodProperties) {
    throw erro("Vara de pesca inválida ou não pertence a você.", 400);
  }
  if (instancia.estado === "Mercado") {
    throw erro("Essa vara está anunciada no Mercado Negro.", 400);
  }
  return {
    id_item: instancia.item.id,
    refinamento: instancia.refinamento,
    efetivo: propriedadesEfetivasVara(instancia.item.fishingRodProperties, instancia.refinamento),
  };
}

// POST /api/fishing/sessions/start
async function iniciarSessao(characterId, { zoneId, rodInstanceId, baitItemId }) {
  return sequelize.transaction(async (transaction) => {
    const ativa = await FishingSession.findOne({
      where: { id_personagem: characterId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (ativa && !ehTerminal(ativa.fase)) {
      throw erro("Você já tem uma sessão de pesca em andamento.", 400);
    }

    const zona = await FishingZone.findOne({ where: { id: zoneId, ativo: true }, transaction });
    if (!zona) throw erro("Zona de pesca não encontrada.", 404);

    const progresso = await garantirProgresso(characterId, transaction);
    if (progresso.nivel < zona.nivel_pesca_minimo) {
      throw erro(`Exige Nível de Pesca ${zona.nivel_pesca_minimo}.`, 400);
    }

    // Gate de Navegação (spec §18) — precisa estar na zona (viagem já
    // validada por fishingNavigationService.viajar).
    const navegacao = await CharacterNavigationState.findOne({ where: { id_personagem: characterId }, transaction });
    if (!navegacao || navegacao.id_zone_atual !== zona.id) {
      throw erro("Você precisa navegar até essa zona antes de pescar (ver Navegação).", 400);
    }

    const rod = await buscarRodEfetivo(characterId, rodInstanceId, transaction);
    if (rod && rod.efetivo.nivel_pesca_minimo > progresso.nivel) {
      throw erro("Nível de Pesca insuficiente para essa vara.", 400);
    }

    let bait = null;
    if (baitItemId) {
      bait = await FishingBait.findOne({ where: { id_item: baitItemId, ativo: true }, transaction });
      if (!bait) throw erro("Isca inválida.", 400);
      const entrada = await CharacterInventory.findOne({
        where: { id_personagem: characterId, id_item: baitItemId },
        transaction,
      });
      if (!entrada || entrada.quantidade < 1) throw erro("Você não possui essa isca.", 400);
    }

    const agora = new Date();
    const session = await FishingSession.create(
      {
        id_personagem: characterId,
        id_zone: zona.id,
        id_instancia_vara: rodInstanceId ?? null,
        id_bait_item: baitItemId ?? null,
        fase: "CASTING",
        started_at: agora,
        expires_at: new Date(agora.getTime() + SESSAO_EXPIRACAO_MS),
      },
      { transaction },
    );
    return estadoPublico(session);
  });
}

async function carregarSessaoAtivaTravada(characterId, sessionId, transaction) {
  const session = await FishingSession.findOne({
    where: { id: sessionId, id_personagem: characterId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!session) throw erro("Sessão de pesca não encontrada.", 404);
  return session;
}

function checarExpiracao(session, agora) {
  if (!ehTerminal(session.fase) && agora.getTime() > new Date(session.expires_at).getTime()) {
    session.fase = "EXPIRED";
    session.finalized_at = agora;
    session.resultado_payload = { motivo: "EXPIRED" };
    return true;
  }
  return false;
}

// POST /api/fishing/sessions/:id/cast — "lançar a linha": sorteia
// espécie/peso/comportamento AGORA (nunca antes, nunca no cliente).
async function lancar(characterId, sessionId) {
  return sequelize.transaction(async (transaction) => {
    const session = await carregarSessaoAtivaTravada(characterId, sessionId, transaction);
    const agora = new Date();
    if (checarExpiracao(session, agora)) {
      await session.save({ transaction });
      return estadoPublico(session);
    }
    if (session.fase !== "CASTING") {
      if (ehTerminal(session.fase)) return estadoPublico(session);
      throw erro(`Ação inválida na fase atual (${session.fase}).`, 400);
    }

    const progresso = await garantirProgresso(characterId, transaction);
    const especie = await sortearEspecie(session.id_zone, progresso.nivel, session.id_bait_item, { transaction });
    if (!especie) throw erro("Não há espécies disponíveis nessa zona no momento.", 400);

    const peso = sortearPesoGramas(especie.peso_min_g, especie.peso_max_g, especie.perfil_peso);
    const seed = Math.floor(Math.random() * 2 ** 31);

    // Marco de consumo da isca (spec §11/§31): a partir daqui a
    // espécie/isca já foram sorteadas — abandonar depois disso NÃO
    // devolve a isca (impede reroll de graça).
    if (session.id_bait_item) {
      const entrada = await CharacterInventory.findOne({
        where: { id_personagem: characterId, id_item: session.id_bait_item },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!entrada || entrada.quantidade < 1) throw erro("Isca insuficiente.", 400);
      entrada.quantidade -= 1;
      if (entrada.quantidade <= 0) await entrada.destroy({ transaction });
      else await entrada.save({ transaction });
      session.isca_consumida = true;
    }

    const rodInfo = await buscarRodEfetivo(characterId, session.id_instancia_vara, transaction);
    const precisao = rodInfo?.efetivo?.precisao ?? 0;
    const janelaMs = JANELA_MORDIDA_BASE_MS + Math.round((precisao / 1000) * 1200);
    const esperaMs = ESPERA_MORDIDA_MIN_MS + Math.random() * (ESPERA_MORDIDA_MAX_MS - ESPERA_MORDIDA_MIN_MS);

    session.id_species = especie.id;
    session.weight_g = peso;
    session.behavior_seed = seed;
    session.fase = "WAITING_BITE";
    session.mordida_disponivel_em = new Date(agora.getTime() + esperaMs);
    session.janela_mordida_expira_em = new Date(agora.getTime() + esperaMs + janelaMs);
    await session.save({ transaction });
    return estadoPublico(session);
  });
}

// POST /api/fishing/sessions/:id/hook — fisgar dentro da janela.
async function fisgar(characterId, sessionId) {
  return sequelize.transaction(async (transaction) => {
    const session = await carregarSessaoAtivaTravada(characterId, sessionId, transaction);
    const agora = new Date();
    if (checarExpiracao(session, agora)) {
      await session.save({ transaction });
      return estadoPublico(session);
    }
    if (session.fase !== "WAITING_BITE") {
      if (ehTerminal(session.fase)) return estadoPublico(session);
      throw erro(`Ação inválida na fase atual (${session.fase}).`, 400);
    }

    if (agora.getTime() < new Date(session.mordida_disponivel_em).getTime()) {
      throw erro("O peixe ainda não mordeu.", 400);
    }
    if (agora.getTime() > new Date(session.janela_mordida_expira_em).getTime()) {
      session.fase = "ESCAPED";
      session.finalized_at = agora;
      session.resultado_payload = { motivo: "JANELA_PERDIDA" };
      await session.save({ transaction });
      return estadoPublico(session);
    }

    session.fase = "FIGHTING";
    session.tensao = 0;
    session.progresso = 0;
    await session.save({ transaction });
    return estadoPublico(session);
  });
}

// Finalização da captura — UMA transaction: lock sessão -> valida não
// finalizada -> add Item -> add XP -> cria CatchRecord -> finaliza
// sessão (spec §30). Chamado de dentro de recolher() já com a sessão
// travada na mesma transaction.
async function finalizarCaptura(characterId, session, transaction) {
  if (session.finalized_at) return session.resultado_payload; // idempotência de retry

  const FishingSpecies = require("../models/FishingSpecies");
  const especie = await FishingSpecies.findByPk(session.id_species, { transaction });
  if (!especie) throw erro("Espécie da captura não encontrada.", 500);

  const quality = qualidadeEspecime(session.weight_g, especie.peso_min_g, especie.peso_max_g);
  const xpGanho = xpPorCaptura(especie.dificuldade_base, quality);

  // 1 unidade do Item stackável no inventário (spec §12.1).
  const [entrada] = await CharacterInventory.findOrCreate({
    where: { id_personagem: characterId, id_item: especie.id_item },
    defaults: { id_personagem: characterId, id_item: especie.id_item, quantidade: 0 },
    transaction,
  });
  entrada.quantidade += 1;
  await entrada.save({ transaction });

  await aplicarGanhoDeXp(characterId, xpGanho, transaction);

  let rodItemId = null;
  let refinamentoSnapshot = null;
  if (session.id_instancia_vara) {
    const instancia = await CharacterEquipmentInstance.findByPk(session.id_instancia_vara, { transaction });
    if (instancia) {
      rodItemId = instancia.id_item;
      refinamentoSnapshot = instancia.refinamento;
    }
  }

  const catchRecord = await FishingCatchRecord.create(
    {
      id_personagem: characterId,
      id_species: especie.id,
      id_zone: session.id_zone,
      id_session: session.id,
      weight_g: session.weight_g,
      quality,
      id_rod_item: rodItemId,
      refinamento_vara_snapshot: refinamentoSnapshot,
      id_bait_item: session.id_bait_item,
    },
    { transaction },
  );

  const [discovery, criado] = await CharacterFishingSpeciesDiscovery.findOrCreate({
    where: { id_personagem: characterId, id_species: especie.id },
    defaults: { id_personagem: characterId, id_species: especie.id, total_capturado: 0, maior_peso_g: 0 },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  discovery.total_capturado += 1;
  if (session.weight_g > discovery.maior_peso_g) discovery.maior_peso_g = session.weight_g;
  await discovery.save({ transaction });

  const resultado = {
    resultado: "CAUGHT",
    id_species: especie.id,
    nome_especie: null, // resolvido pelo controller via include, se necessário
    weight_g: session.weight_g,
    quality,
    xp: xpGanho,
    id_catch_record: catchRecord.id,
    primeira_descoberta: criado,
  };

  session.finalized_at = new Date();
  session.resultado_payload = resultado;
  return resultado;
}

// POST /api/fishing/sessions/:id/reel — body: { active: boolean }
async function recolher(characterId, sessionId, active) {
  return sequelize.transaction(async (transaction) => {
    const session = await carregarSessaoAtivaTravada(characterId, sessionId, transaction);
    const agora = new Date();
    if (ehTerminal(session.fase)) return estadoPublico(session); // idempotente — nunca reprocessa
    if (checarExpiracao(session, agora)) {
      await session.save({ transaction });
      return estadoPublico(session);
    }
    if (session.fase !== "FIGHTING") {
      throw erro(`Ação inválida na fase atual (${session.fase}).`, 400);
    }

    const especie = await require("../models/FishingSpecies").findByPk(session.id_species, { transaction });
    const rodInfo = await buscarRodEfetivo(characterId, session.id_instancia_vara, transaction);

    session.sequence += 1;
    const passo = resolverPassoDeReel({
      behaviorKey: especie.comportamento_key,
      seed: session.behavior_seed,
      sequence: session.sequence,
      tensaoAtual: session.tensao,
      progressoAtual: session.progresso,
      rod: rodInfo?.efetivo ?? null,
      active: Boolean(active),
    });
    session.tensao = passo.tensao;
    session.progresso = passo.progresso;

    if (session.tensao >= TENSAO_MAXIMA) {
      session.fase = "BROKEN_LINE";
      session.finalized_at = agora;
      session.resultado_payload = { motivo: "BROKEN_LINE" };
    } else if (session.progresso >= PROGRESSO_PARA_CAPTURA) {
      session.fase = "CAUGHT";
      await finalizarCaptura(characterId, session, transaction);
    }

    await session.save({ transaction });
    return estadoPublico(session);
  });
}

// POST /api/fishing/sessions/:id/abandon
async function abandonar(characterId, sessionId) {
  return sequelize.transaction(async (transaction) => {
    const session = await carregarSessaoAtivaTravada(characterId, sessionId, transaction);
    if (!ehTerminal(session.fase)) {
      session.fase = "ABORTED";
      session.finalized_at = new Date();
      session.resultado_payload = { motivo: "ABORTED" };
      await session.save({ transaction });
    }
    return estadoPublico(session);
  });
}

async function obterSessao(characterId, sessionId) {
  const session = await FishingSession.findOne({ where: { id: sessionId, id_personagem: characterId } });
  if (!session) throw erro("Sessão não encontrada.", 404);
  return estadoPublico(session);
}

async function obterSessaoAtiva(characterId) {
  const session = await FishingSession.findOne({
    where: { id_personagem: characterId },
    order: [["id", "DESC"]],
  });
  if (!session || ehTerminal(session.fase)) return null;
  return estadoPublico(session);
}

module.exports = {
  iniciarSessao,
  lancar,
  fisgar,
  recolher,
  abandonar,
  obterSessao,
  obterSessaoAtiva,
  estadoPublico,
};
