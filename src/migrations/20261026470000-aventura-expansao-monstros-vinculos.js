"use strict";

const { AREAS, MONSTROS } = require("../config/adventureExpansionData");

// Expansão Aventura Beta §9-18/§46 passo 7-8 — insere os 31 monstros
// novos (os 9 existentes NUNCA são tocados aqui, §26/§47: multiplicador
// e nome preservados) e reconstrói os vínculos AdventureZoneMonster das
// 40 combinações (área, monstro) da spec.
//
// §8 — peso 320/320/320/40 (32%/32%/32%/4%) é o padrão novo pra TODAS as
// áreas, inclusive as 3 já existentes (que tinham 475/475/50 pra só 2
// Comuns) — atualiza o vínculo mesmo quando ele já existia, senão a soma
// dos pesos não fecha em 1000 depois de entrar o 3º Comum.
//
// 4 dos monstros já existentes "mudam de bairro" nesta expansão (mesmo
// monstro, mesmo ID, só o vínculo de zona muda — nunca apagado, só
// desativado): Bandido Errante e Cultista Renegado saem de Terras
// Devastadas pra Estrada dos Exilados/Ruínas de Cinza; Orc Guerreiro e
// Draconídeo Jovem saem de Covil do Minotauro pra Garganta de Ferro/
// Abismo Dracônico. Ver comentário de MIG anterior
// (20261026440000-...-piso-maestria) sobre por que isso precisa rodar
// DEPOIS do piso de Maestria já ter sido calculado com o roster antigo.
const VINCULOS_ANTIGOS_PARA_DESATIVAR = [
  { zona: "Terras Devastadas", monstro: "Bandido Errante" },
  { zona: "Terras Devastadas", monstro: "Cultista Renegado" },
  { zona: "Covil do Minotauro", monstro: "Orc Guerreiro" },
  { zona: "Covil do Minotauro", monstro: "Draconídeo Jovem" },
];

const PESO_COMUM = 320;
const PESO_RARO = 40;

module.exports = {
  async up(queryInterface) {
    async function idPorNome(tabela, nome) {
      const [linhas] = await queryInterface.sequelize.query(
        `SELECT id FROM "${tabela}" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome } },
      );
      return linhas[0]?.id ?? null;
    }

    // 1) Insere os 31 monstros novos (existente:true nunca é tocado).
    for (const m of MONSTROS) {
      if (m.existente) continue;
      const jaExiste = await idPorNome("AdventureMonsters", m.nome);
      if (jaExiste) continue;

      const [vida, dano, agilidade, velocidade] = m.mult;
      await queryInterface.bulkInsert("AdventureMonsters", [
        {
          nome: m.nome,
          descricao: m.descricao,
          imagem_url: null,
          sprite_key: null,
          multiplicador_vida: vida,
          multiplicador_dano: dano,
          multiplicador_agilidade: agilidade,
          multiplicador_velocidade: velocidade,
          ativo: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    }

    const areaPorNome = new Map(AREAS.map((a) => [a.nome, a]));

    // 2) Upsert dos 40 vínculos área<->monstro.
    for (const m of MONSTROS) {
      const idArea = await idPorNome("AdventureZones", m.area);
      const idMonstro = await idPorNome("AdventureMonsters", m.nome);
      if (!idArea || !idMonstro) continue;

      const area = areaPorNome.get(m.area);
      const ehRaro = m.tipo === "Raro";
      const peso = ehRaro ? PESO_RARO : PESO_COMUM;
      // §8 — Raro usa override pros 2 níveis superiores da área.
      const nivelMinOverride = ehRaro ? area.max - 1 : null;
      const nivelMaxOverride = ehRaro ? area.max : null;

      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM "AdventureZoneMonsters" WHERE id_area = :idArea AND id_monstro = :idMonstro LIMIT 1;`,
        { replacements: { idArea, idMonstro } },
      );

      if (existente.length > 0) {
        await queryInterface.sequelize.query(
          `UPDATE "AdventureZoneMonsters"
           SET peso_aparicao = :peso, tipo_aparicao = :tipo,
               nivel_min_override = :nivelMin, nivel_max_override = :nivelMax, ativo = true
           WHERE id = :id;`,
          {
            replacements: {
              peso,
              tipo: m.tipo,
              nivelMin: nivelMinOverride,
              nivelMax: nivelMaxOverride,
              id: existente[0].id,
            },
          },
        );
        continue;
      }

      await queryInterface.bulkInsert("AdventureZoneMonsters", [
        {
          id_area: idArea,
          id_monstro: idMonstro,
          peso_aparicao: peso,
          tipo_aparicao: m.tipo,
          nivel_min_override: nivelMinOverride,
          nivel_max_override: nivelMaxOverride,
          ativo: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    }

    // 3) Desativa os vínculos antigos de quem "mudou de bairro" — nunca
    //    apaga a linha (histórico/FKs), só marca ativo:false.
    for (const v of VINCULOS_ANTIGOS_PARA_DESATIVAR) {
      const idArea = await idPorNome("AdventureZones", v.zona);
      const idMonstro = await idPorNome("AdventureMonsters", v.monstro);
      if (!idArea || !idMonstro) continue;

      await queryInterface.sequelize.query(
        `UPDATE "AdventureZoneMonsters" SET ativo = false WHERE id_area = :idArea AND id_monstro = :idMonstro;`,
        { replacements: { idArea, idMonstro } },
      );
    }
  },

  async down(queryInterface) {
    // Não desfaz nada de propósito — não deleta os monstros novos nem os
    // vínculos, e não reativa os antigos (reativar sem também desativar
    // os novos deixaria o mesmo monstro ativo em duas zonas ao mesmo
    // tempo, pior que não reverter nada). Migrations POSTERIORES desta
    // expansão (AdventureMonsterLoot e os contratos novos da Guilda)
    // referenciam id_monstro/id_area por FK de verdade, e mesmo em
    // produção um monstro já abatido tem CharacterMonsterKill
    // referenciando o nome dele — apagar o catálogo por baixo não é
    // seguro. Mesma decisão de "conteúdo de catálogo não é revertido
    // destrutivamente" já usada no seed original da Guilda dos
    // Aventureiros (20260930760000) e na migration de contratos desta
    // mesma expansão (20261026500000).
    void queryInterface;
  },
};
