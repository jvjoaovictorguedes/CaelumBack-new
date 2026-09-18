// src/controllers/craftingController.js
const crypto = require("crypto");
const { sequelize } = require("../config/database");
const { Op } = require("sequelize");
const Character = require("../models/Character");
const Item = require("../models/Item");
const CharacterInventory = require("../models/CharacterInventory");
const {
  CATEGORIAS_CRAFTAVEIS,
  proximaRaridade,
  custoDaForja,
} = require("../services/craftingService");

// GET /api/crafting/options — status de cada combinação categoria+raridade
// que o personagem tem pelo menos 1 unidade, pra tela mostrar progresso
// (quantidade atual/necessária, custo, se já dá pra forjar) mesmo antes
// de o jogador ter itens suficientes. Sem include+lock (isso é leitura,
// não precisa) — só duas queries simples e um join em memória, pra não
// depender de nenhuma associação Sequelize já estar registrada.
exports.getOpcoesDeForja = async (req, res) => {
  try {
    const id_personagem = req.personagemAtual.id;

    const [inventario, itensCategoria] = await Promise.all([
      CharacterInventory.findAll({ where: { id_personagem } }),
      Item.findAll({
        where: { tipo_item: CATEGORIAS_CRAFTAVEIS },
        attributes: ["id", "tipo_item", "raridade"],
      }),
    ]);

    const infoPorItem = new Map(itensCategoria.map((item) => [item.id, item]));

    const somaPorChave = new Map();
    for (const entrada of inventario) {
      const info = infoPorItem.get(entrada.id_item);
      if (!info) continue;
      const chave = `${info.tipo_item}::${info.raridade}`;
      somaPorChave.set(chave, (somaPorChave.get(chave) ?? 0) + entrada.quantidade);
    }

    const raridadesDestinoNoCatalogo = new Set(
      itensCategoria.map((item) => `${item.tipo_item}::${item.raridade}`),
    );

    const opcoes = [];
    for (const [chave, quantidade] of somaPorChave) {
      const [tipo_item, raridade_origem] = chave.split("::");
      const raridade_destino = proximaRaridade(raridade_origem);
      const custo = custoDaForja(raridade_origem);
      if (!raridade_destino || !custo) continue;
      if (!raridadesDestinoNoCatalogo.has(`${tipo_item}::${raridade_destino}`)) continue;

      opcoes.push({
        tipo_item,
        raridade_origem,
        raridade_destino,
        quantidade_necessaria: custo.quantidade,
        quantidade_disponivel: quantidade,
        custo_ouro: custo.ouro,
        pode_craftar: quantidade >= custo.quantidade,
      });
    }

    res.status(200).json({ status: "success", data: { opcoes } });
  } catch (error) {
    console.error("Erro ao buscar opções de forja:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar opções de forja." });
  }
};

// POST /api/crafting/craft — body: { tipo_item, raridade }
// Funde `quantidade_necessaria` itens da categoria+raridade informada
// (misturando itens diferentes da mesma categoria+raridade, não precisa
// ser cópias do mesmo item) + ouro, em 1 item aleatório da mesma
// categoria na raridade seguinte.
exports.craftar = async (req, res) => {
  const id_personagem = req.personagemAtual.id;
  const { tipo_item, raridade } = req.body;

  if (!CATEGORIAS_CRAFTAVEIS.includes(tipo_item)) {
    return res.status(400).json({ message: "Categoria de item inválida pra forja." });
  }
  const raridadeDestino = proximaRaridade(raridade);
  const custo = custoDaForja(raridade);
  if (!raridadeDestino || !custo) {
    return res.status(400).json({ message: "Essa raridade não pode ser forjada." });
  }

  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const character = await Character.findByPk(id_personagem, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!character) {
        throw Object.assign(new Error("Personagem não encontrado."), { statusCode: 404 });
      }
      if (character.dinheiro < custo.ouro) {
        throw Object.assign(new Error("Ouro insuficiente pra essa forja."), { statusCode: 400 });
      }

      const itensDestino = await Item.findAll({
        where: { tipo_item, raridade: raridadeDestino },
        transaction,
      });
      if (itensDestino.length === 0) {
        throw Object.assign(
          new Error("Nenhum item de destino configurado pra essa forja ainda."),
          { statusCode: 400 },
        );
      }

      // IDs de origem buscados SEM lock (Items não muda) — só as linhas
      // de CharacterInventory do personagem que travam de verdade, sem
      // combinar lock com include (Sequelize não deixa: o JOIN vira LEFT
      // OUTER e o Postgres recusa FOR UPDATE nele — mesma restrição já
      // contornada em characterAbilitiesController/marketController).
      const itensOrigem = await Item.findAll({
        where: { tipo_item, raridade },
        attributes: ["id"],
        transaction,
      });
      const idsOrigem = itensOrigem.map((item) => item.id);

      const entradas = await CharacterInventory.findAll({
        where: { id_personagem, id_item: { [Op.in]: idsOrigem } },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      const totalDisponivel = entradas.reduce((soma, entrada) => soma + entrada.quantidade, 0);
      if (totalDisponivel < custo.quantidade) {
        throw Object.assign(
          new Error(
            `Você precisa de ${custo.quantidade}x itens ${raridade} (${tipo_item}) pra essa forja — tem ${totalDisponivel}.`,
          ),
          { statusCode: 400 },
        );
      }

      let restante = custo.quantidade;
      for (const entrada of entradas) {
        if (restante <= 0) break;
        const consumir = Math.min(entrada.quantidade, restante);
        entrada.quantidade -= consumir;
        restante -= consumir;
        if (entrada.quantidade > 0) {
          await entrada.save({ transaction });
        } else {
          await entrada.destroy({ transaction });
        }
      }

      character.dinheiro -= custo.ouro;
      await character.save({ transaction });

      // crypto.randomInt (não Math.random) — mesmo critério já usado no
      // drop de combate e no sorteio de raça/classe rara: é "vale a pena
      // tentar prever/manipular".
      const itemGanho = itensDestino[crypto.randomInt(0, itensDestino.length)];

      const entradaGanha = await CharacterInventory.findOne({
        where: { id_personagem, id_item: itemGanho.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (entradaGanha) {
        entradaGanha.quantidade += 1;
        await entradaGanha.save({ transaction });
      } else {
        await CharacterInventory.create(
          { id_personagem, id_item: itemGanho.id, quantidade: 1 },
          { transaction },
        );
      }

      return { character, itemGanho };
    });

    res.status(200).json({
      status: "success",
      message: `Forja concluída! Você recebeu ${resultado.itemGanho.nome}.`,
      data: {
        item_ganho: {
          id: resultado.itemGanho.id,
          nome: resultado.itemGanho.nome,
          raridade: resultado.itemGanho.raridade,
        },
        dinheiro: resultado.character.dinheiro,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao forjar item:", error);
    res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao forjar item." });
  }
};
