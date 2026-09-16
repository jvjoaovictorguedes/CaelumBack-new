"use strict";

const SLOT_COLUMNS = [
  ["slot_cabeca_item_id", "Cabeca"],
  ["slot_torso_item_id", "Torso"],
  ["slot_maos_item_id", "Maos"],
  ["slot_pes_item_id", "Pes"],
  ["slot_arma_principal_item_id", "ArmaPrincipal"],
  ["slot_arma_secundaria_item_id", "ArmaSecundaria"],
  ["slot_acessorio1_item_id", "Acessorio1"],
  ["slot_acessorio2_item_id", "Acessorio2"],
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const existingTables = await queryInterface.showAllTables();
    if (existingTables.includes("character_equipment")) {
      console.log('[migration] Tabela "character_equipment" já existe — pulando criação.');
      return;
    }

    // Num banco criado do zero pela migration baseline de Characters, as
    // colunas antigas de slot (slot_cabeca_item_id etc.) nunca existiram —
    // só existem em bancos que rodaram sync() antes desse refactor. Detecta
    // isso pra não tentar copiar/remover algo que não está lá.
    const charactersDescription = await queryInterface.describeTable("Characters");
    const hasLegacySlotColumns = SLOT_COLUMNS.some(
      ([column]) => column in charactersDescription,
    );

    // Tudo numa transação: ou migra tudo, ou não muda nada.
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "character_equipment",
        {
          id_personagem: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            references: { model: "Characters", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          slot: {
            type: Sequelize.ENUM(
              "Cabeca",
              "Torso",
              "Maos",
              "Pes",
              "ArmaPrincipal",
              "ArmaSecundaria",
              "Acessorio1",
              "Acessorio2",
            ),
            allowNull: false,
            primaryKey: true,
          },
          id_item: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "Items", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
        },
        { transaction },
      );

      if (!hasLegacySlotColumns) {
        console.log(
          '[migration] "Characters" já não tem as colunas antigas de slot — nada pra copiar/remover.',
        );
        return;
      }

      // 1) Copia os dados existentes das colunas de slot pra tabela nova.
      for (const [column, slot] of SLOT_COLUMNS) {
        if (!(column in charactersDescription)) continue;
        await queryInterface.sequelize.query(
          `
            INSERT INTO "character_equipment" (id_personagem, slot, id_item)
            SELECT id, '${slot}', "${column}"
            FROM "Characters"
            WHERE "${column}" IS NOT NULL;
          `,
          { transaction },
        );
      }

      // 2) Só depois de copiar, remove as colunas antigas.
      for (const [column] of SLOT_COLUMNS) {
        if (!(column in charactersDescription)) continue;
        await queryInterface.removeColumn("Characters", column, {
          transaction,
        });
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // 1) Recria as colunas antigas.
      for (const [column] of SLOT_COLUMNS) {
        await queryInterface.addColumn(
          "Characters",
          column,
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: "Items", key: "id" },
          },
          { transaction },
        );
      }

      // 2) Copia os dados de volta antes de apagar a tabela nova.
      for (const [column, slot] of SLOT_COLUMNS) {
        await queryInterface.sequelize.query(
          `
            UPDATE "Characters" c
            SET "${column}" = ce.id_item
            FROM "character_equipment" ce
            WHERE ce.id_personagem = c.id AND ce.slot = '${slot}';
          `,
          { transaction },
        );
      }

      await queryInterface.dropTable("character_equipment", { transaction });
    });

    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_character_equipment_slot";',
    );
  },
};
