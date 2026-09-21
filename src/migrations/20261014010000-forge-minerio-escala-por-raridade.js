"use strict";

// Fix: os blueprints de Espada/Cajado/Peitoral/Anel "de todos os
// minérios" (20260930400000-forge-blueprints-todos-minerios.js)
// escalavam dano/defesa/valor_venda só pela QUALIDADE dos materiais
// (Comum..Mítico), nunca pelo MINÉRIO em si — um Cajado de Cobre e um
// de Minério Celestial saíam com o dano/venda idênticos na mesma
// qualidade, apesar de Minério Celestial ser MUITO mais raro de achar
// (só na última região de Mineração, ver seed-expedition-regions.js).
// Jogador percebeu: "não faz diferença, joga no ralo o minério ser
// mais difícil de encontrar". Aplica um multiplicador por minério
// (mesma ordem de raridade das regiões de Expedição) em cima do que já
// existe, recalculando os valores dos Items já criados — idempotente
// (sempre recomputa do zero a partir da mesma base, nunca multiplica
// em cima do valor já migrado).
const MINERAIS = ["Ferro", "Cobre", "Prata", "Ouro", "Cristal de Mana", "Obsidiana", "Astralita", "Minério Celestial"];
const QUALIDADES = ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"];
const NOME_EXIBICAO_QUALIDADE = { Comum: "Comum", Incomum: "Incomum", Raro: "Raro", Epico: "Épico", Lendario: "Lendário", Mitico: "Mítico" };
const ESCALA_POR_QUALIDADE = { Comum: 1, Incomum: 1.4, Raro: 2, Epico: 3, Lendario: 4.5, Mitico: 6.5 };
const VALOR_VENDA_POR_QUALIDADE = { Comum: 15, Incomum: 45, Raro: 130, Epico: 400, Lendario: 1200, Mitico: 3500 };

// Progressão de raridade dos minérios — mesma ordem em que eles
// aparecem desbloqueando região por região na Expedição de Mineração
// (Ferro/Cobre -> Prata/Ouro -> Cristal de Mana/Obsidiana -> Astralita
// -> Minério Celestial). Minério Celestial fica ~3.5x mais forte que
// Ferro na mesma qualidade — dá pra sentir a diferença de garimpar até
// a última região sem deixar a escala de qualidade (até 6.5x) ficar
// irrelevante.
const ESCALA_POR_MINERAL = {
  Ferro: 1,
  Cobre: 1.15,
  Prata: 1.35,
  Ouro: 1.6,
  "Cristal de Mana": 1.9,
  Obsidiana: 2.3,
  Astralita: 2.8,
  "Minério Celestial": 3.5,
};

const TEMPLATES = [
  {
    sufixoBlueprint: "Espada",
    nomeBaseItem: (mineral) => `Espada Forjada de ${mineral}`,
    tipoPropriedade: "Weapon",
    danoBase: { min: 6, max: 10 },
  },
  {
    sufixoBlueprint: "Cajado",
    nomeBaseItem: (mineral) => `Cajado Forjado de ${mineral}`,
    tipoPropriedade: "Weapon",
    danoBase: { min: 5, max: 8 },
  },
  {
    sufixoBlueprint: "Peitoral",
    nomeBaseItem: (mineral) => `Peitoral Forjado de ${mineral}`,
    tipoPropriedade: "Armor",
    defesaBase: 4,
  },
  {
    sufixoBlueprint: "Anel",
    nomeBaseItem: (mineral) => `Anel Forjado de ${mineral}`,
    tipoPropriedade: "Armor",
    defesaBase: 2,
  },
];

module.exports = {
  async up(queryInterface) {
    let atualizados = 0;
    for (const mineral of MINERAIS) {
      const escalaMineral = ESCALA_POR_MINERAL[mineral];
      for (const template of TEMPLATES) {
        for (const qualidade of QUALIDADES) {
          const nomeItem = `${template.nomeBaseItem(mineral)} — ${NOME_EXIBICAO_QUALIDADE[qualidade]}`;
          const escalaQualidade = ESCALA_POR_QUALIDADE[qualidade];
          const escalaFinal = escalaQualidade * escalaMineral;

          const [[item]] = await queryInterface.sequelize.query(
            `SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`,
            { replacements: { nome: nomeItem } },
          );
          if (!item) {
            console.log(`[migration] Item "${nomeItem}" não encontrado — pulando.`);
            continue;
          }

          await queryInterface.sequelize.query(
            `UPDATE "Items" SET valor_venda = :valor_venda WHERE id = :id;`,
            {
              replacements: {
                id: item.id,
                valor_venda: Math.round(VALOR_VENDA_POR_QUALIDADE[qualidade] * escalaMineral),
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
                  dano_min: Math.round(template.danoBase.min * escalaFinal),
                  dano_max: Math.round(template.danoBase.max * escalaFinal),
                  valor_bonus: Math.round(1 * escalaFinal * 10) / 10,
                },
              },
            );
          } else {
            await queryInterface.sequelize.query(
              `UPDATE "ArmorProperties"
               SET defesa = :defesa, bonus_vitalidade = :bonus_vit
               WHERE id_item = :id;`,
              {
                replacements: {
                  id: item.id,
                  defesa: Math.round(template.defesaBase * escalaFinal),
                  bonus_vit: Math.round(1 * escalaFinal),
                },
              },
            );
          }
          atualizados += 1;
        }
      }
    }
    console.log(`[migration] ${atualizados} itens forjados recalculados com escala por minério.`);
  },

  // Reverte pro comportamento antigo (só escala de qualidade, sem
  // diferenciar minério) — mesma fórmula da migration original.
  async down(queryInterface) {
    for (const mineral of MINERAIS) {
      for (const template of TEMPLATES) {
        for (const qualidade of QUALIDADES) {
          const nomeItem = `${template.nomeBaseItem(mineral)} — ${NOME_EXIBICAO_QUALIDADE[qualidade]}`;
          const escala = ESCALA_POR_QUALIDADE[qualidade];

          const [[item]] = await queryInterface.sequelize.query(
            `SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`,
            { replacements: { nome: nomeItem } },
          );
          if (!item) continue;

          await queryInterface.sequelize.query(
            `UPDATE "Items" SET valor_venda = :valor_venda WHERE id = :id;`,
            { replacements: { id: item.id, valor_venda: VALOR_VENDA_POR_QUALIDADE[qualidade] } },
          );

          if (template.tipoPropriedade === "Weapon") {
            await queryInterface.sequelize.query(
              `UPDATE "WeaponProperties"
               SET dano_min = :dano_min, dano_max = :dano_max, valor_bonus_atributo = :valor_bonus
               WHERE id_item = :id;`,
              {
                replacements: {
                  id: item.id,
                  dano_min: Math.round(template.danoBase.min * escala),
                  dano_max: Math.round(template.danoBase.max * escala),
                  valor_bonus: Math.round(1 * escala * 10) / 10,
                },
              },
            );
          } else {
            await queryInterface.sequelize.query(
              `UPDATE "ArmorProperties" SET defesa = :defesa, bonus_vitalidade = :bonus_vit WHERE id_item = :id;`,
              {
                replacements: {
                  id: item.id,
                  defesa: Math.round(template.defesaBase * escala),
                  bonus_vit: Math.round(1 * escala),
                },
              },
            );
          }
        }
      }
    }
  },
};
