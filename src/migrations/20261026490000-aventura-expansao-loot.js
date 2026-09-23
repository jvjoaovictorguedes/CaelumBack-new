"use strict";

const { MONSTROS, CHANCE_PPM } = require("../config/adventureExpansionData");

// Expansão Aventura Beta §19-22/§46 passo 10 — cria o AdventureMonsterLoot
// de TODOS os 40 monstros (inclusive os 9 já existentes, cujo item
// legado vira o drop "Principal" — §22: "migrar os 9 drops atuais para
// seus monstros corretos"). Cada entrada rola INDEPENDENTE (§21) — nunca
// uma escolha exclusiva entre os drops do mesmo monstro.
//
// AdventureZoneLoot (o modelo antigo, por zona) NÃO é apagado aqui — só
// fica sem uso a partir de agora que adventureRewardService.js passa a
// preferir loot por monstro (ver próxima migration/patch note e o commit
// do service). §22 passo 5: remover/depreciar de vez fica pra uma versão
// posterior.
module.exports = {
  async up(queryInterface) {
    async function idPorNome(tabela, nome) {
      const [linhas] = await queryInterface.sequelize.query(
        `SELECT id FROM "${tabela}" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome } },
      );
      return linhas[0]?.id ?? null;
    }

    for (const m of MONSTROS) {
      const idMonstro = await idPorNome("AdventureMonsters", m.nome);
      if (!idMonstro) continue;

      const ehRaro = m.tipo === "Raro";
      const categorias = ehRaro ? ["Principal", "Secundario", "Especial"] : ["Principal", "Secundario"];

      for (let indice = 0; indice < m.drops.length; indice += 1) {
        const nomeItem = m.drops[indice];
        const idItem = await idPorNome("Items", nomeItem);
        if (!idItem) continue;

        const categoria = categorias[indice];
        const [existente] = await queryInterface.sequelize.query(
          `SELECT id FROM "AdventureMonsterLoots" WHERE id_monstro = :idMonstro AND id_item = :idItem LIMIT 1;`,
          { replacements: { idMonstro, idItem } },
        );
        if (existente.length > 0) continue;

        let chancePpm;
        let quantidadeMax;
        if (categoria === "Principal") {
          chancePpm = ehRaro ? CHANCE_PPM.principalRaro : CHANCE_PPM.principalComum;
          quantidadeMax = 2;
        } else if (categoria === "Secundario") {
          chancePpm = ehRaro ? CHANCE_PPM.secundarioRaro : CHANCE_PPM.secundarioComum;
          quantidadeMax = 1;
        } else {
          chancePpm = CHANCE_PPM.especialRaro;
          quantidadeMax = 1;
        }

        await queryInterface.bulkInsert("AdventureMonsterLoots", [
          {
            id_monstro: idMonstro,
            id_item: idItem,
            chance_ppm: chancePpm,
            quantidade_min: 1,
            quantidade_max: quantidadeMax,
            categoria,
            ativo: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
      }
    }
  },

  async down(queryInterface) {
    async function idPorNome(tabela, nome) {
      const [linhas] = await queryInterface.sequelize.query(
        `SELECT id FROM "${tabela}" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome } },
      );
      return linhas[0]?.id ?? null;
    }
    const idsMonstros = [];
    for (const m of MONSTROS) {
      const id = await idPorNome("AdventureMonsters", m.nome);
      if (id) idsMonstros.push(id);
    }
    if (idsMonstros.length > 0) {
      await queryInterface.bulkDelete("AdventureMonsterLoots", { id_monstro: idsMonstros });
    }
  },
};
