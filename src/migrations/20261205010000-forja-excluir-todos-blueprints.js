"use strict";

// Bug reportado: "FORJA - CORREÇÃO EXCLUA TODOS OS BLUEPRINTS
// EXISTENTES NA FORJA, ATIVOS OU INATIVOS".
//
// Até este ponto o Admin da Forja só sabia ATIVAR/DESATIVAR blueprints
// (adminForgeService.setAtivoBlueprintAdmin) — nunca existiu exclusão
// de verdade, nem no backend nem no frontend (ver
// adminForgeService.excluirBlueprintAdmin/excluirTodosBlueprintsAdmin,
// adicionados na mesma leva desta migration). Esta migration aplica a
// correção pedida de uma vez, em produção, sem depender de alguém
// clicar em "Excluir todos" manualmente no próximo deploy: remove TODO
// blueprint existente, ativo ou inativo.
//
// Seguro por construção: forge_blueprint_ingredients/
// forge_blueprint_results têm ON DELETE CASCADE em id_blueprint (ver
// migrations de criação da Forja), então o DELETE abaixo já limpa os
// dois sozinho. Nenhuma fila de fabricação em andamento
// (character_forge_queue) referencia blueprint por FK — ela guarda o
// resultado já sorteado em payload_resultado desde o INÍCIO do
// trabalho, nunca relê o blueprint pra coletar (§49) — e
// forge_operation_metrics.id_blueprint é só telemetria histórica sem
// FK. down() não recria os blueprints excluídos (não há como
// reconstruir dados apagados a partir do nome da migration) — quem
// reverter isto volta pra "sem blueprint nenhum", igual o up() deixou.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query('DELETE FROM "forge_blueprints";', { transaction });
    });
  },

  async down() {
    // Intencionalmente no-op — ver comentário acima.
  },
};
