"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aventura' AND versao = '3.1' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aventura 3.1 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aventura', '3.1', 'Correção de dificuldade e novos cenários de combate',
         'Corrigimos um bug sério: entrar numa Área de Caça acima do seu nível (como o Covil do Minotauro, recomendado pra nível 30-50) não deixava a luta mais difícil de verdade — o monstro sorteado tinha o "nível" só no nome, mas a força dele era calibrada pelos SEUS atributos atuais, então dava pra vencer um "Minotauro nível 50" tranquilamente sendo nível 12. Agora, quanto maior a diferença entre o nível sorteado do monstro e o seu nível atual, mais forte esse monstro fica de verdade — entrar numa zona muito acima do seu nível continua permitido, mas agora é genuinamente arriscado, como já avisava o indicador de perigo. Também demos identidade visual a mais alguns monstros: Espectro Sussurrante (cripta), Bandido Errante (acampamento), Golem de Pedra (templo em ruínas) e Minotauro (covil) agora têm cenário de fundo próprio na tela de combate, e Terras Devastadas ganhou um fundo padrão para os demais monstros da zona.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aventura", versao: "3.1" });
  },
};
