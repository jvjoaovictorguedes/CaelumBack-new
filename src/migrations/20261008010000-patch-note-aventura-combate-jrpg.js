"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aventura' AND versao = '3.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aventura 3.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aventura', '3.0', 'Combate da Aventura com visual de RPG',
         'A tela de combate da Aventura ganhou uma repaginada no estilo dos RPGs de turno: seu personagem agora caminha de verdade até o inimigo pra golpear (e o inimigo caminha até você no contra-ataque), em vez daquele "passinho" no lugar de antes. Os números de dano e cura continuam aparecendo do mesmo jeito, flutuando sobre a cabeça de quem foi atingido. As habilidades e consumíveis agora ficam fixos numa barra na parte de baixo da tela, sempre visíveis. O log de combate saiu da tela principal pra não poluir a visão da luta — agora é só clicar no ícone "i" pra abrir o registro completo em um popup. E o Bosque de Sussurros ganhou um fundo de floresta de verdade (as outras Áreas de Caça ainda usam o cenário padrão, por enquanto).',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aventura", versao: "3.0" });
  },
};
