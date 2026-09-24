// Balcão de Espólios §5 — ciclo de 5 encomendas por personagem, por
// janela de 4h. Mesmo padrão preguiçoso de adventureGuildRotationService
// (as ofertas de Rank): a primeira requisição de uma janela nova que não
// encontra o ciclo o gera; qualquer requisição concorrente na mesma
// janela só lê o que já existe (nunca sorteia duas vezes — a unique
// index em (id_personagem, janela_inicio)/(id_ciclo, ordem) é quem
// garante isso de verdade, não o código).
//
// DIFERENÇA importante pra adventureGuildRotationService: aqui o ciclo é
// POR PERSONAGEM (cada jogador tem suas próprias 5 encomendas), não
// global por Rank — por isso não tem "pool compartilhado entre todos".
const crypto = require("crypto");
const { Op } = require("sequelize");
const CharacterSpoilOrderCycle = require("../models/CharacterSpoilOrderCycle");
const CharacterSpoilOrder = require("../models/CharacterSpoilOrder");
const Item = require("../models/Item");
const AdventureMonsterLoot = require("../models/AdventureMonsterLoot");
const {
  SPOIL_ORDERS_PER_ROTATION,
  SPOIL_ORDER_ROTATION_MS,
  SPOIL_ORDER_QUANTITY_RANGES,
  inicioDaJanelaDeEncomendas,
} = require("../config/adventureGuildConfig");

function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// §5.3 — só espólios de verdade OBTENÍVEIS (tipo Espolio, com
// valor_venda > 0 e vinculados a pelo menos um AdventureMonsterLoot
// ativo) entram no pool; a Aventura não bloqueia zona por nível (§4 de
// AdventureZone — nivel_monstro_min/max é só recomendado), então "o
// estado atual de progressão" hoje equivale a "qualquer espólio
// realmente dropável no jogo", sem inventar um gate de nível que o
// próprio Modo Aventura não tem.
async function obterPoolDeEspoliosElegiveis(transaction) {
  const idsComLoot = await AdventureMonsterLoot.findAll({
    attributes: ["id_item"],
    where: { ativo: true },
    group: ["id_item"],
    transaction,
  });
  const idsElegiveis = idsComLoot.map((l) => l.id_item);
  if (idsElegiveis.length === 0) return [];

  return Item.findAll({
    where: {
      id: { [Op.in]: idsElegiveis },
      tipo_item: "Espolio",
      valor_venda: { [Op.gt]: 0 },
    },
    transaction,
  });
}

function sortearQuantidade(raridade) {
  const faixa = SPOIL_ORDER_QUANTITY_RANGES[raridade] ?? SPOIL_ORDER_QUANTITY_RANGES.Comum;
  const [min, max] = faixa;
  return min >= max ? min : crypto.randomInt(min, max + 1);
}

// §5.3/§14 — prefere 5 itens diferentes; com menos de 5 elegíveis,
// repete itens (nunca duplica exatamente item+quantidade: cada
// repetição sorteia sua própria quantidade, e evita repetir a mesma
// quantidade já usada por aquele item nesta leva).
function escolherCincoItens(pool) {
  const embaralhado = embaralhar(pool);
  const escolhidos = [];
  let indice = 0;
  while (escolhidos.length < SPOIL_ORDERS_PER_ROTATION) {
    const item = embaralhado[indice % embaralhado.length];
    indice += 1;
    escolhidos.push(item);
  }
  return escolhidos;
}

async function gerarEncomendas(ciclo, transaction) {
  const pool = await obterPoolDeEspoliosElegiveis(transaction);
  if (pool.length === 0) return;

  const itensEscolhidos = escolherCincoItens(pool);
  const quantidadesUsadasPorItem = new Map();
  const agora = new Date();

  const linhas = itensEscolhidos.map((item, indice) => {
    let quantidade = sortearQuantidade(item.raridade);
    const usadas = quantidadesUsadasPorItem.get(item.id) ?? new Set();
    // Evita repetir item+quantidade idêntico dentro da mesma leva (§14) —
    // tenta algumas vezes; se o range for tão estreito que esgote, aceita
    // a repetição mesmo assim (faixa mínima é [1,3], então pode acontecer).
    let tentativas = 0;
    while (usadas.has(quantidade) && tentativas < 5) {
      quantidade = sortearQuantidade(item.raridade);
      tentativas += 1;
    }
    usadas.add(quantidade);
    quantidadesUsadasPorItem.set(item.id, usadas);

    return {
      id_ciclo: ciclo.id,
      ordem: indice + 1,
      id_item: item.id,
      quantidade_exigida: quantidade,
      valor_unitario_snapshot: item.valor_venda,
      createdAt: agora,
      updatedAt: agora,
    };
  });

  try {
    await CharacterSpoilOrder.bulkCreate(linhas, { transaction, validate: true });
  } catch (erro) {
    if (erro.name !== "SequelizeUniqueConstraintError") throw erro;
  }
}

// Garante ciclo + 5 encomendas da janela ATUAL pro personagem, gerando
// se ainda não existir. janelaInicio/janelaFim vêm do relógio do
// SERVIDOR (nunca do cliente).
async function obterCicloAtual(idPersonagem, transaction) {
  const janelaInicio = inicioDaJanelaDeEncomendas();
  const janelaFim = new Date(janelaInicio.getTime() + SPOIL_ORDER_ROTATION_MS);

  const [ciclo] = await CharacterSpoilOrderCycle.findOrCreate({
    where: { id_personagem: idPersonagem, janela_inicio: janelaInicio },
    defaults: { janela_fim: janelaFim },
    transaction,
  });

  const buscarEncomendas = () =>
    CharacterSpoilOrder.findAll({
      where: { id_ciclo: ciclo.id },
      include: [{ model: Item, as: "item" }],
      order: [["ordem", "ASC"]],
      transaction,
    });

  let encomendas = await buscarEncomendas();
  if (encomendas.length === 0) {
    await gerarEncomendas(ciclo, transaction);
    encomendas = await buscarEncomendas();
  }

  return { ciclo, janelaInicio, janelaFim, encomendas };
}

module.exports = { obterCicloAtual, obterPoolDeEspoliosElegiveis };
