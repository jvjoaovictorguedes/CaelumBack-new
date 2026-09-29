// Painel Administrativo — Alquimia (Caldeirão). CRUD de receitas +
// ingredientes; nunca duplica a lógica de preparo (alchemyService.js
// continua a única fonte de verdade pro fluxo do jogador — isto só
// gerencia o catálogo).
const { sequelize } = require("../config/database");
const AlchemyRecipe = require("../models/AlchemyRecipe");
const AlchemyRecipeIngredient = require("../models/AlchemyRecipeIngredient");
const Item = require("../models/Item");
const { registrarAcao } = require("./adminAuditService");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function somenteCampos(objeto, campos) {
  const out = {};
  for (const campo of campos) {
    if (objeto?.[campo] !== undefined) out[campo] = objeto[campo];
  }
  return out;
}

const CAMPOS_RECEITA = [
  "key",
  "nome",
  "descricao",
  "categoria",
  "id_item_resultado",
  "quantidade_resultado",
  "nivel_alquimia_minimo",
  "xp_alquimia",
  "custo_ouro",
  "modo_desbloqueio",
  "ativo",
  "ordem",
];

// Igual ao resto do domínio de Alquimia (ver comentário em
// associations.js): id_item_resultado/id_item são FK simples SEM
// belongsTo/alias, pra não confundir com equipamento — os nomes dos
// Items pra exibição no Admin são resolvidos aqui em lote, nunca via
// include do Sequelize.
async function anexarItensResolvidos(receitas) {
  const idsItens = new Set();
  for (const r of receitas) {
    idsItens.add(r.id_item_resultado);
    for (const ing of r.ingredientes ?? []) idsItens.add(ing.id_item);
  }
  const itens = idsItens.size
    ? await Item.findAll({ where: { id: [...idsItens] }, attributes: ["id", "nome", "tipo_item", "imagem_url"] })
    : [];
  const porId = new Map(itens.map((i) => [i.id, i]));
  return receitas.map((r) => ({
    ...r.toJSON(),
    item_resultado: porId.get(r.id_item_resultado) ?? null,
    ingredientes: (r.ingredientes ?? []).map((ing) => ({ ...ing.toJSON(), item: porId.get(ing.id_item) ?? null })),
  }));
}

function validarIngredientesPayload(ingredientes) {
  if (!Array.isArray(ingredientes)) throw erro("ingredientes precisa ser uma lista.");
  for (const ing of ingredientes) {
    if (!ing.id_item) throw erro("Cada ingrediente precisa de id_item.");
    if (!ing.quantidade || ing.quantidade < 1) throw erro("Cada ingrediente precisa de quantidade >= 1.");
  }
}

async function listAdminAlchemyRecipes() {
  const receitas = await AlchemyRecipe.findAll({
    include: [{ model: AlchemyRecipeIngredient, as: "ingredientes" }],
    order: [["ordem", "ASC"], ["nome", "ASC"]],
  });
  return anexarItensResolvidos(receitas);
}

async function createAdminAlchemyRecipe(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_RECEITA);
  if (!dados.key || !dados.nome || !dados.categoria || !dados.id_item_resultado) {
    throw erro("key, nome, categoria e id_item_resultado são obrigatórios.");
  }
  const ingredientes = payload.ingredientes ?? [];
  validarIngredientesPayload(ingredientes);

  return sequelize.transaction(async (transaction) => {
    const itemResultado = await Item.findByPk(dados.id_item_resultado, { transaction });
    if (!itemResultado) throw erro("Item de resultado não encontrado.", 404);
    if (itemResultado.tipo_item !== "Consumivel") {
      throw erro("O item de resultado de uma receita de Alquimia precisa ser do tipo Consumível.");
    }

    const receita = await AlchemyRecipe.create(dados, { transaction });
    if (ingredientes.length > 0) {
      await AlchemyRecipeIngredient.bulkCreate(
        ingredientes.map((i) => ({ id_recipe: receita.id, id_item: i.id_item, quantidade: i.quantidade })),
        { transaction },
      );
    }

    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "AlchemyRecipe",
      idEntidade: receita.id,
      dadosDepois: { ...receita.toJSON(), ingredientes },
      req,
      transaction,
    });

    const criada = await AlchemyRecipe.findByPk(receita.id, {
      include: [{ model: AlchemyRecipeIngredient, as: "ingredientes" }],
      transaction,
    });
    return (await anexarItensResolvidos([criada]))[0];
  });
}

async function updateAdminAlchemyRecipe(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_RECEITA.filter((c) => c !== "key"));
  if (payload.ingredientes !== undefined) validarIngredientesPayload(payload.ingredientes);

  return sequelize.transaction(async (transaction) => {
    // Lock sem include: Postgres não permite FOR UPDATE no lado nullable
    // de um LEFT OUTER JOIN (que é como o Sequelize traduz o hasMany
    // "ingredientes" quando a receita pode não ter nenhum ainda).
    const receita = await AlchemyRecipe.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!receita) throw erro("Receita não encontrada.", 404);
    const ingredientesAntes = await AlchemyRecipeIngredient.findAll({ where: { id_recipe: id }, transaction });
    const antes = { ...receita.toJSON(), ingredientes: ingredientesAntes.map((i) => i.toJSON()) };

    if (dados.id_item_resultado) {
      const itemResultado = await Item.findByPk(dados.id_item_resultado, { transaction });
      if (!itemResultado) throw erro("Item de resultado não encontrado.", 404);
      if (itemResultado.tipo_item !== "Consumivel") {
        throw erro("O item de resultado de uma receita de Alquimia precisa ser do tipo Consumível.");
      }
    }

    await receita.update(dados, { transaction });

    if (payload.ingredientes !== undefined) {
      await AlchemyRecipeIngredient.destroy({ where: { id_recipe: id }, transaction });
      if (payload.ingredientes.length > 0) {
        await AlchemyRecipeIngredient.bulkCreate(
          payload.ingredientes.map((i) => ({ id_recipe: id, id_item: i.id_item, quantidade: i.quantidade })),
          { transaction },
        );
      }
    }

    const atualizada = await AlchemyRecipe.findByPk(id, {
      include: [{ model: AlchemyRecipeIngredient, as: "ingredientes" }],
      transaction,
    });
    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "AlchemyRecipe",
      idEntidade: receita.id,
      dadosAntes: antes,
      dadosDepois: atualizada.toJSON(),
      req,
      transaction,
    });
    return (await anexarItensResolvidos([atualizada]))[0];
  });
}

module.exports = { listAdminAlchemyRecipes, createAdminAlchemyRecipe, updateAdminAlchemyRecipe };
