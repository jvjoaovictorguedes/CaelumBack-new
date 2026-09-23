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
const { REFINEMENT_COST_TIER_MULTIPLIER } = require("../config/equipmentTierConfig");
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

  // nome/imagem do material — sem isso a prévia só tinha o id_item cru,
  // e o frontend nunca conseguia mostrar PRA QUEM refina o que
  // efetivamente precisa ter em mãos (só o custo em ouro aparecia).
  const materiais = [];
  if (base.barras > 0) {
    const recursoBarra = await recursoBarraRefinamento(transaction);
    const idItemBarra = recursoBarra
      ? await resolverIdItemDoInsumo({ tipo_insumo: "Barra", id_recurso: recursoBarra.id, qualidade: item.raridade }, transaction)
      : null;
    if (idItemBarra) {
      const itemBarra = await Item.findByPk(idItemBarra, { attributes: ["nome", "imagem_url"], transaction });
      materiais.push({
        id_item: idItemBarra,
        quantidade: base.barras * unidades,
        papel: "barras",
        nome: itemBarra?.nome ?? "Barra",
        imagem_url: itemBarra?.imagem_url ?? null,
      });
    }
  }
  if (base.troncos > 0) {
    const recursoTronco = await recursoTroncoRefinamento(transaction);
    const idItemTronco = recursoTronco
      ? await resolverIdItemDoInsumo({ tipo_insumo: "RecursoExpedicao", id_recurso: recursoTronco.id, qualidade: item.raridade }, transaction)
      : null;
    if (idItemTronco) {
      const itemTronco = await Item.findByPk(idItemTronco, { attributes: ["nome", "imagem_url"], transaction });
      materiais.push({
        id_item: idItemTronco,
        quantidade: base.troncos * unidades,
        papel: "troncos",
        nome: itemTronco?.nome ?? "Tronco",
        imagem_url: itemTronco?.imagem_url ?? null,
      });
    }
  }

  // Tier mais alto custa mais Ouro pra manter refinado (spec de Tier
  // §34) — não altera a chance-base de sucesso nem as quantidades de
  // material, só o custo em Ouro. item.tier_equipamento é null pra
  // itens sem Tier (não deveria acontecer com equipável, mas cai em 1x
  // por segurança em vez de quebrar a prévia).
  const multiplicadorTier = REFINEMENT_COST_TIER_MULTIPLIER[item.tier_equipamento] ?? 1;
  const ouro = Math.round((OURO_BASE_REFINAMENTO_POR_QUALIDADE[item.raridade] ?? 0) * unidades * multiplicadorTier);
  return { alvo, unidades, materiais, ouro, item };
}

// Confere um id_item_pergaminho contra ForgeScroll + inventário + nível
// de Forja — usado tanto na prévia (onde uma indisponibilidade só
// "desliga" o bônus, sem travar a prévia inteira) quanto reaproveitado
// como referência de validação em iniciarRefinamento (que aí sim
// BLOQUEIA a tentativa inteira se o pergaminho pedido não for válido —
// nunca inicia um refinamento fingindo que o bônus não foi pedido).
// Retorna { scroll, erro } — erro é a mensagem pronta pra mostrar ao
// jogador quando o pergaminho não pode ser aplicado.
async function validarPergaminho(characterId, idItemPergaminho, nivelForja, { transaction, lock } = {}) {
  const scroll = await ForgeScroll.findByPk(idItemPergaminho, {
    include: [{ model: Item, as: "item" }],
    transaction,
  });
  if (!scroll) return { scroll: null, erro: "Esse pergaminho não existe." };
  if (nivelForja < scroll.nivel_forja_minimo) {
    return { scroll, erro: `Exige nível ${scroll.nivel_forja_minimo} de Forja.` };
  }
  const entrada = await CharacterInventory.findOne({
    where: { id_personagem: characterId, id_item: idItemPergaminho },
    transaction,
    lock,
  });
  if (!entrada || entrada.quantidade < 1) {
    return { scroll, erro: "Você não possui esse pergaminho." };
  }
  return { scroll, erro: null, entrada };
}

// Catálogo dos pergaminhos (spec §7: "com quantidade e bônus visíveis",
// e desabilitar opção que não atende ao nível mínimo "mostrando o
// motivo") — pouquíssimas linhas (hoje só 3), então um findAll sem
// paginação é suficiente.
async function listarPergaminhosDisponiveis(characterId) {
  const progresso = await CharacterForgeProgress.findOne({ where: { id_personagem: characterId } });
  const nivelForja = nivelPorXpTotal(progresso?.experiencia ?? 0);

  const scrolls = await ForgeScroll.findAll({ include: [{ model: Item, as: "item" }] });
  const idsItens = scrolls.map((s) => s.id_item);
  const inventario = idsItens.length
    ? await CharacterInventory.findAll({ where: { id_personagem: characterId, id_item: idsItens } })
    : [];
  const quantidadePorItem = new Map(inventario.map((e) => [e.id_item, e.quantidade]));

  return scrolls.map((scroll) => ({
    id_item: scroll.id_item,
    nome: scroll.item.nome,
    bonus_percentual: scroll.bonus_percentual,
    nivel_forja_minimo: scroll.nivel_forja_minimo,
    quantidade_disponivel: quantidadePorItem.get(scroll.id_item) ?? 0,
    nivel_forja_suficiente: nivelForja >= scroll.nivel_forja_minimo,
  }));
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
      new Error("Esse equipamento está anunciado no Mercado Negro — cancele o anúncio antes de refinar."),
      { statusCode: 400 },
    );
  }
  if (instancia.refinamento >= NIVEL_MAXIMO) {
    throw Object.assign(new Error("Esse equipamento já está no refinamento máximo."), { statusCode: 400 });
  }

  const nivelForja = nivelPorXpTotal(progresso?.experiencia ?? 0);
  const info = await calcularMateriaisNecessarios(instancia, null);
  if (!info) throw Object.assign(new Error("Não foi possível calcular os materiais desse equipamento."), { statusCode: 500 });

  // Pergaminho pedido pra essa prévia — indisponibilidade (nível
  // insuficiente, sem estoque, item inválido) só DESLIGA o bônus e
  // avisa por que (pergaminho_erro); nunca derruba a prévia inteira —
  // é só uma simulação, o jogador ainda pode ver a chance sem
  // pergaminho e trocar a seleção.
  let bonusPergaminho = 0;
  let pergaminhoAplicado = null;
  let pergaminhoErro = null;
  if (id_item_pergaminho) {
    const { scroll, erro } = await validarPergaminho(characterId, id_item_pergaminho, nivelForja);
    if (erro) {
      pergaminhoErro = erro;
    } else {
      bonusPergaminho = scroll.bonus_percentual;
      pergaminhoAplicado = { id_item: scroll.id_item, nome: scroll.item.nome, bonus_percentual: scroll.bonus_percentual };
    }
  }

  const chancePpmSemPergaminho = chanceFinalRefinamentoPpm(info.alvo, nivelForja, 0);
  const chancePpm = chanceFinalRefinamentoPpm(info.alvo, nivelForja, bonusPergaminho);

  // Quanto o jogador já tem de cada material — pro frontend mostrar
  // "2/3" (igual já faz na tela de Fabricação) em vez de só o nome.
  const materiaisComEstoque = await Promise.all(
    info.materiais.map(async (material) => {
      const entrada = await CharacterInventory.findOne({
        where: { id_personagem: characterId, id_item: material.id_item },
      });
      return { ...material, quantidade_disponivel: entrada?.quantidade ?? 0 };
    }),
  );

  return {
    alvo: info.alvo,
    // "+10%" é ponto percentual, não multiplicativo — chance_percentual
    // já sai com o bônus somado direto (ver chanceFinalRefinamentoPpm),
    // e chance_percentual_sem_pergaminho dá o "antes" pro frontend
    // mostrar "45,0% → 55,0%" (spec §5.1) sem precisar de uma segunda
    // chamada.
    chance_percentual: chancePpm / 10_000,
    chance_percentual_sem_pergaminho: chancePpmSemPergaminho / 10_000,
    ouro_custo: info.ouro,
    materiais: materiaisComEstoque,
    pergaminho_aplicado: pergaminhoAplicado,
    pergaminho_erro: pergaminhoErro,
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
        new Error("Esse equipamento está anunciado no Mercado Negro — cancele o anúncio antes de refinar."),
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

    // Iniciar é quem MANDA de verdade — diferente da prévia (que só
    // desliga o bônus quando o pergaminho não é válido), aqui qualquer
    // problema (item errado, nível insuficiente, sem estoque) BLOQUEIA
    // a tentativa inteira. Nunca inicia um refinamento silenciosamente
    // ignorando um pergaminho pedido — se o jogador pediu, ou aplica ou
    // recusa a tentativa toda (spec §6.3: "não aceitar bônus arbitrário",
    // "garantir idempotência/concorrência").
    let entradaPergaminho = null;
    let bonusPergaminho = 0;
    let nomePergaminho = null;
    if (id_item_pergaminho) {
      const { scroll, erro, entrada } = await validarPergaminho(characterId, id_item_pergaminho, nivelForja, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (erro) throw Object.assign(new Error(erro), { statusCode: 400 });
      entradaPergaminho = entrada;
      bonusPergaminho = scroll.bonus_percentual;
      nomePergaminho = scroll.item.nome;
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
        // id/nome do pergaminho snapshotados aqui pra auditoria (spec
        // §6.2) — sobrevive mesmo se o Item do pergaminho for renomeado
        // depois, e não depende de re-consultar forge_scrolls só pra
        // saber o que foi usado nessa tentativa específica.
        referencia: {
          id_instancia,
          alvo: info.alvo,
          chance_final_ppm: chancePpm,
          id_item_pergaminho: id_item_pergaminho ?? null,
          nome_pergaminho: nomePergaminho,
        },
        payload_resultado: { sucesso, xp: xpGanho },
        iniciado_em: iniciadoEm,
        pronto_em: prontoEm,
      },
      { transaction },
    );

    return { pronto_em: prontoEm, chance_percentual: chancePpm / 10_000 };
  });
}

module.exports = {
  previaRefinamento,
  iniciarRefinamento,
  calcularMateriaisNecessarios,
  listarPergaminhosDisponiveis,
};
