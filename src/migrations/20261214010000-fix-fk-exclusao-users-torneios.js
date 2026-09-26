"use strict";

// Continuação dos fixes de exclusão de conta (20261204010000 e
// 20261212010000, ambos focados em FKs pra Characters.id). O painel
// admin continuou reportando "Falha inesperada — restrição de chave
// estrangeira" mesmo depois desses dois — porque a causa dessa vez é
// FK pra "users".id (não "Characters".id: mensagens referenciam o
// usuário direto) e FK pra "tournament_participants".id (torneio
// referencia o participante, não o personagem).
//
// Descoberta em produção via mensagem de erro real do painel: contas
// #6/#7/#14/#15/#16/#20/#29 bloqueadas em "messages"."messages_id_
// remetente_fkey"/"messages_id_destinatario_fkey", e #19/#22/#40/#41/
// #42/#43 em "tournament_participants"."tournament_series_participant_
// a_id_fkey" (e variantes). O arquivo de migration de "messages" já
// pede ON DELETE CASCADE — a produção tinha drift (constraint real no
// banco não batia com o que a migration original pedia, provavelmente
// de antes dessa migration existir). Por isso o fix aqui é dinâmico:
// lê o catálogo do Postgres de verdade em vez de confiar no que os
// arquivos de migration dizem que "deveria" ser.
//
// Duas categorias, mesmo racional de sempre (linha DONA do usuário/
// participante -> CASCADE; registro de histórico/auditoria que deve
// sobreviver -> SET NULL):
//
// 1) Dinâmico pra "users" — CASCADE em tudo que referencia users.id e
//    ainda não é CASCADE/SET NULL, EXCETO Characters.id_usuario (essa
//    FK é proposital sem onDelete: adminUserService/characterController
//    já destroem o Character manualmente ANTES do User, com a trava de
//    guilda líder/fundador no meio — CASCADE aqui pularia essa trava).
// 2) Explícito — colunas de auditoria (quem criou/alterou) que devem
//    sobreviver à exclusão da conta: admin_action_logs.id_admin,
//    tournaments.created_by (ambas NOT NULL, precisam virar nullable
//    antes), game_settings.updated_by_admin_id e patch_notes.
//    created_by_admin_id (já nullable).
// 3) Explícito — tournament_series/tournament_matches referenciam
//    tournament_participants.id (não Characters.id direto). Um jogo já
//    resolvido (bracket) é histórico de torneio — excluir o participante
//    (porque a conta dele foi excluída) não deve apagar o jogo inteiro,
//    só esvaziar aquele slot. SET NULL (colunas já nullable).
// 4) Explícito — market_transactions.id_instancia (histórico de venda,
//    já nullable) sobrevive à exclusão da instância. market_listings.
//    id_instancia continua RESTRICT de propósito (protege contra apagar
//    um item ainda anunciado por engano em qualquer outro fluxo) — a
//    exclusão de conta lida com isso no código (adminUserService/
//    characterController cancelam os anúncios do personagem antes de
//    destruir a instância), não aqui.
const EXCLUIR_DO_SCAN_USERS = ["Characters"]; // Characters_id_usuario_fkey — proposital, ver comentário acima.

const SET_NULL_JA_NULLAVEL = [
  { table: "game_settings", constraint: "game_settings_updated_by_admin_id_fkey", column: "updated_by_admin_id", parent: "users" },
  { table: "patch_notes", constraint: "patch_notes_created_by_admin_id_fkey", column: "created_by_admin_id", parent: "users" },
  { table: "tournament_series", constraint: "tournament_series_participant_a_id_fkey", column: "participant_a_id", parent: "tournament_participants" },
  { table: "tournament_series", constraint: "tournament_series_participant_b_id_fkey", column: "participant_b_id", parent: "tournament_participants" },
  { table: "tournament_series", constraint: "tournament_series_winner_participant_id_fkey", column: "winner_participant_id", parent: "tournament_participants" },
  { table: "tournament_matches", constraint: "tournament_matches_winner_participant_id_fkey", column: "winner_participant_id", parent: "tournament_participants" },
  { table: "market_transactions", constraint: "market_transactions_id_instancia_fkey", column: "id_instancia", parent: "character_equipment_instances" },
];

const SET_NULL_PRECISA_FICAR_NULLAVEL = [
  { table: "admin_action_logs", constraint: "admin_action_logs_id_admin_fkey", column: "id_admin", parent: "users" },
  { table: "tournaments", constraint: "tournaments_created_by_fkey", column: "created_by", parent: "users" },
];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // --- 1) Dinâmico: qualquer FK pra "users" ainda fora de CASCADE/SET NULL ---
      const [constraintsUsers] = await queryInterface.sequelize.query(
        `
        SELECT con.conname AS constraint_name, rel.relname AS table_name, pg_get_constraintdef(con.oid) AS definition
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_class frel ON frel.oid = con.confrelid
        WHERE con.contype = 'f'
          AND frel.relname = 'users'
          AND con.confdeltype NOT IN ('c', 'n')
          AND rel.relname NOT IN (${EXCLUIR_DO_SCAN_USERS.map((t) => `'${t}'`).join(",")});
      `,
        { transaction },
      );

      // Nunca CASCADE nas colunas de auditoria/histórico — mesmo que o
      // scan dinâmico as encontre, elas seguem pra SET NULL nos passos
      // 2/3 abaixo. Remove daqui pra não aplicar CASCADE por cima e
      // reverter logo em seguida (resultado final seria o mesmo, mas a
      // intenção do código ficaria errada).
      const nomesSetNull = new Set([...SET_NULL_JA_NULLAVEL, ...SET_NULL_PRECISA_FICAR_NULLAVEL].map((c) => c.constraint));
      const paraCascade = constraintsUsers.filter((c) => !nomesSetNull.has(c.constraint_name));

      console.log(`[migration] CASCADE em ${paraCascade.length} FK(s) pra "users" sem CASCADE/SET NULL:`, paraCascade.map((c) => `${c.table_name}.${c.constraint_name}`).join(", ") || "(nenhuma)");

      for (const { constraint_name: constraintName, table_name: tableName, definition } of paraCascade) {
        const novaDefinicao = /ON DELETE \w+/i.test(definition) ? definition.replace(/ON DELETE \w+/i, "ON DELETE CASCADE") : `${definition} ON DELETE CASCADE`;
        await queryInterface.sequelize.query(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${constraintName}";`, { transaction });
        await queryInterface.sequelize.query(`ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" ${novaDefinicao};`, { transaction });
      }

      // --- 2) SET NULL em colunas já nullable (torneios, mercado, config) ---
      for (const { table, constraint, column, parent } of SET_NULL_JA_NULLAVEL) {
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint}";`, { transaction });
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}") REFERENCES "${parent}" (id) ON DELETE SET NULL;`,
          { transaction },
        );
      }

      // --- 3) SET NULL em colunas que precisam virar nullable primeiro ---
      for (const { table, constraint, column, parent } of SET_NULL_PRECISA_FICAR_NULLAVEL) {
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP NOT NULL;`, { transaction });
        await queryInterface.sequelize.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint}";`, { transaction });
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}") REFERENCES "${parent}" (id) ON DELETE SET NULL;`,
          { transaction },
        );
      }
    });
  },

  // Down proposital sem-op — mesmo racional de 20261212010000: reverter
  // reintroduz o bug, e não há como saber a definição original exata de
  // cada constraint (algumas vieram sem onDelete, sem constraint nomeada
  // igual em todo ambiente). Restaurar de um backup de schema é mais
  // seguro do que adivinhar aqui.
  async down() {
    console.log("[migration] down() é no-op — ver comentário no arquivo pra detalhes.");
  },
};
