"use strict";

// Reformulação "Item Único por Equipamento, Raridade por Instância" —
// fase BACKFILL (§16.3/§17/§18.2). Só popula os campos novos (Expand,
// migration 20261207010000) a partir do estado atual; nunca decide
// balanceamento novo, é uma FOTO da migração (§18.2 "não confundir
// backfill com novo design").
//
// 1. CharacterEquipmentInstance.raridade <- Item.raridade da própria
//    instância (lossless: cada instância já aponta pro Item exato da
//    raridade que ela é).
// 2. ForgeBlueprint.id_item_resultado <- Item da variante Comum em
//    ForgeBlueprintResult (§17: "Comum como canônico, preservar seu ID
//    e propriedades-base"). Blueprint sem variante Comum cadastrada
//    fica de fora de propósito (nunca adivinha) — o admin precisa
//    configurar id_item_resultado manualmente pra esses.
// 3. Colapso de variantes: pra cada (blueprint, qualidade != Comum)
//    cujo blueprint já tem canônico, reescreve toda referência à Item
//    variante (CharacterEquipmentInstance.id_item, EquipmentSetPiece.
//    item_id, payload_resultado pendente na fila da Forja) pro Item
//    canônico — a raridade da cópia já foi preservada no passo 1 ANTES
//    de sobrescrever id_item, então nenhuma informação se perde.
//
// ForgeBlueprintResult e as Items variantes continuam existindo depois
// deste backfill (só são removidos no Contract) — nada aqui é
// destrutivo.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Cast via texto: "Items".raridade e character_equipment_instances.
      // raridade são dois ENUMs Postgres DISTINTOS (mesmos valores, tipos
      // diferentes) — Postgres não converte implicitamente entre eles.
      await queryInterface.sequelize.query(
        `UPDATE character_equipment_instances cei
         SET raridade = i.raridade::text::"enum_character_equipment_instances_raridade"
         FROM "Items" i
         WHERE cei.id_item = i.id AND cei.raridade IS NULL;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `UPDATE forge_blueprints fb
         SET id_item_resultado = fbr.id_item
         FROM forge_blueprint_results fbr
         WHERE fbr.id_blueprint = fb.id AND fbr.qualidade = 'Comum' AND fb.id_item_resultado IS NULL;`,
        { transaction },
      );

      const [variantes] = await queryInterface.sequelize.query(
        `SELECT fbr.id_item AS variante_id, fb.id_item_resultado AS canonico_id
         FROM forge_blueprint_results fbr
         JOIN forge_blueprints fb ON fb.id = fbr.id_blueprint
         WHERE fb.id_item_resultado IS NOT NULL AND fbr.id_item <> fb.id_item_resultado;`,
        { transaction },
      );

      for (const { variante_id, canonico_id } of variantes) {
        await queryInterface.sequelize.query(
          `UPDATE character_equipment_instances SET id_item = :canonico WHERE id_item = :variante;`,
          { replacements: { canonico: canonico_id, variante: variante_id }, transaction },
        );
        await queryInterface.sequelize.query(
          `UPDATE equipment_set_pieces SET item_id = :canonico WHERE item_id = :variante;`,
          { replacements: { canonico: canonico_id, variante: variante_id }, transaction },
        );
        // Fila da Forja: trabalho de Fabricação ainda não coletado que
        // aponta pra variante antiga (payload_resultado JSON) precisa
        // apontar pro canônico, senão a coleta pós-deploy criaria uma
        // instância da variante que o Switch não reconhece mais.
        await queryInterface.sequelize.query(
          `UPDATE character_forge_queue
           SET payload_resultado = jsonb_set(payload_resultado, '{id_item}', to_jsonb(:canonico::int))
           WHERE tipo_acao = 'Fabricacao' AND (payload_resultado->>'id_item')::int = :variante;`,
          { replacements: { canonico: canonico_id, variante: variante_id }, transaction },
        );
      }
    });
  },

  async down(queryInterface) {
    // Backfill é uma foto de migração (§18.2) — down() não tenta
    // reverter o colapso de Items (perderia a distinção de qual
    // instância era de qual variante); só limpa os campos novos que a
    // migration Expand introduziu, mesmo espírito do down() de lá.
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`UPDATE character_equipment_instances SET raridade = NULL;`, { transaction });
      await queryInterface.sequelize.query(`UPDATE forge_blueprints SET id_item_resultado = NULL;`, { transaction });
    });
  },
};
