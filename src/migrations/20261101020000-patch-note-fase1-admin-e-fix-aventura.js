"use strict";

// Notas de patch: Painel Administrativo Fase 1 (permissões novas +
// categorias reorganizadas) e o fix do bug "Aventura pulava a seleção
// de zona depois de derrota".
const NOTAS = [
  {
    feature: "Administração",
    versao: "1.2",
    titulo: "Painel Administrativo reorganizado em categorias",
    descricao:
      "O hub administrativo agora segue as 5 categorias definitivas (Conteúdo, Jogadores, Economia, Eventos, Sistema), com os módulos futuros já visíveis como 'em breve'. Torneios mudou de Sistema para Eventos.",
  },
  {
    feature: "Aventura",
    versao: "4.7",
    titulo: "Corrigido: derrota também podia prender no mesmo encontro",
    descricao:
      "Sair da Aventura depois de uma derrota não encerrava a caçada no servidor (só a vitória fazia isso). Resultado: ao voltar pra Aventura, o jogo pulava a seleção de zona e caía direto no mesmo monstro. Agora os dois casos encerram a sessão corretamente.",
  },
];

module.exports = {
  async up(queryInterface) {
    for (const nota of NOTAS) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM patch_notes WHERE feature = :feature AND versao = :versao LIMIT 1;`,
        { replacements: { feature: nota.feature, versao: nota.versao } },
      );
      if (existente.length > 0) continue;

      const [[{ max }]] = await queryInterface.sequelize.query(
        `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
      );

      await queryInterface.sequelize.query(
        `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
         VALUES (:ordem, :feature, :versao, :titulo, :descricao, CURRENT_DATE, now(), now());`,
        {
          replacements: {
            ordem: max + 1,
            feature: nota.feature,
            versao: nota.versao,
            titulo: nota.titulo,
            descricao: nota.descricao,
          },
        },
      );
    }
  },

  async down(queryInterface) {
    for (const nota of NOTAS) {
      await queryInterface.bulkDelete("patch_notes", { feature: nota.feature, versao: nota.versao });
    }
  },
};
