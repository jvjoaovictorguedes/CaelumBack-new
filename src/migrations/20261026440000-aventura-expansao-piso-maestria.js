"use strict";

// Expansão Aventura Beta §35 — PRECISA rodar ANTES de qualquer migration
// que mexa no roster de monstro das 3 áreas já existentes (Bosque de
// Sussurros / Terras Devastadas / Covil do Minotauro): calcula a
// Maestria Regional de cada personagem com o roster ANTIGO (2 Comuns +
// 1 Raro) ainda intacto no banco, e persiste como "piso" — depois que o
// catálogo crescer, calcularMaestriaDaRegiao (masteryService.js) nunca
// deixa o nível cair abaixo disso, mesmo que o cálculo ao vivo (com o
// roster novo, maior) ainda não tenha alcançado de volta esse nível.
//
// Reusa o serviço real (não reimplementa a fórmula aqui) pra nunca
// divergir da lógica de produção.
module.exports = {
  async up(queryInterface) {
    const CharacterZoneMasteryFloor = require("../models/CharacterZoneMasteryFloor");
    const CharacterMonsterKill = require("../models/CharacterMonsterKill");
    const { calcularMaestriaDaRegiao } = require("../services/masteryService");

    const ZONAS_EXISTENTES = ["Bosque de Sussurros", "Terras Devastadas", "Covil do Minotauro"];

    for (const nomeZona of ZONAS_EXISTENTES) {
      const [linhas] = await queryInterface.sequelize.query(
        `SELECT id FROM "AdventureZones" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: nomeZona } },
      );
      const idArea = linhas[0]?.id;
      if (!idArea) continue;

      const [vinculos] = await queryInterface.sequelize.query(
        `SELECT m.nome FROM "AdventureZoneMonsters" zm
         JOIN "AdventureMonsters" m ON m.id = zm.id_monstro
         WHERE zm.id_area = :idArea AND zm.ativo = true;`,
        { replacements: { idArea } },
      );
      const nomesMonstros = vinculos.map((v) => v.nome);
      if (nomesMonstros.length === 0) continue;

      const kills = await CharacterMonsterKill.findAll({
        where: { nome_monstro: nomesMonstros },
        attributes: ["id_personagem"],
        group: ["id_personagem"],
      });
      const idsPersonagens = [...new Set(kills.map((k) => k.id_personagem))];

      for (const idPersonagem of idsPersonagens) {
        const { nivel } = await calcularMaestriaDaRegiao(idPersonagem, idArea);
        if (nivel < 1) continue;

        const existente = await CharacterZoneMasteryFloor.findOne({
          where: { id_personagem: idPersonagem, id_area: idArea },
        });
        if (existente) continue;

        await CharacterZoneMasteryFloor.create({
          id_personagem: idPersonagem,
          id_area: idArea,
          nivel_piso: nivel,
        });
      }
    }
  },

  async down(queryInterface) {
    // Não reverte o piso persistido — remover isso de volta reabriria
    // exatamente a regressão que essa migration existe pra evitar. Um
    // down() aqui só faria sentido desfazendo a migration inteira (o que
    // já apaga a tabela CharacterZoneMasteryFloors na migration
    // estrutural), então este down() é proposital vazio.
    void queryInterface;
  },
};
