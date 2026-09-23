"use strict";

const { MONSTROS, ITENS_LEGADOS, DESCRICAO_ITEM, FAIXA_POR_AREA } = require("../config/adventureExpansionData");
const { AREAS } = require("../config/adventureExpansionData");

// Expansão Aventura Beta §19/§23/§24/§46 passo 9 — cria os ~81 Items de
// Espólio novos (os 9 legados — ITENS_LEGADOS — já existem, nunca
// recriados/reescritos, §22/§47). Raridade/valor de venda escalam pela
// ordem final da área (FAIXA_POR_AREA) e pela posição do drop na lista
// do monstro (índice 0 = Principal, 1 = Secundário, 2 = Especial só em
// Raro) — ponto de partida pro Beta, a calibrar depois com o simulador
// de economia (§24/§41, não disponível neste ambiente agora).
module.exports = {
  async up(queryInterface) {
    const ordemPorArea = new Map(AREAS.map((a) => [a.nome, a.ordem]));
    const jaInseridos = new Set();

    for (const m of MONSTROS) {
      const ordem = ordemPorArea.get(m.area);
      const faixa = FAIXA_POR_AREA[ordem];

      for (let indice = 0; indice < m.drops.length; indice += 1) {
        const nomeItem = m.drops[indice];
        if (ITENS_LEGADOS.has(nomeItem)) continue;
        if (jaInseridos.has(nomeItem)) continue;

        const [existente] = await queryInterface.sequelize.query(
          `SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`,
          { replacements: { nome: nomeItem } },
        );
        if (existente.length > 0) {
          jaInseridos.add(nomeItem);
          continue;
        }

        // índice 0 = Principal, 1 = Secundário, 2 = Especial (só Raro).
        let raridade;
        let valorVenda;
        if (indice === 0) {
          raridade = faixa.principal;
          valorVenda = faixa.pVenda;
        } else if (indice === 1) {
          raridade = faixa.secundario;
          valorVenda = faixa.sVenda;
        } else {
          raridade = faixa.especial;
          valorVenda = faixa.eVenda;
        }

        await queryInterface.bulkInsert("Items", [
          {
            nome: nomeItem,
            descricao: DESCRICAO_ITEM[nomeItem] ?? `Espólio de ${m.nome}.`,
            tipo_item: "Espolio",
            raridade,
            valor_compra: 0,
            valor_venda: valorVenda,
            peso: 0.3,
            disponivel_loja: false,
            tier_equipamento: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
        jaInseridos.add(nomeItem);
      }
    }
  },

  async down(queryInterface) {
    // Não deletado de propósito — AdventureMonsterLoot (migration
    // seguinte) referencia esses Items por FK, e um jogador que já
    // recebeu um desses Espólios tem linha em CharacterInventoryItem
    // apontando pra ele. Mesma decisão de conteúdo-nunca-destrutivo já
    // usada nas outras migrations desta expansão.
    void queryInterface;
  },
};
