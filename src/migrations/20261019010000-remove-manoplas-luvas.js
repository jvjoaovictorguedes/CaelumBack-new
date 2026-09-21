"use strict";

// Remove o slot de "Mãos" como peça de armadura própria — pedido do
// jogador: uma mão já segura a arma, a outra o escudo, não sobra mão
// livre pra uma luva/manopla separada valer a pena existir como slot.
// NUNCA mexe em Escudo: ArmorProperties.slot_equipamento="Maos" nos
// escudos é só um valor de placeholder histórico (o ENUM não tem um
// valor dedicado pra escudo — ver comentário em
// scripts/reseed-itens-producao.js), a validação de equipar já não lê
// esse campo pra Escudo (equipmentInstanceService.resolverSlot manda
// Escudo sempre pra ArmaSecundaria, fixo). Só os 5 itens de
// Armadura/Manopla/Luva abaixo saem do jogo.
const NOMES_REMOVIDOS = [
  "Luvas de Couro",
  "Manoplas de Ferro",
  "Luvas Élficas",
  "Manoplas Sombrias",
  "Manoplas Dracônicas",
];

module.exports = {
  async up(queryInterface) {
    const [itens] = await queryInterface.sequelize.query(
      `SELECT id, nome FROM "Items" WHERE nome IN (:nomes) AND tipo_item = 'Armadura';`,
      { replacements: { nomes: NOMES_REMOVIDOS } },
    );
    if (itens.length === 0) {
      console.log("[migration] Nenhum item de Mãos encontrado — já removido ou nunca existiu.");
      return;
    }
    const ids = itens.map((i) => i.id);
    console.log(`[migration] Removendo ${itens.length} itens de Mãos:`, itens.map((i) => i.nome).join(", "));

    // Auditoria antes de apagar — aborta se achar algo que exigiria
    // tratamento manual (nada disso era esperado, ver investigação
    // prévia: nenhum jogador tinha equipado, anunciado ou uma receita
    // de Forja usando esses itens).
    const [equipado] = await queryInterface.sequelize.query(
      `SELECT ce.id_personagem, ce.slot FROM character_equipment ce
       JOIN character_equipment_instances cei ON cei.id = ce.id_instancia
       WHERE cei.id_item IN (:ids);`,
      { replacements: { ids } },
    );
    if (equipado.length > 0) {
      throw new Error(
        `Existem ${equipado.length} personagem(ns) com item de Mãos EQUIPADO agora — aborta pra não remover algo em uso: ${JSON.stringify(equipado)}`,
      );
    }
    const [anunciado] = await queryInterface.sequelize.query(
      `SELECT ml.id FROM market_listings ml
       JOIN character_equipment_instances cei ON cei.id = ml.id_instancia
       WHERE cei.id_item IN (:ids) AND ml.status = 'Ativo';`,
      { replacements: { ids } },
    );
    if (anunciado.length > 0) {
      throw new Error(`Existem ${anunciado.length} anúncio(s) ATIVO(s) no Mercado com item de Mãos — aborta.`);
    }

    // Instâncias existentes (todas no inventário de algum jogador, sem
    // estar equipadas/anunciadas — já confirmado acima) somem junto com
    // o item, igual descontinuar qualquer outro item do catálogo.
    await queryInterface.sequelize.query(`DELETE FROM character_equipment_instances WHERE id_item IN (:ids);`, {
      replacements: { ids },
    });
    await queryInterface.sequelize.query(`DELETE FROM character_inventory WHERE id_item IN (:ids);`, {
      replacements: { ids },
    });
    await queryInterface.sequelize.query(`DELETE FROM forge_blueprint_results WHERE id_item IN (:ids);`, {
      replacements: { ids },
    });
    await queryInterface.sequelize.query(`DELETE FROM "ArmorProperties" WHERE id_item IN (:ids);`, {
      replacements: { ids },
    });
    await queryInterface.sequelize.query(`DELETE FROM "Items" WHERE id IN (:ids);`, { replacements: { ids } });

    console.log(`[migration] ${itens.length} itens de Mãos removidos do catálogo.`);
  },

  // Intencionalmente sem down() — descontinuar conteúdo não é uma
  // operação que se desfaz reinserindo dados sintéticos (mesmo padrão
  // já usado em remoções anteriores de catálogo neste projeto).
  async down() {
    console.log("[migration] down() é um no-op — remoção de catálogo não é revertida automaticamente.");
  },
};
