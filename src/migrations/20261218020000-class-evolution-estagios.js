"use strict";

// Classes V2 (§5/§6) — Evolução de Classe deixa de ser um único FK em
// Character (id_evolucao_classe, sem suporte a um segundo estágio) e
// passa a ser uma árvore por estágios (Lv.40 = estágio 1, Lv.100 =
// estágio 2) com histórico próprio em character_class_evolutions.
//
// Regra de migração explícita da spec: NÃO criar id_evolucao_classe_2.
// Character.id_evolucao_classe é mantido (Expand) só como ponteiro de
// leitura legado/compatibilidade; a fonte de verdade passa a ser
// CharacterClassEvolution.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("class_evolution_paths", "slug", {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn("class_evolution_paths", "estagio", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });
    await queryInterface.addColumn("class_evolution_paths", "id_evolucao_pai", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "class_evolution_paths", key: "id" },
    });
    await queryInterface.addColumn("class_evolution_paths", "ativo", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    await queryInterface.addColumn("class_evolution_paths", "icone_url", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    // Backfill (§25.3): todo caminho já existente é, por definição, um
    // caminho de estágio 1 sem pai — é o único tipo que existia antes da
    // V2. slug gerado a partir do nome (mesmo padrão informal usado nos
    // outros slugs do projeto), único por causa da constraint abaixo.
    await queryInterface.sequelize.query(`
      UPDATE class_evolution_paths
      SET slug = lower(regexp_replace(regexp_replace(unaccent(nome), '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')) || '-' || id
      WHERE slug IS NULL;
    `).catch(async () => {
      // unaccent pode não estar habilitada como extensão — fallback sem
      // remover acentos, ainda determinístico e único.
      await queryInterface.sequelize.query(`
        UPDATE class_evolution_paths
        SET slug = lower(regexp_replace(regexp_replace(nome, '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')) || '-' || id
        WHERE slug IS NULL;
      `);
    });

    await queryInterface.changeColumn("class_evolution_paths", "slug", {
      type: Sequelize.STRING(100),
      allowNull: false,
    });
    await queryInterface.addIndex("class_evolution_paths", ["slug"], {
      unique: true,
      name: "class_evolution_paths_slug_unique",
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE class_evolution_paths ADD CONSTRAINT class_evolution_paths_estagio_positivo CHECK (estagio >= 1);
    `);

    // Tabela histórica de progressão — substitui o FK único de Character
    // (§6). Um personagem tem no máximo UMA evolução por estágio E não
    // pode adquirir o mesmo caminho duas vezes (defesa redundante, já
    // coberta pela primeira constraint na prática, mas explícita mesmo
    // assim porque são invariantes semanticamente diferentes).
    await queryInterface.createTable("character_class_evolutions", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_personagem: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Characters", key: "id" },
        onDelete: "CASCADE",
      },
      id_evolucao: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "class_evolution_paths", key: "id" },
      },
      estagio: { type: Sequelize.INTEGER, allowNull: false },
      // §7.1 — risco crítico de migração: personagens que já evoluíram
      // na V1 tiveram o bônus somado diretamente em Character e não há
      // como provar com certeza qual foi o valor exato aplicado (pode
      // ter mudado por migrations posteriores). legacy_bonus_materializado
      // = true significa "o bônus deste registro já está embutido nos
      // atributos-base do personagem, NÃO aplicar dinamicamente de novo"
      // — só backfill grava true; toda evolução nova (Switch em diante)
      // é sempre false e resolvida sob demanda.
      legacy_bonus_materializado: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      legacy_bonus_snapshot: { type: Sequelize.JSONB, allowNull: true },
      adquirida_em: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("character_class_evolutions", ["id_personagem", "estagio"], {
      unique: true,
      name: "character_class_evolutions_personagem_estagio_unique",
    });
    await queryInterface.addIndex("character_class_evolutions", ["id_personagem", "id_evolucao"], {
      unique: true,
      name: "character_class_evolutions_personagem_evolucao_unique",
    });
    await queryInterface.sequelize.query(`
      ALTER TABLE character_class_evolutions ADD CONSTRAINT character_class_evolutions_estagio_positivo CHECK (estagio >= 1);
    `);

    // Backfill dos personagens já evoluídos na V1 (§25.3/§7.1): cria o
    // registro histórico com legacy_bonus_materializado=true — o bônus
    // já está nos atributos, o resolver dinâmico (classEvolutionBonusService)
    // sabe ignorar essas linhas. Nada é subtraído de Character; nenhum
    // ponto legítimo do jogador é tocado.
    await queryInterface.sequelize.query(`
      INSERT INTO character_class_evolutions (id_personagem, id_evolucao, estagio, legacy_bonus_materializado, adquirida_em)
      SELECT c.id, c.id_evolucao_classe, 1, true, NOW()
      FROM "Characters" c
      WHERE c.id_evolucao_classe IS NOT NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("character_class_evolutions");
    await queryInterface.sequelize.query(`
      ALTER TABLE class_evolution_paths DROP CONSTRAINT IF EXISTS class_evolution_paths_estagio_positivo;
    `);
    await queryInterface.removeIndex("class_evolution_paths", "class_evolution_paths_slug_unique");
    await queryInterface.removeColumn("class_evolution_paths", "icone_url");
    await queryInterface.removeColumn("class_evolution_paths", "ativo");
    await queryInterface.removeColumn("class_evolution_paths", "id_evolucao_pai");
    await queryInterface.removeColumn("class_evolution_paths", "estagio");
    await queryInterface.removeColumn("class_evolution_paths", "slug");
  },
};
