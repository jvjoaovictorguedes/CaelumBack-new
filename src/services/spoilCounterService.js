// Balcão de Espólios §4/§9.2 — venda permanente de espólios por preço
// fixo (Item.valor_venda), reserva ("Manter X unidades"), proteção
// contra venda acidental e histórico com snapshot de preço. Toda a
// conta acontece aqui, nunca confiando em nada que o cliente mande
// além de itemId/quantidade (§2 "Cálculos econômicos").
const Character = require("../models/Character");
const CharacterInventory = require("../models/CharacterInventory");
const CharacterSpoilPreference = require("../models/CharacterSpoilPreference");
const CharacterSpoilSale = require("../models/CharacterSpoilSale");
const CharacterSpoilSaleItem = require("../models/CharacterSpoilSaleItem");
const Item = require("../models/Item");
const { removeStack } = require("./inventoryService");
const { concederOuro } = require("./goldService");

function erroBalcao(statusCode, mensagem) {
  return Object.assign(new Error(mensagem), { statusCode });
}

// §4/§11.2 — devolve todo espólio no inventário do personagem (mesmo
// que já protegido/reservado — o front precisa mostrar isso) com preço,
// quantidade vendável e preferências. Itens com valor_venda <= 0 não
// aparecem: nunca são vendáveis (§4.1/§14).
async function listarEspolios(idPersonagem, transaction) {
  const entradas = await CharacterInventory.findAll({
    where: { id_personagem: idPersonagem },
    include: [{ model: Item, as: "itemEspolio", required: true, where: { tipo_item: "Espolio" } }],
    transaction,
  });

  const preferencias = await CharacterSpoilPreference.findAll({
    where: { id_personagem: idPersonagem },
    transaction,
  });
  const preferenciaPorItem = new Map(preferencias.map((p) => [p.id_item, p]));

  return entradas
    .filter((entrada) => entrada.itemEspolio.valor_venda > 0)
    .map((entrada) => {
      const preferencia = preferenciaPorItem.get(entrada.id_item);
      const quantidadeReservada = preferencia?.quantidade_reservada ?? 0;
      const protegido = preferencia?.protegido_venda ?? false;
      const quantidadeVendavel = protegido ? 0 : Math.max(0, entrada.quantidade - quantidadeReservada);
      return {
        item: {
          id: entrada.itemEspolio.id,
          nome: entrada.itemEspolio.nome,
          raridade: entrada.itemEspolio.raridade,
          imagem_url: entrada.itemEspolio.imagem_url,
          valor_venda: entrada.itemEspolio.valor_venda,
        },
        quantidade_inventario: entrada.quantidade,
        quantidade_reservada: quantidadeReservada,
        protegido_venda: protegido,
        quantidade_vendavel: quantidadeVendavel,
      };
    });
}

// §4.3/§4.4 — PATCH /spoils/:itemId/preferences. Upsert simples: cria a
// linha na primeira vez que o jogador mexe na preferência de um item.
async function atualizarPreferencia(idPersonagem, idItem, { protegidoVenda, quantidadeReservada }, transaction) {
  if (quantidadeReservada != null && quantidadeReservada < 0) {
    throw erroBalcao(400, "Quantidade reservada não pode ser negativa.");
  }

  const [preferencia] = await CharacterSpoilPreference.findOrCreate({
    where: { id_personagem: idPersonagem, id_item: idItem },
    defaults: { protegido_venda: false, quantidade_reservada: 0 },
    transaction,
  });
  await preferencia.reload({ transaction, lock: transaction.LOCK.UPDATE });

  if (protegidoVenda != null) preferencia.protegido_venda = Boolean(protegidoVenda);
  if (quantidadeReservada != null) preferencia.quantidade_reservada = quantidadeReservada;
  await preferencia.save({ transaction });

  return preferencia;
}

// §4.5/§4.6/§9.2/§9.4 — venda atômica de uma ou várias linhas. Duas
// fases: 1) valida TODAS as linhas sem mutar nada (se uma falhar, a
// venda inteira falha, §4.5); 2) só então remove os stacks e credita o
// ouro. `idempotencyKey` repetida com o MESMO conjunto de linhas
// devolve o resultado já processado (replay seguro de retry/duplo
// clique); repetida com linhas diferentes é 409 (§9.4/§14).
async function venderEspolios(idPersonagem, linhasPedido, idempotencyKey, transaction) {
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    throw erroBalcao(400, "idempotencyKey é obrigatória.");
  }
  if (!Array.isArray(linhasPedido) || linhasPedido.length === 0) {
    throw erroBalcao(400, "Informe ao menos um espólio para vender.");
  }

  const vendaExistente = await CharacterSpoilSale.findOne({
    where: { id_personagem: idPersonagem, idempotency_key: idempotencyKey },
    transaction,
  });
  if (vendaExistente) {
    const linhasExistentes = await CharacterSpoilSaleItem.findAll({
      where: { id_sale: vendaExistente.id },
      include: [{ model: Item, as: "item" }],
      transaction,
    });
    const assinaturaExistente = new Map(linhasExistentes.map((l) => [l.id_item, l.quantidade]));
    const assinaturaPedido = new Map(linhasPedido.map((l) => [l.itemId, l.quantidade]));
    const mesmoConjunto =
      assinaturaExistente.size === assinaturaPedido.size &&
      [...assinaturaExistente.entries()].every(([id, qtd]) => assinaturaPedido.get(id) === qtd);
    if (!mesmoConjunto) {
      throw erroBalcao(409, "idempotencyKey já usada com uma venda diferente.");
    }
    return { totalOuro: vendaExistente.total_ouro, linhas: linhasExistentes, repetida: true };
  }

  const idsRepetidos = new Set();
  for (const linha of linhasPedido) {
    if (idsRepetidos.has(linha.itemId)) {
      throw erroBalcao(400, "Item duplicado na mesma venda.");
    }
    idsRepetidos.add(linha.itemId);
  }

  // Fase 1 — valida tudo primeiro (lock nas linhas de inventário
  // envolvidas evita duas vendas concorrentes do mesmo stack, §4.5).
  const linhasValidadas = [];
  for (const { itemId, quantidade } of linhasPedido) {
    if (!(quantidade > 0)) {
      throw erroBalcao(400, "Quantidade deve ser maior que zero.");
    }

    const item = await Item.findByPk(itemId, { transaction });
    if (!item || item.tipo_item !== "Espolio" || !(item.valor_venda > 0)) {
      throw erroBalcao(400, `Item ${itemId} não é vendável no Balcão.`);
    }

    const entradaInventario = await CharacterInventory.findOne({
      where: { id_personagem: idPersonagem, id_item: itemId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!entradaInventario) {
      throw erroBalcao(400, `Você não possui ${item.nome}.`);
    }

    const preferencia = await CharacterSpoilPreference.findOne({
      where: { id_personagem: idPersonagem, id_item: itemId },
      transaction,
    });
    if (preferencia?.protegido_venda) {
      throw erroBalcao(400, `${item.nome} está protegido contra venda.`);
    }

    const quantidadeReservada = preferencia?.quantidade_reservada ?? 0;
    const quantidadeVendavel = Math.max(0, entradaInventario.quantidade - quantidadeReservada);
    if (quantidade > quantidadeVendavel) {
      throw erroBalcao(400, `Quantidade indisponível de ${item.nome} (vendável: ${quantidadeVendavel}).`);
    }

    const valorUnitario = item.valor_venda;
    linhasValidadas.push({
      idItem: item.id,
      nome: item.nome,
      quantidade,
      valorUnitario,
      totalLinha: valorUnitario * quantidade,
    });
  }

  // Fase 2 — aplica de verdade.
  let totalVenda = 0;
  for (const linha of linhasValidadas) {
    await removeStack(idPersonagem, linha.idItem, linha.quantidade, transaction);
    totalVenda += linha.totalLinha;
  }

  const character = await Character.findByPk(idPersonagem, { transaction, lock: transaction.LOCK.UPDATE });
  if (!character) throw erroBalcao(404, "Personagem não encontrado.");
  concederOuro(character, totalVenda);
  await character.save({ transaction });

  const venda = await CharacterSpoilSale.create(
    { id_personagem: idPersonagem, total_ouro: totalVenda, idempotency_key: idempotencyKey },
    { transaction },
  );
  const linhasPersistidas = await CharacterSpoilSaleItem.bulkCreate(
    linhasValidadas.map((linha) => ({
      id_sale: venda.id,
      id_item: linha.idItem,
      quantidade: linha.quantidade,
      valor_unitario_snapshot: linha.valorUnitario,
      total_linha: linha.totalLinha,
    })),
    { transaction, returning: true },
  );

  // bulkCreate não carrega a associação `item` — devolve os nomes já
  // validados em memória em vez de forçar mais uma query (a resposta
  // imediata da venda não precisa reconsultar o banco pro que acabou de
  // ser escrito por ele mesmo).
  const linhasComNome = linhasPersistidas.map((linha, indice) => ({
    ...linha.toJSON(),
    nome: linhasValidadas[indice]?.nome ?? null,
  }));

  return { totalOuro: totalVenda, linhas: linhasComNome, repetida: false };
}

// §4.6/§10 — GET /spoils/sales, histórico paginado.
async function listarHistoricoDeVendas(idPersonagem, { pagina = 1, porPagina = 20 } = {}, transaction) {
  const limite = Math.min(50, Math.max(1, porPagina));
  const offset = (Math.max(1, pagina) - 1) * limite;

  const { rows, count } = await CharacterSpoilSale.findAndCountAll({
    where: { id_personagem: idPersonagem },
    include: [{ model: CharacterSpoilSaleItem, as: "linhas", include: [{ model: Item, as: "item" }] }],
    order: [["createdAt", "DESC"]],
    limit: limite,
    offset,
    transaction,
  });

  return { vendas: rows, total: count, pagina, porPagina: limite };
}

module.exports = { listarEspolios, atualizarPreferencia, venderEspolios, listarHistoricoDeVendas };
