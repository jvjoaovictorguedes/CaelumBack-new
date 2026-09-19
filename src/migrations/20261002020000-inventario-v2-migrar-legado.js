"use strict";

// Migração dos equipamentos legados (Inventário v2 §13) — pra cada
// CharacterInventory de item equipável com quantidade N, cria N
// CharacterEquipmentInstance ANTES de tocar no stack. Vincula uma
// instância recém-criada a cada slot que já usava esse id_item sem
// id_instancia (equipagem legada). Só remove o stack depois de tudo
// confirmado — nunca apaga primeiro. Validado por contagem
// (unidades no stack == instâncias criadas) antes de prosseguir.
const TIPOS_EQUIPAVEIS = ["Arma", "Armadura", "Capacete", "Escudo", "Acessorio1", "Acessorio2"];

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;

    const [stacks] = await sequelize.query(
      `SELECT ci.id_personagem_inventario, ci.id_personagem, ci.id_item, ci.quantidade
       FROM character_inventory ci
       JOIN "Items" i ON i.id = ci.id_item
       WHERE i.tipo_item IN (:tipos) AND ci.quantidade > 0;`,
      { replacements: { tipos: TIPOS_EQUIPAVEIS } },
    );

    console.log(`[migration] ${stacks.length} stack(s) de equipamento legado encontrado(s) pra migrar.`);

    let totalUnidadesAntes = 0;
    let totalInstanciasCriadas = 0;

    for (const stack of stacks) {
      totalUnidadesAntes += stack.quantidade;

      const [slotsEquipados] = await sequelize.query(
        `SELECT slot FROM character_equipment
         WHERE id_personagem = :idPersonagem AND id_item = :idItem AND id_instancia IS NULL;`,
        { replacements: { idPersonagem: stack.id_personagem, idItem: stack.id_item } },
      );

      if (slotsEquipados.length > stack.quantidade) {
        // Nunca deveria acontecer (o equipItem legado já exige
        // quantidade suficiente pra ocupar N slots), mas aborta alto e
        // claro em vez de vincular slot a menos.
        throw new Error(
          `Inconsistência: personagem ${stack.id_personagem} tem item ${stack.id_item} em ` +
            `${slotsEquipados.length} slot(s) mas só ${stack.quantidade} unidade(s) no inventário.`,
        );
      }

      const idsCriados = [];
      for (let i = 0; i < stack.quantidade; i++) {
        const [[nova]] = await sequelize.query(
          `INSERT INTO character_equipment_instances
             (id_personagem, id_item, refinamento, equipada, estado, "createdAt", "updatedAt")
           VALUES (:idPersonagem, :idItem, 0, false, 'Inventario', now(), now())
           RETURNING id;`,
          { replacements: { idPersonagem: stack.id_personagem, idItem: stack.id_item } },
        );
        idsCriados.push(nova.id);
      }
      totalInstanciasCriadas += idsCriados.length;

      for (const { slot } of slotsEquipados) {
        const idInstancia = idsCriados.shift();
        await sequelize.query(
          `UPDATE character_equipment SET id_instancia = :idInstancia
           WHERE id_personagem = :idPersonagem AND slot = :slot;`,
          { replacements: { idInstancia, idPersonagem: stack.id_personagem, slot } },
        );
        await sequelize.query(
          `UPDATE character_equipment_instances SET estado = 'Equipada', equipada = true WHERE id = :idInstancia;`,
          { replacements: { idInstancia } },
        );
      }

      // NUNCA apaga o stack antes daqui — só depois que instâncias e
      // vínculos de slot já foram criados/gravados com sucesso.
      await sequelize.query(
        `DELETE FROM character_inventory WHERE id_personagem_inventario = :id;`,
        { replacements: { id: stack.id_personagem_inventario } },
      );
    }

    if (totalInstanciasCriadas !== totalUnidadesAntes) {
      throw new Error(
        `Migração inconsistente: ${totalUnidadesAntes} unidade(s) esperada(s), ${totalInstanciasCriadas} instância(s) criada(s).`,
      );
    }

    console.log(
      `[migration] OK — ${totalInstanciasCriadas} instância(s) de equipamento criada(s) a partir de stacks legados (contagem validada).`,
    );
  },

  async down() {
    // Irreversível de propósito (mesma postura já registrada nesta base
    // pra migrations equivalentes) — juntar de volta instâncias com
    // refinamentos possivelmente DIFERENTES numa única stack sem
    // refinamento perderia informação de verdade do jogador.
  },
};
