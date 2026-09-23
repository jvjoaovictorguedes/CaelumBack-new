"use strict";

// Conquistas e Títulos iniciais (Especificação Perfil de Jogador, §47/
// §48) — catálogo estático, concedido de verdade pelo achievementService
// conforme o jogador cumpre a condição real (nunca automático aqui).
// Idempotente por `key`.
const CONQUISTAS = [
  { key: "primeiro_sangue", nome: "Primeiro Sangue", descricao: "Derrote a primeira criatura.", categoria: "Aventura" },
  { key: "senhor_do_labirinto", nome: "Senhor do Labirinto", descricao: "Derrote 100 Minotauros.", categoria: "Aventura" },
  { key: "naturalista", nome: "Naturalista", descricao: "Complete uma região do Bestiário.", categoria: "Bestiario" },
  { key: "mestre_do_bestiario", nome: "Mestre do Bestiário", descricao: "Obtenha Maestria V em uma região.", categoria: "Bestiario" },
  { key: "mestre_ferreiro", nome: "Mestre Ferreiro", descricao: "Alcance Forja Nível 10.", categoria: "Forja" },
  { key: "minerador_veterano", nome: "Minerador Veterano", descricao: "Alcance Mineração Nível 10.", categoria: "Expedicao" },
  { key: "veterano_da_arena", nome: "Veterano da Arena", descricao: "Vença 100 combates PvP.", categoria: "PvP" },
  { key: "campeao", nome: "Campeão", descricao: "Vença um torneio.", categoria: "PvP" },
  { key: "companheiro_de_armas", nome: "Companheiro de Armas", descricao: "Ingresse em uma Guilda.", categoria: "Guilda" },
];

// Alguns títulos vinculados a uma conquista (§26); outros soltos, pra
// vincular a condições futuras sem migration nova.
const TITULOS = [
  { key: "aventureiro", nome: "Aventureiro", descricao: null, achievementKey: null },
  { key: "cacador_de_espectros", nome: "Caçador de Espectros", descricao: null, achievementKey: null },
  { key: "senhor_do_labirinto", nome: "Senhor do Labirinto", descricao: null, achievementKey: "senhor_do_labirinto" },
  { key: "mestre_ferreiro", nome: "Mestre Ferreiro", descricao: null, achievementKey: "mestre_ferreiro" },
  { key: "veterano_da_arena", nome: "Veterano da Arena", descricao: null, achievementKey: "veterano_da_arena" },
  { key: "campeao_da_arena", nome: "Campeão da Arena", descricao: null, achievementKey: "campeao" },
  { key: "explorador_celestial", nome: "Explorador Celestial", descricao: null, achievementKey: null },
];

module.exports = {
  async up(queryInterface) {
    for (const c of CONQUISTAS) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM achievements WHERE key = :key LIMIT 1;`,
        { replacements: { key: c.key } },
      );
      if (existente.length > 0) continue;
      await queryInterface.sequelize.query(
        `INSERT INTO achievements (key, nome, descricao, categoria, ativa, "createdAt", "updatedAt")
         VALUES (:key, :nome, :descricao, :categoria, true, now(), now());`,
        { replacements: c },
      );
    }

    for (const t of TITULOS) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM titles WHERE key = :key LIMIT 1;`,
        { replacements: { key: t.key } },
      );
      if (existente.length > 0) continue;

      let idAchievement = null;
      if (t.achievementKey) {
        const [[achievement]] = await queryInterface.sequelize.query(
          `SELECT id FROM achievements WHERE key = :key LIMIT 1;`,
          { replacements: { key: t.achievementKey } },
        );
        idAchievement = achievement ? achievement.id : null;
      }

      await queryInterface.sequelize.query(
        `INSERT INTO titles (key, nome, descricao, id_achievement_desbloqueia, ativa, "createdAt", "updatedAt")
         VALUES (:key, :nome, :descricao, :id_achievement, true, now(), now());`,
        { replacements: { key: t.key, nome: t.nome, descricao: t.descricao, id_achievement: idAchievement } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("titles", { key: TITULOS.map((t) => t.key) });
    await queryInterface.bulkDelete("achievements", { key: CONQUISTAS.map((c) => c.key) });
  },
};
