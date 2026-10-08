// Templo do Véu Celestial (templo_veu_celestial_v1_caelum.docx) — Fase
// 4: Relicário dos Ecos (§6/§7). O draw NUNCA lê TempleRewardPool/
// TempleRewardEntry em runtime — sempre o config_snapshot.relicary
// congelado na ativação (templeLifecycleService.montarSnapshot), pro
// odds preview (futuro Admin) e o draw real usarem exatamente o mesmo
// pool/pesos (§14.2 "Odds preview e runtime usam o mesmo
// snapshot/pesos"). RNG sempre crypto.randomInt (nunca Math.random, ver
// convenção em expeditionRollService/dropService/worldBossLifecycleService).
const crypto = require("crypto");
const { EVENT_STATUS_ABERTOS } = require("../config/templeConfig");
const TempleEvent = require("../models/TempleEvent");
const CharacterTempleDrawState = require("../models/CharacterTempleDrawState");
const TempleDrawBatch = require("../models/TempleDrawBatch");
const TempleDrawHistory = require("../models/TempleDrawHistory");
const CharacterInventory = require("../models/CharacterInventory");
const CharacterEquipmentInstance = require("../models/CharacterEquipmentInstance");
const Item = require("../models/Item");
const inventoryService = require("./inventoryService");
const equipmentInstanceService = require("./equipmentInstanceService");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

const QUANTIDADES_PERMITIDAS = [1, 10];

async function obterEventoComRelicarioAberto(transaction) {
  return TempleEvent.findOne({ where: { status: EVENT_STATUS_ABERTOS }, transaction });
}

// §7.2 — "recompensa única já possuída deve sair da lista elegível".
// V1 prefere Item (spec §6.2), então posse é checada direto no
// inventário/instâncias, nunca por um registro paralelo de "já ganhou".
async function characterJaPossui(characterId, entrada, transaction) {
  if (entrada.reward_kind === "EQUIPMENT") {
    const instancia = await CharacterEquipmentInstance.findOne({
      where: { id_personagem: characterId, id_item: entrada.id_item },
      transaction,
    });
    return Boolean(instancia);
  }
  const linha = await CharacterInventory.findOne({
    where: { id_personagem: characterId, id_item: entrada.id_item },
    transaction,
  });
  return Boolean(linha && linha.quantidade > 0);
}

async function concederRecompensa(characterId, entrada, transaction) {
  if (entrada.reward_kind === "EQUIPMENT") {
    await equipmentInstanceService.create(
      { idPersonagem: characterId, idItem: entrada.id_item, raridade: entrada.raridade_instancia },
      transaction,
    );
    return;
  }
  await inventoryService.addStack(characterId, entrada.id_item, entrada.quantidade, transaction);
}

function sortearPonderado(entradas) {
  const pesoTotal = entradas.reduce((soma, e) => soma + e.weight, 0);
  if (!(pesoTotal > 0)) throw erro("O Relicário desta Convergência não tem peso configurado corretamente.", 500);
  let alvo = crypto.randomInt(0, pesoTotal);
  for (const entrada of entradas) {
    if (alvo < entrada.weight) return entrada;
    alvo -= entrada.weight;
  }
  return entradas[entradas.length - 1];
}

function formatarDraw(registro) {
  return {
    draw_seq: registro.draw_seq,
    entry_key: registro.entry_key,
    reward_kind: registro.reward_kind,
    id_item: registro.id_item,
    nome: registro.nome_item_snapshot,
    quantidade: registro.quantidade,
    raridade: registro.raridade_snapshot,
    eh_fallback: registro.eh_fallback,
    createdAt: registro.createdAt,
  };
}

// §6.1/§7.1 — um draw individual dentro do lote: resolve garantia de
// pity (Featured tem prioridade sobre Raro+ quando as duas batem no
// mesmo draw — Featured é a garantia mais específica), aplica a regra
// de duplicata (§7.2) e grava histórico com pity antes/depois. Os
// contadores resetam com base na entry ORIGINAL sorteada (antes de um
// eventual fallback por duplicata) — o fallback existe pra não repetir
// algo que o personagem já tem, não pra negar a garantia que a entry
// original já cumpriria.
async function executarUmDraw(characterId, evento, relicary, estadoPity, batch, transaction) {
  const raroAntes = estadoPity.draws_desde_raro_mais;
  const featuredAntes = estadoPity.draws_desde_featured;
  const raroTentativo = raroAntes + 1;
  const featuredTentativo = featuredAntes + 1;

  const entradas = relicary.entries;
  let candidatas = entradas;
  if (relicary.pity_featured_garantia != null && featuredTentativo >= relicary.pity_featured_garantia) {
    candidatas = entradas.filter((e) => e.eh_featured);
  } else if (relicary.pity_raro_mais_garantia != null && raroTentativo >= relicary.pity_raro_mais_garantia) {
    candidatas = entradas.filter((e) => e.eh_raro_mais);
  }
  if (candidatas.length === 0) candidatas = entradas;
  if (candidatas.length === 0) throw erro("O Relicário desta Convergência não tem nenhuma entrada ativa.", 500);

  const original = sortearPonderado(candidatas);
  let concedida = original;
  let ehFallback = false;
  if (original.eh_unico && (await characterJaPossui(characterId, original, transaction))) {
    const fallback = entradas.find((e) => e.key === original.fallback_key);
    if (!fallback) {
      throw erro(`Relicário configurado incorretamente: fallback ausente para "${original.key}".`, 500);
    }
    concedida = fallback;
    ehFallback = true;
  }

  await concederRecompensa(characterId, concedida, transaction);

  const raroDepois = original.eh_raro_mais ? 0 : raroTentativo;
  const featuredDepois = original.eh_featured ? 0 : featuredTentativo;
  estadoPity.draws_desde_raro_mais = raroDepois;
  estadoPity.draws_desde_featured = featuredDepois;
  estadoPity.total_draws += 1;
  estadoPity.last_draw_at = new Date();

  const item = await Item.findByPk(concedida.id_item, { transaction });
  const quantidadeConcedida = concedida.reward_kind === "EQUIPMENT" ? 1 : concedida.quantidade;
  const raridadeConcedida =
    concedida.reward_kind === "EQUIPMENT" ? concedida.raridade_instancia : item?.raridade ?? null;

  const registro = await TempleDrawHistory.create(
    {
      id_batch: batch.id,
      id_event: evento.id,
      character_id: characterId,
      draw_seq: estadoPity.total_draws,
      entry_key: concedida.key,
      reward_kind: concedida.reward_kind,
      id_item: concedida.id_item,
      nome_item_snapshot: item?.nome ?? concedida.nome_exibicao,
      quantidade: quantidadeConcedida,
      raridade_snapshot: raridadeConcedida,
      eh_fallback: ehFallback,
      original_entry_key: ehFallback ? original.key : null,
      pity_raro_mais_antes: raroAntes,
      pity_raro_mais_depois: raroDepois,
      pity_featured_antes: featuredAntes,
      pity_featured_depois: featuredDepois,
    },
    { transaction },
  );

  return formatarDraw(registro);
}

// POST /api/temple/relicary/draw — §6.1/§14.1. client_request_id é
// obrigatório: um retry com o MESMO id nunca debita Sigilos de novo,
// só devolve o resultado já gravado (idempotência real via UNIQUE em
// temple_draw_batches, não um cache em memória).
async function sortear(characterId, { count, clientRequestId }, transaction) {
  if (!QUANTIDADES_PERMITIDAS.includes(count)) {
    throw erro("A quantidade de draws deve ser 1 ou 10.", 400);
  }
  if (!clientRequestId || typeof clientRequestId !== "string") {
    throw erro("client_request_id é obrigatório.", 400);
  }

  const existente = await TempleDrawBatch.findOne({
    where: { character_id: characterId, client_request_id: clientRequestId },
    transaction,
  });
  if (existente) {
    const draws = await TempleDrawHistory.findAll({
      where: { id_batch: existente.id },
      order: [["draw_seq", "ASC"]],
      transaction,
    });
    return { idempotente: true, draws: draws.map(formatarDraw) };
  }

  const evento = await TempleEvent.findOne({
    where: { status: EVENT_STATUS_ABERTOS },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!evento) throw erro("Não há Convergência com Relicário aberto agora.", 400);

  const relicary = evento.config_snapshot?.relicary;
  if (!relicary) throw erro("O Relicário desta Convergência ainda não foi configurado.", 400);

  const custoTotal = relicary.custo_sigilos_draw * count;
  // Lock + validação de saldo + débito atômico — mesma rotina usada em
  // qualquer outro custo de Currencia do projeto (§14.1 "lock no
  // CharacterInventory da moeda").
  await inventoryService.removeStack(characterId, evento.id_currency_item, custoTotal, transaction);

  const [estadoPity] = await CharacterTempleDrawState.findOrCreate({
    where: { character_id: characterId },
    defaults: { character_id: characterId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  let batch;
  try {
    batch = await TempleDrawBatch.create(
      {
        id_event: evento.id,
        character_id: characterId,
        client_request_id: clientRequestId,
        quantidade: count,
        custo_total: custoTotal,
      },
      { transaction },
    );
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      throw erro("Esta requisição já está sendo processada. Tente novamente em um instante.", 409);
    }
    throw error;
  }

  const resultados = [];
  for (let i = 0; i < count; i++) {
    resultados.push(await executarUmDraw(characterId, evento, relicary, estadoPity, batch, transaction));
  }
  await estadoPity.save({ transaction });

  return { idempotente: false, draws: resultados };
}

// GET /api/temple/relicary — §13.4: custo, odds (após elegibilidade de
// duplicata — entries eh_unico já possuídas somem do denominador),
// pity atual e saldo de Sigilos do personagem.
async function obterRelicario(characterId) {
  const evento = await obterEventoComRelicarioAberto();
  if (!evento) return { event_id: null, relicario: null };

  const relicary = evento.config_snapshot?.relicary;
  if (!relicary) return { event_id: evento.id, relicario: null };

  const entradasElegiveis = [];
  for (const entrada of relicary.entries) {
    const possuiJa = entrada.eh_unico && (await characterJaPossui(characterId, entrada, null));
    if (!possuiJa) entradasElegiveis.push(entrada);
  }
  const pesoTotal = entradasElegiveis.reduce((soma, e) => soma + e.weight, 0);

  const [estadoPity] = await CharacterTempleDrawState.findOrCreate({
    where: { character_id: characterId },
    defaults: { character_id: characterId },
  });

  const linhaSigilos = await CharacterInventory.findOne({
    where: { id_personagem: characterId, id_item: evento.id_currency_item },
  });

  return {
    event_id: evento.id,
    relicario: {
      nome: relicary.nome,
      custo_sigilos_draw: relicary.custo_sigilos_draw,
      meus_sigilos: linhaSigilos?.quantidade ?? 0,
      pity_raro_mais_garantia: relicary.pity_raro_mais_garantia,
      pity_featured_garantia: relicary.pity_featured_garantia,
      draws_desde_raro_mais: estadoPity.draws_desde_raro_mais,
      draws_desde_featured: estadoPity.draws_desde_featured,
      total_draws: estadoPity.total_draws,
      entries: entradasElegiveis.map((entrada) => ({
        key: entrada.key,
        nome_exibicao: entrada.nome_exibicao,
        reward_kind: entrada.reward_kind,
        raridade_instancia: entrada.raridade_instancia,
        eh_raro_mais: entrada.eh_raro_mais,
        eh_featured: entrada.eh_featured,
        chance_normal: pesoTotal > 0 ? entrada.weight / pesoTotal : 0,
      })),
    },
  };
}

// GET /api/temple/relicary/history — §13.4 "histórico recente". Cruza
// Convergências de propósito (draw_seq é vitalício por personagem),
// nunca filtrado por id_event.
async function listarHistorico(characterId, limite = 50) {
  const registros = await TempleDrawHistory.findAll({
    where: { character_id: characterId },
    order: [["draw_seq", "DESC"]],
    limit: Math.max(1, Math.min(200, limite)),
  });
  return registros.map(formatarDraw);
}

module.exports = {
  obterEventoComRelicarioAberto,
  characterJaPossui,
  sortear,
  obterRelicario,
  listarHistorico,
};
