// Painel Administrativo §10-13 — camada administrativa transacional
// pra Item + suas propriedades específicas (Weapon/Armor/Consumable).
// O ADM vê um único formulário; este service decide quais tabelas
// específicas precisam ser criadas/atualizadas, sempre na MESMA
// transaction (se qualquer etapa falhar, nada fica parcialmente salvo).
const { sequelize } = require("../config/database");
const Item = require("../models/Item");
const WeaponProperties = require("../models/WeaponProperties");
const ArmorProperties = require("../models/ArmorProperties");
const ConsumableProperties = require("../models/ConsumableProperties");
const { registrarAcao } = require("./adminAuditService");

const TIPOS_ARMA = ["Arma"];
const TIPOS_ARMADURA = ["Armadura", "Capacete", "Escudo", "Acessorio1", "Acessorio2"];
const TIPOS_CONSUMIVEL = ["Consumivel"];

const ENUM_TIPO_ITEM = Item.rawAttributes.tipo_item.values;
const ENUM_RARIDADE = Item.rawAttributes.raridade.values;

const CAMPOS_ITEM = [
  "nome",
  "descricao",
  "tipo_item",
  "raridade",
  "valor_compra",
  "valor_venda",
  "peso",
  "imagem_url",
  "disponivel_loja",
  "negociavel_mercado",
  "tier_equipamento",
];
const CAMPOS_WEAPON = ["dano_min", "dano_max", "tipo_dano", "tipo_arma", "bonus_atributo", "valor_bonus_atributo"];
const CAMPOS_ARMOR = [
  "slot_equipamento",
  "defesa",
  "bonus_forca",
  "bonus_vitalidade",
  "bonus_inteligencia",
  "bonus_agilidade",
  "bonus_velocidade",
];
const CAMPOS_CONSUMABLE = ["efeito_vida", "efeito_mana", "efeito_atributo", "valor_atributo", "duracao_efeito"];

// Nunca passar req.body inteiro pro Model.create/update (§53) — só os
// campos explicitamente permitidos entram na query.
function somenteCampos(origem = {}, permitidos) {
  const saida = {};
  for (const campo of permitidos) {
    if (origem[campo] !== undefined) saida[campo] = origem[campo];
  }
  return saida;
}

function erroDeValidacao(mensagens) {
  const erro = new Error(mensagens.join(" "));
  erro.statusCode = 400;
  return erro;
}

function validarCamposBase(dadosItem) {
  const erros = [];
  if (!dadosItem.nome || typeof dadosItem.nome !== "string" || !dadosItem.nome.trim()) {
    erros.push("nome é obrigatório.");
  }
  if (dadosItem.tipo_item && !ENUM_TIPO_ITEM.includes(dadosItem.tipo_item)) {
    erros.push(`tipo_item inválido — use um de: ${ENUM_TIPO_ITEM.join(", ")}.`);
  }
  if (dadosItem.raridade && !ENUM_RARIDADE.includes(dadosItem.raridade)) {
    erros.push(`raridade inválida — use uma de: ${ENUM_RARIDADE.join(", ")}.`);
  }
  if (dadosItem.valor_compra != null && Number(dadosItem.valor_compra) < 0) erros.push("valor_compra não pode ser negativo.");
  if (dadosItem.valor_venda != null && Number(dadosItem.valor_venda) < 0) erros.push("valor_venda não pode ser negativo.");
  if (dadosItem.peso != null && Number(dadosItem.peso) < 0) erros.push("peso não pode ser negativo.");
  if (dadosItem.tier_equipamento != null) {
    const tier = Number(dadosItem.tier_equipamento);
    if (!Number.isInteger(tier) || tier < 1 || tier > 5) erros.push("tier_equipamento deve ser um inteiro de 1 a 5.");
  }
  return erros;
}

async function criarPropriedadesDoTipo(item, payload, transaction) {
  if (TIPOS_ARMA.includes(item.tipo_item)) {
    await WeaponProperties.create({ id_item: item.id, ...somenteCampos(payload.weapon, CAMPOS_WEAPON) }, { transaction });
  } else if (TIPOS_ARMADURA.includes(item.tipo_item)) {
    await ArmorProperties.create({ id_item: item.id, ...somenteCampos(payload.armor, CAMPOS_ARMOR) }, { transaction });
  } else if (TIPOS_CONSUMIVEL.includes(item.tipo_item)) {
    await ConsumableProperties.create(
      { id_item: item.id, ...somenteCampos(payload.consumable, CAMPOS_CONSUMABLE) },
      { transaction },
    );
  }
}

async function createAdminItem(payload, { idAdmin, req } = {}) {
  const dadosItem = somenteCampos(payload, CAMPOS_ITEM);
  const erros = validarCamposBase(dadosItem);
  if (!dadosItem.tipo_item) erros.push("tipo_item é obrigatório.");

  if (TIPOS_ARMA.includes(dadosItem.tipo_item) && !payload.weapon) erros.push('Item do tipo "Arma" exige propriedades de arma.');
  if (TIPOS_ARMADURA.includes(dadosItem.tipo_item) && !payload.armor) erros.push(`Item do tipo "${dadosItem.tipo_item}" exige propriedades de armadura.`);
  if (TIPOS_CONSUMIVEL.includes(dadosItem.tipo_item) && !payload.consumable) erros.push('Item do tipo "Consumivel" exige propriedades de efeito.');

  if (erros.length > 0) throw erroDeValidacao(erros);

  return sequelize.transaction(async (transaction) => {
    const item = await Item.create(
      { ativo: true, disponivel_loja: false, negociavel_mercado: true, ...dadosItem },
      { transaction },
    );
    await criarPropriedadesDoTipo(item, payload, transaction);
    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "Item",
      idEntidade: item.id,
      dadosDepois: item.toJSON(),
      req,
      transaction,
    });
    return item;
  });
}

async function updateAdminItem(idItem, payload, { idAdmin, req } = {}) {
  const dadosItem = somenteCampos(payload, CAMPOS_ITEM);
  // Trocar o tipo_item de um item já existente reordenaria qual tabela
  // de propriedades ele deveria ter (e o que fazer com a antiga é uma
  // decisão de conteúdo, não de infraestrutura) — fora de escopo desta
  // v1; quem precisar disso hoje desativa e cria um item novo.
  delete dadosItem.tipo_item;
  const erros = validarCamposBase(dadosItem);
  if (erros.length > 0) throw erroDeValidacao(erros);

  return sequelize.transaction(async (transaction) => {
    const item = await Item.findByPk(idItem, {
      transaction,
      lock: transaction.LOCK.UPDATE,
      include: [
        { model: WeaponProperties, as: "weaponProperties" },
        { model: ArmorProperties, as: "armorProperties" },
        { model: ConsumableProperties, as: "consumableProperties" },
      ],
    });
    if (!item) {
      const erro = new Error("Item não encontrado.");
      erro.statusCode = 404;
      throw erro;
    }

    const dadosAntes = item.toJSON();
    await item.update(dadosItem, { transaction });

    if (TIPOS_ARMA.includes(item.tipo_item) && payload.weapon) {
      const camposWeapon = somenteCampos(payload.weapon, CAMPOS_WEAPON);
      if (item.weaponProperties) await item.weaponProperties.update(camposWeapon, { transaction });
      else await WeaponProperties.create({ id_item: item.id, ...camposWeapon }, { transaction });
    } else if (TIPOS_ARMADURA.includes(item.tipo_item) && payload.armor) {
      const camposArmor = somenteCampos(payload.armor, CAMPOS_ARMOR);
      if (item.armorProperties) await item.armorProperties.update(camposArmor, { transaction });
      else await ArmorProperties.create({ id_item: item.id, ...camposArmor }, { transaction });
    } else if (TIPOS_CONSUMIVEL.includes(item.tipo_item) && payload.consumable) {
      const camposConsumable = somenteCampos(payload.consumable, CAMPOS_CONSUMABLE);
      if (item.consumableProperties) await item.consumableProperties.update(camposConsumable, { transaction });
      else await ConsumableProperties.create({ id_item: item.id, ...camposConsumable }, { transaction });
    }

    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "Item",
      idEntidade: item.id,
      dadosAntes,
      dadosDepois: item.toJSON(),
      req,
      transaction,
    });
    return item;
  });
}

// Desativar é a ação PADRÃO (§13/§48) — nunca deletar item de produção:
// pode estar em inventários, instâncias de equipamento, Mercado, Forja,
// missões, histórico ou recompensas. Exclusão física fica fora desta
// v1 (ação excepcional de SuperAdmin, exige checar dependências antes).
async function deactivateAdminItem(idItem, { idAdmin, motivo, req } = {}) {
  if (!motivo || !motivo.trim()) throw erroDeValidacao(["motivo é obrigatório para desativar um item."]);

  return sequelize.transaction(async (transaction) => {
    const item = await Item.findByPk(idItem, { transaction, lock: transaction.LOCK.UPDATE });
    if (!item) {
      const erro = new Error("Item não encontrado.");
      erro.statusCode = 404;
      throw erro;
    }
    const dadosAntes = item.toJSON();
    await item.update({ ativo: false, disponivel_loja: false }, { transaction });

    await registrarAcao({
      idAdmin,
      acao: "desativar",
      entidade: "Item",
      idEntidade: item.id,
      dadosAntes,
      dadosDepois: item.toJSON(),
      motivo,
      req,
      transaction,
    });
    return item;
  });
}

async function listAdminItems({ pagina = 1, porPagina = 20, tipo_item, raridade, nome, apenasAtivos } = {}) {
  const { Op } = require("sequelize");
  const where = {};
  if (tipo_item) where.tipo_item = tipo_item;
  if (raridade) where.raridade = raridade;
  if (nome) where.nome = { [Op.iLike]: `%${nome}%` };
  if (apenasAtivos !== undefined) where.ativo = apenasAtivos;

  const limite = Math.min(100, Math.max(1, porPagina));
  const offset = (Math.max(1, pagina) - 1) * limite;

  const { count, rows } = await Item.findAndCountAll({
    where,
    include: [
      { model: WeaponProperties, as: "weaponProperties" },
      { model: ArmorProperties, as: "armorProperties" },
      { model: ConsumableProperties, as: "consumableProperties" },
    ],
    order: [["id", "DESC"]],
    limit: limite,
    offset,
  });

  return { total: count, pagina, porPagina: limite, itens: rows };
}

module.exports = {
  createAdminItem,
  updateAdminItem,
  deactivateAdminItem,
  listAdminItems,
  ENUM_TIPO_ITEM,
  ENUM_RARIDADE,
};
