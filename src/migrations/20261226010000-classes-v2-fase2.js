"use strict";

// Classes V2 — Fase 2 (segue direto a Fase 1, commit 5615030: evolução
// em estágios + tipo_dano). Fase 1 deixou explicitamente de fora:
// identidade/gameplay de Classe editável no Admin, Requirement/Ability/
// Effect genéricos, evolução estágio 2 (Lv.100) com conteúdo real, e o
// Painel Admin em si. Esta migration cobre o schema (Expand) + backfill
// necessário pra tudo isso — nunca remove nem renomeia nada que já
// existe (id_evolucao_classe, nome_monstro_alvo, as 4 colunas de
// requisito ad hoc em class_evolution_paths continuam vivas: o Contract
// dessas fica pra depois de validação em produção, mesma politica já
// usada na Fase 1 pro id_evolucao_classe).
//
// Decisão de escopo registrada aqui (documentada no relatório final):
// o critério "requisitos usam id_monstro, não nome" do documento não é
// aplicado literalmente porque CharacterMonsterKill (usado também pelo
// Bestiário e mastery, não só por Classes) é indexado por NOME de
// monstro em todo o jogo — não existe uma tabela de catálogo de
// monstros com id estável pra todo abate. Migrar isso seria um projeto
// à parte, bem maior e mais arriscado que Classes V2, e fora do escopo
// deste documento. O requisito MONSTER_KILL do novo
// ClassEvolutionRequirement usa `reference_key` (nome do monstro) —
// exatamente a coluna que o próprio §8 da spec desenha pra "requisito
// sem entidade numérica".
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    // ------------------------------------------------- Class V2 (§3) --
    const colunasClass = await queryInterface.describeTable("Classes");
    async function addColunaClasseSeNaoExiste(nome, definicao) {
      if (!colunasClass[nome]) {
        await queryInterface.addColumn("Classes", nome, definicao);
      }
    }
    await addColunaClasseSeNaoExiste("slug", { type: Sequelize.STRING(60), allowNull: true, unique: true });
    await addColunaClasseSeNaoExiste("icone_url", { type: Sequelize.STRING(255), allowNull: true });
    await addColunaClasseSeNaoExiste("banner_url", { type: Sequelize.STRING(255), allowNull: true });
    await addColunaClasseSeNaoExiste("ativo", { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true });
    await addColunaClasseSeNaoExiste("disponivel_criacao", { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true });
    await addColunaClasseSeNaoExiste("papel", { type: Sequelize.STRING(30), allowNull: true });
    await addColunaClasseSeNaoExiste("atributo_principal", { type: Sequelize.STRING(20), allowNull: true });
    await addColunaClasseSeNaoExiste("atributo_secundario", { type: Sequelize.STRING(20), allowNull: true });
    await addColunaClasseSeNaoExiste("ordem_exibicao", { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });

    // Backfill de identidade — só as 2 classes normais existentes hoje
    // (Guerreiro/Mago), usando os valores de exemplo do próprio §11 da
    // spec. Classes raras (Primordial/Celestial) e qualquer classe nova
    // cadastrada depois ficam com os defaults seguros acima (ativo=true,
    // disponivel_criacao=true, papel/atributos NULL) até o Admin editar.
    const [classesExistentes] = await queryInterface.sequelize.query(`SELECT id, nome, slug FROM "Classes";`);
    function slugify(nome) {
      return nome
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    }
    const IDENTIDADE_CONHECIDA = {
      guerreiro: { papel: "Combatente", atributo_principal: "Forca", atributo_secundario: "Vitalidade" },
      mago: { papel: "Mago", atributo_principal: "Inteligencia", atributo_secundario: "Velocidade" },
    };
    for (const [i, classe] of classesExistentes.entries()) {
      const chave = classe.nome.toLowerCase();
      const identidade = IDENTIDADE_CONHECIDA[chave];
      const slug = classe.slug || slugify(classe.nome);
      await queryInterface.sequelize.query(
        `UPDATE "Classes"
           SET slug = :slug,
               ordem_exibicao = COALESCE(NULLIF(ordem_exibicao, 0), :ordem),
               papel = COALESCE(papel, :papel),
               atributo_principal = COALESCE(atributo_principal, :atributoPrincipal),
               atributo_secundario = COALESCE(atributo_secundario, :atributoSecundario)
         WHERE id = :id;`,
        {
          replacements: {
            id: classe.id,
            slug,
            ordem: i + 1,
            papel: identidade?.papel ?? null,
            atributoPrincipal: identidade?.atributo_principal ?? null,
            atributoSecundario: identidade?.atributo_secundario ?? null,
          },
        },
      );
    }

    // ------------------------------------- ClassEvolutionRequirement --
    if (!tabelas.includes("class_evolution_requirements")) {
      await queryInterface.createTable("class_evolution_requirements", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_evolucao: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "class_evolution_paths", key: "id" },
          onDelete: "CASCADE",
        },
        tipo: {
          type: Sequelize.ENUM("LEVEL", "GOLD", "ITEM", "MONSTER_KILL", "ADVENTURE_GUILD_RANK", "ACHIEVEMENT", "REPUTATION", "QUEST"),
          allowNull: false,
        },
        quantidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        reference_id: { type: Sequelize.INTEGER, allowNull: true },
        reference_key: { type: Sequelize.STRING(150), allowNull: true },
        config: { type: Sequelize.JSONB, allowNull: true },
        ordem: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addIndex("class_evolution_requirements", ["id_evolucao"]);
    }

    // ----------------------------------------- ClassEvolutionAbility --
    if (!tabelas.includes("class_evolution_abilities")) {
      await queryInterface.createTable("class_evolution_abilities", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_evolucao: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "class_evolution_paths", key: "id" },
          onDelete: "CASCADE",
        },
        id_power: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Powers", key: "id" },
          onDelete: "CASCADE",
        },
        auto_conceder: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        ativar_se_houver_slot: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addConstraint("class_evolution_abilities", {
        fields: ["id_evolucao", "id_power"],
        type: "unique",
        name: "class_evolution_abilities_evolucao_power_unique",
      });
    }

    // ------------------------------------------ ClassEvolutionEffect --
    if (!tabelas.includes("class_evolution_effects")) {
      await queryInterface.createTable("class_evolution_effects", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_evolucao: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "class_evolution_paths", key: "id" },
          onDelete: "CASCADE",
        },
        // Catálogo FECHADO em nível de schema (ver §10.1 da spec) — o
        // Admin, além disso, só deixa SELECIONAR effect_keys que o
        // service central (classEvolutionEffectService.js) realmente
        // interpreta (EFFECT_KEYS_IMPLEMENTADAS); as demais existem no
        // ENUM pra documentar o catálogo completo do documento, mas
        // nunca chegam a ser oferecidas na criação/edição — nenhum
        // efeito executa lógica arbitrária vinda do banco.
        effect_key: {
          type: Sequelize.ENUM(
            "RAGE_STACK",
            "LIFESTEAL",
            "LOW_HP_DAMAGE",
            "DAMAGE_REDUCTION",
            "MANA_COST_REDUCTION",
            "COOLDOWN_REDUCTION",
            "CRITICAL_CHANCE",
            "CRITICAL_DAMAGE",
            "DODGE_BONUS",
            "HEALING_BONUS",
            "SHIELD_ON_CAST",
          ),
          allowNull: false,
        },
        valor: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
        config: { type: Sequelize.JSONB, allowNull: true },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addIndex("class_evolution_effects", ["id_evolucao"]);
    }

    // Backfill dos requisitos ad hoc existentes (nível/item/ouro/caça de
    // cada caminho já cadastrado) pra dentro do sistema genérico novo —
    // a partir de agora ClassEvolutionRequirement é a fonte de verdade
    // lida pelo fluxo de evolução (characterController.evolveClass
    // passa a validar por aqui, ver serviço), as colunas antigas em
    // class_evolution_paths continuam existindo só como histórico/
    // compat, nunca mais lidas pelo runtime novo.
    const [caminhos] = await queryInterface.sequelize.query(
      `SELECT id, nivel_necessario, id_item_requisito, quantidade_item_requisito, custo_ouro,
              nome_monstro_alvo, quantidade_monstro_necessaria
         FROM class_evolution_paths;`,
    );
    for (const caminho of caminhos) {
      const [[jaTemRequisitos]] = await queryInterface.sequelize.query(
        `SELECT COUNT(*)::int AS total FROM class_evolution_requirements WHERE id_evolucao = :id;`,
        { replacements: { id: caminho.id } },
      );
      if (jaTemRequisitos.total > 0) continue; // idempotente — já migrado numa rodada anterior

      const linhas = [];
      let ordem = 0;
      if (caminho.nivel_necessario > 1) {
        linhas.push({ tipo: "LEVEL", quantidade: caminho.nivel_necessario, reference_id: null, reference_key: null, ordem: ordem++ });
      }
      if (caminho.id_item_requisito) {
        linhas.push({
          tipo: "ITEM",
          quantidade: caminho.quantidade_item_requisito || 1,
          reference_id: caminho.id_item_requisito,
          reference_key: null,
          ordem: ordem++,
        });
      }
      if (caminho.custo_ouro > 0) {
        linhas.push({ tipo: "GOLD", quantidade: caminho.custo_ouro, reference_id: null, reference_key: null, ordem: ordem++ });
      }
      if (caminho.nome_monstro_alvo) {
        linhas.push({
          tipo: "MONSTER_KILL",
          quantidade: caminho.quantidade_monstro_necessaria || 1,
          reference_id: null,
          reference_key: caminho.nome_monstro_alvo,
          ordem: ordem++,
        });
      }
      for (const linha of linhas) {
        await queryInterface.sequelize.query(
          `INSERT INTO class_evolution_requirements
             (id_evolucao, tipo, quantidade, reference_id, reference_key, ordem, "createdAt", "updatedAt")
           VALUES (:id_evolucao, :tipo, :quantidade, :reference_id, :reference_key, :ordem, now(), now());`,
          { replacements: { id_evolucao: caminho.id, ...linha } },
        );
      }
    }

    // ------------------------------------------------ Permissão Admin --
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'classes.manage' LIMIT 1;`,
    );
    if (existente.length === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt")
         VALUES ('classes.manage', 'Editar Classes, evoluções, requisitos, habilidades e efeitos (Classes V2)', now(), now());`,
      );
    }
    const [[permissao]] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'classes.manage' LIMIT 1;`,
    );
    for (const nomeRole of ["Conteudo", "SuperAdmin"]) {
      const [[role]] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_roles WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: nomeRole } },
      );
      if (!role || !permissao) continue;
      await queryInterface.sequelize.query(
        `INSERT INTO admin_role_permissions (id_role, id_permission, "createdAt", "updatedAt")
         VALUES (:idRole, :idPermission, now(), now())
         ON CONFLICT DO NOTHING;`,
        { replacements: { idRole: role.id, idPermission: permissao.id } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM admin_role_permissions WHERE id_permission = (SELECT id FROM admin_permissions WHERE chave = 'classes.manage');`,
    );
    await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = 'classes.manage';`);

    await queryInterface.dropTable("class_evolution_effects");
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_class_evolution_effects_effect_key";`);
    await queryInterface.dropTable("class_evolution_abilities");
    await queryInterface.dropTable("class_evolution_requirements");
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_class_evolution_requirements_tipo";`);

    for (const coluna of [
      "slug",
      "icone_url",
      "banner_url",
      "ativo",
      "disponivel_criacao",
      "papel",
      "atributo_principal",
      "atributo_secundario",
      "ordem_exibicao",
    ]) {
      await queryInterface.removeColumn("Classes", coluna).catch(() => {});
    }
  },
};
