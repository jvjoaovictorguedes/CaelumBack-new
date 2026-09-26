"use strict";

// Bug reportado: "Fila - As contas não estão sendo excluidas pelo
// painel de admin. Está dando erro interno do servidor."
//
// Causa raiz: quando os módulos do jogo foram sendo adicionados ao
// longo do projeto (habilidades, inventário, guilda, PvP ranqueado,
// mercado, Proezas Únicas...), a maioria das tabelas que referenciam
// Characters.id ganhou ON DELETE CASCADE — mas pelo menos 17 colunas em
// 12 tabelas ficaram com o padrão do Postgres (NO ACTION) ou RESTRICT.
// Qualquer personagem com UMA habilidade aprendida ou UM item no
// inventário (ou seja, praticamente toda conta real) já bloqueia
// character.destroy()/usuario.destroy() com
// SequelizeForeignKeyConstraintError — que o controller then reporta
// como "Erro interno do servidor" (500) sem detalhar a causa real.
// Reproduzido localmente (test/adminUserExclusao.test.js) antes desta
// migration: CharacterAbilities_id_personagem_fkey e
// character_inventory_id_personagem_fkey batiam a violação primeiro.
//
// Este fix ataca a causa raiz no nível do banco (não só no código de
// adminUserService/characterController) — corrige exclusão de conta
// TANTO pelo painel admin (bulkDeleteUsers) QUANTO pela exclusão de
// personagem do próprio jogador (characterController.deleteCharacter),
// que sofria exatamente do mesmo problema.
//
// Duas categorias de fix, escolhidas por tabela:
//
// 1) CASCADE — linha é "dona" do personagem (progresso, vínculo,
//    aparição temporária, ou histórico de partida/transação que só
//    envolve o personagem excluído). Remover a linha junto é o
//    comportamento correto e já é o padrão dominante no schema (~50
//    outras tabelas já fazem isso).
// 2) SET NULL — a linha é um registro de histórico/auditoria que faz
//    sentido sobreviver ao personagem (log de guilda, transação do
//    tesouro já com id_personagem nullable) OU cuja garantia de
//    integridade exige sobreviver (unique_feat_claims: o UNIQUE em
//    id_unique_feat é o que impede a Proeza de ser reclamada duas
//    vezes — CASCADE apagaria a claim e liberaria a Proeza pra outro
//    jogador reclamar de novo, quebrando a garantia "um vencedor pra
//    sempre". Por isso ganha SET NULL + coluna agora nullable; o
//    character_name_snapshot, já existente desde a Fase 1, existe
//    exatamente pra esse cenário).
const CASCADE = [
  { table: "CharacterAbilities", constraint: "CharacterAbilities_id_personagem_fkey", column: "id_personagem" },
  { table: "character_inventory", constraint: "character_inventory_id_personagem_fkey", column: "id_personagem" },
  { table: "GuildApplications", constraint: "GuildApplications_id_personagem_fkey", column: "id_personagem" },
  { table: "GuildContributions", constraint: "GuildContributions_id_personagem_fkey", column: "id_personagem" },
  { table: "GuildInvites", constraint: "GuildInvites_id_personagem_convidado_fkey", column: "id_personagem_convidado" },
  { table: "GuildInvites", constraint: "GuildInvites_id_personagem_convidante_fkey", column: "id_personagem_convidante" },
  { table: "character_pvp_seasons", constraint: "character_pvp_seasons_character_id_fkey", column: "character_id" },
  { table: "guild_member_mission_progress", constraint: "guild_member_mission_progress_id_personagem_fkey", column: "id_personagem" },
  { table: "ranked_matches", constraint: "ranked_matches_id_jogador1_fkey", column: "id_jogador1" },
  { table: "ranked_matches", constraint: "ranked_matches_id_jogador2_fkey", column: "id_jogador2" },
  { table: "ranked_matches", constraint: "ranked_matches_id_vencedor_fkey", column: "id_vencedor" },
  { table: "market_transactions", constraint: "market_transactions_id_personagem_comprador_fkey", column: "id_personagem_comprador" },
  { table: "market_transactions", constraint: "market_transactions_id_personagem_vendedor_fkey", column: "id_personagem_vendedor" },
];

// Colunas já allowNull:true no model — só troca a ação, sem tocar em
// NOT NULL nenhum.
const SET_NULL_JA_NULLABLE = [
  { table: "GuildLogs", constraint: "GuildLogs_id_personagem_alvo_fkey", column: "id_personagem_alvo" },
  { table: "GuildLogs", constraint: "GuildLogs_id_personagem_responsavel_fkey", column: "id_personagem_responsavel" },
  { table: "GuildTreasuryTransactions", constraint: "GuildTreasuryTransactions_id_personagem_fkey", column: "id_personagem" },
];

// Única coluna que precisa deixar de ser NOT NULL pra viabilizar SET
// NULL (ver explicação acima sobre por que esta é a exceção que não
// pode ser CASCADE).
const UNIQUE_FEAT_CLAIM = {
  table: "unique_feat_claims",
  constraint: "unique_feat_claims_id_personagem_fkey",
  column: "id_personagem",
  originalRule: "RESTRICT",
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const { table, constraint, column } of CASCADE) {
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" DROP CONSTRAINT "${constraint}";`,
          { transaction },
        );
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}") REFERENCES "Characters" (id) ON DELETE CASCADE;`,
          { transaction },
        );
      }

      for (const { table, constraint, column } of SET_NULL_JA_NULLABLE) {
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" DROP CONSTRAINT "${constraint}";`,
          { transaction },
        );
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}") REFERENCES "Characters" (id) ON DELETE SET NULL;`,
          { transaction },
        );
      }

      await queryInterface.sequelize.query(
        `ALTER TABLE "${UNIQUE_FEAT_CLAIM.table}" ALTER COLUMN "${UNIQUE_FEAT_CLAIM.column}" DROP NOT NULL;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "${UNIQUE_FEAT_CLAIM.table}" DROP CONSTRAINT "${UNIQUE_FEAT_CLAIM.constraint}";`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "${UNIQUE_FEAT_CLAIM.table}" ADD CONSTRAINT "${UNIQUE_FEAT_CLAIM.constraint}" FOREIGN KEY ("${UNIQUE_FEAT_CLAIM.column}") REFERENCES "Characters" (id) ON DELETE SET NULL;`,
        { transaction },
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const { table, constraint, column } of [...CASCADE, ...SET_NULL_JA_NULLABLE]) {
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" DROP CONSTRAINT "${constraint}";`,
          { transaction },
        );
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}") REFERENCES "Characters" (id);`,
          { transaction },
        );
      }

      await queryInterface.sequelize.query(
        `ALTER TABLE "${UNIQUE_FEAT_CLAIM.table}" DROP CONSTRAINT "${UNIQUE_FEAT_CLAIM.constraint}";`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "${UNIQUE_FEAT_CLAIM.table}" ADD CONSTRAINT "${UNIQUE_FEAT_CLAIM.constraint}" FOREIGN KEY ("${UNIQUE_FEAT_CLAIM.column}") REFERENCES "Characters" (id) ON DELETE ${UNIQUE_FEAT_CLAIM.originalRule};`,
        { transaction },
      );
      // NOT NULL de volta é seguro (down só roda em dev/rollback antes
      // de qualquer claim real ter ficado null em produção).
      await queryInterface.sequelize.query(
        `ALTER TABLE "${UNIQUE_FEAT_CLAIM.table}" ALTER COLUMN "${UNIQUE_FEAT_CLAIM.column}" SET NOT NULL;`,
        { transaction },
      );
    });
  },
};
