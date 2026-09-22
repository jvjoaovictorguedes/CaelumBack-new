// Service central de posse pra EQUIPAMENTOS (Inventário v2 §4/§12) —
// arma/armadura/capacete/escudo/acessório vivem como instância
// individual (CharacterEquipmentInstance), nunca mais empilhados em
// CharacterInventory. Único ponto que cria/transfere/equipa/desequipa/
// reserva pro Mercado — controllers nunca mexem direto nessas tabelas.
const CharacterEquipmentInstance = require("../models/CharacterEquipmentInstance");
const CharacterEquipment = require("../models/CharacterEquipment");
const Item = require("../models/Item");
const ArmorProperties = require("../models/ArmorProperties");
const WeaponProperties = require("../models/WeaponProperties");
const { propriedadesEfetivasArma, propriedadesEfetivasArmadura } = require("./equipmentRefinementService");

const ESTADOS = { INVENTARIO: "Inventario", EQUIPADA: "Equipada", MERCADO: "Mercado" };

// Tipos de Item que passam a viver só como instância (spec §4) — o
// resto (Material/Consumivel/Espolio/QuestItem/Currencia) continua
// empilhável via inventoryService.js.
const TIPOS_EQUIPAVEIS = ["Arma", "Armadura", "Capacete", "Escudo", "Acessorio1", "Acessorio2"];

function ehEquipavel(tipoItem) {
  return TIPOS_EQUIPAVEIS.includes(tipoItem);
}

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

// Slot de destino a partir do TIPO do item — mesma regra que já vivia
// espalhada em CharacterEquipmentController.validarCompatibilidade e
// forgeService.equiparInstancia, agora num lugar só. Escudo sempre vai
// pra ArmaSecundaria (nunca lido de ArmorProperties.slot_equipamento,
// que nem tem esse valor no ENUM) — gap que existia silenciosamente em
// forgeService.equiparInstancia antes desta unificação.
async function resolverSlot(item, transaction) {
  if (item.tipo_item === "Arma") return "ArmaPrincipal";

  if (item.tipo_item === "Escudo") {
    const propriedades = await ArmorProperties.findByPk(item.id, { transaction });
    if (!propriedades) throw erro(`O item "${item.nome}" não possui propriedades de escudo configuradas.`);
    return "ArmaSecundaria";
  }

  if (item.tipo_item === "Acessorio1" || item.tipo_item === "Acessorio2") {
    return item.tipo_item;
  }

  // Capacete / Armadura — slot vem da própria ArmorProperties
  // (Cabeca/Torso/Pes — "Maos" descontinuado, ver
  // 20261019010000-remove-manoplas-luvas.js).
  const propriedades = await ArmorProperties.findByPk(item.id, { transaction });
  if (!propriedades) throw erro(`O item "${item.nome}" não possui propriedades de armadura configuradas.`);
  return propriedades.slot_equipamento;
}

// Nova cópia física de um equipamento pertencente a um personagem —
// TODA fonte (Loja/Drop/Forja/Mercado/Admin) chama isto em vez de
// tocar CharacterEquipmentInstance direto (spec §11).
async function create({ idPersonagem, idItem, refinamento = 0 }, transaction) {
  return CharacterEquipmentInstance.create(
    { id_personagem: idPersonagem, id_item: idItem, refinamento, estado: ESTADOS.INVENTARIO, equipada: false },
    { transaction },
  );
}

// Equipa a instância no slot resolvido pelo próprio item — nunca aceita
// slot vindo do cliente (spec §16). Trava a instância PRIMEIRO (mesma
// ordem que já era usada em forgeService.equiparInstancia): duas
// requisições concorrentes tentando equipar a MESMA instância em dois
// slots serializam aqui, a segunda vê estado já "Equipada" ou o
// ocupante do slot já trocado.
async function equip(idPersonagem, idInstancia, transaction) {
  const instancia = await CharacterEquipmentInstance.findOne({
    where: { id: idInstancia },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!instancia) throw erro("Equipamento não encontrado.", 404);
  if (instancia.id_personagem !== Number(idPersonagem)) {
    throw erro("Este equipamento não pertence a você.", 403);
  }
  if (instancia.estado === ESTADOS.MERCADO) {
    throw erro("Este equipamento está anunciado no Mercado Negro — cancele o anúncio antes de equipar.", 400);
  }

  const item = await Item.findByPk(instancia.id_item, { transaction });
  if (!item) throw erro("Item não encontrado.", 404);
  const slot = await resolverSlot(item, transaction);

  const ocupante = await CharacterEquipment.findOne({
    where: { id_personagem: idPersonagem, slot },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (ocupante?.id_instancia && ocupante.id_instancia !== instancia.id) {
    await CharacterEquipmentInstance.update(
      { estado: ESTADOS.INVENTARIO, equipada: false },
      { where: { id: ocupante.id_instancia }, transaction },
    );
  }

  await CharacterEquipment.upsert(
    { id_personagem: idPersonagem, slot, id_item: item.id, id_instancia: instancia.id },
    { transaction },
  );
  instancia.estado = ESTADOS.EQUIPADA;
  instancia.equipada = true;
  await instancia.save({ transaction });

  return { slot, id_instancia: instancia.id };
}

// Desequipa o slot inteiro (independente de ter id_instancia ou ser
// legado id_item puro) — mantém o comportamento de sempre pro legado.
async function unequip(idPersonagem, slot, transaction) {
  const equipamento = await CharacterEquipment.findOne({
    where: { id_personagem: idPersonagem, slot },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!equipamento) throw erro("Esse slot já estava vazio.", 404);

  if (equipamento.id_instancia) {
    await CharacterEquipmentInstance.update(
      { estado: ESTADOS.INVENTARIO, equipada: false },
      { where: { id: equipamento.id_instancia }, transaction },
    );
  }
  await equipamento.destroy({ transaction });
  return true;
}

// Reserva a instância pro Mercado (spec §12) — só sai do "Inventario"
// (nunca de "Equipada" direto, o vendedor precisa desequipar primeiro;
// nunca de "Mercado" de novo, evita anunciar duas vezes).
async function reserveForMarket(idPersonagem, idInstancia, transaction) {
  const instancia = await CharacterEquipmentInstance.findOne({
    where: { id: idInstancia },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!instancia) throw erro("Equipamento não encontrado.", 404);
  if (instancia.id_personagem !== Number(idPersonagem)) {
    throw erro("Este equipamento não pertence a você.", 403);
  }
  if (instancia.estado !== ESTADOS.INVENTARIO) {
    throw erro("Esse equipamento precisa estar no inventário (não equipado, não já anunciado) pra anunciar no Mercado Negro.", 400);
  }
  instancia.estado = ESTADOS.MERCADO;
  await instancia.save({ transaction });
  return instancia;
}

// Devolve a instância pro inventário do dono sem trocar de dono — usado
// ao cancelar um anúncio.
async function releaseFromMarket(idInstancia, transaction) {
  const instancia = await CharacterEquipmentInstance.findOne({
    where: { id: idInstancia },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!instancia) throw erro("Equipamento não encontrado.", 404);
  instancia.estado = ESTADOS.INVENTARIO;
  await instancia.save({ transaction });
  return instancia;
}

// Muda de dono ao vender no Mercado — só a partir de "Mercado" (nunca
// transfere algo equipado ou solto sem ter passado por reserveForMarket
// antes).
async function transfer(idInstancia, idNovoPersonagem, transaction) {
  const instancia = await CharacterEquipmentInstance.findOne({
    where: { id: idInstancia },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!instancia) throw erro("Equipamento não encontrado.", 404);
  if (instancia.estado !== ESTADOS.MERCADO) {
    throw erro("Esse equipamento não está à venda.", 400);
  }
  instancia.id_personagem = idNovoPersonagem;
  instancia.estado = ESTADOS.INVENTARIO;
  await instancia.save({ transaction });
  return instancia;
}

// Todas as instâncias de um personagem, com Item + propriedades base já
// incluídas — base pra formatarInstancia (inventário v2) e pro Mercado.
async function listarInstancias(idPersonagem, transaction) {
  return CharacterEquipmentInstance.findAll({
    where: { id_personagem: idPersonagem },
    include: [
      {
        model: Item,
        as: "item",
        include: [
          { model: WeaponProperties, as: "weaponProperties" },
          { model: ArmorProperties, as: "armorProperties" },
        ],
      },
    ],
    order: [["id", "DESC"]],
    transaction,
  });
}

// Formato de resposta padrão de uma instância pra API (spec §9: "Item,
// raridade, imagem, refinamento, propriedades efetivas e estado atual").
function formatarInstancia(instancia) {
  const item = instancia.item;
  const weaponEfetivo = propriedadesEfetivasArma(item?.weaponProperties, instancia.refinamento);
  const armorEfetivo = propriedadesEfetivasArmadura(item?.armorProperties, instancia.refinamento);
  return {
    id: instancia.id,
    id_item: instancia.id_item,
    nome: item?.nome,
    tipo_item: item?.tipo_item,
    raridade: item?.raridade,
    tier_equipamento: item?.tier_equipamento ?? null,
    imagem_url: item?.imagem_url,
    refinamento: instancia.refinamento,
    estado: instancia.estado,
    propriedades_base: item?.weaponProperties ?? item?.armorProperties ?? null,
    propriedades_efetivas: weaponEfetivo ?? armorEfetivo ?? null,
  };
}

// Mesma formatação, só que a partir de uma linha de CharacterEquipment
// (join `item` + `instancia`, ver equipmentBonusService.js pro mesmo
// padrão) — cobre tanto v2 (id_instancia setado) quanto legado (null,
// refinamento sempre 0).
function formatarEquipado(equipamento) {
  const item = equipamento.item;
  const refinamento = equipamento.instancia?.refinamento ?? 0;
  const weaponEfetivo = propriedadesEfetivasArma(item?.weaponProperties, refinamento);
  const armorEfetivo = propriedadesEfetivasArmadura(item?.armorProperties, refinamento);
  return {
    slot: equipamento.slot,
    id_instancia: equipamento.id_instancia,
    id_item: item?.id,
    nome: item?.nome,
    tipo_item: item?.tipo_item,
    raridade: item?.raridade,
    tier_equipamento: item?.tier_equipamento ?? null,
    imagem_url: item?.imagem_url,
    refinamento,
    propriedades_base: item?.weaponProperties ?? item?.armorProperties ?? null,
    propriedades_efetivas: weaponEfetivo ?? armorEfetivo ?? null,
  };
}

module.exports = {
  ESTADOS,
  TIPOS_EQUIPAVEIS,
  ehEquipavel,
  resolverSlot,
  create,
  equip,
  unequip,
  reserveForMarket,
  releaseFromMarket,
  transfer,
  listarInstancias,
  formatarInstancia,
  formatarEquipado,
};
