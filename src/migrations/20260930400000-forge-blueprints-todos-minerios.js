"use strict";

// Expande a Fabricação pra usar TODOS os 8 minérios (antes só Ferro
// tinha receita — as barras dos outros 7 minérios não tinham pra onde
// ir) e adiciona Cajado (arma mágica, escala com Inteligência) — antes
// só existia Espada (Força), então quem jogava de Mago não tinha
// equipamento pra fabricar. Um Cajado, uma Espada, um Peitoral e um
// Anel por minério = cobre guerreiro e mago em todas as 8 progressões
// de minério.
const MINERAIS = ["Ferro", "Cobre", "Prata", "Ouro", "Cristal de Mana", "Obsidiana", "Astralita", "Minério Celestial"];

const QUALIDADES = ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"];
const NOME_EXIBICAO_QUALIDADE = { Comum: "Comum", Incomum: "Incomum", Raro: "Raro", Epico: "Épico", Lendario: "Lendário", Mitico: "Mítico" };
const ESCALA_POR_QUALIDADE = { Comum: 1, Incomum: 1.4, Raro: 2, Epico: 3, Lendario: 4.5, Mitico: 6.5 };
const VALOR_VENDA_POR_QUALIDADE = { Comum: 15, Incomum: 45, Raro: 130, Epico: 400, Lendario: 1200, Mitico: 3500 };

// Cada template gera 1 blueprint POR MINÉRIO. A parte "Barra" do
// ingrediente muda de minério pra minério (id_recurso resolvido na
// hora); a parte "RecursoExpedicao" (madeira/erva de apoio) é sempre a
// mesma, pra não precisar de outra combinação por minério.
const TEMPLATES = [
  {
    sufixoBlueprint: "Espada",
    categoria_equipamento: "Arma",
    multiplicador_tempo: 1,
    nomeBaseItem: (mineral) => `Espada Forjada de ${mineral}`,
    tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Espada", tipo_dano: "Fisico", bonus_atributo: "Forca" },
    danoBase: { min: 6, max: 10 },
    quantidadeBarra: 3,
    ingredientesExtras: [
      { nomeRecurso: "Carvalho", quantidade_base: 1 },
      { nomeRecurso: "Essência Elemental", quantidade_base: 1 },
    ],
  },
  {
    sufixoBlueprint: "Cajado",
    categoria_equipamento: "Arma",
    multiplicador_tempo: 1.1,
    nomeBaseItem: (mineral) => `Cajado Forjado de ${mineral}`,
    tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" },
    danoBase: { min: 5, max: 8 },
    quantidadeBarra: 1,
    ingredientesExtras: [
      { nomeRecurso: "Madeira Arcana", quantidade_base: 2 },
      { nomeRecurso: "Erva de Mana", quantidade_base: 1 },
    ],
  },
  {
    sufixoBlueprint: "Peitoral",
    categoria_equipamento: "Armadura",
    multiplicador_tempo: 1.5,
    nomeBaseItem: (mineral) => `Peitoral Forjado de ${mineral}`,
    tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Torso" },
    defesaBase: 4,
    quantidadeBarra: 5,
    ingredientesExtras: [
      { nomeRecurso: "Carvalho", quantidade_base: 2 },
      { nomeRecurso: "Erva Medicinal", quantidade_base: 1 },
    ],
  },
  {
    sufixoBlueprint: "Anel",
    categoria_equipamento: "Acessorio1",
    multiplicador_tempo: 0.7,
    nomeBaseItem: (mineral) => `Anel Forjado de ${mineral}`,
    tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Acessorio1" },
    defesaBase: 2,
    quantidadeBarra: 1,
    ingredientesExtras: [{ nomeRecurso: "Essência Elemental", quantidade_base: 1 }],
  },
];

module.exports = {
  async up(queryInterface) {
    for (const mineral of MINERAIS) {
      const [[recursoMineral]] = await queryInterface.sequelize.query(
        `SELECT id FROM expedition_resources WHERE nome = :nome AND profissao = 'Mineracao' LIMIT 1;`,
        { replacements: { nome: mineral } },
      );
      if (!recursoMineral) {
        console.log(`[migration] Minério "${mineral}" não encontrado — pulando.`);
        continue;
      }

      for (const template of TEMPLATES) {
        const nomeBlueprint = `${template.sufixoBlueprint} de ${mineral}`;

        const [existente] = await queryInterface.sequelize.query(
          `SELECT id FROM forge_blueprints WHERE nome = :nome LIMIT 1;`,
          { replacements: { nome: nomeBlueprint } },
        );
        if (existente.length > 0) {
          console.log(`[migration] Blueprint "${nomeBlueprint}" já existe — pulando.`);
          continue;
        }

        const [[blueprintCriado]] = await queryInterface.sequelize.query(
          `INSERT INTO forge_blueprints (nome, categoria_equipamento, multiplicador_tempo, nivel_forja_minimo, ativo, "createdAt", "updatedAt")
           VALUES (:nome, :categoria, :multiplicador, 1, true, now(), now())
           RETURNING id;`,
          {
            replacements: {
              nome: nomeBlueprint,
              categoria: template.categoria_equipamento,
              multiplicador: template.multiplicador_tempo,
            },
          },
        );
        const idBlueprint = blueprintCriado.id;

        // Ingrediente "Barra" — sempre o minério deste blueprint.
        await queryInterface.sequelize.query(
          `INSERT INTO forge_blueprint_ingredients (id_blueprint, tipo_insumo, id_recurso, quantidade_base)
           VALUES (:id_blueprint, 'Barra', :id_recurso, :quantidade);`,
          { replacements: { id_blueprint: idBlueprint, id_recurso: recursoMineral.id, quantidade: template.quantidadeBarra } },
        );

        // Ingredientes de apoio (madeira/erva) — mesmos pra todo minério.
        for (const extra of template.ingredientesExtras) {
          const [[recursoExtra]] = await queryInterface.sequelize.query(
            `SELECT id FROM expedition_resources WHERE nome = :nome LIMIT 1;`,
            { replacements: { nome: extra.nomeRecurso } },
          );
          if (!recursoExtra) {
            throw new Error(`Recurso "${extra.nomeRecurso}" não encontrado pro blueprint "${nomeBlueprint}".`);
          }
          await queryInterface.sequelize.query(
            `INSERT INTO forge_blueprint_ingredients (id_blueprint, tipo_insumo, id_recurso, quantidade_base)
             VALUES (:id_blueprint, 'RecursoExpedicao', :id_recurso, :quantidade);`,
            { replacements: { id_blueprint: idBlueprint, id_recurso: recursoExtra.id, quantidade: extra.quantidade_base } },
          );
        }

        // 6 Items de resultado (1 por qualidade).
        for (const qualidade of QUALIDADES) {
          const nomeItem = `${template.nomeBaseItem(mineral)} — ${NOME_EXIBICAO_QUALIDADE[qualidade]}`;
          const escala = ESCALA_POR_QUALIDADE[qualidade];

          const [[itemCriado]] = await queryInterface.sequelize.query(
            `INSERT INTO "Items" (nome, descricao, tipo_item, raridade, valor_compra, valor_venda, peso, "disponivel_loja", "createdAt", "updatedAt")
             VALUES (:nome, :descricao, :tipo_item, :raridade, 0, :valor_venda, 1, false, now(), now())
             RETURNING id;`,
            {
              replacements: {
                nome: nomeItem,
                descricao: `${template.sufixoBlueprint} de ${mineral} fabricado(a) na Forja, qualidade ${NOME_EXIBICAO_QUALIDADE[qualidade]}.`,
                tipo_item: template.categoria_equipamento,
                raridade: qualidade,
                valor_venda: VALOR_VENDA_POR_QUALIDADE[qualidade],
              },
            },
          );
          const idItem = itemCriado.id;

          if (template.tipoPropriedade === "Weapon") {
            const danoMin = Math.round(template.danoBase.min * escala);
            const danoMax = Math.round(template.danoBase.max * escala);
            await queryInterface.sequelize.query(
              `INSERT INTO "WeaponProperties" (id_item, dano_min, dano_max, tipo_dano, tipo_arma, bonus_atributo, valor_bonus_atributo, "createdAt", "updatedAt")
               VALUES (:id_item, :dano_min, :dano_max, :tipo_dano, :tipo_arma, :bonus_atributo, :valor_bonus, now(), now());`,
              {
                replacements: {
                  id_item: idItem,
                  dano_min: danoMin,
                  dano_max: danoMax,
                  tipo_dano: template.weapon.tipo_dano,
                  tipo_arma: template.weapon.tipo_arma,
                  bonus_atributo: template.weapon.bonus_atributo,
                  valor_bonus: Math.round(1 * escala * 10) / 10,
                },
              },
            );
          } else {
            const defesa = Math.round(template.defesaBase * escala);
            await queryInterface.sequelize.query(
              `INSERT INTO "ArmorProperties" (id_item, slot_equipamento, defesa, bonus_forca, bonus_vitalidade, bonus_inteligencia, bonus_agilidade, bonus_velocidade, "createdAt", "updatedAt")
               VALUES (:id_item, :slot, :defesa, 0, :bonus_vit, 0, 0, 0, now(), now());`,
              {
                replacements: {
                  id_item: idItem,
                  slot: template.armor.slot_equipamento,
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
    }

    console.log("[migration] Blueprints de todos os minérios criados.");
  },

  async down(queryInterface) {
    for (const mineral of MINERAIS) {
      for (const template of TEMPLATES) {
        const nomeBlueprint = `${template.sufixoBlueprint} de ${mineral}`;
        const [[blueprint]] = await queryInterface.sequelize.query(
          `SELECT id FROM forge_blueprints WHERE nome = :nome LIMIT 1;`,
          { replacements: { nome: nomeBlueprint } },
        );
        if (!blueprint) continue;

        const [resultados] = await queryInterface.sequelize.query(
          `SELECT id_item FROM forge_blueprint_results WHERE id_blueprint = :id;`,
          { replacements: { id: blueprint.id } },
        );
        const idsItens = resultados.map((r) => r.id_item);

        await queryInterface.sequelize.query(`DELETE FROM forge_blueprint_results WHERE id_blueprint = :id;`, {
          replacements: { id: blueprint.id },
        });
        await queryInterface.sequelize.query(`DELETE FROM forge_blueprint_ingredients WHERE id_blueprint = :id;`, {
          replacements: { id: blueprint.id },
        });
        await queryInterface.sequelize.query(`DELETE FROM forge_blueprints WHERE id = :id;`, {
          replacements: { id: blueprint.id },
        });
        if (idsItens.length > 0) {
          await queryInterface.sequelize.query(`DELETE FROM "WeaponProperties" WHERE id_item IN (${idsItens.join(",")});`);
          await queryInterface.sequelize.query(`DELETE FROM "ArmorProperties" WHERE id_item IN (${idsItens.join(",")});`);
          await queryInterface.sequelize.query(`DELETE FROM "Items" WHERE id IN (${idsItens.join(",")});`);
        }
      }
    }
  },
};
