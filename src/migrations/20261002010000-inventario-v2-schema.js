"use strict";

// Inventário e Equipamentos v2 — adiciona o estado explícito da
// instância (spec §5: Inventario|Equipada|Mercado) e prepara o Mercado
// P2P pra anunciar instâncias (com refinamento próprio) em vez de só
// id_item+quantidade. Aditivo e idempotente — nada aqui apaga dado
// nenhum; a migração de stacks legados pra instâncias é uma migration
// SEPARADA (20261002030000), só depois que todo o código já sabe ler
// os dois formatos.
module.exports = {
  async up(queryInterface, Sequelize) {
    const instancias = await queryInterface.describeTable("character_equipment_instances");
    if (!instancias.estado) {
      await queryInterface.addColumn("character_equipment_instances", "estado", {
        type: Sequelize.ENUM("Inventario", "Equipada", "Mercado"),
        allowNull: false,
        defaultValue: "Inventario",
      });
      // Backfill a partir do booleano já existente — nenhuma instância
      // criada até aqui podia estar em Mercado (isso não existia).
      await queryInterface.sequelize.query(`
        UPDATE character_equipment_instances SET estado = 'Equipada' WHERE equipada = true;
      `);
    }

    const listings = await queryInterface.describeTable("market_listings");
    if (!listings.id_instancia) {
      await queryInterface.addColumn("market_listings", "id_instancia", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "character_equipment_instances", key: "id" },
        onDelete: "RESTRICT",
      });
    }
  },

  async down(queryInterface) {
    const listings = await queryInterface.describeTable("market_listings");
    if (listings.id_instancia) {
      await queryInterface.removeColumn("market_listings", "id_instancia");
    }
    const instancias = await queryInterface.describeTable("character_equipment_instances");
    if (instancias.estado) {
      await queryInterface.removeColumn("character_equipment_instances", "estado");
    }
  },
};
