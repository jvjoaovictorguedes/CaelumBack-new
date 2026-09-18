// src/controllers/craftingController.js
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Item = require("../models/Item");
const CharacterInventory = require("../models/CharacterInventory");
const CraftingRecipe = require("../models/CraftingRecipe");
const CraftingRecipeIngredient = require("../models/CraftingRecipeIngredient");
const CharacterCraftingQueue = require("../models/CharacterCraftingQueue");
const { listarReceitasComItens } = require("../services/craftingService");

function formatarReceita(receita, quantidadesPorItem) {
  return {
    id: receita.id,
    tempo_segundos: receita.tempo_segundos,
    ouro_custo: receita.ouro_custo,
    item: {
      id: receita.item.id,
      nome: receita.item.nome,
      tipo_item: receita.item.tipo_item,
      raridade: receita.item.raridade,
      imagem_url: receita.item.imagem_url,
    },
    ingredientes: receita.ingredientes.map((ingrediente) => ({
      id_item: ingrediente.material.id,
      nome: ingrediente.material.nome,
      raridade: ingrediente.material.raridade,
      imagem_url: ingrediente.material.imagem_url,
      quantidade_necessaria: ingrediente.quantidade,
      quantidade_disponivel: quantidadesPorItem.get(ingrediente.material.id) ?? 0,
    })),
  };
}

// GET /api/crafting/recipes — todo o catálogo de receitas, já com
// quanto o personagem tem de cada material (pro front pintar de
// verde/vermelho sem N chamadas por item).
exports.getReceitas = async (req, res) => {
  try {
    const id_personagem = req.personagemAtual.id;

    const [receitas, inventario, filaAtiva] = await Promise.all([
      listarReceitasComItens(),
      CharacterInventory.findAll({ where: { id_personagem } }),
      CharacterCraftingQueue.findByPk(id_personagem),
    ]);

    const quantidadesPorItem = new Map();
    for (const entrada of inventario) {
      quantidadesPorItem.set(entrada.id_item, (quantidadesPorItem.get(entrada.id_item) ?? 0) + entrada.quantidade);
    }

    const character = await Character.findByPk(id_personagem, { attributes: ["dinheiro"] });

    const dados = receitas.map((receita) => {
      const formatada = formatarReceita(receita, quantidadesPorItem);
      const temMateriais = formatada.ingredientes.every(
        (ingrediente) => ingrediente.quantidade_disponivel >= ingrediente.quantidade_necessaria,
      );
      const temOuro = character.dinheiro >= receita.ouro_custo;
      return {
        ...formatada,
        pode_forjar: temMateriais && temOuro && !filaAtiva,
      };
    });

    res.status(200).json({
      status: "success",
      data: { receitas: dados, dinheiro: character.dinheiro, forja_ocupada: Boolean(filaAtiva) },
    });
  } catch (error) {
    console.error("Erro ao buscar receitas de forja:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar receitas de forja." });
  }
};

// GET /api/crafting/queue — forja em andamento (ou null), com quanto
// falta em segundos e se já pode coletar.
exports.getFila = async (req, res) => {
  try {
    const id_personagem = req.personagemAtual.id;
    const fila = await CharacterCraftingQueue.findByPk(id_personagem, {
      include: [{ model: CraftingRecipe, as: "receita", include: [{ model: Item, as: "item" }] }],
    });

    if (!fila) {
      return res.status(200).json({ status: "success", data: { fila: null } });
    }

    const agora = Date.now();
    const prontoEm = new Date(fila.pronto_em).getTime();
    const segundosRestantes = Math.max(0, Math.ceil((prontoEm - agora) / 1000));

    res.status(200).json({
      status: "success",
      data: {
        fila: {
          id_receita: fila.id_receita,
          item: {
            id: fila.receita.item.id,
            nome: fila.receita.item.nome,
            raridade: fila.receita.item.raridade,
            imagem_url: fila.receita.item.imagem_url,
          },
          iniciado_em: fila.iniciado_em,
          pronto_em: fila.pronto_em,
          segundos_restantes: segundosRestantes,
          pronto: segundosRestantes <= 0,
        },
      },
    });
  } catch (error) {
    console.error("Erro ao buscar fila de forja:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar fila de forja." });
  }
};

// POST /api/crafting/start — body: { id_receita }
exports.iniciarForja = async (req, res) => {
  const id_personagem = req.personagemAtual.id;
  const { id_receita } = req.body;

  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const filaExistente = await CharacterCraftingQueue.findByPk(id_personagem, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (filaExistente) {
        throw Object.assign(
          new Error("Você já tem uma forja em andamento — colete ou espere terminar antes de começar outra."),
          { statusCode: 400 },
        );
      }

      const receita = await CraftingRecipe.findByPk(id_receita, {
        include: [
          { model: Item, as: "item" },
          { model: CraftingRecipeIngredient, as: "ingredientes", include: [{ model: Item, as: "material" }] },
        ],
        transaction,
      });
      if (!receita) {
        throw Object.assign(new Error("Receita não encontrada."), { statusCode: 404 });
      }

      const character = await Character.findByPk(id_personagem, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (character.dinheiro < receita.ouro_custo) {
        throw Object.assign(new Error("Ouro insuficiente pra essa forja."), { statusCode: 400 });
      }

      const idsMateriais = receita.ingredientes.map((ingrediente) => ingrediente.id_item_material);
      const entradasInventario = await CharacterInventory.findAll({
        where: { id_personagem, id_item: { [Op.in]: idsMateriais } },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const entradaPorItem = new Map(entradasInventario.map((entrada) => [entrada.id_item, entrada]));

      for (const ingrediente of receita.ingredientes) {
        const disponivel = entradaPorItem.get(ingrediente.id_item_material)?.quantidade ?? 0;
        if (disponivel < ingrediente.quantidade) {
          throw Object.assign(
            new Error(
              `Falta material pra essa forja: precisa de ${ingrediente.quantidade}x ${ingrediente.material.nome}, tem ${disponivel}.`,
            ),
            { statusCode: 400 },
          );
        }
      }

      for (const ingrediente of receita.ingredientes) {
        const entrada = entradaPorItem.get(ingrediente.id_item_material);
        entrada.quantidade -= ingrediente.quantidade;
        if (entrada.quantidade > 0) {
          await entrada.save({ transaction });
        } else {
          await entrada.destroy({ transaction });
        }
      }

      character.dinheiro -= receita.ouro_custo;
      await character.save({ transaction });

      const iniciadoEm = new Date();
      const prontoEm = new Date(iniciadoEm.getTime() + receita.tempo_segundos * 1000);
      await CharacterCraftingQueue.create(
        { id_personagem, id_receita: receita.id, iniciado_em: iniciadoEm, pronto_em: prontoEm },
        { transaction },
      );

      return { receita, prontoEm, dinheiro: character.dinheiro };
    });

    res.status(200).json({
      status: "success",
      message: `Forja de ${resultado.receita.item.nome} iniciada! Fica pronta em ${resultado.receita.tempo_segundos / 60} minutos.`,
      data: { pronto_em: resultado.prontoEm, dinheiro: resultado.dinheiro },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao iniciar forja:", error);
    res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao iniciar forja." });
  }
};

// POST /api/crafting/collect
exports.coletarForja = async (req, res) => {
  const id_personagem = req.personagemAtual.id;

  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      // Sem lock+include combinados (Sequelize gera LEFT OUTER JOIN, e o
      // Postgres recusa FOR UPDATE nele) — mesma restrição já contornada
      // em CharacterEquipmentController/marketController. A receita e o
      // item não mudam durante a transação, não precisam de lock.
      const fila = await CharacterCraftingQueue.findByPk(id_personagem, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!fila) {
        throw Object.assign(new Error("Você não tem nenhuma forja em andamento."), { statusCode: 400 });
      }
      if (new Date(fila.pronto_em).getTime() > Date.now()) {
        throw Object.assign(new Error("Essa forja ainda não terminou."), { statusCode: 400 });
      }

      const receita = await CraftingRecipe.findByPk(fila.id_receita, {
        include: [{ model: Item, as: "item" }],
        transaction,
      });

      const idItem = receita.item.id;
      const entrada = await CharacterInventory.findOne({
        where: { id_personagem, id_item: idItem },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (entrada) {
        entrada.quantidade += 1;
        await entrada.save({ transaction });
      } else {
        await CharacterInventory.create({ id_personagem, id_item: idItem, quantidade: 1 }, { transaction });
      }

      const item = receita.item;
      await fila.destroy({ transaction });

      return { item };
    });

    res.status(200).json({
      status: "success",
      message: `Forja concluída! Você recebeu ${resultado.item.nome}.`,
      data: {
        item_ganho: {
          id: resultado.item.id,
          nome: resultado.item.nome,
          raridade: resultado.item.raridade,
        },
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao coletar forja:", error);
    res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao coletar forja." });
  }
};
