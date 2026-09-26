// Painel Administrativo Fase 4 (Especificação Sistema de Conjuntos §4-8)
// — reaproveita EquipmentSet/EquipmentSetPiece/EquipmentSetBonus e o
// equipmentSetEffectRegistry existentes. Nunca cria intérprete de
// fórmula genérico: `stats` só aceita os atributos que
// equipmentSetService já soma (CAMPOS_STAT), `effect_key` só aceita
// chaves cadastradas no registry.
const { sequelize } = require("../config/database");
const EquipmentSet = require("../models/EquipmentSet");
const EquipmentSetPiece = require("../models/EquipmentSetPiece");
const EquipmentSetBonus = require("../models/EquipmentSetBonus");
const Item = require("../models/Item");
const ForgeBlueprint = require("../models/ForgeBlueprint");
const { SET_EFFECT_HANDLERS } = require("./equipmentSetEffectRegistry");
const { registrarAcao } = require("./adminAuditService");

// Mesma lista que equipmentSetService.js soma de verdade — se um dia
// crescer lá, crescer aqui também (fonte única seria melhor, mas o
// service de combate não expõe isso hoje; documentado aqui de propósito
// pra não divergir silenciosamente).
const CAMPOS_STAT_PERMITIDOS = ["forca", "vitalidade", "agilidade", "inteligencia", "velocidade", "defesa"];

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

function validarStats(stats) {
  if (stats == null) return;
  if (typeof stats !== "object" || Array.isArray(stats)) throw erro("stats precisa ser um objeto.");
  for (const [chave, valor] of Object.entries(stats)) {
    if (!CAMPOS_STAT_PERMITIDOS.includes(chave)) {
      throw erro(`Atributo "${chave}" não é permitido em stats. Use: ${CAMPOS_STAT_PERMITIDOS.join(", ")}.`);
    }
    if (typeof valor !== "number" || Number.isNaN(valor)) {
      throw erro(`stats.${chave} precisa ser number.`);
    }
  }
}

function validarEffectKey(effectKey) {
  if (!effectKey) return;
  if (!Object.prototype.hasOwnProperty.call(SET_EFFECT_HANDLERS, effectKey)) {
    throw erro(`effect_key "${effectKey}" não está registrado no servidor. Efeitos disponíveis: ${Object.keys(SET_EFFECT_HANDLERS).join(", ") || "nenhum ainda"}.`);
  }
}

// ------------------------------------------------------------- CONJUNTOS
const CAMPOS_SET = ["key", "nome", "descricao", "imagem_url", "ativo"];

async function listAdminEquipmentSets() {
  return EquipmentSet.findAll({
    include: [
      {
        model: EquipmentSetPiece,
        as: "pecas",
        include: [
          { model: Item, as: "item", attributes: ["id", "nome", "imagem_url", "tipo_item"] },
          { model: ForgeBlueprint, as: "blueprint", attributes: ["id", "nome", "categoria_equipamento", "tier_equipamento"] },
        ],
      },
      { model: EquipmentSetBonus, as: "bonuses" },
    ],
    order: [["nome", "ASC"]],
  });
}

async function createAdminEquipmentSet(payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_SET);
  if (!dados.key) throw erro("key é obrigatória.");
  if (!dados.nome) throw erro("nome é obrigatório.");
  // Sempre nasce inativo — o admin ainda não tem peça nenhuma
  // cadastrada nesse ponto, e "conjunto publicado precisa ter pelo
  // menos uma peça" (§8) seria violado se nascesse ativo.
  dados.ativo = false;

  return sequelize.transaction(async (transaction) => {
    const set = await EquipmentSet.create(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "criar", entidade: "EquipmentSet", idEntidade: set.id, dadosDepois: set.toJSON(), req, transaction });
    return set;
  });
}

async function updateAdminEquipmentSet(id, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, CAMPOS_SET);

  return sequelize.transaction(async (transaction) => {
    const set = await EquipmentSet.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!set) throw erro("Conjunto não encontrado.", 404);

    if (dados.ativo === true && set.ativo !== true) {
      const totalPecas = await EquipmentSetPiece.count({ where: { equipment_set_id: id }, transaction });
      if (totalPecas === 0) throw erro("Conjunto publicado precisa ter pelo menos uma peça.");
    }

    const antes = set.toJSON();
    await set.update(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "EquipmentSet", idEntidade: set.id, dadosAntes: antes, dadosDepois: set.toJSON(), req, transaction });
    return set;
  });
}

async function duplicateAdminEquipmentSet(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const original = await EquipmentSet.findByPk(id, {
      transaction,
      include: [
        { model: EquipmentSetPiece, as: "pecas" },
        { model: EquipmentSetBonus, as: "bonuses" },
      ],
    });
    if (!original) throw erro("Conjunto não encontrado.", 404);

    const copia = await EquipmentSet.create(
      { key: `${original.key}_copia_${Date.now()}`, nome: `${original.nome} (cópia)`, descricao: original.descricao, imagem_url: original.imagem_url, ativo: false },
      { transaction },
    );
    for (const peca of original.pecas ?? []) {
      await EquipmentSetPiece.create(
        { equipment_set_id: copia.id, item_id: peca.item_id, id_blueprint: peca.id_blueprint, piece_key: peca.piece_key, ordem: peca.ordem },
        { transaction },
      );
    }
    for (const bonus of original.bonuses ?? []) {
      await EquipmentSetBonus.create(
        { equipment_set_id: copia.id, pieces_required: bonus.pieces_required, stats: bonus.stats, effect_key: bonus.effect_key, effect_config: bonus.effect_config, descricao: bonus.descricao },
        { transaction },
      );
    }

    await registrarAcao({ idAdmin, acao: "duplicar", entidade: "EquipmentSet", idEntidade: copia.id, dadosAntes: { origemId: original.id }, dadosDepois: copia.toJSON(), req, transaction });
    return copia;
  });
}

// ------------------------------------------------------------------ PEÇAS
async function addAdminEquipmentSetPiece(idSet, payload, { idAdmin, req }) {
  const { item_id, id_blueprint, piece_key, ordem } = payload ?? {};
  if (!piece_key) throw erro("piece_key é obrigatório.");
  // Uma peça aponta pra um Item específico OU pra um ForgeBlueprint da
  // Forja (qualquer raridade que o blueprint produzir conta pra peça) —
  // nunca os dois, nunca nenhum (CHECK equipment_set_pieces_item_xor_blueprint
  // no banco, ver migration 20261206010000). item_id continua o caminho
  // de sempre pra itens que não vêm de blueprint.
  if (item_id && id_blueprint) throw erro("Informe item_id OU id_blueprint, nunca os dois.");
  if (!item_id && !id_blueprint) throw erro("Informe item_id ou id_blueprint.");

  // Bug reportado no painel ("não consigo colocar o ID do item que eu
  // quero") era o seletor de item do frontend (ItemPicker.tsx), não isso
  // — mas o service aceitava qualquer valor "truthy" (string, float,
  // negativo) como item_id sem checar o tipo antes de bater no banco,
  // então um payload malformado (ex.: um bug futuro no frontend, ou uma
  // chamada direta à API) só ia falhar depois, com Item.findByPk
  // devolvendo null pra um id inválido e um erro genérico "Item não
  // encontrado" em vez de deixar claro que o item_id em si é inválido.
  if (item_id && (!Number.isInteger(item_id) || item_id <= 0)) {
    throw erro("item_id precisa ser um número inteiro positivo.");
  }
  if (id_blueprint && (!Number.isInteger(id_blueprint) || id_blueprint <= 0)) {
    throw erro("id_blueprint precisa ser um número inteiro positivo.");
  }

  return sequelize.transaction(async (transaction) => {
    const set = await EquipmentSet.findByPk(idSet, { transaction });
    if (!set) throw erro("Conjunto não encontrado.", 404);

    if (item_id) {
      const item = await Item.findByPk(item_id, { transaction });
      if (!item) throw erro("Item não encontrado.", 404);
      if (!item.ativo) throw erro("Item desativado não pode virar peça de conjunto.");
    } else {
      const blueprint = await ForgeBlueprint.findByPk(id_blueprint, { transaction });
      if (!blueprint) throw erro("Blueprint não encontrado.", 404);
      if (!blueprint.ativo) throw erro("Blueprint desativado não pode virar peça de conjunto.");
    }

    const duplicada = await EquipmentSetPiece.findOne({ where: { equipment_set_id: idSet, piece_key }, transaction });
    if (duplicada) throw erro(`Já existe uma peça com piece_key "${piece_key}" nesse conjunto.`);

    const peca = await EquipmentSetPiece.create(
      { equipment_set_id: idSet, item_id: item_id ?? null, id_blueprint: id_blueprint ?? null, piece_key, ordem: ordem ?? null },
      { transaction },
    );
    await registrarAcao({ idAdmin, acao: "criar", entidade: "EquipmentSetPiece", idEntidade: peca.id, dadosDepois: peca.toJSON(), req, transaction });
    return peca;
  });
}

async function removeAdminEquipmentSetPiece(idPeca, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const peca = await EquipmentSetPiece.findByPk(idPeca, { transaction });
    if (!peca) throw erro("Peça não encontrada.", 404);

    const totalDepoisDeRemover = (await EquipmentSetPiece.count({ where: { equipment_set_id: peca.equipment_set_id }, transaction })) - 1;
    const maiorThreshold = await EquipmentSetBonus.max("pieces_required", { where: { equipment_set_id: peca.equipment_set_id }, transaction });
    if (maiorThreshold && totalDepoisDeRemover < maiorThreshold) {
      throw erro(`Não é possível remover: sobraria ${totalDepoisDeRemover} peça(s), mas existe bônus pedindo ${maiorThreshold}.`);
    }

    const antes = peca.toJSON();
    await peca.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "remover", entidade: "EquipmentSetPiece", idEntidade: idPeca, dadosAntes: antes, req, transaction });
    return { removido: true };
  });
}

// ----------------------------------------------------------------- BÔNUS
async function addAdminEquipmentSetBonus(idSet, payload, { idAdmin, req }) {
  const { pieces_required, stats, effect_key, effect_config, descricao } = payload ?? {};
  if (!Number.isInteger(pieces_required) || pieces_required < 1) throw erro("pieces_required precisa ser inteiro >= 1.");
  validarStats(stats);
  validarEffectKey(effect_key);

  return sequelize.transaction(async (transaction) => {
    const set = await EquipmentSet.findByPk(idSet, { transaction });
    if (!set) throw erro("Conjunto não encontrado.", 404);

    const totalPecas = await EquipmentSetPiece.count({ where: { equipment_set_id: idSet }, transaction });
    if (pieces_required > totalPecas) {
      throw erro(`pieces_required (${pieces_required}) não pode ser maior que a quantidade de peças do conjunto (${totalPecas}).`);
    }

    const existente = await EquipmentSetBonus.findOne({ where: { equipment_set_id: idSet, pieces_required }, transaction });
    if (existente) throw erro(`Já existe um bônus para ${pieces_required} peças nesse conjunto.`);

    const bonus = await EquipmentSetBonus.create(
      { equipment_set_id: idSet, pieces_required, stats: stats ?? {}, effect_key: effect_key ?? null, effect_config: effect_config ?? {}, descricao: descricao ?? null },
      { transaction },
    );
    await registrarAcao({ idAdmin, acao: "criar", entidade: "EquipmentSetBonus", idEntidade: bonus.id, dadosDepois: bonus.toJSON(), req, transaction });
    return bonus;
  });
}

async function updateAdminEquipmentSetBonus(idBonus, payload, { idAdmin, req }) {
  const dados = somenteCampos(payload, ["stats", "effect_key", "effect_config", "descricao"]);
  validarStats(dados.stats);
  validarEffectKey(dados.effect_key);

  return sequelize.transaction(async (transaction) => {
    const bonus = await EquipmentSetBonus.findByPk(idBonus, { transaction, lock: transaction.LOCK.UPDATE });
    if (!bonus) throw erro("Bônus não encontrado.", 404);
    const antes = bonus.toJSON();
    await bonus.update(dados, { transaction });
    await registrarAcao({ idAdmin, acao: "editar", entidade: "EquipmentSetBonus", idEntidade: bonus.id, dadosAntes: antes, dadosDepois: bonus.toJSON(), req, transaction });
    return bonus;
  });
}

async function removeAdminEquipmentSetBonus(idBonus, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const bonus = await EquipmentSetBonus.findByPk(idBonus, { transaction });
    if (!bonus) throw erro("Bônus não encontrado.", 404);
    const antes = bonus.toJSON();
    await bonus.destroy({ transaction });
    await registrarAcao({ idAdmin, acao: "remover", entidade: "EquipmentSetBonus", idEntidade: idBonus, dadosAntes: antes, req, transaction });
    return { removido: true };
  });
}

// --------------------------------------------------------------- PREVIEW
// Painel Administrativo Fase 7 — simula quais thresholds ficariam
// ativos pra N peças equipadas, usando a MESMA regra de ativação que
// equipmentSetService.js usa de verdade (uniquePieces >= pieces_required)
// — não precisa de personagem real pra simular um conjunto de catálogo.
async function previewAdminEquipmentSet(idSet, quantidadePecas) {
  const set = await EquipmentSet.findByPk(idSet, { include: [{ model: EquipmentSetBonus, as: "bonuses" }] });
  if (!set) throw erro("Conjunto não encontrado.", 404);

  const bonuses = (set.bonuses ?? [])
    .sort((a, b) => a.pieces_required - b.pieces_required)
    .map((bonus) => ({
      pieces_required: bonus.pieces_required,
      ativo: quantidadePecas >= bonus.pieces_required,
      stats: bonus.stats,
      effect_key: bonus.effect_key,
      descricao: bonus.descricao,
    }));

  return { equipment_set_id: set.id, quantidade_pecas: quantidadePecas, bonuses };
}

module.exports = {
  CAMPOS_STAT_PERMITIDOS,
  listAdminEquipmentSets,
  createAdminEquipmentSet,
  updateAdminEquipmentSet,
  duplicateAdminEquipmentSet,
  addAdminEquipmentSetPiece,
  removeAdminEquipmentSetPiece,
  addAdminEquipmentSetBonus,
  updateAdminEquipmentSetBonus,
  removeAdminEquipmentSetBonus,
  previewAdminEquipmentSet,
};
