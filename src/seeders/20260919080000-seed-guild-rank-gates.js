"use strict";

// 8 Portais de Guilda (F até S+) — pool de vida gigante de propósito
// (BIGINT), pensada pra exigir dano somado de vários membros dentro da
// janela, não uma pessoa só. Ajuste depois de observar quantas guildas
// conseguem fechar cada ranque dentro do prazo.
module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      "SELECT COUNT(*)::int AS count FROM guild_rank_gates;",
    );
    if (rows[0].count > 0) {
      console.log("[seed] guild_rank_gates já tem dados — pulando.");
      return;
    }

    const agora = new Date();
    const portais = [
      { rank: "F", nome_chefe: "Alcateia de Sombras", vida_total: "5000", defesa: 5, janela_horas: 48, recompensa_tesouro: 500, recompensa_dinheiro_por_membro: 20 },
      { rank: "E", nome_chefe: "Legião de Cavaleiros Caídos", vida_total: "20000", defesa: 12, janela_horas: 48, recompensa_tesouro: 1500, recompensa_dinheiro_por_membro: 50 },
      { rank: "D", nome_chefe: "Ninho da Quimera Ancestral", vida_total: "60000", defesa: 22, janela_horas: 60, recompensa_tesouro: 4000, recompensa_dinheiro_por_membro: 120 },
      { rank: "C", nome_chefe: "Coro de Espectros do Abismo", vida_total: "150000", defesa: 35, janela_horas: 60, recompensa_tesouro: 9000, recompensa_dinheiro_por_membro: 250 },
      { rank: "B", nome_chefe: "Ninho do Dragão Carmesim", vida_total: "350000", defesa: 55, janela_horas: 72, recompensa_tesouro: 20000, recompensa_dinheiro_por_membro: 500 },
      { rank: "A", nome_chefe: "Convocação dos Arautos do Vazio", vida_total: "800000", defesa: 80, janela_horas: 72, recompensa_tesouro: 45000, recompensa_dinheiro_por_membro: 1000 },
      { rank: "S", nome_chefe: "Titã Colossal de Ferro", vida_total: "1800000", defesa: 115, janela_horas: 96, recompensa_tesouro: 100000, recompensa_dinheiro_por_membro: 2000 },
      { rank: "S+", nome_chefe: "Fragmento Vivo do Caos Primevo", vida_total: "4000000", defesa: 160, janela_horas: 96, recompensa_tesouro: 220000, recompensa_dinheiro_por_membro: 4000 },
    ].map((portal) => ({
      ...portal,
      descricao: `${portal.nome_chefe} ameaça as terras do ranque ${portal.rank}. Nenhuma guilda derruba isso sozinha em um golpe — precisa do esforço somado de todos os membros antes que o tempo se esgote.`,
      imagem_url: null,
      createdAt: agora,
      updatedAt: agora,
    }));

    await queryInterface.bulkInsert("guild_rank_gates", portais);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("guild_rank_gates", null, {});
  },
};
