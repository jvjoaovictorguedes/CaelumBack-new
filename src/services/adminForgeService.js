// Painel Administrativo da Forja (§14) — Blueprints/Barras/Pergaminhos/
// Balanceamento/Métricas. Administra CONTEÚDO, nunca reimplementa a
// Forja: toda resolução de ingrediente/chance/tempo usa a MESMA
// infraestrutura do gameplay real (forgeMaterialsService/forgeConfig/
// forgeRollService), nunca uma segunda fórmula duplicada.
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const ForgeBlueprint = require("../models/ForgeBlueprint");
const ForgeBlueprintIngredient = require("../models/ForgeBlueprintIngredient");
const ForgeBlueprintResult = require("../models/ForgeBlueprintResult");
const ForgeBarItem = require("../models/ForgeBarItem");
const ForgeScroll = require("../models/ForgeScroll");
const ForgeScrollIngredient = require("../models/ForgeScrollIngredient");
const ExpeditionResource = require("../models/ExpeditionResource");
const Item = require("../models/Item");
const WeaponProperties = require("../models/WeaponProperties");
const ArmorProperties = require("../models/ArmorProperties");
const FishingRodProperties = require("../models/FishingRodProperties");
require("../models/associations");

const forgeConfig = require("../config/forgeConfig");
const { resolverIdItemDoInsumo } = require("./forgeMaterialsService");
const { chanceFinalRefinamentoPpm } = require("./forgeRollService");
const validation = require("./forgeAdminValidationService");
const { registrarAcao } = require("./adminAuditService");
const forgeTelemetryService = require("./forgeTelemetryService");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

const INCLUDE_RESULTADO_COMPLETO = [
  {
    model: ForgeBlueprintResult,
    as: "resultados",
    include: [
      {
        model: Item,
        as: "item",
        include: [
          { model: WeaponProperties, as: "weaponProperties" },
          { model: ArmorProperties, as: "armorProperties" },
          { model: FishingRodProperties, as: "fishingRodProperties" },
        ],
      },
    ],
  },
];

// -----------------------------------------------------------------
// BLUEPRINTS (§4/§5/§6/§15)
// -----------------------------------------------------------------

async function carregarBlueprintCompleto(id, transaction) {
  const blueprint = await ForgeBlueprint.findByPk(id, {
    include: [
      { model: ForgeBlueprintIngredient, as: "ingredientes", include: [{ model: ExpeditionResource, as: "recurso" }] },
      ...INCLUDE_RESULTADO_COMPLETO,
    ],
    transaction,
  });
  return blueprint;
}

async function montarRelatorioValidacao(blueprint, transaction) {
  const matrizIngredientes = await validation.resolverMatrizIngredientes(
    blueprint.ingredientes.map((i) => ({ tipo_insumo: i.tipo_insumo, id_recurso: i.id_recurso, quantidade_base: i.quantidade_base })),
    transaction,
  );
  const resultadosPorQualidade = new Map(blueprint.resultados.map((r) => [r.qualidade, r.item]));
  const resultadosValidacao = validation.validarResultados(blueprint.categoria_equipamento, blueprint.tier_equipamento, resultadosPorQualidade);
  const { podeAtivar, motivos } = validation.podeAtivar({ matrizIngredientes, resultadosValidacao });
  return { matrizIngredientes, resultadosValidacao, podeAtivar, motivos };
}

function contagemResultados(blueprint) {
  return blueprint.resultados?.length ?? 0;
}

async function listarBlueprintsAdmin({
  pagina = 1,
  porPagina = 20,
  nome,
  categoria,
  tier,
  nivelMinimo,
  ativo,
  incompletos,
  ingredienteNaoResolvivel,
} = {}) {
  const where = {};
  if (nome) where.nome = { [Op.iLike]: `%${nome}%` };
  if (categoria) where.categoria_equipamento = categoria;
  if (tier !== undefined && tier !== "") where.tier_equipamento = Number(tier);
  if (nivelMinimo !== undefined && nivelMinimo !== "") where.nivel_forja_minimo = { [Op.gte]: Number(nivelMinimo) };
  if (ativo !== undefined && ativo !== "") where.ativo = ativo === true || ativo === "true";

  const limite = Math.min(100, Math.max(1, Number(porPagina) || 20));
  const paginaAtual = Math.max(1, Number(pagina) || 1);

  const blueprints = await ForgeBlueprint.findAll({
    where,
    include: [{ model: ForgeBlueprintIngredient, as: "ingredientes" }, ...INCLUDE_RESULTADO_COMPLETO],
    order: [["id", "DESC"]],
  });

  let linhas = await Promise.all(
    blueprints.map(async (bp) => {
      const resultadosCompletos = contagemResultados(bp) === forgeConfig.ORDEM_QUALIDADE.length;
      let ingredientesOk = true;
      if (bp.ingredientes.length > 0) {
        const matriz = await validation.resolverMatrizIngredientes(
          bp.ingredientes.map((i) => ({ tipo_insumo: i.tipo_insumo, id_recurso: i.id_recurso, quantidade_base: i.quantidade_base })),
        );
        ingredientesOk = validation.todosIngredientesResolviveis(matriz);
      } else {
        ingredientesOk = false;
      }
      return {
        id: bp.id,
        nome: bp.nome,
        categoria_equipamento: bp.categoria_equipamento,
        tier_equipamento: bp.tier_equipamento,
        nivel_forja_minimo: bp.nivel_forja_minimo,
        multiplicador_tempo: bp.multiplicador_tempo,
        ativo: bp.ativo,
        resultados_count: contagemResultados(bp),
        resultados_completos: resultadosCompletos,
        ingredientes_ok: ingredientesOk,
      };
    }),
  );

  if (incompletos === true || incompletos === "true") linhas = linhas.filter((l) => !l.resultados_completos);
  if (ingredienteNaoResolvivel === true || ingredienteNaoResolvivel === "true") linhas = linhas.filter((l) => !l.ingredientes_ok);

  const total = linhas.length;
  const offset = (paginaAtual - 1) * limite;
  return { total, pagina: paginaAtual, porPagina: limite, itens: linhas.slice(offset, offset + limite) };
}

async function obterBlueprintAdmin(id) {
  const blueprint = await carregarBlueprintCompleto(id);
  if (!blueprint) throw erro("Blueprint não encontrado.", 404);
  const relatorio = await montarRelatorioValidacao(blueprint);
  return { blueprint, ...relatorio };
}

async function criarBlueprintAdmin(payload, { idAdmin, req }) {
  validation.validarCamposBasicos(payload);
  const ingredientes = payload.ingredientes ?? [];
  if (ingredientes.length > 0) validation.validarIngredientesPayload(ingredientes);
  const resultados = payload.resultados ?? {};
  for (const qualidade of Object.keys(resultados)) {
    if (!forgeConfig.ORDEM_QUALIDADE.includes(qualidade)) throw erro(`Qualidade de resultado inválida: ${qualidade}.`);
  }

  return sequelize.transaction(async (transaction) => {
    const existente = await ForgeBlueprint.findOne({ where: { nome: payload.nome }, transaction });
    if (existente) throw erro(`Já existe um blueprint com o nome "${payload.nome}".`);

    // §4.2/§21.5 — todo blueprint novo nasce INATIVO, sempre, mesmo que
    // o payload tente mandar ativo:true.
    const blueprint = await ForgeBlueprint.create(
      {
        nome: payload.nome,
        categoria_equipamento: payload.categoria_equipamento,
        tier_equipamento: payload.tier_equipamento,
        multiplicador_tempo: payload.multiplicador_tempo,
        nivel_forja_minimo: payload.nivel_forja_minimo,
        ativo: false,
      },
      { transaction },
    );

    if (ingredientes.length > 0) {
      await ForgeBlueprintIngredient.bulkCreate(
        ingredientes.map((i) => ({ id_blueprint: blueprint.id, tipo_insumo: i.tipo_insumo, id_recurso: i.id_recurso, quantidade_base: i.quantidade_base })),
        { transaction },
      );
    }
    const entradasResultado = Object.entries(resultados);
    if (entradasResultado.length > 0) {
      await ForgeBlueprintResult.bulkCreate(
        entradasResultado.map(([qualidade, idItem]) => ({ id_blueprint: blueprint.id, qualidade, id_item: idItem })),
        { transaction },
      );
    }

    const completo = await carregarBlueprintCompleto(blueprint.id, transaction);
    await registrarAcao({
      idAdmin,
      acao: "CREATE_BLUEPRINT",
      entidade: "ForgeBlueprint",
      idEntidade: blueprint.id,
      dadosDepois: completo.toJSON(),
      req,
      transaction,
    });
    return completo;
  });
}

async function atualizarBlueprintAdmin(id, payload, { idAdmin, req }) {
  if (payload.nome !== undefined || payload.categoria_equipamento !== undefined || payload.tier_equipamento !== undefined || payload.multiplicador_tempo !== undefined || payload.nivel_forja_minimo !== undefined) {
    validation.validarCamposBasicos(payload, { parcial: true });
  }
  if (payload.ingredientes !== undefined) validation.validarIngredientesPayload(payload.ingredientes);
  if (payload.resultados !== undefined) {
    for (const qualidade of Object.keys(payload.resultados)) {
      if (!forgeConfig.ORDEM_QUALIDADE.includes(qualidade)) throw erro(`Qualidade de resultado inválida: ${qualidade}.`);
    }
  }

  return sequelize.transaction(async (transaction) => {
    const blueprint = await ForgeBlueprint.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!blueprint) throw erro("Blueprint não encontrado.", 404);

    const antes = await carregarBlueprintCompleto(id, transaction);
    const dadosAntes = antes.toJSON();

    if (payload.nome !== undefined && payload.nome !== blueprint.nome) {
      const conflito = await ForgeBlueprint.findOne({ where: { nome: payload.nome, id: { [Op.ne]: id } }, transaction });
      if (conflito) throw erro(`Já existe um blueprint com o nome "${payload.nome}".`);
    }

    const camposBasicos = ["nome", "categoria_equipamento", "tier_equipamento", "multiplicador_tempo", "nivel_forja_minimo"];
    const patch = {};
    for (const campo of camposBasicos) if (payload[campo] !== undefined) patch[campo] = payload[campo];
    // `ativo` NUNCA muda por aqui — ativação/desativação é uma ação
    // explícita separada (setAtivoBlueprintAdmin), que revalida tudo
    // antes de ligar (§6/§21.6).
    if (Object.keys(patch).length > 0) await blueprint.update(patch, { transaction });

    if (payload.ingredientes !== undefined) {
      await ForgeBlueprintIngredient.destroy({ where: { id_blueprint: id }, transaction });
      if (payload.ingredientes.length > 0) {
        await ForgeBlueprintIngredient.bulkCreate(
          payload.ingredientes.map((i) => ({ id_blueprint: id, tipo_insumo: i.tipo_insumo, id_recurso: i.id_recurso, quantidade_base: i.quantidade_base })),
          { transaction },
        );
      }
    }

    if (payload.resultados !== undefined) {
      for (const [qualidade, idItem] of Object.entries(payload.resultados)) {
        await ForgeBlueprintResult.upsert({ id_blueprint: id, qualidade, id_item: idItem }, { transaction });
      }
    }

    const depois = await carregarBlueprintCompleto(id, transaction);
    await registrarAcao({
      idAdmin,
      acao: "UPDATE_BLUEPRINT",
      entidade: "ForgeBlueprint",
      idEntidade: id,
      dadosAntes,
      dadosDepois: depois.toJSON(),
      req,
      transaction,
    });
    return depois;
  });
}

async function duplicarBlueprintAdmin(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const original = await carregarBlueprintCompleto(id, transaction);
    if (!original) throw erro("Blueprint não encontrado.", 404);

    let nomeCopia = `${original.nome} (cópia)`;
    let sufixo = 1;
    while (await ForgeBlueprint.findOne({ where: { nome: nomeCopia }, transaction })) {
      sufixo += 1;
      nomeCopia = `${original.nome} (cópia ${sufixo})`;
    }

    // §6/§21.5 — cópia SEMPRE nasce inativa, mesmo se o original estava ativo.
    const copia = await ForgeBlueprint.create(
      {
        nome: nomeCopia,
        categoria_equipamento: original.categoria_equipamento,
        tier_equipamento: original.tier_equipamento,
        multiplicador_tempo: original.multiplicador_tempo,
        nivel_forja_minimo: original.nivel_forja_minimo,
        ativo: false,
      },
      { transaction },
    );

    if (original.ingredientes.length > 0) {
      await ForgeBlueprintIngredient.bulkCreate(
        original.ingredientes.map((i) => ({ id_blueprint: copia.id, tipo_insumo: i.tipo_insumo, id_recurso: i.id_recurso, quantidade_base: i.quantidade_base })),
        { transaction },
      );
    }
    if (original.resultados.length > 0) {
      await ForgeBlueprintResult.bulkCreate(
        original.resultados.map((r) => ({ id_blueprint: copia.id, qualidade: r.qualidade, id_item: r.id_item })),
        { transaction },
      );
    }

    const completo = await carregarBlueprintCompleto(copia.id, transaction);
    await registrarAcao({
      idAdmin,
      acao: "DUPLICATE_BLUEPRINT",
      entidade: "ForgeBlueprint",
      idEntidade: copia.id,
      dadosAntes: { origemId: original.id, origemNome: original.nome },
      dadosDepois: completo.toJSON(),
      req,
      transaction,
    });
    return completo;
  });
}

async function validarBlueprintAdmin(id) {
  const blueprint = await carregarBlueprintCompleto(id);
  if (!blueprint) throw erro("Blueprint não encontrado.", 404);
  return montarRelatorioValidacao(blueprint);
}

async function setAtivoBlueprintAdmin(id, ativo, { idAdmin, req, motivo } = {}) {
  return sequelize.transaction(async (transaction) => {
    const blueprint = await carregarBlueprintCompleto(id, transaction);
    if (!blueprint) throw erro("Blueprint não encontrado.", 404);
    const dadosAntes = blueprint.toJSON();

    if (ativo) {
      // §6/§21.6 — reativar revalida tudo de novo, nunca confia que
      // continua válido só porque já esteve ativo antes.
      const relatorio = await montarRelatorioValidacao(blueprint, transaction);
      if (!relatorio.podeAtivar) {
        throw erro(`Não é possível ativar: ${relatorio.motivos.join(" ")}`);
      }
    }

    await ForgeBlueprint.update({ ativo }, { where: { id }, transaction });
    const depois = await carregarBlueprintCompleto(id, transaction);
    await registrarAcao({
      idAdmin,
      acao: ativo ? "REACTIVATE_BLUEPRINT" : "DEACTIVATE_BLUEPRINT",
      entidade: "ForgeBlueprint",
      idEntidade: id,
      dadosAntes,
      dadosDepois: depois.toJSON(),
      motivo: motivo ?? null,
      req,
      transaction,
    });
    return depois;
  });
}

// §5.1 — "como o jogador vê": mesmas tabelas/objetos do forgeConfig que
// o gameplay real usa (CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL,
// reducaoTempoPorNivelForja), nunca uma fórmula reimplementada. Nunca
// inicia nenhuma ação de jogo real — só lê.
async function previewBlueprintAdmin(id, { nivelForja = 1, qualidadeBase = "Comum" } = {}) {
  const nivel = Math.max(1, Math.min(forgeConfig.NIVEL_MAXIMO, Number(nivelForja) || 1));
  if (!forgeConfig.ORDEM_QUALIDADE.includes(qualidadeBase)) throw erro("qualidadeBase inválida.");

  const blueprint = await carregarBlueprintCompleto(id);
  if (!blueprint) throw erro("Blueprint não encontrado.", 404);

  const ingredientesResolvidos = [];
  for (const ingrediente of blueprint.ingredientes) {
    const idItem = await resolverIdItemDoInsumo({ tipo_insumo: ingrediente.tipo_insumo, id_recurso: ingrediente.id_recurso, qualidade: qualidadeBase });
    const item = idItem ? await Item.findByPk(idItem, { attributes: ["id", "nome", "imagem_url"] }) : null;
    ingredientesResolvidos.push({
      tipo_insumo: ingrediente.tipo_insumo,
      nome_recurso: ingrediente.recurso?.nome,
      quantidade_necessaria: ingrediente.quantidade_base,
      id_item: idItem,
      nome_item: item?.nome ?? null,
      imagem_url: item?.imagem_url ?? null,
    });
  }

  const chances = forgeConfig.CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL[nivel] ?? {};
  const indiceBase = forgeConfig.ORDEM_QUALIDADE.indexOf(qualidadeBase);
  const chancesPorQualidadeFinal = {};
  for (let degrau = 0; degrau <= 5; degrau += 1) {
    const indiceFinal = Math.min(forgeConfig.ORDEM_QUALIDADE.length - 1, indiceBase + degrau);
    const qualidadeFinal = forgeConfig.ORDEM_QUALIDADE[indiceFinal];
    const chavePpm = degrau === 0 ? "mesma" : `mais${degrau}`;
    const ppm = chances[chavePpm] ?? 0;
    if (ppm > 0 || degrau === 0) chancesPorQualidadeFinal[qualidadeFinal] = (chancesPorQualidadeFinal[qualidadeFinal] ?? 0) + ppm / 10_000;
  }

  const tempoMs = forgeConfig.TEMPO_BASE_FABRICACAO_MS_POR_QUALIDADE[qualidadeBase] * blueprint.multiplicador_tempo * (1 - forgeConfig.reducaoTempoPorNivelForja(nivel));

  const resultadoQualidadeBase = blueprint.resultados.find((r) => r.qualidade === qualidadeBase)?.item ?? null;

  return {
    blueprint: { id: blueprint.id, nome: blueprint.nome, categoria_equipamento: blueprint.categoria_equipamento, tier_equipamento: blueprint.tier_equipamento },
    nivel_forja_simulado: nivel,
    qualidade_base: qualidadeBase,
    ingredientes: ingredientesResolvidos,
    chances_percentual_por_qualidade_final: chancesPorQualidadeFinal,
    tempo_segundos: Math.round(tempoMs / 1000),
    item_resultado_qualidade_base: resultadoQualidadeBase
      ? { id: resultadoQualidadeBase.id, nome: resultadoQualidadeBase.nome, imagem_url: resultadoQualidadeBase.imagem_url, raridade: resultadoQualidadeBase.raridade }
      : null,
  };
}

// -----------------------------------------------------------------
// FUNDIÇÃO / BARRAS (§7.1)
// -----------------------------------------------------------------

async function listarBarrasAdmin() {
  const [recursos, barras] = await Promise.all([
    ExpeditionResource.findAll({ where: { profissao: "Mineracao" }, order: [["nome", "ASC"]] }),
    ForgeBarItem.findAll({ include: [{ model: Item, as: "item" }] }),
  ]);
  const porChave = new Map(barras.map((b) => [`${b.id_recurso}:${b.qualidade}`, b.item]));

  return recursos.map((recurso) => ({
    id_recurso: recurso.id,
    nome_recurso: recurso.nome,
    qualidades: forgeConfig.ORDEM_QUALIDADE.map((qualidade) => {
      const item = porChave.get(`${recurso.id}:${qualidade}`);
      return { qualidade, item: item ? { id: item.id, nome: item.nome, imagem_url: item.imagem_url, raridade: item.raridade } : null };
    }),
  }));
}

async function upsertBarraAdmin(idRecurso, qualidade, idItem, { idAdmin, req } = {}) {
  if (!forgeConfig.ORDEM_QUALIDADE.includes(qualidade)) throw erro("Qualidade inválida.");
  if (!Number.isInteger(idItem)) throw erro("id_item é obrigatório.");

  return sequelize.transaction(async (transaction) => {
    const item = await Item.findByPk(idItem, { transaction });
    if (!item) throw erro("Item não encontrado.", 404);
    if (item.raridade !== qualidade) {
      throw erro(`Item "${item.nome}" tem raridade ${item.raridade}, esperado ${qualidade} pra esse mapeamento.`);
    }
    const recurso = await ExpeditionResource.findByPk(idRecurso, { transaction });
    if (!recurso || recurso.profissao !== "Mineracao") throw erro("Recurso de Mineração não encontrado.", 404);

    const existente = await ForgeBarItem.findOne({ where: { id_recurso: idRecurso, qualidade }, transaction, lock: transaction.LOCK.UPDATE });
    const dadosAntes = existente ? existente.toJSON() : null;
    await ForgeBarItem.upsert({ id_recurso: idRecurso, qualidade, id_item: idItem }, { transaction });

    await registrarAcao({
      idAdmin,
      acao: "UPDATE_BAR_MAPPING",
      entidade: "ForgeBarItem",
      idEntidade: null,
      dadosAntes,
      dadosDepois: { id_recurso: idRecurso, qualidade, id_item: idItem, nome_recurso: recurso.nome, nome_item: item.nome },
      req,
      transaction,
    });
    return { id_recurso: idRecurso, qualidade, item: { id: item.id, nome: item.nome, imagem_url: item.imagem_url } };
  });
}

async function removerBarraAdmin(idRecurso, qualidade, { idAdmin, req, confirmar } = {}) {
  if (confirmar !== true) throw erro("Remover um mapeamento de barra pode quebrar blueprints existentes — confirme com confirmar:true.");
  return sequelize.transaction(async (transaction) => {
    const existente = await ForgeBarItem.findOne({ where: { id_recurso: idRecurso, qualidade }, transaction, lock: transaction.LOCK.UPDATE });
    if (!existente) throw erro("Mapeamento não encontrado.", 404);
    const dadosAntes = existente.toJSON();
    await existente.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "REMOVE_BAR_MAPPING", entidade: "ForgeBarItem", idEntidade: null, dadosAntes, req, transaction });
    return { removido: true };
  });
}

// -----------------------------------------------------------------
// PERGAMINHOS (§8)
// -----------------------------------------------------------------

function validarScrollPayload(dados, { parcial = false } = {}) {
  const erros = [];
  if (!parcial || dados.bonus_percentual !== undefined) {
    if (!Number.isInteger(dados.bonus_percentual) || dados.bonus_percentual < 0) erros.push("bonus_percentual precisa ser um inteiro >= 0.");
  }
  if (!parcial || dados.nivel_forja_minimo !== undefined) {
    if (!Number.isInteger(dados.nivel_forja_minimo) || dados.nivel_forja_minimo < 1 || dados.nivel_forja_minimo > forgeConfig.NIVEL_MAXIMO) {
      erros.push(`nivel_forja_minimo precisa ser um inteiro entre 1 e ${forgeConfig.NIVEL_MAXIMO}.`);
    }
  }
  if (!parcial || dados.tempo_segundos !== undefined) {
    if (!Number.isInteger(dados.tempo_segundos) || dados.tempo_segundos <= 0) erros.push("tempo_segundos precisa ser um inteiro positivo.");
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

async function carregarScrollCompleto(idItem, transaction) {
  return ForgeScroll.findByPk(idItem, {
    include: [{ model: Item, as: "item" }, { model: ForgeScrollIngredient, as: "ingredientes", include: [{ model: Item, as: "material" }] }],
    transaction,
  });
}

async function listarScrollsAdmin({ ativo } = {}) {
  const where = {};
  if (ativo !== undefined && ativo !== "") where.ativo = ativo === true || ativo === "true";
  const scrolls = await ForgeScroll.findAll({
    where,
    include: [{ model: Item, as: "item" }, { model: ForgeScrollIngredient, as: "ingredientes", include: [{ model: Item, as: "material" }] }],
    order: [["id_item", "ASC"]],
  });
  // §8 — bônus NUNCA pode ignorar o cap; sinaliza aqui pra o Admin ver
  // de cara um pergaminho cujo bonus_percentual sozinho já estoura o
  // cap vigente (mesmo sem nível de Forja/base nenhum somado).
  return scrolls.map((s) => ({
    ...s.toJSON(),
    excede_cap_sozinho: Math.round((s.bonus_percentual / 100) * 1_000_000) >= forgeConfig.CAP_CHANCE_REFINAMENTO_PPM,
  }));
}

async function criarScrollAdmin(payload, { idAdmin, req }) {
  if (!Number.isInteger(payload.id_item)) throw erro("id_item é obrigatório.");
  validarScrollPayload(payload);

  return sequelize.transaction(async (transaction) => {
    const item = await Item.findByPk(payload.id_item, { transaction });
    if (!item) throw erro("Item não encontrado.", 404);
    const existente = await ForgeScroll.findByPk(payload.id_item, { transaction });
    if (existente) throw erro("Esse Item já é um pergaminho de refino.");

    const scroll = await ForgeScroll.create(
      {
        id_item: payload.id_item,
        bonus_percentual: payload.bonus_percentual,
        nivel_forja_minimo: payload.nivel_forja_minimo,
        tempo_segundos: payload.tempo_segundos,
        ativo: payload.ativo ?? true,
      },
      { transaction },
    );

    const ingredientes = payload.ingredientes ?? [];
    if (ingredientes.length > 0) {
      await ForgeScrollIngredient.bulkCreate(
        ingredientes.map((i) => ({ id_scroll_item: scroll.id_item, id_item_material: i.id_item_material, quantidade: i.quantidade })),
        { transaction },
      );
    }

    const completo = await carregarScrollCompleto(scroll.id_item, transaction);
    await registrarAcao({ idAdmin, acao: "CREATE_SCROLL", entidade: "ForgeScroll", idEntidade: scroll.id_item, dadosDepois: completo.toJSON(), req, transaction });
    return completo;
  });
}

async function atualizarScrollAdmin(idItem, payload, { idAdmin, req }) {
  validarScrollPayload(payload, { parcial: true });

  return sequelize.transaction(async (transaction) => {
    const scroll = await ForgeScroll.findByPk(idItem, { transaction, lock: transaction.LOCK.UPDATE });
    if (!scroll) throw erro("Pergaminho não encontrado.", 404);
    const antes = await carregarScrollCompleto(idItem, transaction);
    const dadosAntes = antes.toJSON();

    const campos = ["bonus_percentual", "nivel_forja_minimo", "tempo_segundos"];
    const patch = {};
    for (const campo of campos) if (payload[campo] !== undefined) patch[campo] = payload[campo];
    if (Object.keys(patch).length > 0) await scroll.update(patch, { transaction });

    if (payload.ingredientes !== undefined) {
      await ForgeScrollIngredient.destroy({ where: { id_scroll_item: idItem }, transaction });
      if (payload.ingredientes.length > 0) {
        await ForgeScrollIngredient.bulkCreate(
          payload.ingredientes.map((i) => ({ id_scroll_item: idItem, id_item_material: i.id_item_material, quantidade: i.quantidade })),
          { transaction },
        );
      }
    }

    const depois = await carregarScrollCompleto(idItem, transaction);
    await registrarAcao({ idAdmin, acao: "UPDATE_SCROLL", entidade: "ForgeScroll", idEntidade: idItem, dadosAntes, dadosDepois: depois.toJSON(), req, transaction });
    return depois;
  });
}

async function duplicarScrollAdmin(idItem, novoIdItem, { idAdmin, req }) {
  if (!Number.isInteger(novoIdItem)) throw erro("Informe novo_id_item (um Item existente, ainda sem pergaminho vinculado).");
  return sequelize.transaction(async (transaction) => {
    const original = await carregarScrollCompleto(idItem, transaction);
    if (!original) throw erro("Pergaminho não encontrado.", 404);
    const itemNovo = await Item.findByPk(novoIdItem, { transaction });
    if (!itemNovo) throw erro("Item de destino não encontrado.", 404);
    const conflito = await ForgeScroll.findByPk(novoIdItem, { transaction });
    if (conflito) throw erro("O Item de destino já é um pergaminho.");

    const copia = await ForgeScroll.create(
      { id_item: novoIdItem, bonus_percentual: original.bonus_percentual, nivel_forja_minimo: original.nivel_forja_minimo, tempo_segundos: original.tempo_segundos, ativo: false },
      { transaction },
    );
    if (original.ingredientes.length > 0) {
      await ForgeScrollIngredient.bulkCreate(
        original.ingredientes.map((i) => ({ id_scroll_item: copia.id_item, id_item_material: i.id_item_material, quantidade: i.quantidade })),
        { transaction },
      );
    }
    const completo = await carregarScrollCompleto(copia.id_item, transaction);
    await registrarAcao({ idAdmin, acao: "DUPLICATE_SCROLL", entidade: "ForgeScroll", idEntidade: copia.id_item, dadosAntes: { origemId: idItem }, dadosDepois: completo.toJSON(), req, transaction });
    return completo;
  });
}

async function setAtivoScrollAdmin(idItem, ativo, { idAdmin, req } = {}) {
  return sequelize.transaction(async (transaction) => {
    const scroll = await ForgeScroll.findByPk(idItem, { transaction, lock: transaction.LOCK.UPDATE });
    if (!scroll) throw erro("Pergaminho não encontrado.", 404);
    const antes = scroll.toJSON();
    await scroll.update({ ativo }, { transaction });
    await registrarAcao({ idAdmin, acao: ativo ? "REACTIVATE_SCROLL" : "DEACTIVATE_SCROLL", entidade: "ForgeScroll", idEntidade: idItem, dadosAntes: antes, dadosDepois: scroll.toJSON(), req, transaction });
    return scroll;
  });
}

// -----------------------------------------------------------------
// RECURSOS (auxiliar pro seletor de ingrediente lógico/barra no frontend)
// -----------------------------------------------------------------

async function listarRecursosAdmin({ profissao } = {}) {
  const where = {};
  if (profissao) where.profissao = profissao;
  return ExpeditionResource.findAll({ where, order: [["profissao", "ASC"], ["nome", "ASC"]] });
}

// -----------------------------------------------------------------
// BALANCEAMENTO (§9/§10) — delega tudo pro forgeSettingsService.
// -----------------------------------------------------------------

const forgeSettingsService = require("./forgeSettingsService");

async function getBalanceamentoAdmin() {
  return forgeSettingsService.getBalanceamentoCompleto();
}

async function updateBalanceamentoAdmin(grupo, valores, ctx) {
  return forgeSettingsService.updateBalanceamento(grupo, valores, ctx);
}

// §9.1 — Simulador OBRIGATÓRIO de Refinamento: usa a MESMA função de
// gameplay (forgeRollService.chanceFinalRefinamentoPpm) e as MESMAS
// tabelas (forgeConfig, já com overrides de balanceamento aplicados).
async function previewRefinamentoAdmin({ categoria, qualidade, refinamentoAtual, nivelForja, idItemPergaminho, tierEquipamento }) {
  if (!forgeConfig.MATERIAIS_BASE_REFINAMENTO_POR_CATEGORIA[categoria]) throw erro("Categoria inválida.");
  if (!forgeConfig.ORDEM_QUALIDADE.includes(qualidade)) throw erro("Qualidade inválida.");
  const alvo = (Number(refinamentoAtual) || 0) + 1;
  if (alvo > forgeConfig.NIVEL_MAXIMO) throw erro(`refinamentoAtual já está no máximo (${forgeConfig.NIVEL_MAXIMO}).`);
  const nivel = Math.max(1, Math.min(forgeConfig.NIVEL_MAXIMO, Number(nivelForja) || 1));

  let bonusPergaminho = 0;
  let pergaminho = null;
  if (idItemPergaminho) {
    const scroll = await ForgeScroll.findByPk(idItemPergaminho, { include: [{ model: Item, as: "item" }] });
    if (scroll && scroll.ativo) {
      bonusPergaminho = scroll.bonus_percentual;
      pergaminho = { id_item: scroll.id_item, nome: scroll.item.nome, bonus_percentual: scroll.bonus_percentual };
    }
  }

  const garantido = forgeConfig.REFINAMENTOS_GARANTIDOS.includes(alvo);
  const chanceBasePpm = garantido ? 1_000_000 : forgeConfig.CHANCE_BASE_REFINAMENTO_PPM_POR_ALVO[alvo] ?? 0;
  const bonusForjaPpm = garantido ? 0 : forgeConfig.BONUS_FORJA_REFINAMENTO_PPM_POR_NIVEL[nivel] ?? 0;
  const bonusPergaminhoPpm = Math.round((bonusPergaminho / 100) * 1_000_000);
  const chanceFinalPpm = chanceFinalRefinamentoPpm(alvo, nivel, bonusPergaminho);

  const unidades = forgeConfig.UNIDADES_MATERIAL_REFINAMENTO_POR_ALVO[alvo] ?? 1;
  const base = forgeConfig.MATERIAIS_BASE_REFINAMENTO_POR_CATEGORIA[categoria];
  const multiplicadorTier = require("../config/equipmentTierConfig").REFINEMENT_COST_TIER_MULTIPLIER?.[tierEquipamento] ?? 1;
  const ouro = Math.round((forgeConfig.OURO_BASE_REFINAMENTO_POR_QUALIDADE[qualidade] ?? 0) * unidades * multiplicadorTier);

  const recursoBarra = await ExpeditionResource.findOne({ where: { nome: "Ferro", profissao: "Mineracao" } });
  const recursoTronco = await ExpeditionResource.findOne({ where: { nome: "Carvalho", profissao: "Silvicultura" } });
  const materiais = [];
  if (base.barras > 0 && recursoBarra) {
    const idItemBarra = await resolverIdItemDoInsumo({ tipo_insumo: "Barra", id_recurso: recursoBarra.id, qualidade });
    const itemBarra = idItemBarra ? await Item.findByPk(idItemBarra, { attributes: ["nome", "imagem_url"] }) : null;
    materiais.push({ papel: "barras", quantidade: base.barras * unidades, nome: itemBarra?.nome ?? null, imagem_url: itemBarra?.imagem_url ?? null });
  }
  if (base.troncos > 0 && recursoTronco) {
    const idItemTronco = await resolverIdItemDoInsumo({ tipo_insumo: "RecursoExpedicao", id_recurso: recursoTronco.id, qualidade });
    const itemTronco = idItemTronco ? await Item.findByPk(idItemTronco, { attributes: ["nome", "imagem_url"] }) : null;
    materiais.push({ papel: "troncos", quantidade: base.troncos * unidades, nome: itemTronco?.nome ?? null, imagem_url: itemTronco?.imagem_url ?? null });
  }

  const xpSucesso = forgeConfig.XP_REFINAMENTO_POR_ALVO[alvo] ?? 0;
  const xpFalha = Math.round(xpSucesso * forgeConfig.FATOR_XP_REFINAMENTO_FALHA);
  const bonusAtributoAposSucesso = forgeConfig.BONUS_ATRIBUTO_REFINAMENTO_PCT[alvo] ?? null;

  return {
    alvo,
    garantido,
    chance_base_percentual: chanceBasePpm / 10_000,
    bonus_forja_percentual: bonusForjaPpm / 10_000,
    bonus_pergaminho_percentual: bonusPergaminhoPpm / 10_000,
    chance_final_percentual: chanceFinalPpm / 10_000,
    cap_percentual: forgeConfig.CAP_CHANCE_REFINAMENTO_PPM / 10_000,
    custo_gold: ouro,
    materiais,
    xp_sucesso: xpSucesso,
    xp_falha: xpFalha,
    bonus_atributo_apos_sucesso_percentual: bonusAtributoAposSucesso,
    pergaminho_aplicado: pergaminho,
  };
}

// §11.2 — preview de impacto ANTES de editar a curva de XP: personagens
// que sobem/descem, distribuição antes/depois, blueprints que mudam de
// elegibilidade. NUNCA persiste nada — só leitura + cálculo.
async function previewImpactoProgressaoAdmin(novaCurvaXpPorEtapa) {
  const CharacterForgeProgress = require("../models/CharacterForgeProgress");
  const { NIVEL_MAXIMO, XP_TOTAL_PARA_NIVEL: curvaAtual } = forgeConfig;

  const curvaNova = { 1: 0 };
  let acumulado = 0;
  for (let nivel = 2; nivel <= NIVEL_MAXIMO; nivel += 1) {
    const etapa = novaCurvaXpPorEtapa[nivel - 1] ?? forgeConfig.XP_NECESSARIO_POR_ETAPA[nivel - 1];
    if (!Number.isInteger(etapa) || etapa <= 0) throw erro(`XP da etapa ${nivel - 1} precisa ser um inteiro positivo.`);
    acumulado += etapa;
    curvaNova[nivel] = acumulado;
  }
  function nivelPorCurva(xp, curva) {
    let nivel = 1;
    for (let candidato = 2; candidato <= NIVEL_MAXIMO; candidato += 1) {
      if (xp >= curva[candidato]) nivel = candidato;
      else break;
    }
    return nivel;
  }

  const progressos = await CharacterForgeProgress.findAll();
  let sobem = 0;
  let descem = 0;
  const distribuicaoAntes = {};
  const distribuicaoDepois = {};
  for (const p of progressos) {
    const antes = nivelPorCurva(p.experiencia, curvaAtual);
    const depois = nivelPorCurva(p.experiencia, curvaNova);
    distribuicaoAntes[antes] = (distribuicaoAntes[antes] ?? 0) + 1;
    distribuicaoDepois[depois] = (distribuicaoDepois[depois] ?? 0) + 1;
    if (depois > antes) sobem += 1;
    else if (depois < antes) descem += 1;
  }

  const blueprints = await ForgeBlueprint.findAll({ attributes: ["id", "nome", "nivel_forja_minimo"] });
  const blueprintsAfetados = blueprints
    .map((bp) => ({ id: bp.id, nome: bp.nome, nivel_forja_minimo: bp.nivel_forja_minimo }))
    .filter((bp) => bp.nivel_forja_minimo > 1); // qualquer blueprint com requisito > 1 pode mudar de elegibilidade se a curva mudar

  return {
    total_personagens: progressos.length,
    personagens_sobem: sobem,
    personagens_descem: descem,
    distribuicao_antes: distribuicaoAntes,
    distribuicao_depois: distribuicaoDepois,
    blueprints_potencialmente_afetados: blueprintsAfetados,
    curva_xp_total_nova: curvaNova,
  };
}

async function getMetricasAdmin() {
  return forgeTelemetryService.getMetricas();
}

module.exports = {
  listarBlueprintsAdmin,
  obterBlueprintAdmin,
  criarBlueprintAdmin,
  atualizarBlueprintAdmin,
  duplicarBlueprintAdmin,
  validarBlueprintAdmin,
  setAtivoBlueprintAdmin,
  previewBlueprintAdmin,
  listarBarrasAdmin,
  upsertBarraAdmin,
  removerBarraAdmin,
  listarScrollsAdmin,
  criarScrollAdmin,
  atualizarScrollAdmin,
  duplicarScrollAdmin,
  setAtivoScrollAdmin,
  listarRecursosAdmin,
  getBalanceamentoAdmin,
  updateBalanceamentoAdmin,
  previewRefinamentoAdmin,
  previewImpactoProgressaoAdmin,
  getMetricasAdmin,
};
