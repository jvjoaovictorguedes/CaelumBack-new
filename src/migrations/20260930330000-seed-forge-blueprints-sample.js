"use strict";

// Seed inicial de ForgeBlueprint (ETAPA 5) — um blueprint por categoria
// principal (Arma/Armadura/Acessorio1), cada um com os 3 tipos de
// ingrediente que a spec pede (Barra de Mineração + Tronco de
// Silvicultura + recurso de Exploração, ver §17: "as receitas devem
// utilizar as três profissões de Expedição") e 6 Items de resultado
// (1 por qualidade, ver §16). Mais blueprints podem ser adicionados
// depois com o mesmo padrão — este seed prova o pipeline ponta a ponta,
// não pretende cobrir as 8 categorias da tabela da spec de uma vez
// (decisão de escopo documentada no relatório final).
const QUALIDADES = ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"];
const NOME_EXIBICAO_QUALIDADE = { Comum: "Comum", Incomum: "Incomum", Raro: "Raro", Epico: "Épico", Lendario: "Lendário", Mitico: "Mítico" };

// { nome, categoria_equipamento, multiplicador_tempo, nivel_forja_minimo,
//   nomeBaseItem, propriedades (Weapon|Armor), ingredientes: [{tipo_insumo, nomeRecurso, quantidade_base}] }
const BLUEPRINTS = [
  {
    nome: "Espada de Ferro",
    categoria_equipamento: "Arma",
    multiplicador_tempo: 1,
    nivel_forja_minimo: 1,
    nomeBaseItem: "Espada Forjada de Ferro",
    tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Espada", tipo_dano: "Fisico", bonus_atributo: "Forca" },
    ingredientes: [
      { tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 3 },
      { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Carvalho", quantidade_base: 1 },
      { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Essência Elemental", quantidade_base: 1 },
    ],
  },
  {
    nome: "Peitoral de Ferro",
    categoria_equipamento: "Armadura",
    multiplicador_tempo: 1.5,
    nivel_forja_minimo: 1,
    nomeBaseItem: "Peitoral Forjado de Ferro",
    tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Torso" },
    ingredientes: [
      { tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 5 },
      { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Carvalho", quantidade_base: 2 },
      { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Erva Medicinal", quantidade_base: 1 },
    ],
  },
  {
    nome: "Anel de Ferro",
    categoria_equipamento: "Acessorio1",
    multiplicador_tempo: 0.7,
    nivel_forja_minimo: 1,
    nomeBaseItem: "Anel Forjado de Ferro",
    tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Acessorio1" },
    ingredientes: [
      { tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 1 },
      { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Essência Elemental", quantidade_base: 1 },
    ],
  },
];

// Escala simples de atributos por qualidade — cada degrau acima
// multiplica o valor-base do Comum. Aplicado igual pra dano (arma) ou
// defesa (armadura/acessório), já que o refinamento (forgeConfig.js)
// cuida do resto do balanceamento por cima disso.
const ESCALA_POR_QUALIDADE = { Comum: 1, Incomum: 1.4, Raro: 2, Epico: 3, Lendario: 4.5, Mitico: 6.5 };
const VALOR_VENDA_POR_QUALIDADE = { Comum: 15, Incomum: 45, Raro: 130, Epico: 400, Lendario: 1200, Mitico: 3500 };

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM forge_blueprints LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Blueprints de exemplo já existem — pulando.");
      return;
    }

    for (const bp of BLUEPRINTS) {
      const [[blueprintCriado]] = await queryInterface.sequelize.query(
        `INSERT INTO forge_blueprints (nome, categoria_equipamento, multiplicador_tempo, nivel_forja_minimo, ativo, "createdAt", "updatedAt")
         VALUES (:nome, :categoria, :multiplicador, :nivel_minimo, true, now(), now())
         RETURNING id;`,
        {
          replacements: {
            nome: bp.nome,
            categoria: bp.categoria_equipamento,
            multiplicador: bp.multiplicador_tempo,
            nivel_minimo: bp.nivel_forja_minimo,
          },
        },
      );
      const idBlueprint = blueprintCriado.id;

      for (const ingrediente of bp.ingredientes) {
        const [[recurso]] = await queryInterface.sequelize.query(
          `SELECT id FROM expedition_resources WHERE nome = :nome LIMIT 1;`,
          { replacements: { nome: ingrediente.nomeRecurso } },
        );
        if (!recurso) {
          throw new Error(`Recurso "${ingrediente.nomeRecurso}" não encontrado pra blueprint "${bp.nome}".`);
        }
        await queryInterface.sequelize.query(
          `INSERT INTO forge_blueprint_ingredients (id_blueprint, tipo_insumo, id_recurso, quantidade_base)
           VALUES (:id_blueprint, :tipo_insumo, :id_recurso, :quantidade);`,
          {
            replacements: {
              id_blueprint: idBlueprint,
              tipo_insumo: ingrediente.tipo_insumo,
              id_recurso: recurso.id,
              quantidade: ingrediente.quantidade_base,
            },
          },
        );
      }

      for (const qualidade of QUALIDADES) {
        const nome = `${bp.nomeBaseItem} — ${NOME_EXIBICAO_QUALIDADE[qualidade]}`;

        const [[itemCriado]] = await queryInterface.sequelize.query(
          `INSERT INTO "Items" (nome, descricao, tipo_item, raridade, valor_compra, valor_venda, peso, "disponivel_loja", "createdAt", "updatedAt")
           VALUES (:nome, :descricao, :tipo_item, :raridade, 0, :valor_venda, 1, false, now(), now())
           RETURNING id;`,
          {
            replacements: {
              nome,
              descricao: `${bp.nome} fabricado na Forja, qualidade ${NOME_EXIBICAO_QUALIDADE[qualidade]}.`,
              tipo_item: bp.categoria_equipamento,
              raridade: qualidade,
              valor_venda: VALOR_VENDA_POR_QUALIDADE[qualidade],
            },
          },
        );
        const idItem = itemCriado.id;

        const escala = ESCALA_POR_QUALIDADE[qualidade];
        if (bp.tipoPropriedade === "Weapon") {
          const danoMin = Math.round(6 * escala);
          const danoMax = Math.round(10 * escala);
          await queryInterface.sequelize.query(
            `INSERT INTO "WeaponProperties" (id_item, dano_min, dano_max, tipo_dano, tipo_arma, bonus_atributo, valor_bonus_atributo, "createdAt", "updatedAt")
             VALUES (:id_item, :dano_min, :dano_max, :tipo_dano, :tipo_arma, :bonus_atributo, :valor_bonus, now(), now());`,
            {
              replacements: {
                id_item: idItem,
                dano_min: danoMin,
                dano_max: danoMax,
                tipo_dano: bp.weapon.tipo_dano,
                tipo_arma: bp.weapon.tipo_arma,
                bonus_atributo: bp.weapon.bonus_atributo,
                valor_bonus: Math.round(1 * escala * 10) / 10,
              },
            },
          );
        } else {
          const defesa = Math.round(4 * escala);
          await queryInterface.sequelize.query(
            `INSERT INTO "ArmorProperties" (id_item, slot_equipamento, defesa, bonus_forca, bonus_vitalidade, bonus_inteligencia, bonus_agilidade, bonus_velocidade, "createdAt", "updatedAt")
             VALUES (:id_item, :slot, :defesa, 0, :bonus_vit, 0, 0, 0, now(), now());`,
            {
              replacements: {
                id_item: idItem,
                slot: bp.armor.slot_equipamento,
                defesa,
                bonus_vit: Math.round(1 * escala),
              },
            },
          );
        }

        await queryInterface.sequelize.query(
          `INSERT INTO forge_blueprint_results (id_blueprint, qualidade, id_item)
           VALUES (:id_blueprint, :qualidade, :id_item);`,
          { replacements: { id_blueprint: idBlueprint, qualidade, id_item: idItem } },
        );
      }
    }

    console.log(`[migration] ${BLUEPRINTS.length} blueprints de exemplo criados (${BLUEPRINTS.length * 6} itens).`);
  },

  async down(queryInterface) {
    const [blueprints] = await queryInterface.sequelize.query(
      `SELECT id FROM forge_blueprints WHERE nome IN (${BLUEPRINTS.map((bp) => `'${bp.nome}'`).join(",")});`,
    );
    const ids = blueprints.map((b) => b.id);
    if (ids.length === 0) return;

    const [resultados] = await queryInterface.sequelize.query(
      `SELECT id_item FROM forge_blueprint_results WHERE id_blueprint IN (${ids.join(",")});`,
    );
    const idsItens = resultados.map((r) => r.id_item);

    await queryInterface.sequelize.query(`DELETE FROM forge_blueprint_results WHERE id_blueprint IN (${ids.join(",")});`);
    await queryInterface.sequelize.query(`DELETE FROM forge_blueprint_ingredients WHERE id_blueprint IN (${ids.join(",")});`);
    await queryInterface.sequelize.query(`DELETE FROM forge_blueprints WHERE id IN (${ids.join(",")});`);
    if (idsItens.length > 0) {
      await queryInterface.sequelize.query(`DELETE FROM "WeaponProperties" WHERE id_item IN (${idsItens.join(",")});`);
      await queryInterface.sequelize.query(`DELETE FROM "ArmorProperties" WHERE id_item IN (${idsItens.join(",")});`);
      await queryInterface.sequelize.query(`DELETE FROM "Items" WHERE id IN (${idsItens.join(",")});`);
    }
  },
};
