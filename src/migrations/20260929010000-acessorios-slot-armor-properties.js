"use strict";

// ArmorProperties.slot_equipamento só aceitava Cabeca/Torso/Maos/Pes —
// pra acessórios (Acessorio1/Acessorio2) darem bônus de atributo de
// verdade, reaproveitando o mesmo sistema (equipmentBonusService só
// olha se o item TEM armorProperties, não o slot), o enum precisa
// aceitar os dois valores novos. ALTER TYPE ... ADD VALUE não pode
// rodar dentro de uma transaction em versões antigas do Postgres — cada
// ADD VALUE é seu próprio comando, fora de transaction explícita.
module.exports = {
  async up(queryInterface) {
    const [jaTemAcessorio1] = await queryInterface.sequelize.query(
      `SELECT 1 FROM pg_enum WHERE enumlabel = 'Acessorio1'
         AND enumtypid = 'public."enum_ArmorProperties_slot_equipamento"'::regtype;`,
    );
    if (jaTemAcessorio1.length === 0) {
      await queryInterface.sequelize.query(
        `ALTER TYPE "enum_ArmorProperties_slot_equipamento" ADD VALUE 'Acessorio1';`,
      );
    } else {
      console.log("[migration] enum já tem Acessorio1 — pulando.");
    }

    const [jaTemAcessorio2] = await queryInterface.sequelize.query(
      `SELECT 1 FROM pg_enum WHERE enumlabel = 'Acessorio2'
         AND enumtypid = 'public."enum_ArmorProperties_slot_equipamento"'::regtype;`,
    );
    if (jaTemAcessorio2.length === 0) {
      await queryInterface.sequelize.query(
        `ALTER TYPE "enum_ArmorProperties_slot_equipamento" ADD VALUE 'Acessorio2';`,
      );
    } else {
      console.log("[migration] enum já tem Acessorio2 — pulando.");
    }
  },

  // Postgres não permite remover valor de enum (ALTER TYPE ... DROP
  // VALUE não existe) — down só documenta que não reverte.
  async down() {
    console.log(
      "[migration] down não remove Acessorio1/Acessorio2 do enum — Postgres não suporta DROP VALUE.",
    );
  },
};
