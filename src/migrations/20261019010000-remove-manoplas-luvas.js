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
//
// Limpa TUDO relacionado a esses itens sozinha — nunca aborta pedindo
// intervenção manual: desequipa quem estiver com um equipado, cancela
// qualquer anúncio ativo no Mercado devolvendo o slot pra null, e só
// depois apaga instância/estoque/receita/propriedades/item. Rodar de
// novo depois de já ter rodado é sempre seguro (idempotente): se os 5
// itens já não existirem mais em "Items", não há mais nada pra
// desequipar/cancelar/apagar.
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

    // Desequipa automaticamente quem estiver com um desses itens
    // equipado agora — o slot "Maos" está sendo descontinuado de
    // qualquer jeito, então o personagem simplesmente fica sem nada
    // nesse slot (igual desequipar manualmente antes de vender/
    // descartar o item).
    const [desequipados] = await queryInterface.sequelize.query(
      `DELETE FROM character_equipment ce
       USING character_equipment_instances cei
       WHERE cei.id = ce.id_instancia AND cei.id_item IN (:ids)
       RETURNING ce.id_personagem;`,
      { replacements: { ids } },
    );
    if (desequipados.length > 0) {
      console.log(`[migration] Desequipado automaticamente de ${desequipados.length} personagem(ns):`, desequipados.map((d) => d.id_personagem).join(", "));
    }

    // Cancela qualquer anúncio ativo no Mercado envolvendo esses itens
    // — a instância vai deixar de existir, então o anúncio não pode
    // continuar de pé. Ninguém perde ouro (a compra não aconteceu).
    const [cancelados] = await queryInterface.sequelize.query(
      `UPDATE market_listings SET status = 'Cancelado'
       WHERE id_instancia IN (SELECT id FROM character_equipment_instances WHERE id_item IN (:ids))
         AND status = 'Ativo'
       RETURNING id;`,
      { replacements: { ids } },
    );
    if (cancelados.length > 0) {
      console.log(`[migration] ${cancelados.length} anúncio(s) ativo(s) no Mercado cancelado(s).`);
    }
    await queryInterface.sequelize.query(
      `UPDATE market_listings SET id_instancia = NULL
       WHERE id_instancia IN (SELECT id FROM character_equipment_instances WHERE id_item IN (:ids));`,
      { replacements: { ids } },
    );

    // Instâncias existentes (agora garantidamente sem estar equipadas
    // nem anunciadas) somem junto com o item, igual descontinuar
    // qualquer outro item do catálogo.
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
