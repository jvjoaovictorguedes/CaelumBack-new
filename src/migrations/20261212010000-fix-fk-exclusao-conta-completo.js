"use strict";

// Continuação do fix anterior (20261204010000-fix-fk-exclusao-conta.js).
// Aquele fix corrigiu 12 tabelas escolhidas manualmente, mas a exclusão
// de conta continuou batendo "Erro interno do servidor" em produção —
// auditoria completa do schema (script ad-hoc lendo TODAS as migrations
// que referenciam "Characters".id) mostrou que sobraram mais de 20
// tabelas criadas em módulos posteriores (Perfil do Jogador, Forja V3,
// Alquimia, Torneios, Ranqueado V2, PvP casual legado, Boss Global,
// Expedições, Mercado, Ofício/Crafting, Evoluções, Guildas — portas de
// Rank) ainda com o padrão do Postgres (NO ACTION) na FK pra
// Characters.id. Cada uma dessas é dona de dados praticamente
// universais (todo personagem tem perfil, todo mundo já checou status
// de PvP, quem forja tem progresso de forja etc.), então a exclusão
// continuava travando na próxima tabela da lista assim que a primeira
// fosse corrigida.
//
// Em vez de continuar caçando tabela por tabela manualmente (raiz do
// problema anterior: a lista manual ficou desatualizada assim que um
// novo módulo foi adicionado), este fix é dinâmico: lê direto do
// catálogo do Postgres (pg_constraint) TODA foreign key que aponta pra
// "Characters"(id) e ainda não é CASCADE nem SET NULL, e converte pra
// CASCADE — o padrão dominante do schema pra "linha que pertence ao
// personagem". As exceções que precisam sobreviver ao personagem
// (GuildLogs, GuildTreasuryTransactions, unique_feat_claims) já foram
// convertidas pra SET NULL pelo fix anterior, então o filtro
// "confdeltype não é CASCADE nem SET NULL" já as exclui automaticamente
// — nenhuma lista de exceção pra manter aqui.
//
// Exceção deliberada: "Guilds".id_fundador/id_lider. Testado localmente
// (banco na mesma versão de schema) — são as ÚNICAS duas FKs que ainda
// sobram fora de CASCADE/SET NULL, e é assim de propósito:
// adminUserService/characterController já barram a exclusão de um
// personagem líder/fundador de guilda ANTES de chegar no destroy() (veja
// excluirUmUsuario). Se essa migration convertesse pra CASCADE, excluir
// a conta de um fundador apagaria a guilda inteira em cascata — o
// oposto do comportamento correto (exigir transferir liderança antes).
module.exports = {
  async up(queryInterface) {
    const [constraints] = await queryInterface.sequelize.query(`
      SELECT
        con.conname AS constraint_name,
        rel.relname AS table_name,
        pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_class frel ON frel.oid = con.confrelid
      WHERE con.contype = 'f'
        AND frel.relname = 'Characters'
        AND rel.relname <> 'Guilds'
        AND con.confdeltype NOT IN ('c', 'n');
    `);

    if (constraints.length === 0) {
      console.log('[migration] Nenhuma FK pendente pra "Characters" fora de CASCADE/SET NULL — nada a fazer.');
      return;
    }

    console.log(
      `[migration] Corrigindo ${constraints.length} FK(s) pra "Characters"(id) sem CASCADE:`,
      constraints.map((c) => `${c.table_name}.${c.constraint_name}`).join(", "),
    );

    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const { constraint_name: constraintName, table_name: tableName, definition } of constraints) {
        // pg_get_constraintdef só imprime "ON DELETE ..." quando não é o
        // padrão (NO ACTION) — troca se já tiver uma cláusula explícita
        // (ex: RESTRICT), ou acrescenta se estiver implícita (ausente).
        const novaDefinicao = /ON DELETE \w+/i.test(definition)
          ? definition.replace(/ON DELETE \w+/i, "ON DELETE CASCADE")
          : `${definition} ON DELETE CASCADE`;

        await queryInterface.sequelize.query(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${constraintName}";`, {
          transaction,
        });
        await queryInterface.sequelize.query(
          `ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" ${novaDefinicao};`,
          { transaction },
        );
      }
    });
  },

  // Down proposital sem-op: reverter pra NO ACTION/RESTRICT reintroduz
  // exatamente o bug que este fix resolve, e não há como saber com
  // segurança qual definição original cada constraint tinha (algumas
  // vieram sem onDelete nenhum, outras com RESTRICT explícito). Se for
  // preciso reverter de verdade, restaurar a partir de um backup do
  // schema é mais seguro do que adivinhar aqui.
  async down() {
    console.log("[migration] down() é no-op — ver comentário no arquivo pra detalhes.");
  },
};
