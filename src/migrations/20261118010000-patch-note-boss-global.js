"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Ameaça Mundial' AND versao = '1.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Ameaça Mundial 1.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, resumo, destaque, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Ameaça Mundial', '1.0', 'Uma Ameaça Mundial desperta em Caelum',
         'Um novo chefe global pode surgir enquanto você explora a Aventura: encontros de zona têm chance de revelar sua presença, e quando descoberta ela desperta para todo o servidor lutar junto — sem grupos fixos, sem fila, cada aventureiro entra e ataca por conta própria contra o mesmo HP compartilhado por todos. Dano de participação, quem desfere o golpe final e quem a descobriu primeiro recebem recompensas de Ouro, experiência e itens exclusivos. Acompanhe pela Guilda dos Aventureiros, aba "Ameaça Mundial", ou pelo aviso que aparece no topo da tela quando ela é avistada.',
         'Um chefe global e cooperativo: descoberto explorando a Aventura, enfrentado por todo o servidor ao mesmo tempo, com recompensas por contribuição, descoberta e golpe final.',
         true, CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Ameaça Mundial", versao: "1.0" });
  },
};
