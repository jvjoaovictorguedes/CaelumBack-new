"use strict";

// Bug real reportado: o admin de Pesca pedia pra digitar um
// id_world_connection (WorldMapConnection) na mão, sem NENHUM lugar no
// painel pra criar uma conexão nova — muito menos garantindo que fosse
// do tipo certo ("RotaMaritima") e ativa. Resultado: rota criada com
// sucesso no admin, mas "Rota inválida." na hora de viajar de verdade
// (fishingNavigationService.viajar confere tipo/ativo da conexão).
// adminFishingService.createAdminMarineRoute agora cria essa conexão
// técnica sozinho (nunca mais pede id pro admin) — este backfill só
// repara marine_routes que já ficaram apontando pra uma conexão
// inexistente/errada/inativa ANTES desse fix, sem exigir recriar a
// rota manualmente.
module.exports = {
  async up(queryInterface) {
    const [quebradas] = await queryInterface.sequelize.query(`
      SELECT mr.id AS id_rota, fp.id_world_node AS id_world_node
      FROM marine_routes mr
      LEFT JOIN world_map_connections wmc ON wmc.id = mr.id_world_connection
      LEFT JOIN fishing_ports fp ON fp.id = mr.id_port_origem
      WHERE wmc.id IS NULL OR wmc.tipo <> 'RotaMaritima' OR wmc.ativo IS NOT TRUE;
    `);

    for (const linha of quebradas) {
      const idNode = linha.id_world_node ?? 1;
      const [inserida] = await queryInterface.sequelize.query(
        `INSERT INTO world_map_connections (id_origem, id_destino, tipo, ordem, ativo, "createdAt", "updatedAt")
         VALUES (:idNode, :idNode, 'RotaMaritima', 0, true, now(), now())
         RETURNING id;`,
        { replacements: { idNode } },
      );
      const idConexaoNova = inserida[0].id;
      await queryInterface.sequelize.query(
        `UPDATE marine_routes SET id_world_connection = :idConexaoNova, "updatedAt" = now() WHERE id = :idRota;`,
        { replacements: { idConexaoNova, idRota: linha.id_rota } },
      );
    }
  },

  async down() {
    // Não reverte de propósito — não dá pra saber depois quais
    // conexões eram as "erradas" originais (podem já ter sido
    // apagadas/reaproveitadas), e apontar de volta pra elas recriaria
    // exatamente o bug que este backfill corrige.
  },
};
