// Loot drop ao vencer um combate PvE (ver combatController.processarTurno).
// Três resultados possíveis por vitória, sempre um OU outro (nunca os
// dois juntos, pra não empilhar recompensa de vitória normal + drop
// duplo): nada, ouro bônus, ou um item — cada um com sua própria faixa
// de chance. RNG criptográfico (crypto.randomInt), igual ao sorteio de
// raça/classe rara em raridadeRolagemService.js — é "vale a pena tentar
// prever/manipular", mesmo raciocínio.
const crypto = require("crypto");
const Item = require("../models/Item");
const { concederOuro } = require("./goldService");
const { addStack } = require("./inventoryService");
const { ehEquipavel, create: criarInstancia } = require("./equipmentInstanceService");

const BASE_SORTEIO = 10000;
const CHANCE_ITEM_BASE10000 = 2000; // 20%
const CHANCE_OURO_BONUS_BASE10000 = 2500; // 25% (checado só se não caiu no item)

// Pool de tipos que fazem sentido cair como loot de monstro — sem
// QuestItem/Currencia (não são itens "de verdade" pra dropar assim).
const TIPOS_DROPAVEIS = [
  "Armadura",
  "Capacete",
  "Escudo",
  "Arma",
  "Consumivel",
  "Material",
  "Acessorio1",
  "Acessorio2",
];

// Quanto mais raro, mais raro cair — pesos decrescem rápido pra dar de
// fato a sensação de "achado" quando sai algo Épico+ de um mob comum.
const PESO_POR_RARIDADE = {
  Comum: 100,
  Incomum: 45,
  Raro: 18,
  Epico: 6,
  Lendario: 2,
  Mitico: 0.5,
};

function sortearComPeso(itens, pesoDe) {
  const pesoTotal = itens.reduce((soma, item) => soma + pesoDe(item), 0);
  if (pesoTotal <= 0) return null;

  // crypto.randomInt não aceita float, então rola sobre uma escala
  // inteira e divide de volta.
  const ESCALA = 1000;
  let alvo = crypto.randomInt(0, Math.round(pesoTotal * ESCALA));
  for (const item of itens) {
    alvo -= pesoDe(item) * ESCALA;
    if (alvo < 0) return item;
  }
  return itens[itens.length - 1];
}

async function sortearItemDrop() {
  const itens = await Item.findAll({ where: { tipo_item: TIPOS_DROPAVEIS } });
  if (itens.length === 0) return null;
  return sortearComPeso(itens, (item) => PESO_POR_RARIDADE[item.raridade] ?? 1);
}

// Inventário v2 (§4/§11) — equipamento (arma/armadura/escudo/acessório)
// nunca mais empilha em CharacterInventory: cada unidade dropada vira
// uma instância própria (com seu refinamento, sempre 0 aqui). Material/
// Consumível continua empilhado como sempre.
async function concederItem(idPersonagem, idItem, quantidade, transaction) {
  const item = await Item.findByPk(idItem, { transaction });
  if (item && ehEquipavel(item.tipo_item)) {
    const instancias = [];
    for (let i = 0; i < quantidade; i++) {
      instancias.push(await criarInstancia({ idPersonagem, idItem }, transaction));
    }
    return instancias;
  }
  return addStack(idPersonagem, idItem, quantidade, transaction);
}

// Rola o drop de uma vitória em PvE e, se algo caiu, já credita
// (item no inventário, ouro no personagem — quem chama ainda precisa
// dar `character.save()`, isso aqui só ajusta o campo em memória igual
// o resto do combatController faz com dinheiro/xp).
// Retorna null (nada caiu) ou { tipo: "item"|"ouro", ... } pro log/UI.
async function rolarDropDeVitoria(character, inimigo, transaction) {
  const rolagem = crypto.randomInt(0, BASE_SORTEIO);

  if (rolagem < CHANCE_ITEM_BASE10000) {
    const item = await sortearItemDrop();
    if (!item) return null;
    await concederItem(character.id, item.id, 1, transaction);
    return { tipo: "item", item: { id: item.id, nome: item.nome, raridade: item.raridade } };
  }

  if (rolagem < CHANCE_ITEM_BASE10000 + CHANCE_OURO_BONUS_BASE10000) {
    const ouro = 5 + inimigo.nivel * 3 + crypto.randomInt(0, inimigo.nivel * 3 + 1);
    concederOuro(character, ouro);
    return { tipo: "ouro", dinheiro: ouro };
  }

  return null;
}

module.exports = { rolarDropDeVitoria, concederItem };
