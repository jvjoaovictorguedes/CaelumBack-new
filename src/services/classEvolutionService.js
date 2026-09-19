// Evolução de CLASSE — árvore de caminhos exclusivos (ver
// ClassEvolutionPath): cada classe tem N caminhos configurados em
// class_evolution_paths, o personagem escolhe UM em definitivo (nível
// alto + 1 Relíquia de Ascensão específica do caminho), ganhando bônus
// permanente nos atributos. Diferente do sistema de Evolution (esse é
// por natureza mágica, cumulativo, comprado com ouro) — aqui é uma
// escolha única e maior, tipo "capstone" de fim de progressão.
const ClassEvolutionPath = require("../models/ClassEvolutionPath");
const Item = require("../models/Item");
const { contarMortes } = require("./monsterKillService");

async function listarCaminhosDaClasse(idClasse) {
  return ClassEvolutionPath.findAll({
    where: { id_classe: idClasse },
    order: [["ordem", "ASC"]],
  });
}

async function buscarCaminho(idCaminho) {
  return ClassEvolutionPath.findByPk(idCaminho);
}

async function buscarItemRequisito(idItem, transaction) {
  return Item.findByPk(idItem, { attributes: ["id", "nome", "imagem_url"], transaction });
}

module.exports = {
  listarCaminhosDaClasse,
  buscarCaminho,
  buscarItemRequisito,
  contarMortesDoAlvo: contarMortes,
};
