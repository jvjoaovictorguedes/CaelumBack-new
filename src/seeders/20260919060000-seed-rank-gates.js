"use strict";

// 8 Portais (F até S+ — S++ é o teto, sem portal seguinte). Stats
// FIXOS, escalando por tier — servem de ponto de partida jogável;
// ajuste os números depois de observar taxa de vitória real dos
// jogadores em cada ranque.
module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      'SELECT COUNT(*)::int AS count FROM rank_gates;',
    );
    if (rows[0].count > 0) {
      console.log("[seed] rank_gates já tem dados — pulando.");
      return;
    }

    const agora = new Date();
    const portais = [
      { rank: "F", nome_chefe: "Lobo Sombrio do Portal Instável", nivel_recomendado: 5, vida: 80, forca: 8, agilidade: 5, velocidade: 5, defesa: 5, recompensa_dinheiro: 50, recompensa_xp: 100 },
      { rank: "E", nome_chefe: "Cavaleiro Caído da Névoa", nivel_recomendado: 10, vida: 220, forca: 18, agilidade: 10, velocidade: 10, defesa: 12, recompensa_dinheiro: 150, recompensa_xp: 300 },
      { rank: "D", nome_chefe: "Quimera das Ruínas Profundas", nivel_recomendado: 18, vida: 500, forca: 32, agilidade: 18, velocidade: 15, defesa: 22, recompensa_dinheiro: 400, recompensa_xp: 700 },
      { rank: "C", nome_chefe: "Espectro do Abismo Selado", nivel_recomendado: 28, vida: 1000, forca: 50, agilidade: 28, velocidade: 22, defesa: 35, recompensa_dinheiro: 900, recompensa_xp: 1500 },
      { rank: "B", nome_chefe: "Dragão Jovem das Chamas Carmesim", nivel_recomendado: 40, vida: 2000, forca: 75, agilidade: 40, velocidade: 30, defesa: 55, recompensa_dinheiro: 2000, recompensa_xp: 3000 },
      { rank: "A", nome_chefe: "Arauto do Vazio Estelar", nivel_recomendado: 55, vida: 4000, forca: 110, agilidade: 55, velocidade: 40, defesa: 80, recompensa_dinheiro: 4500, recompensa_xp: 6000 },
      { rank: "S", nome_chefe: "Titã Ancestral de Ferro", nivel_recomendado: 75, vida: 8000, forca: 160, agilidade: 75, velocidade: 55, defesa: 115, recompensa_dinheiro: 10000, recompensa_xp: 12000 },
      { rank: "S+", nome_chefe: "Avatar do Caos Primevo", nivel_recomendado: 100, vida: 16000, forca: 230, agilidade: 100, velocidade: 70, defesa: 160, recompensa_dinheiro: 22000, recompensa_xp: 25000 },
    ].map((portal) => ({
      ...portal,
      descricao: `Um portal instável se abriu, guardado por ${portal.nome_chefe}. Só quem já provou sua força no ranque ${portal.rank} tem chance de atravessar vivo.`,
      vitalidade: 0,
      inteligencia: 0,
      imagem_url: null,
      createdAt: agora,
      updatedAt: agora,
    }));

    await queryInterface.bulkInsert("rank_gates", portais);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("rank_gates", null, {});
  },
};
