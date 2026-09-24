"use strict";

// Corrige o set Gaia (a peça de arma/cabeça certa é Cajado Colisão
// Elemental + Chapéu Gaia — não Orbe Stellaris/Ruptura Arcana, que eu
// tinha usado errado por falta de imagem na hora) e adiciona 3 sets
// novos + 9 armas avulsas (sem set, "DIVERSOS"), tudo no mesmo padrão
// de ForgeBlueprint com 6 qualidades usado em
// 20261026700000-forge-premium-equipment-sets.js.
const QUALIDADES = ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"];
const NOME_EXIBICAO_QUALIDADE = { Comum: "Comum", Incomum: "Incomum", Raro: "Raro", Epico: "Épico", Lendario: "Lendário", Mitico: "Mítico" };
const TIER_POWER_MULTIPLIER = { 5: 1.0, 4: 1.25, 3: 1.55, 2: 1.95, 1: 2.45 };
const RARITY_POWER_MULTIPLIER = { Comum: 1.0, Incomum: 1.05, Raro: 1.1, Epico: 1.17, Lendario: 1.25, Mitico: 1.35 };
const TIER_ECONOMIC_MULTIPLIER = { 5: 1, 4: 2, 3: 4, 2: 8, 1: 16 };
const VALOR_VENDA_POR_QUALIDADE = { Comum: 15, Incomum: 45, Raro: 130, Epico: 400, Lendario: 1200, Mitico: 3500 };

function fatorPoder(tier, qualidade) {
  return TIER_POWER_MULTIPLIER[tier] * RARITY_POWER_MULTIPLIER[qualidade];
}

// Blueprints errados criados em 20261026700000 pro set Gaia — nasceram
// sem imagem própria na hora (usei Orbe Stellaris/Ruptura Arcana
// emprestados). Removidos aqui; Manto Gaia e Sapato Gaia (nomes e
// imagens corretos desde o início) continuam intactos.
const NOMES_BLUEPRINTS_ERRADOS = ["Orbe Stellaris", "Ruptura Arcana"];

const BLUEPRINTS = [
  // ---- Gaia (Mago, Tier 3) — completa o set com a arma e capacete certos ----
  { nome: "Cajado Colisão Elemental", categoria: "Arma", tier: 3, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Cajado Colisão Elemental.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 11, max: 16 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Cristal de Mana", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Flor Solar", quantidade_base: 1 }] },
  { nome: "Chapéu Gaia", categoria: "Capacete", tier: 3, multiplicador_tempo: 1.2,
    imagem: "/images/equipamentos/Chapéu Gaia.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Cabeca" }, defesaBase: 4,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Cristal de Mana", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Cedro", quantidade_base: 1 }] },

  // ---- Ruptura Arcana (Mago, Tier 2) ----
  { nome: "Grimório Celeste", categoria: "Arma", tier: 2, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Grimório Celeste.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 13, max: 19 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Astralita", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Essência Celestial", quantidade_base: 1 }] },
  { nome: "Chapéu Ruptura Mágica", categoria: "Capacete", tier: 2, multiplicador_tempo: 1.2,
    imagem: "/images/equipamentos/Chapéu Ruptura Mágica.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Cabeca" }, defesaBase: 7,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Astralita", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Essência Celestial", quantidade_base: 1 }] },
  { nome: "Manto Ruptura Mágica", categoria: "Armadura", tier: 2, multiplicador_tempo: 1.5,
    imagem: "/images/equipamentos/Manto Ruptura Mágica.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Torso" }, defesaBase: 12,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Astralita", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Madeira Arcana", quantidade_base: 2 }] },
  { nome: "Bota Ruptura Mágica", categoria: "Armadura", tier: 2, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Bota Ruptura Mágica.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Pes" }, defesaBase: 5,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Astralita", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Madeira Arcana", quantidade_base: 1 }] },

  // ---- Equinócio (Mago — o Grimório é claramente arma de conjurador,
  // apesar da pasta de origem ter vindo nomeada "- GUERREIRO"; se a
  // intenção era Guerreiro mesmo, é só avisar que troco o tipo_arma.
  // Tier 2) ----
  { nome: "Grimório Equinócio", categoria: "Arma", tier: 2, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Grimório Equinócio.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 13, max: 19 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Obsidiana", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Erva de Mana", quantidade_base: 1 }] },
  { nome: "Máscara Equinócio", categoria: "Capacete", tier: 2, multiplicador_tempo: 1.2,
    imagem: "/images/equipamentos/Máscara Equinócio.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Cabeca" }, defesaBase: 7,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Obsidiana", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Erva de Mana", quantidade_base: 1 }] },
  { nome: "Manto Equinócio", categoria: "Armadura", tier: 2, multiplicador_tempo: 1.5,
    imagem: "/images/equipamentos/Manto Equinócio.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Torso" }, defesaBase: 12,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Obsidiana", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Flor Lunar", quantidade_base: 2 }] },
  { nome: "Sapatos Equinócio", categoria: "Armadura", tier: 2, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Sapatos Equinócio.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Pes" }, defesaBase: 5,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Obsidiana", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Flor Lunar", quantidade_base: 1 }] },
  // Não fazem parte do set fechado (só 4 slots: arma/cabeça/torso/pés) —
  // viram 2 acessórios avulsos, um em cada slot de acessório pra dar
  // pra equipar os dois ao mesmo tempo (tema dia/noite).
  { nome: "Véu da Noite", categoria: "Acessorio1", tier: 2, multiplicador_tempo: 0.7,
    imagem: "/images/equipamentos/Véu da Noite.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Acessorio1" }, defesaBase: 3,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Obsidiana", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Salgueiro Lunar", quantidade_base: 1 }] },
  { nome: "Véu do Dia", categoria: "Acessorio2", tier: 2, multiplicador_tempo: 0.7,
    imagem: "/images/equipamentos/Véu do Dia.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Acessorio2" }, defesaBase: 3,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Obsidiana", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Flor Solar", quantidade_base: 1 }] },

  // ---- Véu do Dragão (Guerreiro, Tier 1 — tema dracônico, topo de linha) ----
  { nome: "Lança Véu do Dragão", categoria: "Arma", tier: 1, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Lança Véu do Dragão.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Lança", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 16, max: 23 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Minério Celestial", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Madeira Dracônica", quantidade_base: 1 }] },
  { nome: "Elmo Véu do Dragão", categoria: "Capacete", tier: 1, multiplicador_tempo: 1.2,
    imagem: "/images/equipamentos/Elmo Véu do Dragão.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Cabeca" }, defesaBase: 9,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Minério Celestial", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Madeira Dracônica", quantidade_base: 1 }] },
  { nome: "Armadura Véu do Dragão", categoria: "Armadura", tier: 1, multiplicador_tempo: 1.5,
    imagem: "/images/equipamentos/Armadura Véu do Dragão.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Torso" }, defesaBase: 16,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Minério Celestial", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Essência Celestial", quantidade_base: 2 }] },
  { nome: "Botas Véu do Dragão", categoria: "Armadura", tier: 1, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Botas Véu do Dragão.png", tipoPropriedade: "Armor",
    armor: { slot_equipamento: "Pes" }, defesaBase: 7,
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Minério Celestial", quantidade_base: 2 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Essência Celestial", quantidade_base: 1 }] },

  // ---- DIVERSOS — armas avulsas, sem set (só categoria Arma). Tier 3.
  // tipo_arma/tipo_dano/bonus_atributo inferidos só pelo nome/tema —
  // sinalizar se algum ficou errado. ----
  { nome: "Cutelo Rústico", categoria: "Arma", tier: 3, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Cutelo Rústico.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Machado", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 10, max: 15 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Carvalho", quantidade_base: 1 }] },
  { nome: "Foice Mana Abissal", categoria: "Arma", tier: 3, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Foice Mana Abissal.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 10, max: 15 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Cristal de Mana", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Erva de Mana", quantidade_base: 1 }] },
  { nome: "Foice do Emanador", categoria: "Arma", tier: 3, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Foice do Emanador.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 10, max: 15 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Cristal de Mana", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Erva Medicinal", quantidade_base: 1 }] },
  { nome: "Foice do Julgador", categoria: "Arma", tier: 3, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Foice do Julgador.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Cajado", tipo_dano: "Magico", bonus_atributo: "Inteligencia" }, danoBase: { min: 10, max: 15 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Cristal de Mana", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Essência Elemental", quantidade_base: 1 }] },
  { nome: "Lança Aqua", categoria: "Arma", tier: 3, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Lança Aqua.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Lança", tipo_dano: "Fisico", bonus_atributo: "Agilidade" }, danoBase: { min: 9, max: 14 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Prata", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Salgueiro Lunar", quantidade_base: 1 }] },
  { nome: "Lança Real", categoria: "Arma", tier: 3, multiplicador_tempo: 1.1,
    imagem: "/images/equipamentos/Lança Real.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Lança", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 11, max: 16 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ouro", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Flor Solar", quantidade_base: 1 }] },
  { nome: "Machado Rúnico", categoria: "Arma", tier: 3, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Machado Rúnico.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Machado", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 12, max: 17 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Prata", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Raiz Ancestral", quantidade_base: 1 }] },
  { nome: "Machado Rústico", categoria: "Arma", tier: 3, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Machado Rústico.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Machado", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 10, max: 15 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ferro", quantidade_base: 3 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Carvalho", quantidade_base: 1 }] },
  { nome: "Tormenta Real", categoria: "Arma", tier: 3, multiplicador_tempo: 1,
    imagem: "/images/equipamentos/Tormenta Real.png", tipoPropriedade: "Weapon",
    weapon: { tipo_arma: "Espada", tipo_dano: "Fisico", bonus_atributo: "Forca" }, danoBase: { min: 11, max: 16 },
    ingredientes: [{ tipo_insumo: "Barra", nomeRecurso: "Ouro", quantidade_base: 4 }, { tipo_insumo: "RecursoExpedicao", nomeRecurso: "Flor Solar", quantidade_base: 1 }] },
];

module.exports = {
  async up(queryInterface) {
    const [errados] = await queryInterface.sequelize.query(
      `SELECT id FROM forge_blueprints WHERE nome IN (${NOMES_BLUEPRINTS_ERRADOS.map(() => "?").join(",")});`,
      { replacements: NOMES_BLUEPRINTS_ERRADOS },
    );
    if (errados.length > 0) {
      const idsErrados = errados.map((b) => b.id);
      const [resultados] = await queryInterface.sequelize.query(
        `SELECT id_item FROM forge_blueprint_results WHERE id_blueprint IN (${idsErrados.join(",")});`,
      );
      const idsItens = resultados.map((r) => r.id_item);
      await queryInterface.sequelize.query(`DELETE FROM forge_blueprint_results WHERE id_blueprint IN (${idsErrados.join(",")});`);
      await queryInterface.sequelize.query(`DELETE FROM forge_blueprint_ingredients WHERE id_blueprint IN (${idsErrados.join(",")});`);
      await queryInterface.sequelize.query(`DELETE FROM forge_blueprints WHERE id IN (${idsErrados.join(",")});`);
      if (idsItens.length > 0) {
        await queryInterface.sequelize.query(`DELETE FROM "WeaponProperties" WHERE id_item IN (${idsItens.join(",")});`);
        await queryInterface.sequelize.query(`DELETE FROM "ArmorProperties" WHERE id_item IN (${idsItens.join(",")});`);
        await queryInterface.sequelize.query(`DELETE FROM "Items" WHERE id IN (${idsItens.join(",")});`);
      }
      console.log(`[migration] ${idsErrados.length} blueprint(s) errado(s) do set Gaia removido(s) (Orbe Stellaris/Ruptura Arcana).`);
    }

    let blueprintsCriados = 0;
    let itensCriados = 0;

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

    console.log(`[migration] ${blueprintsCriados} blueprint(s) novo(s), ${itensCriados} item(ns) criado(s) (6 qualidades cada).`);
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
