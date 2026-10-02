// Painel Administrativo — Alquimia (Caldeirão). CRUD de receitas +
// ingredientes; nunca duplica a lógica de preparo (alchemyService.js
// continua a única fonte de verdade pro fluxo do jogador — isto só
// gerencia o catálogo).
const { sequelize } = require("../config/database");
const AlchemyRecipe = require("../models/AlchemyRecipe");
const AlchemyRecipeIngredient = require("../models/AlchemyRecipeIngredient");
const Item = require("../models/Item");
const ConsumableEffect = require("../models/ConsumableEffect");
const { registrarAcao } = require("./adminAuditService");
const { CONSUMABLE_EFFECT_HANDLERS, efeitoConhecido } = require("./consumableEffectRegistry");
const consumableEffectService = require("./consumableEffectService");
const {
  ATRIBUTOS_BUFAVEIS,
  STATUS_RESISTANCE_MAXIMA,
  somaDeAtributo,
  modificadorDeDanoSaida,
  bonusDeDefesa,
  regenDeVidaDoTurno,
  regenDeManaDoTurno,
} = require("./combatBuffService");
const { CHAVES_VALIDAS } = require("../config/statusEffectConfig");

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
  // Alquimia V2 (spec §8.1/§11.1) — metadados da fórmula física, só
  // fazem sentido quando modo_desbloqueio = DESCOBERTA (validado em
  // validarFormulaFisica abaixo, nunca só no frontend).
  "id_item_receita",
  "raridade_receita",
  "negociavel_receita",
  "consome_ao_aprender",
  "pista_publica",
];

const RARIDADES_RECEITA = ["Comum", "Raro", "Lendario"];

// Igual ao resto do domínio de Alquimia (ver comentário em
// associations.js): id_item_resultado/id_item são FK simples SEM
// belongsTo/alias, pra não confundir com equipamento — os nomes dos
// Items pra exibição no Admin são resolvidos aqui em lote, nunca via
// include do Sequelize.
async function anexarItensResolvidos(receitas) {
  const idsItens = new Set();
  for (const r of receitas) {
    idsItens.add(r.id_item_resultado);
    if (r.id_item_receita) idsItens.add(r.id_item_receita);
    for (const ing of r.ingredientes ?? []) idsItens.add(ing.id_item);
  }
  const idsItensResultado = [...new Set(receitas.map((r) => r.id_item_resultado))];
  const [itens, efeitos] = await Promise.all([
    idsItens.size
      ? Item.findAll({ where: { id: [...idsItens] }, attributes: ["id", "nome", "tipo_item", "imagem_url"] })
      : [],
    // Construtor de Efeitos (spec Caldeirão §12) — pré-carregado em lote
    // (mesmo princípio do resto desta função) pro Admin já exibir os
    // efeitos de cada receita na listagem, sem N+1 por linha.
    idsItensResultado.length
      ? ConsumableEffect.findAll({ where: { id_item: idsItensResultado }, order: [["id", "ASC"]] })
      : [],
  ]);
  const porId = new Map(itens.map((i) => [i.id, i]));
  const efeitosPorItem = new Map();
  for (const efeito of efeitos) {
    const lista = efeitosPorItem.get(efeito.id_item) ?? [];
    lista.push(efeito.toJSON());
    efeitosPorItem.set(efeito.id_item, lista);
  }
  return receitas.map((r) => ({
    ...r.toJSON(),
    item_resultado: porId.get(r.id_item_resultado) ?? null,
    item_receita: r.id_item_receita ? (porId.get(r.id_item_receita) ?? null) : null,
    ingredientes: (r.ingredientes ?? []).map((ing) => ({ ...ing.toJSON(), item: porId.get(ing.id_item) ?? null })),
    efeitos_consumivel: efeitosPorItem.get(r.id_item_resultado) ?? [],
  }));
}

function validarIngredientesPayload(ingredientes) {
  if (!Array.isArray(ingredientes)) throw erro("ingredientes precisa ser uma lista.");
  for (const ing of ingredientes) {
    if (!ing.id_item) throw erro("Cada ingrediente precisa de id_item.");
    if (!ing.quantidade || ing.quantidade < 1) throw erro("Cada ingrediente precisa de quantidade >= 1.");
  }
}

// spec §8.1 — campos da fórmula física são METADADOS OPCIONAIS sobre
// AlchemyRecipe: uma receita DESCOBERTA pode ser concedida por outra
// via (Proeza Única, recompensa de evento etc., via
// alchemyRecipeUnlockService.grant direto) sem nunca ter um pergaminho
// físico — então nunca EXIGIMOS id_item_receita só por ser DESCOBERTA
// (alchemyLearnService já recusa aprender uma receita sem fórmula
// configurada, no momento certo de validar isso). O que o painel SEMPRE
// valida, quando um id_item_receita É informado (spec §11.3): o Item
// precisa existir, ser tipo Receita, e nenhuma outra receita já usar
// esse mesmo Item.
async function validarFormulaFisica(estadoFinal, { idReceitaAtual = null, transaction } = {}) {
  if (estadoFinal.raridade_receita && !RARIDADES_RECEITA.includes(estadoFinal.raridade_receita)) {
    throw erro(`raridade_receita precisa ser uma de: ${RARIDADES_RECEITA.join(", ")}.`);
  }

  if (!estadoFinal.id_item_receita) return;

  const itemReceita = await Item.findByPk(estadoFinal.id_item_receita, { transaction });
  if (!itemReceita) throw erro("Item de fórmula física não encontrado.", 404);
  if (itemReceita.tipo_item !== "Receita") {
    throw erro("O Item da fórmula física precisa ser do tipo Receita.");
  }

  const conflito = await AlchemyRecipe.findOne({
    where: { id_item_receita: estadoFinal.id_item_receita },
    transaction,
  });
  if (conflito && conflito.id !== idReceitaAtual) {
    throw erro(`Esse Item de fórmula física já pertence à receita "${conflito.nome}".`, 409);
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

    await validarFormulaFisica(
      {
        id_item_receita: dados.id_item_receita ?? null,
        raridade_receita: dados.raridade_receita ?? null,
      },
      { transaction },
    );

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

    await validarFormulaFisica(
      {
        id_item_receita: dados.id_item_receita !== undefined ? dados.id_item_receita : receita.id_item_receita,
        raridade_receita:
          dados.raridade_receita !== undefined ? dados.raridade_receita : receita.raridade_receita,
      },
      { idReceitaAtual: receita.id, transaction },
    );

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

// ---------------------------------------------------------------------
// Construtor de Efeitos (spec Caldeirão §12) — CRUD de ConsumableEffect
// escopado por Item (id_item é a FK real; o admin sempre chega aqui a
// partir do item_resultado de uma receita, mas o endpoint em si não
// sabe nada de receita — um Item pode ganhar efeito mesmo sem vir do
// Caldeirão). Nunca duplica a whitelist/validação de config — sempre
// reaproveita consumableEffectRegistry/combatBuffService/
// statusEffectConfig, a mesma fonte de verdade que resolve o efeito de
// verdade no combate.
// ---------------------------------------------------------------------

const CAMPOS_EFEITO = ["effect_key", "magnitude", "duration_turns", "config", "ativo"];

// Chaves que fazem sentido num consumível de uso direto (self, sem
// duração "de combate turno a turno" nem bônus de atributo) — nenhuma
// delas é um ConsumableEffect sem handler, então basta existir no
// registry. GRANT_SHIELD/APPLY_COMBAT_BUFF exigem duration_turns > 0;
// as demais (cura/mana/cleanse) ignoram duration_turns.
const EFFECT_KEYS_COM_DURACAO = ["APPLY_COMBAT_BUFF", "GRANT_SHIELD"];

// Metadados pro frontend montar o formulário certo pra cada effect_key
// sem precisar reimplementar a whitelist — single source of truth
// continua sendo consumableEffectRegistry.CONSUMABLE_EFFECT_HANDLERS,
// isto aqui só descreve CAMPOS, nunca COMPORTAMENTO.
function listEffectTypes() {
  return Object.keys(CONSUMABLE_EFFECT_HANDLERS).map((effectKey) => ({
    effect_key: effectKey,
    exige_duracao: EFFECT_KEYS_COM_DURACAO.includes(effectKey),
    exige_atributo_buff: effectKey === "APPLY_COMBAT_BUFF",
    atributos_buff: effectKey === "APPLY_COMBAT_BUFF" ? ATRIBUTOS_BUFAVEIS : undefined,
    exige_status_key: effectKey === "CLEANSE_STATUS",
    status_keys: effectKey === "CLEANSE_STATUS" ? CHAVES_VALIDAS : undefined,
    exige_category: effectKey === "CLEANSE_CATEGORY",
    categorias: effectKey === "CLEANSE_CATEGORY" ? ["DOT", "CONTROLE"] : undefined,
    exige_magnitude: effectKey !== "CLEANSE_STATUS" && effectKey !== "CLEANSE_CATEGORY",
  }));
}

// Mesma validação que o motor de combate já faz na hora de EXECUTAR o
// efeito (consumableEffectRegistry handlers) — replicada aqui só pra
// dar erro 400 explicativo na hora de CADASTRAR, em vez de deixar o
// jogo falhar silenciosamente (spec §12) só quando alguém usar o item.
// Nunca é a fonte de verdade: se as regras divergirem, o motor de
// combate que decide o que realmente acontece.
function validarConfigDoEfeito(effectKey, config, duration_turns, magnitude) {
  if (!efeitoConhecido(effectKey)) {
    throw erro(`effect_key desconhecida: ${effectKey}. Valores aceitos: ${Object.keys(CONSUMABLE_EFFECT_HANDLERS).join(", ")}.`);
  }
  if (EFFECT_KEYS_COM_DURACAO.includes(effectKey) && !(Number(duration_turns) > 0)) {
    throw erro(`${effectKey} precisa de duration_turns > 0.`);
  }
  if (effectKey === "APPLY_COMBAT_BUFF") {
    if (!config?.atributo || !ATRIBUTOS_BUFAVEIS.includes(config.atributo)) {
      throw erro(`APPLY_COMBAT_BUFF precisa de config.atributo em: ${ATRIBUTOS_BUFAVEIS.join(", ")}.`);
    }
  }
  if (effectKey === "CLEANSE_STATUS") {
    if (!config?.status_key || !CHAVES_VALIDAS.includes(config.status_key)) {
      throw erro(`CLEANSE_STATUS precisa de config.status_key em: ${CHAVES_VALIDAS.join(", ")}.`);
    }
  }
  if (effectKey === "CLEANSE_CATEGORY") {
    if (!config?.category || !["DOT", "CONTROLE"].includes(config.category)) {
      throw erro("CLEANSE_CATEGORY precisa de config.category em: DOT, CONTROLE.");
    }
  }
  if (effectKey !== "CLEANSE_STATUS" && effectKey !== "CLEANSE_CATEGORY" && !(Number(magnitude) !== 0)) {
    throw erro(`${effectKey} precisa de magnitude diferente de 0.`);
  }
}

async function listAdminConsumableEffects(idItem) {
  const item = await Item.findByPk(idItem);
  if (!item) throw erro("Item não encontrado.", 404);
  const efeitos = await ConsumableEffect.findAll({ where: { id_item: idItem }, order: [["id", "ASC"]] });
  return efeitos.map((e) => e.toJSON());
}

async function createAdminConsumableEffect(idItem, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_EFEITO);
  if (!dados.effect_key) throw erro("effect_key é obrigatório.");
  validarConfigDoEfeito(dados.effect_key, dados.config ?? null, dados.duration_turns, dados.magnitude);

  return sequelize.transaction(async (transaction) => {
    const item = await Item.findByPk(idItem, { transaction });
    if (!item) throw erro("Item não encontrado.", 404);
    if (item.tipo_item !== "Consumivel") {
      throw erro("Só um Item do tipo Consumível pode ganhar ConsumableEffect.");
    }

    const efeito = await ConsumableEffect.create(
      {
        id_item: idItem,
        effect_key: dados.effect_key,
        magnitude: dados.magnitude ?? 0,
        duration_turns: dados.duration_turns ?? null,
        config: dados.config ?? null,
        ativo: dados.ativo ?? true,
      },
      { transaction },
    );

    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "ConsumableEffect",
      idEntidade: efeito.id,
      dadosDepois: efeito.toJSON(),
      req,
      transaction,
    });

    return efeito.toJSON();
  });
}

async function updateAdminConsumableEffect(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_EFEITO);

  return sequelize.transaction(async (transaction) => {
    const efeito = await ConsumableEffect.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!efeito) throw erro("Efeito não encontrado.", 404);
    const antes = efeito.toJSON();

    const effectKeyFinal = dados.effect_key ?? efeito.effect_key;
    const configFinal = dados.config !== undefined ? dados.config : efeito.config;
    const durationFinal = dados.duration_turns !== undefined ? dados.duration_turns : efeito.duration_turns;
    const magnitudeFinal = dados.magnitude !== undefined ? dados.magnitude : efeito.magnitude;
    validarConfigDoEfeito(effectKeyFinal, configFinal, durationFinal, magnitudeFinal);

    await efeito.update(dados, { transaction });

    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "ConsumableEffect",
      idEntidade: efeito.id,
      dadosAntes: antes,
      dadosDepois: efeito.toJSON(),
      req,
      transaction,
    });

    return efeito.toJSON();
  });
}

async function deleteAdminConsumableEffect(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const efeito = await ConsumableEffect.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!efeito) throw erro("Efeito não encontrado.", 404);
    const antes = efeito.toJSON();
    await efeito.destroy({ transaction });

    await registrarAcao({
      idAdmin,
      acao: "excluir",
      entidade: "ConsumableEffect",
      idEntidade: id,
      dadosAntes: antes,
      req,
      transaction,
    });

    return { id };
  });
}

// ---------------------------------------------------------------------
// Preview server-side (spec Caldeirão §19) — simula o uso do item com
// vida/mana/buffs/escudo/status HIPOTÉTICOS (nunca lê/grava um
// Character de verdade: é só uma calculadora pro admin conferir o
// catálogo antes de publicar), reaproveitando o MESMO
// consumableEffectService.aplicarEfeitosDoItem que PvE/fora-de-combate
// usam de verdade — nunca duplica a ordem/precedência dos handlers
// aqui. STATUS_RESISTANCE nunca roda RNG num preview (resolverTentativaDeStatus
// é só pra uma tentativa de verdade em combate): mostra a CHANCE
// calculada (já com o teto de 75%), nunca um resultado sorteado.
// ---------------------------------------------------------------------

function resumoDeBuffs(combatBuffs, { vidaMaxima, manaMaxima }) {
  return {
    dano_saida_multiplicador: modificadorDeDanoSaida(combatBuffs),
    defesa_bonus: bonusDeDefesa(combatBuffs),
    regen_vida_por_turno: regenDeVidaDoTurno(combatBuffs, vidaMaxima),
    regen_mana_por_turno: regenDeManaDoTurno(combatBuffs, manaMaxima),
    status_resistance_chance: Math.min(STATUS_RESISTANCE_MAXIMA, somaDeAtributo(combatBuffs, "STATUS_RESISTANCE_PCT")),
  };
}

async function previewAdminConsumableEffects(idItem, hipotetico = {}) {
  const item = await Item.findByPk(idItem);
  if (!item) throw erro("Item não encontrado.", 404);

  const vidaMaxima = hipotetico.vidaMaxima != null ? Number(hipotetico.vidaMaxima) : 100;
  const manaMaxima = hipotetico.manaMaxima != null ? Number(hipotetico.manaMaxima) : 100;
  if (!(vidaMaxima > 0) || !(manaMaxima > 0)) {
    throw erro("vidaMaxima e manaMaxima hipotéticos precisam ser > 0.");
  }
  const vidaAtual = hipotetico.vidaAtual != null ? Number(hipotetico.vidaAtual) : vidaMaxima;
  const manaAtual = hipotetico.manaAtual != null ? Number(hipotetico.manaAtual) : manaMaxima;
  const quantidade = hipotetico.quantidade != null ? Number(hipotetico.quantidade) : 1;
  const combatBuffsAntes = Array.isArray(hipotetico.combatBuffs) ? hipotetico.combatBuffs : [];
  const escudoAntes = hipotetico.escudoAtual ?? null;
  const statusEffectsAntes = Array.isArray(hipotetico.statusEffects) ? hipotetico.statusEffects : [];

  const resultado = await consumableEffectService.aplicarEfeitosDoItem({
    idItem,
    statusEffects: statusEffectsAntes,
    combatBuffs: combatBuffsAntes,
    escudoAtual: escudoAntes,
    vidaAtual,
    vidaMaxima,
    manaAtual,
    manaMaxima,
    quantidade,
    nomeAlvo: "Personagem de teste",
  });

  return {
    item: { id: item.id, nome: item.nome },
    hipotetico: { vidaAtual, vidaMaxima, manaAtual, manaMaxima, quantidade },
    antes: {
      vidaAtual,
      manaAtual,
      statusEffects: statusEffectsAntes,
      combatBuffs: combatBuffsAntes,
      escudo: escudoAntes,
      resumo: resumoDeBuffs(combatBuffsAntes, { vidaMaxima, manaMaxima }),
    },
    depois: {
      vidaAtual: resultado.vidaAtual,
      manaAtual: resultado.manaAtual,
      statusEffects: resultado.statusEffects,
      combatBuffs: resultado.combatBuffs,
      escudo: resultado.escudo,
      resumo: resumoDeBuffs(resultado.combatBuffs, { vidaMaxima, manaMaxima }),
    },
    curaVida: resultado.curaVida,
    curaMana: resultado.curaMana,
    log: resultado.log,
  };
}

module.exports = {
  listAdminAlchemyRecipes,
  createAdminAlchemyRecipe,
  updateAdminAlchemyRecipe,
  listEffectTypes,
  listAdminConsumableEffects,
  createAdminConsumableEffect,
  updateAdminConsumableEffect,
  deleteAdminConsumableEffect,
  previewAdminConsumableEffects,
};
