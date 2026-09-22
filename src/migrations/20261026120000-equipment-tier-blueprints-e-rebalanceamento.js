"use strict";

// Reestruturação de Tier de Equipamentos — passo 2/3 (spec §14/§21/§22/
// §24/§25): mapeia o Tier fixo dos 32 blueprints genéricos "de todos os
// minérios" (20260930400000-forge-blueprints-todos-minerios.js, com o
// fix de escala por minério em 20261014010000) e RECALCULA
// WeaponProperties/ArmorProperties/valor_venda dos 192 Items
// resultantes (32 blueprints × 6 qualidades), preservando os IDs —
// nenhum Item/instância de jogador é apagado ou recriado (§22: "Não
// excluir/recriar os Items atuais"). Os valores INLINE abaixo espelham
// src/config/equipmentTierConfig.js — se mexer num, mexa no outro
// (mesma convenção já usada nas duas migrations de Forja citadas
// acima, que reimplementam suas próprias cópias locais das tabelas).
//
// Fórmula NOVA (§11/§24), substituindo "dano = danoBase × raridade":
//   atributo = baseDoArquétipo × TIER_POWER_MULTIPLIER[tier] × RARITY_POWER_MULTIPLIER[raridade]
//   valor_venda = VALOR_VENDA_POR_QUALIDADE[raridade] × TIER_ECONOMIC_MULTIPLIER[tier]
// Isso troca o antigo `escalaQualidade × escalaMineral` — a escala
// contínua por minério (ESCALA_POR_MINERAL) é substituída pelo Tier
// discreto, que é o objetivo central da spec.
const MINERAIS = ["Ferro", "Cobre", "Prata", "Ouro", "Cristal de Mana", "Obsidiana", "Astralita", "Minério Celestial"];
const QUALIDADES = ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"];
const NOME_EXIBICAO_QUALIDADE = { Comum: "Comum", Incomum: "Incomum", Raro: "Raro", Epico: "Épico", Lendario: "Lendário", Mitico: "Mítico" };

// §14 — mapeamento inicial dos blueprints genéricos existentes, por
// material predominante. NÃO é regra global do material (§14: "não
// transformar em regra global") — só o ponto de partida pra estes 32
// blueprints específicos; receitas futuras podem ter Tier independente
// do minério predominante.
const TIER_POR_MINERAL = {
  Ferro: 5,
  Cobre: 5,
  Prata: 4,
  Ouro: 4,
  "Cristal de Mana": 3,
  Obsidiana: 3,
  Astralita: 2,
  "Minério Celestial": 1,
};

const TIER_POWER_MULTIPLIER = { 5: 1.0, 4: 1.25, 3: 1.55, 2: 1.95, 1: 2.45 };
const RARITY_POWER_MULTIPLIER = { Comum: 1.0, Incomum: 1.05, Raro: 1.1, Epico: 1.17, Lendario: 1.25, Mitico: 1.35 };
const TIER_ECONOMIC_MULTIPLIER = { 5: 1, 4: 2, 3: 4, 2: 8, 1: 16 };
const VALOR_VENDA_POR_QUALIDADE = { Comum: 15, Incomum: 45, Raro: 130, Epico: 400, Lendario: 1200, Mitico: 3500 };

function fatorPoder(tier, qualidade) {
  return TIER_POWER_MULTIPLIER[tier] * RARITY_POWER_MULTIPLIER[qualidade];
}

const TEMPLATES = [
  { sufixoBlueprint: "Espada", nomeBaseItem: (mineral) => `Espada Forjada de ${mineral}`, tipoPropriedade: "Weapon", danoBase: { min: 6, max: 10 } },
  { sufixoBlueprint: "Cajado", nomeBaseItem: (mineral) => `Cajado Forjado de ${mineral}`, tipoPropriedade: "Weapon", danoBase: { min: 5, max: 8 } },
  { sufixoBlueprint: "Peitoral", nomeBaseItem: (mineral) => `Peitoral Forjado de ${mineral}`, tipoPropriedade: "Armor", defesaBase: 4 },
  { sufixoBlueprint: "Anel", nomeBaseItem: (mineral) => `Anel Forjado de ${mineral}`, tipoPropriedade: "Armor", defesaBase: 2 },
];

module.exports = {
  async up(queryInterface) {
    let blueprintsAtualizados = 0;
    let itensRecalculados = 0;

    for (const mineral of MINERAIS) {
      const tier = TIER_POR_MINERAL[mineral];

      for (const template of TEMPLATES) {
        const nomeBlueprint = `${template.sufixoBlueprint} de ${mineral}`;

        const [[blueprint]] = await queryInterface.sequelize.query(
          `SELECT id, tier_equipamento FROM forge_blueprints WHERE nome = :nome LIMIT 1;`,
          { replacements: { nome: nomeBlueprint } },
        );
        if (!blueprint) {
          console.log(`[migration] Blueprint "${nomeBlueprint}" não encontrado — pulando.`);
          continue;
        }

        if (blueprint.tier_equipamento !== tier) {
          await queryInterface.sequelize.query(
            `UPDATE forge_blueprints SET tier_equipamento = :tier WHERE id = :id;`,
            { replacements: { tier, id: blueprint.id } },
          );
          blueprintsAtualizados += 1;
        }

        for (const qualidade of QUALIDADES) {
          const nomeItem = `${template.nomeBaseItem(mineral)} — ${NOME_EXIBICAO_QUALIDADE[qualidade]}`;
          const fator = fatorPoder(tier, qualidade);

          const [[item]] = await queryInterface.sequelize.query(
            `SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`,
            { replacements: { nome: nomeItem } },
          );
          if (!item) {
            console.log(`[migration] Item "${nomeItem}" não encontrado — pulando.`);
            continue;
          }

          await queryInterface.sequelize.query(
            `UPDATE "Items" SET tier_equipamento = :tier, valor_venda = :valor_venda WHERE id = :id;`,
            {
              replacements: {
                id: item.id,
                tier,
                valor_venda: Math.round(VALOR_VENDA_POR_QUALIDADE[qualidade] * TIER_ECONOMIC_MULTIPLIER[tier]),
              },
            },
          );

          if (template.tipoPropriedade === "Weapon") {
            await queryInterface.sequelize.query(
              `UPDATE "WeaponProperties"
               SET dano_min = :dano_min, dano_max = :dano_max, valor_bonus_atributo = :valor_bonus
               WHERE id_item = :id;`,
              {
                replacements: {
                  id: item.id,
                  dano_min: Math.round(template.danoBase.min * fator),
                  dano_max: Math.round(template.danoBase.max * fator),
                  valor_bonus: Math.round(1 * fator * 10) / 10,
                },
              },
            );
          } else {
            await queryInterface.sequelize.query(
              `UPDATE "ArmorProperties" SET defesa = :defesa, bonus_vitalidade = :bonus_vit WHERE id_item = :id;`,
              {
                replacements: {
                  id: item.id,
                  defesa: Math.round(template.defesaBase * fator),
                  bonus_vit: Math.round(1 * fator),
                },
              },
            );
          }
          itensRecalculados += 1;
        }
      }
    }

    // Todo blueprint tocado acima já tem Tier — checa se sobrou algum
    // OUTRO blueprint (fora dos 32 genéricos) sem Tier antes de travar
    // a coluna como NOT NULL, senão a migration falha silenciosamente
    // deixando blueprints futuros inconsistentes.
    const [[{ sem_tier }]] = await queryInterface.sequelize.query(
      `SELECT COUNT(*)::int AS sem_tier FROM forge_blueprints WHERE tier_equipamento IS NULL;`,
    );
    if (sem_tier > 0) {
      const [faltantes] = await queryInterface.sequelize.query(
        `SELECT nome FROM forge_blueprints WHERE tier_equipamento IS NULL;`,
      );
      throw new Error(
        `[migration] ${sem_tier} blueprint(s) sem Tier após o backfill: ${faltantes.map((f) => f.nome).join(", ")}. ` +
          `Adicione-os em TIER_POR_MINERAL/TEMPLATES antes de tornar a coluna NOT NULL.`,
      );
    }

    await queryInterface.sequelize.query(`ALTER TABLE forge_blueprints ALTER COLUMN tier_equipamento SET NOT NULL;`);

    console.log(
      `[migration] ${blueprintsAtualizados} blueprints com Tier atualizado, ${itensRecalculados} itens recalculados (Tier+Raridade). forge_blueprints.tier_equipamento agora NOT NULL.`,
    );
  },

  // Reverte pro comportamento anterior à spec de Tier (escala só por
  // minério contínuo, sem Tier) — mesma fórmula de
  // 20261014010000-forge-minerio-escala-por-raridade.js.
  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE forge_blueprints ALTER COLUMN tier_equipamento DROP NOT NULL;`);

    const ESCALA_POR_MINERAL = {
      Ferro: 1, Cobre: 1.15, Prata: 1.35, Ouro: 1.6, "Cristal de Mana": 1.9, Obsidiana: 2.3, Astralita: 2.8, "Minério Celestial": 3.5,
    };
    const ESCALA_POR_QUALIDADE = { Comum: 1, Incomum: 1.4, Raro: 2, Epico: 3, Lendario: 4.5, Mitico: 6.5 };

    for (const mineral of MINERAIS) {
      const escalaMineral = ESCALA_POR_MINERAL[mineral];
      for (const template of TEMPLATES) {
        const nomeBlueprint = `${template.sufixoBlueprint} de ${mineral}`;
        await queryInterface.sequelize.query(
          `UPDATE forge_blueprints SET tier_equipamento = NULL WHERE nome = :nome;`,
          { replacements: { nome: nomeBlueprint } },
        );

        for (const qualidade of QUALIDADES) {
          const nomeItem = `${template.nomeBaseItem(mineral)} — ${NOME_EXIBICAO_QUALIDADE[qualidade]}`;
          const escalaFinal = ESCALA_POR_QUALIDADE[qualidade] * escalaMineral;

          const [[item]] = await queryInterface.sequelize.query(
            `SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`,
            { replacements: { nome: nomeItem } },
          );
          if (!item) continue;

          await queryInterface.sequelize.query(
            `UPDATE "Items" SET tier_equipamento = NULL, valor_venda = :valor_venda WHERE id = :id;`,
            { replacements: { id: item.id, valor_venda: Math.round(VALOR_VENDA_POR_QUALIDADE[qualidade] * escalaMineral) } },
          );

          if (template.tipoPropriedade === "Weapon") {
            await queryInterface.sequelize.query(
              `UPDATE "WeaponProperties" SET dano_min = :dano_min, dano_max = :dano_max, valor_bonus_atributo = :valor_bonus WHERE id_item = :id;`,
              {
                replacements: {
                  id: item.id,
                  dano_min: Math.round(template.danoBase.min * escalaFinal),
                  dano_max: Math.round(template.danoBase.max * escalaFinal),
                  valor_bonus: Math.round(1 * escalaFinal * 10) / 10,
                },
              },
            );
          } else {
            await queryInterface.sequelize.query(
              `UPDATE "ArmorProperties" SET defesa = :defesa, bonus_vitalidade = :bonus_vit WHERE id_item = :id;`,
              { replacements: { id: item.id, defesa: Math.round(template.defesaBase * escalaFinal), bonus_vit: Math.round(1 * escalaFinal) } },
            );
          }
        }
      }
    }
  },
};
