"use strict";

// Regiões + recursos + peso relativo dentro de cada região. Pesos não
// foram especificados na spec além do exemplo da Região I de Mineração
// (Ferro 70 / Cobre 30) — pra todo o resto, assumi peso igual entre os
// recursos listados (documentado aqui, ajustável depois sem tocar em
// código).
const REGIOES = [
  // Mineração
  { profissao: "Mineracao", nome: "Mina Abandonada", nivel_minimo: 1, ordem: 1,
    descricao: "Uma mina simples, esquecida há anos — ainda dá pra tirar algo dela.",
    recursos: [["Ferro", 70], ["Cobre", 30]] },
  { profissao: "Mineracao", nome: "Cavernas Profundas", nivel_minimo: 3, ordem: 2,
    descricao: "Galerias naturais que descem mais fundo do que qualquer mina escavada.",
    recursos: [["Ferro", 40], ["Prata", 35], ["Ouro", 25]] },
  { profissao: "Mineracao", nome: "Galeria Arcana", nivel_minimo: 5, ordem: 3,
    descricao: "As paredes brilham fraco — algo aqui já foi tocado por magia antiga.",
    recursos: [["Prata", 35], ["Cristal de Mana", 35], ["Obsidiana", 30]] },
  { profissao: "Mineracao", nome: "Abismo Mineral", nivel_minimo: 7, ordem: 4,
    descricao: "Ninguém sabe até onde esse abismo desce de verdade.",
    recursos: [["Obsidiana", 55], ["Astralita", 45]] },
  { profissao: "Mineracao", nome: "Veio Celestial", nivel_minimo: 9, ordem: 5,
    descricao: "Um veio de minério que não deveria existir tão perto da superfície.",
    recursos: [["Astralita", 50], ["Minério Celestial", 50]] },

  // Silvicultura
  { profissao: "Silvicultura", nome: "Bosque dos Viajantes", nivel_minimo: 1, ordem: 1,
    descricao: "Árvores comuns, mas fartas — bom lugar pra começar a cortar madeira.",
    recursos: [["Carvalho", 60], ["Pinheiro", 40]] },
  { profissao: "Silvicultura", nome: "Floresta Antiga", nivel_minimo: 3, ordem: 2,
    descricao: "Árvores centenárias que já viram gerações de lenhadores passarem.",
    recursos: [["Carvalho", 40], ["Cedro", 35], ["Ébano", 25]] },
  { profissao: "Silvicultura", nome: "Bosque Encantado", nivel_minimo: 5, ordem: 3,
    descricao: "A madeira aqui responde de leve ao toque — não é uma floresta comum.",
    recursos: [["Madeira Arcana", 55], ["Salgueiro Lunar", 45]] },
  { profissao: "Silvicultura", nome: "Floresta Ancestral", nivel_minimo: 7, ordem: 4,
    descricao: "Ninguém registrou quando essas árvores começaram a crescer.",
    recursos: [["Ébano", 50], ["Madeira Dracônica", 50]] },
  { profissao: "Silvicultura", nome: "Bosque Celestial", nivel_minimo: 9, ordem: 5,
    descricao: "Um bosque que parece existir um pouco fora do mundo comum.",
    recursos: [["Madeira Dracônica", 50], ["Árvore Celestial", 50]] },

  // Exploração
  { profissao: "Exploracao", nome: "Campos Verdes", nivel_minimo: 1, ordem: 1,
    descricao: "Campos abertos logo fora da cidade — fáceis de explorar em segurança.",
    recursos: [["Erva Medicinal", 60], ["Erva de Mana", 40]] },
  { profissao: "Exploracao", nome: "Vale Silvestre", nivel_minimo: 3, ordem: 2,
    descricao: "Um vale mais fechado, com plantas que não crescem perto da cidade.",
    recursos: [["Erva Medicinal", 40], ["Flor Solar", 35], ["Cogumelo Carmesim", 25]] },
  { profissao: "Exploracao", nome: "Clareira Arcana", nivel_minimo: 5, ordem: 3,
    descricao: "Uma clareira onde a lua parece brilhar até durante o dia.",
    recursos: [["Erva Lunar", 35], ["Flor Lunar", 35], ["Essência Elemental", 30]] },
  { profissao: "Exploracao", nome: "Terras Ancestrais", nivel_minimo: 7, ordem: 4,
    descricao: "Ruínas cobertas de vegetação que ninguém consegue datar direito.",
    recursos: [["Raiz Ancestral", 40], ["Fruto Místico", 30], ["Erva Lunar", 30]] },
  { profissao: "Exploracao", nome: "Jardim Celestial", nivel_minimo: 9, ordem: 5,
    descricao: "Dizem que esse jardim só aparece pra quem já provou seu valor.",
    recursos: [["Fruto Místico", 50], ["Essência Celestial", 50]] },
];

module.exports = {
  async up(queryInterface) {
    for (const regiao of REGIOES) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM expedition_regions WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: regiao.nome } },
      );
      let idRegiao;
      if (existente.length > 0) {
        idRegiao = existente[0].id;
        console.log(`[migration] Região "${regiao.nome}" já existe — pulando criação.`);
      } else {
        const [linhas] = await queryInterface.sequelize.query(
          `INSERT INTO expedition_regions (nome, profissao, nivel_minimo, descricao, ordem, ativo, "createdAt", "updatedAt")
           VALUES (:nome, :profissao, :nivel_minimo, :descricao, :ordem, true, now(), now())
           RETURNING id;`,
          { replacements: regiao },
        );
        idRegiao = linhas[0].id;
      }

      for (const [nomeRecurso, peso] of regiao.recursos) {
        const [existenteRecurso] = await queryInterface.sequelize.query(
          `SELECT id FROM expedition_resources WHERE nome = :nome AND profissao = :profissao LIMIT 1;`,
          { replacements: { nome: nomeRecurso, profissao: regiao.profissao } },
        );
        let idRecurso;
        if (existenteRecurso.length > 0) {
          idRecurso = existenteRecurso[0].id;
        } else {
          const [linhasRecurso] = await queryInterface.sequelize.query(
            `INSERT INTO expedition_resources (nome, profissao, ativo, "createdAt", "updatedAt")
             VALUES (:nome, :profissao, true, now(), now())
             RETURNING id;`,
            { replacements: { nome: nomeRecurso, profissao: regiao.profissao } },
          );
          idRecurso = linhasRecurso[0].id;
        }

        const [existenteVinculo] = await queryInterface.sequelize.query(
          `SELECT 1 FROM expedition_region_resources WHERE id_regiao = :idRegiao AND id_recurso = :idRecurso LIMIT 1;`,
          { replacements: { idRegiao, idRecurso } },
        );
        if (existenteVinculo.length === 0) {
          await queryInterface.sequelize.query(
            `INSERT INTO expedition_region_resources (id_regiao, id_recurso, peso, "createdAt", "updatedAt")
             VALUES (:idRegiao, :idRecurso, :peso, now(), now());`,
            { replacements: { idRegiao, idRecurso, peso } },
          );
        }
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("expedition_regions", {
      nome: REGIOES.map((r) => r.nome),
    });
  },
};
