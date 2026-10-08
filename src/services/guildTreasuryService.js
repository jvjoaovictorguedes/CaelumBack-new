// Tesouro da Guilda V2 (spec "Tesouro da Guilda V2 + Contribuição V2")
// — Armazém de itens compartilhado da guilda, separado do Tesouro de
// ouro já existente (Guild.tesouro/GuildTreasuryTransaction, nunca
// tocados por este arquivo). Reaproveita inventoryService (stacks) e
// equipmentInstanceService (instâncias) como fonte única de
// posse/quantidade — nunca duplica essas regras aqui.
//
// Toda mutação (depositar/retirar, stackável ou instância) trava a
// linha da Guild PRIMEIRO (FOR UPDATE) antes de contar slots — é isso
// que serializa duas requisições concorrentes da MESMA guilda e evita
// ultrapassar a capacidade (spec §4.1: "a validação de slot deve
// acontecer dentro da mesma transaction do depósito, sob lock
// apropriado").
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Guild = require("../models/Guild");
const GuildMember = require("../models/GuildMember");
const Character = require("../models/Character");
const Item = require("../models/Item");
const GuildTreasuryStack = require("../models/GuildTreasuryStack");
const GuildTreasuryEquipmentInstance = require("../models/GuildTreasuryEquipmentInstance");
const GuildTreasuryItemTransaction = require("../models/GuildTreasuryItemTransaction");
const { addStack, removeStack } = require("./inventoryService");
const equipmentInstanceService = require("./equipmentInstanceService");
const { temPermissao } = require("./guildPermissionService");
const { capacidadeTesouroEfetiva } = require("../config/guildConfig");
const { emitParaGuild } = require("../socket/guildSocket");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

// §7 — "criar uma única função/política central... reutilizada pelo
// service e pelo Admin. Não espalhar checks de tipo pelo controller."
// QuestItem/Currencia bloqueados por padrão; o resto (empilhável ou
// instanciável) é permitido.
const TIPOS_BLOQUEADOS = new Set(["QuestItem", "Currencia"]);

function podeDepositarNoTesouro(item) {
  return !TIPOS_BLOQUEADOS.has(item.tipo_item);
}

async function carregarMembro(idGuild, idPersonagem, transaction) {
  const membro = await GuildMember.findOne({ where: { id_personagem: idPersonagem }, transaction });
  if (!membro || membro.id_guild !== Number(idGuild)) throw erro("Você não pertence a essa guilda.", 403);
  return membro;
}

async function contarSlotsUsados(idGuild, transaction) {
  const [stacks, instancias] = await Promise.all([
    GuildTreasuryStack.count({ where: { id_guild: idGuild }, transaction }),
    GuildTreasuryEquipmentInstance.count({ where: { id_guild: idGuild }, transaction }),
  ]);
  return stacks + instancias;
}

function garantirSlotLivre(slotsUsados, capacidade) {
  if (slotsUsados >= capacidade) {
    throw erro(`O Tesouro está cheio (${slotsUsados}/${capacidade} slots).`, 409);
  }
}

// ---------------------------------------------------------------------
// Depósito/retirada de stack (spec §9.1/§9.2)
// ---------------------------------------------------------------------

async function depositarItemStackavel(idGuild, idPersonagem, idItem, quantidade) {
  if (!(Number.isInteger(quantidade) && quantidade > 0)) throw erro("Quantidade inválida.", 400);

  const resultado = await sequelize.transaction(async (transaction) => {
    const guild = await Guild.findByPk(idGuild, { transaction, lock: transaction.LOCK.UPDATE });
    if (!guild) throw erro("Guilda não encontrada.", 404);
    await carregarMembro(idGuild, idPersonagem, transaction);

    const item = await Item.findByPk(idItem, { transaction });
    if (!item) throw erro("Item não encontrado.", 404);
    if (!podeDepositarNoTesouro(item)) {
      throw erro(`Itens do tipo "${item.tipo_item}" não podem ser depositados no Tesouro.`, 400);
    }
    if (equipmentInstanceService.ehInstanciavel(item.tipo_item)) {
      throw erro("Esse item é um equipamento — use o depósito de equipamento.", 400);
    }

    let estoque = await GuildTreasuryStack.findOne({
      where: { id_guild: idGuild, id_item: idItem },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!estoque) {
      const slotsUsados = await contarSlotsUsados(idGuild, transaction);
      garantirSlotLivre(slotsUsados, capacidadeTesouroEfetiva(guild.nivel));
    }

    // Trava/confirma posse e desconta do personagem ANTES de creditar o
    // Tesouro — mesma ordem de qualquer transferência no projeto
    // (nunca credita o destino antes de confirmar a origem).
    await removeStack(idPersonagem, idItem, quantidade, transaction);

    if (estoque) {
      estoque.quantidade += quantidade;
      await estoque.save({ transaction });
    } else {
      estoque = await GuildTreasuryStack.create({ id_guild: idGuild, id_item: idItem, quantidade }, { transaction });
    }

    await GuildTreasuryItemTransaction.create(
      {
        id_guild: idGuild,
        id_personagem: idPersonagem,
        operation: "DEPOSITO",
        id_item: idItem,
        quantidade,
        item_nome_snapshot: item.nome,
        raridade_snapshot: item.raridade ?? null,
      },
      { transaction },
    );

    const { registrarLog } = require("../controllers/guildController");
    await registrarLog(idGuild, "tesouro_item_deposito", {
      responsavel: idPersonagem,
      detalhes: `${quantidade}x ${item.nome}`,
      transaction,
    });

    return { id_item: idItem, nome: item.nome, imagem_url: item.imagem_url, quantidade_movimentada: quantidade, quantidade_total: estoque.quantidade };
  });

  await emitirAtualizacao(idGuild, "DEPOSITO", resultado);
  return resultado;
}

async function retirarItemStackavel(idGuild, idPersonagem, idItem, quantidade) {
  if (!(Number.isInteger(quantidade) && quantidade > 0)) throw erro("Quantidade inválida.", 400);

  const resultado = await sequelize.transaction(async (transaction) => {
    const guild = await Guild.findByPk(idGuild, { transaction, lock: transaction.LOCK.UPDATE });
    if (!guild) throw erro("Guilda não encontrada.", 404);
    const membro = await carregarMembro(idGuild, idPersonagem, transaction);
    const autorizado = await temPermissao(idGuild, membro.cargo, "retirar_itens_tesouro");
    if (!autorizado) throw erro("Você não tem permissão para retirar itens do Tesouro.", 403);

    const estoque = await GuildTreasuryStack.findOne({
      where: { id_guild: idGuild, id_item: idItem },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!estoque || estoque.quantidade < quantidade) {
      throw erro("Quantidade insuficiente no Tesouro.", 400);
    }

    const item = await Item.findByPk(idItem, { transaction });

    estoque.quantidade -= quantidade;
    if (estoque.quantidade <= 0) {
      await estoque.destroy({ transaction });
    } else {
      await estoque.save({ transaction });
    }

    await addStack(idPersonagem, idItem, quantidade, transaction);

    await GuildTreasuryItemTransaction.create(
      {
        id_guild: idGuild,
        id_personagem: idPersonagem,
        operation: "RETIRADA",
        id_item: idItem,
        quantidade,
        item_nome_snapshot: item.nome,
        raridade_snapshot: item.raridade ?? null,
      },
      { transaction },
    );

    const { registrarLog } = require("../controllers/guildController");
    await registrarLog(idGuild, "tesouro_item_retirada", {
      responsavel: idPersonagem,
      detalhes: `${quantidade}x ${item.nome}`,
      transaction,
    });

    return { id_item: idItem, nome: item.nome, imagem_url: item.imagem_url, quantidade_movimentada: quantidade };
  });

  await emitirAtualizacao(idGuild, "RETIRADA", resultado);
  return resultado;
}

// ---------------------------------------------------------------------
// Depósito/retirada de equipamento/ferramenta (spec §9.3/§9.4)
// ---------------------------------------------------------------------

async function depositarEquipamento(idGuild, idPersonagem, idInstancia) {
  const resultado = await sequelize.transaction(async (transaction) => {
    const guild = await Guild.findByPk(idGuild, { transaction, lock: transaction.LOCK.UPDATE });
    if (!guild) throw erro("Guilda não encontrada.", 404);
    await carregarMembro(idGuild, idPersonagem, transaction);

    // Reaproveita TODA a validação de posse/estado/loadout já existente
    // (equipmentInstanceService.transferDireto usa a mesma) — spec §9.3:
    // "não duplicar validações de estado nos controllers".
    const instancia = await equipmentInstanceService.validarInstanciaTransferivel(idPersonagem, idInstancia, transaction);

    const item = await Item.findByPk(instancia.id_item, { transaction });
    if (!podeDepositarNoTesouro(item)) {
      throw erro(`Itens do tipo "${item.tipo_item}" não podem ser depositados no Tesouro.`, 400);
    }

    const slotsUsados = await contarSlotsUsados(idGuild, transaction);
    garantirSlotLivre(slotsUsados, capacidadeTesouroEfetiva(guild.nivel));

    const { id_item: idItem, raridade, refinamento } = instancia;
    await instancia.destroy({ transaction });

    const registro = await GuildTreasuryEquipmentInstance.create(
      { id_guild: idGuild, id_item: idItem, raridade, refinamento, depositado_por: idPersonagem },
      { transaction },
    );

    await GuildTreasuryItemTransaction.create(
      {
        id_guild: idGuild,
        id_personagem: idPersonagem,
        operation: "DEPOSITO",
        id_item: idItem,
        id_treasury_equipment_instance: registro.id,
        item_nome_snapshot: item.nome,
        raridade_snapshot: raridade,
        refinamento_snapshot: refinamento,
      },
      { transaction },
    );

    const { registrarLog } = require("../controllers/guildController");
    await registrarLog(idGuild, "tesouro_item_deposito", {
      responsavel: idPersonagem,
      detalhes: `${item.nome}${refinamento ? ` +${refinamento}` : ""}`,
      transaction,
    });

    return { id: registro.id, id_item: idItem, nome: item.nome, imagem_url: item.imagem_url, raridade, refinamento };
  });

  await emitirAtualizacao(idGuild, "DEPOSITO", resultado);
  return resultado;
}

async function retirarEquipamento(idGuild, idPersonagem, idInstanciaTesouro) {
  const resultado = await sequelize.transaction(async (transaction) => {
    const guild = await Guild.findByPk(idGuild, { transaction, lock: transaction.LOCK.UPDATE });
    if (!guild) throw erro("Guilda não encontrada.", 404);
    const membro = await carregarMembro(idGuild, idPersonagem, transaction);
    const autorizado = await temPermissao(idGuild, membro.cargo, "retirar_itens_tesouro");
    if (!autorizado) throw erro("Você não tem permissão para retirar itens do Tesouro.", 403);

    const registro = await GuildTreasuryEquipmentInstance.findOne({
      where: { id: idInstanciaTesouro, id_guild: idGuild },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!registro) throw erro("Esse equipamento não está no Tesouro.", 404);

    const item = await Item.findByPk(registro.id_item, { transaction });

    // Nunca duas cópias físicas do mesmo item — a instância nova só
    // nasce depois de confirmar o registro do Tesouro, e o registro só
    // é destruído depois dela já existir, tudo na mesma transaction.
    // raridade nula (legado pré-Backfill) tratada como Comum — mesmo
    // critério de formatarInstancia (equipmentInstanceService.js).
    const novaInstancia = await equipmentInstanceService.create(
      { idPersonagem, idItem: registro.id_item, raridade: registro.raridade ?? "Comum", refinamento: registro.refinamento },
      transaction,
    );

    await GuildTreasuryItemTransaction.create(
      {
        id_guild: idGuild,
        id_personagem: idPersonagem,
        operation: "RETIRADA",
        id_item: registro.id_item,
        id_treasury_equipment_instance: registro.id,
        item_nome_snapshot: item.nome,
        raridade_snapshot: registro.raridade,
        refinamento_snapshot: registro.refinamento,
      },
      { transaction },
    );

    const { registrarLog } = require("../controllers/guildController");
    await registrarLog(idGuild, "tesouro_item_retirada", {
      responsavel: idPersonagem,
      detalhes: `${item.nome}${registro.refinamento ? ` +${registro.refinamento}` : ""}`,
      transaction,
    });

    await registro.destroy({ transaction });

    return {
      id_instancia: novaInstancia.id,
      id_item: registro.id_item,
      nome: item.nome,
      imagem_url: item.imagem_url,
      raridade: registro.raridade,
      refinamento: registro.refinamento,
    };
  });

  await emitirAtualizacao(idGuild, "RETIRADA", resultado);
  return resultado;
}

// ---------------------------------------------------------------------
// Leitura — resumo do Armazém + histórico (spec §12)
// ---------------------------------------------------------------------

async function resumoArmazem(idGuild, idPersonagem) {
  const guild = await Guild.findByPk(idGuild);
  if (!guild) throw erro("Guilda não encontrada.", 404);
  const membro = await GuildMember.findOne({ where: { id_personagem: idPersonagem } });
  if (!membro || membro.id_guild !== Number(idGuild)) throw erro("Você não pertence a essa guilda.", 403);

  const [estoque, equipamentos, podeRetirar] = await Promise.all([
    GuildTreasuryStack.findAll({ where: { id_guild: idGuild }, include: [{ model: Item, as: "item" }] }),
    GuildTreasuryEquipmentInstance.findAll({
      where: { id_guild: idGuild },
      include: [
        { model: Item, as: "item" },
        { model: Character, as: "depositante", attributes: ["id", "nome"] },
      ],
    }),
    temPermissao(idGuild, membro.cargo, "retirar_itens_tesouro"),
  ]);

  const capacidade = capacidadeTesouroEfetiva(guild.nivel);
  const slotsUsados = estoque.length + equipamentos.length;

  return {
    capacidade,
    slots_usados: slotsUsados,
    pode_depositar: true,
    pode_retirar: podeRetirar,
    estoque: estoque.map((linha) => ({
      id_item: linha.id_item,
      nome: linha.item?.nome,
      imagem_url: linha.item?.imagem_url,
      tipo_item: linha.item?.tipo_item,
      raridade: linha.item?.raridade,
      quantidade: linha.quantidade,
    })),
    equipamentos: equipamentos.map((instancia) => ({
      id: instancia.id,
      id_item: instancia.id_item,
      nome: instancia.item?.nome,
      imagem_url: instancia.item?.imagem_url,
      raridade: instancia.raridade,
      refinamento: instancia.refinamento,
      depositado_por: instancia.depositante?.nome ?? null,
      depositado_em: instancia.depositado_em,
    })),
  };
}

async function historicoMovimentacoes(idGuild, { operation, idPersonagem, idItem, page = 1, limit = 30 } = {}) {
  const where = { id_guild: idGuild };
  if (operation) where.operation = operation;
  if (idPersonagem) where.id_personagem = idPersonagem;
  if (idItem) where.id_item = idItem;

  const limiteSeguro = Math.min(Math.max(1, Number(limit) || 30), 100);
  const paginaSegura = Math.max(1, Number(page) || 1);

  const { rows, count } = await GuildTreasuryItemTransaction.findAndCountAll({
    where,
    include: [{ model: Character, attributes: ["id", "nome"] }],
    order: [["createdAt", "DESC"]],
    limit: limiteSeguro,
    offset: (paginaSegura - 1) * limiteSeguro,
  });

  return {
    total: count,
    pagina: paginaSegura,
    por_pagina: limiteSeguro,
    movimentacoes: rows.map((linha) => ({
      id: linha.id,
      operation: linha.operation,
      personagem: linha.Character ? { id: linha.Character.id, nome: linha.Character.nome } : null,
      id_item: linha.id_item,
      nome_item: linha.item_nome_snapshot,
      raridade: linha.raridade_snapshot,
      refinamento: linha.refinamento_snapshot,
      quantidade: linha.quantidade,
      createdAt: linha.createdAt,
    })),
  };
}

// §10 — "bloquear dissolução da Guilda enquanto houver... itens no
// Armazém... Na V1 recomendada: se houver qualquer item, a dissolução
// retorna 409". Usado por guildController.dissolver.
async function possuiItensNoTesouro(idGuild, transaction) {
  const [stacks, instancias] = await Promise.all([
    GuildTreasuryStack.count({ where: { id_guild: idGuild }, transaction }),
    GuildTreasuryEquipmentInstance.count({ where: { id_guild: idGuild }, transaction }),
  ]);
  return stacks + instancias > 0;
}

// §21 — "emitir um evento compacto... Não criar GuildTreasurySocket
// separado." Busca slots/capacidade atuais pra mandar junto (frontend
// não precisa refazer outra request só pra atualizar o contador).
async function emitirAtualizacao(idGuild, operation, item) {
  const guild = await Guild.findByPk(idGuild, { attributes: ["id", "nivel"] });
  if (!guild) return;
  const slotsUsados = await contarSlotsUsados(idGuild);
  emitParaGuild(idGuild, "guild:treasury:update", {
    operation,
    item,
    slots_usados: slotsUsados,
    capacidade: capacidadeTesouroEfetiva(guild.nivel),
  });
}

module.exports = {
  podeDepositarNoTesouro,
  depositarItemStackavel,
  retirarItemStackavel,
  depositarEquipamento,
  retirarEquipamento,
  resumoArmazem,
  historicoMovimentacoes,
  possuiItensNoTesouro,
};
