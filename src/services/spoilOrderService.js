// Balcão de Espólios §5.4/§7/§9.3 — entrega transacional de UMA
// encomenda: concede ouro + Reputação e, na quinta entrega válida da
// janela, dispara o bônus 5/5 (uma única vez, mesma transação).
const Character = require("../models/Character");
const CharacterInventory = require("../models/CharacterInventory");
const CharacterAdventureGuildProgress = require("../models/CharacterAdventureGuildProgress");
const CharacterSpoilOrder = require("../models/CharacterSpoilOrder");
const CharacterSpoilOrderCycle = require("../models/CharacterSpoilOrderCycle");
const Item = require("../models/Item");
const { removeStack } = require("./inventoryService");
const { concederOuro } = require("./goldService");
const {
  resolverNivel,
  formatarResumoReputacao,
  sortearPercentualBonus,
} = require("./spoilReputationService");
const {
  SPOIL_ORDER_REPUTATION: SPOIL_ORDER_REPUTATION_PADRAO,
  SPOIL_ORDER_SET_BONUS_REPUTATION: SPOIL_ORDER_SET_BONUS_REPUTATION_PADRAO,
  SPOIL_ORDERS_PER_ROTATION,
  inicioDaJanelaDeEncomendas,
} = require("../config/adventureGuildConfig");
const gameSettingCache = require("./gameSettingCache");

// Painel Administrativo Fase 10 — admin pode sobrescrever via
// GameSetting ("spoils.orderReputationReward"/
// "spoils.setBonusReputationReward", ver adminSpoilConfigService.js).
function reputacaoPorEncomenda() {
  return gameSettingCache.obter("spoils.orderReputationReward", SPOIL_ORDER_REPUTATION_PADRAO);
}
function reputacaoDoBonusDeLote() {
  return gameSettingCache.obter("spoils.setBonusReputationReward", SPOIL_ORDER_SET_BONUS_REPUTATION_PADRAO);
}

function erroBalcao(statusCode, mensagem) {
  return Object.assign(new Error(mensagem), { statusCode });
}

async function obterOuCriarProgresso(idPersonagem, transaction) {
  const [progresso] = await CharacterAdventureGuildProgress.findOrCreate({
    where: { id_personagem: idPersonagem },
    defaults: { rank: "F" },
    transaction,
  });
  return progresso;
}

// §7.3 — na quinta entrega válida da janela, concede o bônus de lote:
// +25 Reputação e ouro aleatório sobre a soma do valor-BASE (sem
// multiplicador) das 5 encomendas. Chamado só depois que a encomenda
// que fechou 5/5 já foi marcada concluída, dentro da MESMA transação.
async function concederBonusDeLoteSeCompleto(ciclo, progresso, character, transaction) {
  if (ciclo.bonus_lote_concedido) return null;

  const encomendas = await CharacterSpoilOrder.findAll({ where: { id_ciclo: ciclo.id }, transaction });
  const concluidas = encomendas.filter((o) => o.concluida_em != null);
  if (concluidas.length < SPOIL_ORDERS_PER_ROTATION) return null;

  const valorBaseTotal = encomendas.reduce((soma, o) => soma + o.quantidade_exigida * o.valor_unitario_snapshot, 0);

  // §7.3 — soma o bônus de lote ANTES de decidir o nível do bônus (a
  // reputação da quinta encomenda já foi somada por quem chamou, antes
  // desta função); se o jogador sobe de nível bem na quinta entrega, o
  // bônus já usa o novo nível.
  const reputacaoDoLote = reputacaoDoBonusDeLote();
  progresso.reputacao_encomendas += reputacaoDoLote;
  const nivelDoBonus = resolverNivel(progresso.reputacao_encomendas);
  const percentual = sortearPercentualBonus(nivelDoBonus);
  const bonusOuro = Math.floor(valorBaseTotal * percentual);

  concederOuro(character, bonusOuro);

  ciclo.bonus_lote_concedido = true;
  ciclo.bonus_reputacao = reputacaoDoLote;
  ciclo.bonus_percentual = percentual;
  ciclo.bonus_ouro = bonusOuro;
  await ciclo.save({ transaction });

  return { gold: bonusOuro, reputation: reputacaoDoLote, percentual };
}

// §9.3 — fluxo completo de entrega de UMA encomenda.
async function entregarEncomenda(idPersonagem, idOrder, transaction) {
  // Encomenda "pura" primeiro (sem include, evita FOR UPDATE em LEFT
  // JOIN — mesmo cuidado de adventureGuildContractService.js).
  const order = await CharacterSpoilOrder.findByPk(idOrder, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!order) throw erroBalcao(404, "Encomenda não encontrada.");

  const ciclo = await CharacterSpoilOrderCycle.findByPk(order.id_ciclo, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!ciclo || ciclo.id_personagem !== idPersonagem) {
    throw erroBalcao(404, "Encomenda não encontrada.");
  }

  const janelaAtual = inicioDaJanelaDeEncomendas();
  if (ciclo.janela_inicio.getTime() !== janelaAtual.getTime()) {
    throw erroBalcao(409, "Esta encomenda já não faz parte da janela atual.");
  }
  if (order.concluida_em != null) {
    throw erroBalcao(409, "Esta encomenda já foi entregue.");
  }

  const item = await Item.findByPk(order.id_item, { transaction });

  const entradaInventario = await CharacterInventory.findOne({
    where: { id_personagem: idPersonagem, id_item: order.id_item },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!entradaInventario || entradaInventario.quantidade < order.quantidade_exigida) {
    throw erroBalcao(400, `Você não possui ${order.quantidade_exigida}x ${item?.nome ?? "o item"} necessário(s).`);
  }

  const progresso = await obterOuCriarProgresso(idPersonagem, transaction);
  await progresso.reload({ transaction, lock: transaction.LOCK.UPDATE });

  const character = await Character.findByPk(idPersonagem, { transaction, lock: transaction.LOCK.UPDATE });
  if (!character) throw erroBalcao(404, "Personagem não encontrado.");

  // §7.1 — o multiplicador usado é o nível de Reputação IMEDIATAMENTE
  // ANTES desta entrega, antes dos +5 desta encomenda serem somados.
  const nivelAntesDaEntrega = resolverNivel(progresso.reputacao_encomendas);
  const valorBase = order.quantidade_exigida * order.valor_unitario_snapshot;
  const ouroEncomenda = Math.floor(valorBase * nivelAntesDaEntrega.multiplicador);

  await removeStack(idPersonagem, order.id_item, order.quantidade_exigida, transaction);
  concederOuro(character, ouroEncomenda);

  const reputacaoDaEncomenda = reputacaoPorEncomenda();
  order.concluida_em = new Date();
  order.ouro_pago = ouroEncomenda;
  order.reputacao_paga = reputacaoDaEncomenda;
  await order.save({ transaction });

  progresso.reputacao_encomendas += reputacaoDaEncomenda;
  // Caçadas §11.1 — total permanente, incrementado UMA vez por
  // encomenda individual concluída; o bônus 5/5 nunca soma aqui.
  progresso.total_spoil_orders_completed += 1;

  const setBonus = await concederBonusDeLoteSeCompleto(ciclo, progresso, character, transaction);

  await progresso.save({ transaction });
  await character.save({ transaction });

  return {
    order: { id: order.id, completed: true },
    reward: { gold: ouroEncomenda, reputation: reputacaoDaEncomenda },
    setBonus,
    reputation: formatarResumoReputacao(progresso.reputacao_encomendas),
  };
}

module.exports = { entregarEncomenda };
