// Refinamento +1 a +10 — resultado sorteado no momento de iniciar (spec
// §49), materiais/ouro/pergaminho consumidos IMEDIATAMENTE (mesmo em
// caso de falha futura, já que o resultado já está decidido), e o
// equipamento (instância) só é atualizado na coleta. Trava Character,
// EquipmentInstance, Inventory dos materiais, Pergaminho e Queue NESSA
// ORDEM (spec §55) pra nunca colidir com outro fluxo que trave na mesma
// sequência.
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const CharacterForgeProgress = require("../models/CharacterForgeProgress");
const CharacterForgeQueue = require("../models/CharacterForgeQueue");
const CharacterEquipmentInstance = require("../models/CharacterEquipmentInstance");
const CharacterInventory = require("../models/CharacterInventory");
const ForgeScroll = require("../models/ForgeScroll");
const Item = require("../models/Item");
const ExpeditionResource = require("../models/ExpeditionResource");
const {
  NIVEL_MAXIMO,
  UNIDADES_MATERIAL_REFINAMENTO_POR_ALVO,
  MATERIAIS_BASE_REFINAMENTO_POR_CATEGORIA,
  OURO_BASE_REFINAMENTO_POR_QUALIDADE,
  XP_REFINAMENTO_POR_ALVO,
  FATOR_XP_REFINAMENTO_FALHA,
  SLOTS_FORJA,
  TIPOS_ACAO_FORJA,
} = require("../config/forgeConfig");
const { resolverIdItemDoInsumo } = require("./forgeMaterialsService");
const { chanceFinalRefinamentoPpm, rolarSucessoRefinamento } = require("./forgeRollService");
const { nivelPorXpTotal } = require("./forgeProgressionService");

// Recurso genérico usado como "barra"/"tronco" de refinamento pra
// QUALQUER equipamento — nunca amarrado a uma receita de Fabricação
// existir pro item (bug real: só os ~190 itens forjados por minério
// tinham receita; TODO o resto do jogo — Loja, drop de monstro, itens
// nomeados/temáticos — não tinha NENHUMA, e o refinamento simplesmente
// não funcionava pra eles: a prévia estourava erro 500 e a tela ficava
// muda, sem nenhuma mensagem). O custo de refinar já depende só de
// CATEGORIA (MATERIAIS_BASE_REFINAMENTO_POR_CATEGORIA) e RARIDADE do
// item (OURO_BASE_REFINAMENTO_POR_QUALIDADE) — os dois já eram
// genéricos, só a resolução do ITEM CONCRETO de barra/tronco é que
// dependia indevidamente do blueprint. Ferro/Carvalho têm cobertura
// completa nas 6 qualidades (ForgeBarItem/ExpeditionResourceItem),
// então servem de material universal de refino.
let recursoBarraCache = null;
let recursoTroncoCache = null;

async function recursoBarraRefinamento(transaction) {
  if (!recursoBarraCache) {
    recursoBarraCache = await ExpeditionResource.findOne({ where: { nome: "Ferro", profissao: "Mineracao" }, transaction });
  }
  return recursoBarraCache;
}

async function recursoTroncoRefinamento(transaction) {
  if (!recursoTroncoCache) {
    recursoTroncoCache = await ExpeditionResource.findOne({ where: { nome: "Carvalho", profissao: "Silvicultura" }, transaction });
  }
  return recursoTroncoCache;
}

async function calcularMateriaisNecessarios(instancia, transaction) {
  const item = await Item.findByPk(instancia.id_item, { transaction });
  if (!item) return null;

  const alvo = instancia.refinamento + 1;
  const unidades = UNIDADES_MATERIAL_REFINAMENTO_POR_ALVO[alvo] ?? 1;
  const base = MATERIAIS_BASE_REFINAMENTO_POR_CATEGORIA[item.tipo_item] ?? { barras: 1, troncos: 0 };

  const materiais = [];
  if (base.barras > 0) {
    const recursoBarra = await recursoBarraRefinamento(transaction);
    const idItemBarra = recursoBarra
      ? await resolverIdItemDoInsumo({ tipo_insumo: "Barra", id_recurso: recursoBarra.id, qualidade: item.raridade }, transaction)
      : null;
    if (idItemBarra) materiais.push({ id_item: idItemBarra, quantidade: base.barras * unidades, papel: "barras" });
  }
  if (base.troncos > 0) {
    const recursoTronco = await recursoTroncoRefinamento(transaction);
    const idItemTronco = recursoTronco
      ? await resolverIdItemDoInsumo({ tipo_insumo: "RecursoExpedicao", id_recurso: recursoTronco.id, qualidade: item.raridade }, transaction)
      : null;
    if (idItemTronco) materiais.push({ id_item: idItemTronco, quantidade: base.troncos * unidades, papel: "troncos" });
  }

  const ouro = (OURO_BASE_REFINAMENTO_POR_QUALIDADE[item.raridade] ?? 0) * unidades;
  return { alvo, unidades, materiais, ouro, item };
}

// Prévia pra tela de Refinamento (spec §60) — nunca decide nada, só
// mostra o que a tentativa vai custar/valer.
async function previaRefinamento(characterId, { id_instancia, id_item_pergaminho }) {
  const [progresso, instancia] = await Promise.all([
    CharacterForgeProgress.findOne({ where: { id_personagem: characterId } }),
    CharacterEquipmentInstance.findOne({ where: { id: id_instancia, id_personagem: characterId } }),
  ]);
  if (!instancia) throw Object.assign(new Error("Equipamento não encontrado."), { statusCode: 404 });
  if (instancia.estado === "Mercado") {
    throw Object.assign(
      new Error("Esse equipamento está anunciado no Mercado — cancele o anúncio antes de refinar."),
      { statusCode: 400 },
    );
  }
  if (instancia.refinamento >= NIVEL_MAXIMO) {
    throw Object.assign(new Error("Esse equipamento já está no refinamento máximo."), { statusCode: 400 });
  }

  const nivelForja = nivelPorXpTotal(progresso?.experiencia ?? 0);
  const info = await calcularMateriaisNecessarios(instancia, null);
  if (!info) throw Object.assign(new Error("Não foi possível calcular os materiais desse equipamento."), { statusCode: 500 });

  let bonusPergaminho = 0;
  let pergaminhoNome = null;
  if (id_item_pergaminho) {
    const scroll = await ForgeScroll.findByPk(id_item_pergaminho, { include: [{ model: Item, as: "item" }] });
    if (scroll) {
      bonusPergaminho = scroll.bonus_percentual;
      pergaminhoNome = scroll.item.nome;
    }
  }

  const chancePpm = chanceFinalRefinamentoPpm(info.alvo, nivelForja, bonusPergaminho);

  return {
    alvo: info.alvo,
    chance_percentual: chancePpm / 10_000,
    ouro_custo: info.ouro,
    materiais: info.materiais,
    pergaminho_aplicado: pergaminhoNome,
  };
}

async function iniciarRefinamento(characterId, { id_instancia, id_item_pergaminho }) {
  return sequelize.transaction(async (transaction) => {
    const character = await Character.findByPk(characterId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!character) throw Object.assign(new Error("Personagem não encontrado."), { statusCode: 404 });

    const instancia = await CharacterEquipmentInstance.findOne({
      where: { id: id_instancia, id_personagem: characterId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!instancia) throw Object.assign(new Error("Equipamento não encontrado."), { statusCode: 404 });
    // Instância anunciada no Mercado não pode ser refinada enquanto
    // estiver à venda — sem essa checagem, o refinamento mudava as
    // propriedades efetivas de um item que um comprador já estava
    // vendo listado, e a spec do Mercado v2 exige exatamente o
    // contrário (equipamento anunciado é imutável até vender/cancelar).
    if (instancia.estado === "Mercado") {
      throw Object.assign(
        new Error("Esse equipamento está anunciado no Mercado — cancele o anúncio antes de refinar."),
        { statusCode: 400 },
      );
    }
    if (instancia.refinamento >= NIVEL_MAXIMO) {
      throw Object.assign(new Error("Esse equipamento já está no refinamento máximo."), { statusCode: 400 });
    }

    const filaExistente = await CharacterForgeQueue.findOne({
      where: { id_personagem: characterId, slot: SLOTS_FORJA.FORJA },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (filaExistente) {
      throw Object.assign(
        new Error("O slot de Forja já está ocupado — colete ou espere terminar antes de começar outro trabalho."),
        { statusCode: 400 },
      );
    }

    const progresso = await CharacterForgeProgress.findOne({
      where: { id_personagem: characterId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const nivelForja = nivelPorXpTotal(progresso?.experiencia ?? 0);

    const info = await calcularMateriaisNecessarios(instancia, transaction);
    if (!info) {
      throw Object.assign(new Error("Não foi possível calcular os materiais desse equipamento."), { statusCode: 500 });
    }

    if (character.dinheiro < info.ouro) {
      throw Object.assign(new Error("Ouro insuficiente pra esse refinamento."), { statusCode: 400 });
    }

    const entradasMateriais = [];
    for (const material of info.materiais) {
      const entrada = await CharacterInventory.findOne({
        where: { id_personagem: characterId, id_item: material.id_item },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!entrada || entrada.quantidade < material.quantidade) {
        throw Object.assign(new Error("Materiais insuficientes pra esse refinamento."), { statusCode: 400 });
      }
      entradasMateriais.push({ entrada, quantidade: material.quantidade });
    }

    let entradaPergaminho = null;
    let bonusPergaminho = 0;
    if (id_item_pergaminho) {
      const scroll = await ForgeScroll.findByPk(id_item_pergaminho, { transaction });
      if (!scroll) throw Object.assign(new Error("Pergaminho inválido."), { statusCode: 400 });
      if (nivelForja < scroll.nivel_forja_minimo) {
        throw Object.assign(new Error("Nível de Forja insuficiente pra esse pergaminho."), { statusCode: 400 });
      }
      entradaPergaminho = await CharacterInventory.findOne({
        where: { id_personagem: characterId, id_item: id_item_pergaminho },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!entradaPergaminho || entradaPergaminho.quantidade < 1) {
        throw Object.assign(new Error("Você não possui esse pergaminho."), { statusCode: 400 });
      }
      bonusPergaminho = scroll.bonus_percentual;
    }

    // Resultado sorteado JÁ AGORA — consumo de material/ouro/pergaminho
    // acontece de qualquer jeito, sucesso ou falha (spec §31/§40).
    const chancePpm = chanceFinalRefinamentoPpm(info.alvo, nivelForja, bonusPergaminho);
    const sucesso = rolarSucessoRefinamento(chancePpm);

    character.dinheiro -= info.ouro;
    await character.save({ transaction });

    for (const { entrada, quantidade } of entradasMateriais) {
      entrada.quantidade -= quantidade;
      if (entrada.quantidade <= 0) await entrada.destroy({ transaction });
      else await entrada.save({ transaction });
    }

    if (entradaPergaminho) {
      entradaPergaminho.quantidade -= 1;
      if (entradaPergaminho.quantidade <= 0) await entradaPergaminho.destroy({ transaction });
      else await entradaPergaminho.save({ transaction });
    }

    const xpSucesso = XP_REFINAMENTO_POR_ALVO[info.alvo] ?? 0;
    const xpGanho = sucesso ? xpSucesso : Math.round(xpSucesso * FATOR_XP_REFINAMENTO_FALHA);

    const iniciadoEm = new Date();
    const prontoEm = new Date(iniciadoEm.getTime() + 60_000); // tempo fixo curto — spec não define tempo de refino

    await CharacterForgeQueue.create(
      {
        id_personagem: characterId,
        slot: SLOTS_FORJA.FORJA,
        tipo_acao: TIPOS_ACAO_FORJA.REFINAMENTO,
        referencia: { id_instancia, alvo: info.alvo, chance_final_ppm: chancePpm },
        payload_resultado: { sucesso, xp: xpGanho },
        iniciado_em: iniciadoEm,
        pronto_em: prontoEm,
      },
      { transaction },
    );

    return { pronto_em: prontoEm, chance_percentual: chancePpm / 10_000 };
  });
}

module.exports = { previaRefinamento, iniciarRefinamento, calcularMateriaisNecessarios };
