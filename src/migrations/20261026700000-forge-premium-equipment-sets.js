"use strict";

// Substitui os 12 itens órfãos criados pela migration
// 20261026520000-forge-new-equipment-sets.js (Items soltos, raridade
// fixa, SEM ForgeBlueprint — logo inacessíveis pro jogador) pelo modelo
// de Blueprint real usado no resto da Forja: 1 ForgeBlueprint por peça,
// gerando as 6 qualidades (Comum..Mítico) via ForgeBlueprintResult,
// com Tier fixo (spec de Tier — ver equipmentTierConfig.js) escalando
// dano/defesa junto com a qualidade. Adiciona também 3 sets novos
// (Ordem Divina, Ordem Superior, Gaia) no mesmo padrão.
//
// Fórmula (igual 20261026120000-equipment-tier-blueprints-e-rebalanceamento.js):
//   fator = TIER_POWER_MULTIPLIER[tier] × RARITY_POWER_MULTIPLIER[qualidade]
//   valor_venda = VALOR_VENDA_POR_QUALIDADE[qualidade] × TIER_ECONOMIC_MULTIPLIER[tier]
// Os valores INLINE abaixo espelham src/config/equipmentTierConfig.js —
// mesma convenção de duplicação local já usada nas outras migrations
// de Forja/Tier.
const QUALIDADES = ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"];
const NOME_EXIBICAO_QUALIDADE = { Comum: "Comum", Incomum: "Incomum", Raro: "Raro", Epico: "Épico", Lendario: "Lendário", Mitico: "Mítico" };
const TIER_POWER_MULTIPLIER = { 5: 1.0, 4: 1.25, 3: 1.55, 2: 1.95, 1: 2.45 };
const RARITY_POWER_MULTIPLIER = { Comum: 1.0, Incomum: 1.05, Raro: 1.1, Epico: 1.17, Lendario: 1.25, Mitico: 1.35 };
const TIER_ECONOMIC_MULTIPLIER = { 5: 1, 4: 2, 3: 4, 2: 8, 1: 16 };
const VALOR_VENDA_POR_QUALIDADE = { Comum: 15, Incomum: 45, Raro: 130, Epico: 400, Lendario: 1200, Mitico: 3500 };

function fatorPoder(tier, qualidade) {
  return TIER_POWER_MULTIPLIER[tier] * RARITY_POWER_MULTIPLIER[qualidade];
}

// Os 12 itens órfãos (nome exato usado na migration anterior) — apagados
// no up() antes de recriar via Blueprint.
const NOMES_ITENS_ORFAOS = [
  "Espada do Alto Julgador", "Elmo do Alto Julgador", "Manto do Alto Julgador", "Botas do Alto Julgador",
  "Cajado Arcano Carmesim", "Elmo Arcano Carmesim", "Manto Arcano Carmesim", "Sapato Arcano Carmesim",
  "Trituradora de Ossos", "Elmo do Carrasco", "Armadura do Carrasco", "Botas do Carrasco",
];

// { nome, categoria, tier, imagem, tipoPropriedade, weapon|armor, danoBase|defesaBase,
//   multiplicador_tempo, ingredientes: [{ tipo_insumo, nomeRecurso, quantidade_base }] }
const BLUEPRINTS = [
  // ---- Alto Julgador (Guerreiro físico, Tier 3) ----
  { nome: "Espada do Alto Julgador", categoria: "Arma", tier: 3, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Espada do Alto Julgador.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Espada", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 12, max: 18 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Prata", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Cristal de Mana", quantidade_base: 1 }] },
  { nome: "Elmo do Alto Julgador", categoria: "Capacete", tier: 3, multiplicador_tempo: 1.2,
    imagem: "/images/equipamentos/Elmo do Alto Julgador.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Cabeca" }, defesaBase: 6,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Prata", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Erva de Mana", quantidade_base: 1 }] },
  { nome: "Manto do Alto Julgador", categoria: "Armadura", tier: 3, multiplicador_tempo: 1.5,
    imagem: "/images/equipamentos/Manto do Alto Julgador.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Torso" }, defesaBase: 10,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Prata", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Erva de Mana", quantidade_base: 2 }] },
  { nome: "Botas do Alto Julgador", categoria: "Armadura", tier: 3, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Botas do Alto Julgador.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Pes" }, defesaBase: 4,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Prata", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Cristal de Mana", quantidade_base: 1 }] },

  // ---- Arcano Carmesim (Mago, Tier 3) ----
  { nome: "Cajado Arcano Carmesim", categoria: "Arma", tier: 3, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Cajado Arcano Carmesim.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 10, max: 15 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ouro", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Flor Lunar", quantidade_base: 1 }] },
  { nome: "Elmo Arcano Carmesim", categoria: "Capacete", tier: 3, multiplicador_tempo: 1.2,
    imagem: "/images/equipamentos/Elmo Arcano Carmesim.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Cabeca" }, defesaBase: 4,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ouro", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Flor Lunar", quantidade_base: 1 }] },
  { nome: "Manto Arcano Carmesim", categoria: "Armadura", tier: 3, multiplicador_tempo: 1.5,
    imagem: "/images/equipamentos/Manto Arcano Carmesim.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Torso" }, defesaBase: 7,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ouro", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Erva Lunar", quantidade_base: 2 }] },
  { nome: "Sapato Arcano Carmesim", categoria: "Armadura", tier: 3, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Sapato Arcano Carmesim.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Pes" }, defesaBase: 3,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ouro", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Erva Lunar", quantidade_base: 1 }] },

  // ---- Carrasco (Guerreiro, Tier 2) ----
  { nome: "Trituradora de Ossos", categoria: "Arma", tier: 2, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Trituradora de Ossos.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Machado", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 14, max: 20 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Astralita", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Raiz Ancestral", quantidade_base: 1 }] },
  { nome: "Elmo do Carrasco", categoria: "Capacete", tier: 2, multiplicador_tempo: 1.2,
    imagem: "/images/equipamentos/Elmo do Carrasco.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Cabeca" }, defesaBase: 8,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Astralita", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Raiz Ancestral", quantidade_base: 1 }] },
  { nome: "Armadura do Carrasco", categoria: "Armadura", tier: 2, multiplicador_tempo: 1.5,
    imagem: "/images/equipamentos/Armadura do Carrasco.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Torso" }, defesaBase: 14,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Astralita", quantidade_base: 5 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Ébano", quantidade_base: 2 }] },
  { nome: "Botas do Carrasco", categoria: "Armadura", tier: 2, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Botas do Carrasco.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Pes" }, defesaBase: 6,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Astralita", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Ébano", quantidade_base: 1 }] },

  // ---- Ordem Divina (Mago, Tier 2) ----
  { nome: "Cajado Ordem Divina", categoria: "Arma", tier: 2, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Cajado Ordem Divina.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 13, max: 19 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Minério Celestial", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Essência Celestial", quantidade_base: 1 }] },
  { nome: "Capuz Ordem Divina", categoria: "Capacete", tier: 2, multiplicador_tempo: 1.2,
    imagem: "/images/equipamentos/Capuz Ordem Divina.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Cabeca" }, defesaBase: 7,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Minério Celestial", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Essência Celestial", quantidade_base: 1 }] },
  { nome: "Manto Ordem Divina", categoria: "Armadura", tier: 2, multiplicador_tempo: 1.5,
    imagem: "/images/equipamentos/Manto Ordem Divina.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Torso" }, defesaBase: 12,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Minério Celestial", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Árvore Celestial", quantidade_base: 2 }] },
  { nome: "Botas Ordem Divina", categoria: "Armadura", tier: 2, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Botas Ordem Divina.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Pes" }, defesaBase: 5,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Minério Celestial", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Árvore Celestial", quantidade_base: 1 }] },

  // ---- Ordem Superior (Guerreiro, Tier 2) ----
  { nome: "Julgadora", categoria: "Arma", tier: 2, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Julgadora.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Espada", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 15, max: 21 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Obsidiana", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Madeira Dracônica", quantidade_base: 1 }] },
  { nome: "Elmo Ordem Superior", categoria: "Capacete", tier: 2, multiplicador_tempo: 1.2,
    imagem: "/images/equipamentos/Elmo Ordem Superior.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Cabeca" }, defesaBase: 7,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Obsidiana", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Madeira Dracônica", quantidade_base: 1 }] },
  { nome: "Armadura da Ordem Superior", categoria: "Armadura", tier: 2, multiplicador_tempo: 1.5,
    imagem: "/images/equipamentos/Armadura da Ordem Superior.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Torso" }, defesaBase: 12,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Obsidiana", quantidade_base: 5 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Fruto Místico", quantidade_base: 2 }] },
  { nome: "Botas da Ordem Superior", categoria: "Armadura", tier: 2, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Botas da Ordem Superior.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Pes" }, defesaBase: 5,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Obsidiana", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Fruto Místico", quantidade_base: 1 }] },

  // ---- Gaia (Mago, Tier 3 — arma+torso+pés+acessório, sem capacete) ----
  { nome: "Orbe Stellaris", categoria: "Arma", tier: 3, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Orbe Stellaris.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Orbe", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 11, max: 16 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Cristal de Mana", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Flor Solar", quantidade_base: 1 }] },
  { nome: "Manto Gaia", categoria: "Armadura", tier: 3, multiplicador_tempo: 1.5,
    imagem: "/images/equipamentos/Manto Gaia.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Torso" }, defesaBase: 8,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Cristal de Mana", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Cedro", quantidade_base: 2 }] },
  { nome: "Sapato Gaia", categoria: "Armadura", tier: 3, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Sapato Gaia.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Pes" }, defesaBase: 3,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Cristal de Mana", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Cedro", quantidade_base: 1 }] },
  { nome: "Ruptura Arcana", categoria: "Acessorio1", tier: 3, multiplicador_tempo: 0.7,
    imagem: "/images/equipamentos/Ruptura Arcana.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Acessorio1" }, defesaBase: 2,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Cristal de Mana", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Fruto Místico", quantidade_base: 1 }] },
];

module.exports = {
  async up(queryInterface) {
    // 1) Remove os 12 itens órfãos (sem Blueprint) da migration anterior.
    const [orfaos] = await queryInterface.sequelize.query(
      `SELECT id FROM "Items" WHERE nome IN (${NOMES_ITENS_ORFAOS.map(() => "?").join(",")});`,
      { replacements: NOMES_ITENS_ORFAOS },
    );
    if (orfaos.length > 0) {
      const idsOrfaos = orfaos.map((o) => o.id);
      await queryInterface.sequelize.query(`DELETE FROM "WeaponProperties" WHERE id_item IN (${idsOrfaos.join(",")});`);
      await queryInterface.sequelize.query(`DELETE FROM "ArmorProperties" WHERE id_item IN (${idsOrfaos.join(",")});`);
      await queryInterface.sequelize.query(`DELETE FROM "Items" WHERE id IN (${idsOrfaos.join(",")});`);
      console.log(`[migration] ${idsOrfaos.length} item(ns) órfão(s) removido(s).`);
    }

    let blueprintsCriados = 0;
    let itensCriados = 0;

    // 2) Cria cada blueprint + ingredientes + 6 qualidades.
    for (const bp of BLUEPRINTS) {
      const [[existente]] = await queryInterface.sequelize.query(
        `SELECT id FROM forge_blueprints WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: bp.nome } },
      );
      if (existente) {
        console.log(`[migration] Blueprint "${bp.nome}" já existe — pulando.`);
        continue;
      }

      const [[blueprintCriado]] = await queryInterface.sequelize.query(
        `INSERT INTO forge_blueprints (nome, categoria_equipamento, multiplicador_tempo, nivel_forja_minimo, tier_equipamento, ativo, "createdAt", "updatedAt")
         VALUES (:nome, :categoria, :multiplicador, 1, :tier, true, now(), now())
         RETURNING id;`,
        { replacements: { nome: bp.nome, categoria: bp.categoria, multiplicador: bp.multiplicador_tempo, tier: bp.tier } },
      );
      const idBlueprint = blueprintCriado.id;
      blueprintsCriados += 1;

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
          { replacements: { id_blueprint: idBlueprint, tipo_insumo: ingrediente.tipo_insumo, id_recurso: recurso.id, quantidade: ingrediente.quantidade_base } },
        );
      }

      for (const qualidade of QUALIDADES) {
        const nomeItem = `${bp.nome} — ${NOME_EXIBICAO_QUALIDADE[qualidade]}`;
        const fator = fatorPoder(bp.tier, qualidade);

        const [[itemCriado]] = await queryInterface.sequelize.query(
          `INSERT INTO "Items" (nome, descricao, tipo_item, raridade, valor_compra, valor_venda, peso, imagem_url, tier_equipamento, disponivel_loja, "createdAt", "updatedAt")
           VALUES (:nome, :descricao, :tipo_item, :raridade, 0, :valor_venda, 1, :imagem_url, :tier, false, now(), now())
           RETURNING id;`,
          {
            replacements: {
              nome: nomeItem,
              descricao: `${bp.nome} fabricado na Forja, qualidade ${NOME_EXIBICAO_QUALIDADE[qualidade]}.`,
              tipo_item: bp.categoria,
              raridade: qualidade,
              valor_venda: Math.round(VALOR_VENDA_POR_QUALIDADE[qualidade] * TIER_ECONOMIC_MULTIPLIER[bp.tier]),
              imagem_url: bp.imagem,
              tier: bp.tier,
            },
          },
        );
        const idItem = itemCriado.id;

        if (bp.tipoPropriedade === "Weapon") {
          await queryInterface.sequelize.query(
            `INSERT INTO "WeaponProperties" (id_item, dano_min, dano_max, tipo_dano, tipo_arma, bonus_atributo, valor_bonus_atributo, "createdAt", "updatedAt")
             VALUES (:id_item, :dano_min, :dano_max, :tipo_dano, :tipo_arma, :bonus_atributo, :valor_bonus, now(), now());`,
            {
              replacements: {
                id_item: idItem,
                dano_min: Math.round(bp.danoBase.min * fator),
                dano_max: Math.round(bp.danoBase.max * fator),
                tipo_dano: bp.weapon.tipo_dano,
                tipo_arma: bp.weapon.tipo_arma,
                bonus_atributo: bp.weapon.bonus_atributo,
                valor_bonus: Math.round(1 * fator * 10) / 10,
              },
            },
          );
        } else {
          await queryInterface.sequelize.query(
            `INSERT INTO "ArmorProperties" (id_item, slot_equipamento, defesa, bonus_forca, bonus_vitalidade, bonus_inteligencia, bonus_agilidade, bonus_velocidade, "createdAt", "updatedAt")
             VALUES (:id_item, :slot, :defesa, 0, :bonus_vit, 0, 0, 0, now(), now());`,
            {
              replacements: {
                id_item: idItem,
                slot: bp.armor.slot_equipamento,
                defesa: Math.round(bp.defesaBase * fator),
                bonus_vit: Math.round(1 * fator),
              },
            },
          );
        }

        await queryInterface.sequelize.query(
          `INSERT INTO forge_blueprint_results (id_blueprint, qualidade, id_item)
           VALUES (:id_blueprint, :qualidade, :id_item);`,
          { replacements: { id_blueprint: idBlueprint, qualidade, id_item: idItem } },
        );
        itensCriados += 1;
      }
    }

    console.log(`[migration] ${blueprintsCriados} blueprint(s) criado(s), ${itensCriados} item(ns) criado(s) (6 qualidades cada).`);
  },

  async down(queryInterface) {
    const nomes = BLUEPRINTS.map((bp) => bp.nome);
    const [blueprints] = await queryInterface.sequelize.query(
      `SELECT id FROM forge_blueprints WHERE nome IN (${nomes.map(() => "?").join(",")});`,
      { replacements: nomes },
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
