"use strict";

// Habilidade Passiva pedida pelo jogador: "tem que ficar na aba habilidade
// pra aprender e colocar pra comprar pra poder ativar" — até aqui TODO
// poder de classe/raça era liberado de graça quando o personagem batia o
// nível (ver concederPoderesIniciais em characterController.js). Esse
// campo novo permite marcar um poder como "precisa comprar": quando
// custo_ouro é NULL, continua liberando de graça por nível (comportamento
// de sempre, preserva os 21 poderes já existentes); quando custo_ouro
// tem valor, o personagem só aprende gastando esse ouro na aba de
// Habilidades depois de já ter o nível mínimo — é o gate que faltava pra
// dar sentido a "precisar pegar" a habilidade.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelaClasse = await queryInterface.describeTable("class_abilities");
    if (!tabelaClasse.custo_ouro) {
      await queryInterface.addColumn("class_abilities", "custo_ouro", {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    const tabelaRaca = await queryInterface.describeTable("RaceAbilities");
    if (!tabelaRaca.custo_ouro) {
      await queryInterface.addColumn("RaceAbilities", "custo_ouro", {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const tabelaClasse = await queryInterface.describeTable("class_abilities");
    if (tabelaClasse.custo_ouro) {
      await queryInterface.removeColumn("class_abilities", "custo_ouro");
    }
    const tabelaRaca = await queryInterface.describeTable("RaceAbilities");
    if (tabelaRaca.custo_ouro) {
      await queryInterface.removeColumn("RaceAbilities", "custo_ouro");
    }
  },
};
