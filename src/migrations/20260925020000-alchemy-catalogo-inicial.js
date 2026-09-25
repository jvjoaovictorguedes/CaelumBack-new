"use strict";

// Catálogo inicial do Caldeirão (spec §25) — idempotente por
// nome (Item) e por `key` (AlchemyRecipe). Ingredientes usam Items REAIS
// já existentes no catálogo (Espólios de Aventura + recursos de
// Expedição materializados via expedition_resource_items), nunca IDs
// inventados. Só cria Item novo pro RESULTADO (Consumivel) quando não
// existe um equivalente ainda — não havia nenhuma poção/antídoto
// jogável no catálogo antes desta migration.
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const agora = new Date();

    async function garantirItemConsumivel({ nome, descricao, raridade, valor_venda, imagem_url }) {
      const [existente] = await sequelize.query(`SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`, {
        replacements: { nome },
      });
      if (existente.length > 0) return existente[0].id;

      const [inserido] = await sequelize.query(
        `INSERT INTO "Items"
           (nome, descricao, tipo_item, raridade, valor_compra, valor_venda, peso, imagem_url, disponivel_loja, ativo, negociavel_mercado, "createdAt", "updatedAt")
         VALUES
           (:nome, :descricao, 'Consumivel', :raridade, 0, :valor_venda, 0.2, :imagem_url, false, true, true, now(), now())
         RETURNING id;`,
        { replacements: { nome, descricao, raridade, valor_venda, imagem_url: imagem_url ?? null } },
      );
      return inserido[0].id;
    }

    async function garantirConsumableProperties(idItem, { efeito_vida = 0, efeito_mana = 0 }) {
      const [existente] = await sequelize.query(
        `SELECT id_item FROM consumable_properties WHERE id_item = :idItem LIMIT 1;`,
        { replacements: { idItem } },
      );
      if (existente.length > 0) return;
      await sequelize.query(
        `INSERT INTO consumable_properties (id_item, efeito_vida, efeito_mana, efeito_atributo, valor_atributo, duracao_efeito)
         VALUES (:idItem, :efeito_vida, :efeito_mana, NULL, 0, NULL);`,
        { replacements: { idItem, efeito_vida, efeito_mana } },
      );
    }

    async function garantirConsumableEffect(idItem, effectKey, config, magnitude = 0) {
      const [existente] = await sequelize.query(
        `SELECT id FROM consumable_effects WHERE id_item = :idItem AND effect_key = :effectKey LIMIT 1;`,
        { replacements: { idItem, effectKey } },
      );
      if (existente.length > 0) return;
      await sequelize.query(
        `INSERT INTO consumable_effects (id_item, effect_key, magnitude, duration_turns, config, ativo, "createdAt", "updatedAt")
         VALUES (:idItem, :effectKey, :magnitude, NULL, :config, true, now(), now());`,
        { replacements: { idItem, effectKey, magnitude, config: JSON.stringify(config) } },
      );
    }

    async function buscarIdItemPorNome(nome) {
      const [rows] = await sequelize.query(`SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`, {
        replacements: { nome },
      });
      if (rows.length === 0) throw new Error(`Item base não encontrado para a receita: ${nome}`);
      return rows[0].id;
    }

    async function garantirReceita({ key, nome, descricao, categoria, idItemResultado, quantidadeResultado, nivelMinimo, xp, ingredientes }) {
      const [existente] = await sequelize.query(`SELECT id FROM alchemy_recipes WHERE key = :key LIMIT 1;`, {
        replacements: { key },
      });
      let idReceita;
      if (existente.length > 0) {
        idReceita = existente[0].id;
      } else {
        const [inserido] = await sequelize.query(
          `INSERT INTO alchemy_recipes
             (key, nome, descricao, categoria, id_item_resultado, quantidade_resultado, nivel_alquimia_minimo, xp_alquimia, custo_ouro, modo_desbloqueio, ativo, ordem, "createdAt", "updatedAt")
           VALUES
             (:key, :nome, :descricao, :categoria, :idItemResultado, :quantidadeResultado, :nivelMinimo, :xp, 0, 'NIVEL', true, :ordem, now(), now())
           RETURNING id;`,
          {
            replacements: {
              key,
              nome,
              descricao,
              categoria,
              idItemResultado,
              quantidadeResultado,
              nivelMinimo,
              xp,
              ordem: nivelMinimo,
            },
          },
        );
        idReceita = inserido[0].id;
      }

      for (const ing of ingredientes) {
        const [jaTem] = await sequelize.query(
          `SELECT id FROM alchemy_recipe_ingredients WHERE id_recipe = :idReceita AND id_item = :idItem LIMIT 1;`,
          { replacements: { idReceita, idItem: ing.idItem } },
        );
        if (jaTem.length > 0) continue;
        await sequelize.query(
          `INSERT INTO alchemy_recipe_ingredients (id_recipe, id_item, quantidade) VALUES (:idReceita, :idItem, :quantidade);`,
          { replacements: { idReceita, idItem: ing.idItem, quantidade: ing.quantidade } },
        );
      }
      return idReceita;
    }

    // --- Itens resultado -------------------------------------------------
    const idPocaoVida = await garantirItemConsumivel({
      nome: "Poção de Vida Básica",
      descricao: "Poção alquímica simples que recupera parte da vida ao ser consumida.",
      raridade: "Comum",
      valor_venda: 8,
    });
    await garantirConsumableProperties(idPocaoVida, { efeito_vida: 30 });

    const idPocaoMana = await garantirItemConsumivel({
      nome: "Poção de Mana Básica",
      descricao: "Poção alquímica simples que recupera parte da mana ao ser consumida.",
      raridade: "Comum",
      valor_venda: 8,
    });
    await garantirConsumableProperties(idPocaoMana, { efeito_mana: 30 });

    const idAntidoto = await garantirItemConsumivel({
      nome: "Antídoto",
      descricao: "Preparado alquímico que neutraliza veneno no organismo de quem o consome.",
      raridade: "Incomum",
      valor_venda: 15,
    });
    await garantirConsumableProperties(idAntidoto, {});
    await garantirConsumableEffect(idAntidoto, "CLEANSE_STATUS", { status_key: "POISON" });

    // --- Ingredientes reais (Espólio + recurso de Expedição) ------------
    const idErvaMedicinalComum = await buscarIdItemPorNome("Erva Medicinal — Comum");
    const idErvaManaComum = await buscarIdItemPorNome("Erva de Mana — Comum");
    const idPresaLoboSombrio = await buscarIdItemPorNome("Presa de Lobo Sombrio");
    const idCaudaRato = await buscarIdItemPorNome("Cauda de Rato");
    const idTeiaAranhaVenenosa = await buscarIdItemPorNome("Teia de Aranha Venenosa");

    // --- Receitas ---------------------------------------------------------
    await garantirReceita({
      key: "POCAO_VIDA_BASICA",
      nome: "Poção de Vida Básica",
      descricao: "Espólio comum + Erva Medicinal — recupera vida em combate.",
      categoria: "POCAO",
      idItemResultado: idPocaoVida,
      quantidadeResultado: 1,
      nivelMinimo: 1,
      xp: 6,
      ingredientes: [
        { idItem: idPresaLoboSombrio, quantidade: 2 },
        { idItem: idErvaMedicinalComum, quantidade: 3 },
      ],
    });

    await garantirReceita({
      key: "POCAO_MANA_BASICA",
      nome: "Poção de Mana Básica",
      descricao: "Espólio comum + Erva de Mana — recupera mana em combate.",
      categoria: "POCAO",
      idItemResultado: idPocaoMana,
      quantidadeResultado: 1,
      nivelMinimo: 1,
      xp: 6,
      ingredientes: [
        { idItem: idCaudaRato, quantidade: 2 },
        { idItem: idErvaManaComum, quantidade: 3 },
      ],
    });

    await garantirReceita({
      key: "ANTIDOTO_BASICO",
      nome: "Antídoto",
      descricao: "Espólio venenoso + Erva Medicinal — remove Veneno (POISON) em combate.",
      categoria: "ANTIDOTO",
      idItemResultado: idAntidoto,
      quantidadeResultado: 1,
      nivelMinimo: 5,
      xp: 12,
      ingredientes: [
        { idItem: idTeiaAranhaVenenosa, quantidade: 2 },
        { idItem: idErvaMedicinalComum, quantidade: 2 },
      ],
    });
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const keys = ["POCAO_VIDA_BASICA", "POCAO_MANA_BASICA", "ANTIDOTO_BASICO"];
    for (const key of keys) {
      const [rows] = await sequelize.query(`SELECT id FROM alchemy_recipes WHERE key = :key`, { replacements: { key } });
      if (rows.length === 0) continue;
      await sequelize.query(`DELETE FROM alchemy_recipe_ingredients WHERE id_recipe = :id`, { replacements: { id: rows[0].id } });
      await sequelize.query(`DELETE FROM alchemy_recipes WHERE id = :id`, { replacements: { id: rows[0].id } });
    }
    // Itens/ConsumableProperties/ConsumableEffect criados intencionalmente
    // não são removidos no down — podem já estar em inventários/Mercado.
  },
};
