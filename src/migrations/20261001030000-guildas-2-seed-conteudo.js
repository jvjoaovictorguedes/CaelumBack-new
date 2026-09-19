"use strict";

// Conteúdo inicial do Aprimoramento de Guildas: catálogo de Missões da
// Guilda (Diária/Semanal/Mensal/Rank) e ajuste dos custos/recompensas
// do Boss (criado vazio pela migration anterior, que só copiou vida/
// defesa/pool de Gold do antigo Portal). Valores de REFERÊNCIA inicial
// (a spec pede pra não fechar números definitivos sem simular — mesma
// postura já registrada na Guilda dos Aventureiros).
module.exports = {
  async up(queryInterface) {
    const agora = new Date();

    // Limpa o rank "S+" órfão (existia no antigo Portal F..S++, não
    // existe mais na escada própria da Guilda F..S) — nenhuma guilda
    // pode ter esse rank depois da migration de reset, então esta linha
    // nunca seria usada mesmo, só polui a tabela.
    await queryInterface.sequelize.query(`DELETE FROM guild_boss_configs WHERE rank NOT IN ('F','E','D','C','B','A','S');`);

    // Boss — custo de liberação, XP de Guilda e pool de XP pessoal por
    // Rank (pool de Gold já veio migrado do Portal antigo). Sink
    // econômico: custo sempre maior que o pool de Gold distribuído.
    const bosses = [
      { rank: "F", custo: 3000, xpGuilda: 80, poolXp: 800 },
      { rank: "E", custo: 8000, xpGuilda: 150, poolXp: 1800 },
      { rank: "D", custo: 20000, xpGuilda: 260, poolXp: 4000 },
      { rank: "C", custo: 45000, xpGuilda: 420, poolXp: 8000 },
      { rank: "B", custo: 100000, xpGuilda: 650, poolXp: 15000 },
      { rank: "A", custo: 220000, xpGuilda: 950, poolXp: 28000 },
      { rank: "S", custo: 500000, xpGuilda: 1400, poolXp: 50000 },
    ];
    for (const boss of bosses) {
      await queryInterface.sequelize.query(
        `UPDATE guild_boss_configs
         SET custo_liberacao = :custo, xp_guilda_concedido = :xpGuilda, pool_xp_total = :poolXp
         WHERE rank = :rank;`,
        { replacements: boss },
      );
    }

    const missoes = [
      // Diária
      { categoria: "Diaria", rank: null, nome: "Caçada Diária", descricao: "Derrote criaturas em qualquer atividade de combate hoje.", tipo_objetivo: "MatarInimigos", meta: 20, xp: 30, pontos: 10 },
      { categoria: "Diaria", rank: null, nome: "Ouro do Dia", descricao: "Junte ouro por qualquer meio legítimo hoje.", tipo_objetivo: "GanharOuro", meta: 500, xp: 25, pontos: 10 },
      { categoria: "Diaria", rank: null, nome: "Fornalha Diária", descricao: "Fabrique itens na Forja hoje.", tipo_objetivo: "Fabricar", meta: 3, xp: 25, pontos: 10 },

      // Semanal
      { categoria: "Semanal", rank: null, nome: "Semana de Caça", descricao: "Derrote criaturas ao longo da semana.", tipo_objetivo: "MatarInimigos", meta: 150, xp: 150, pontos: 50 },
      { categoria: "Semanal", rank: null, nome: "Cofre Semanal", descricao: "Acumule ouro ao longo da semana.", tipo_objetivo: "GanharOuro", meta: 5000, xp: 140, pontos: 50 },
      { categoria: "Semanal", rank: null, nome: "Expedições da Semana", descricao: "Complete Expedições ao longo da semana.", tipo_objetivo: "CompletarExpedicoes", meta: 20, xp: 140, pontos: 50 },
      { categoria: "Semanal", rank: null, nome: "Duelos da Semana", descricao: "Vença duelos de PvP ao longo da semana.", tipo_objetivo: "VencerDuelos", meta: 15, xp: 140, pontos: 50 },

      // Mensal
      { categoria: "Mensal", rank: null, nome: "Extermínio Mensal", descricao: "Derrote criaturas ao longo do mês.", tipo_objetivo: "MatarInimigos", meta: 600, xp: 600, pontos: 200 },
      { categoria: "Mensal", rank: null, nome: "Fortuna Mensal", descricao: "Acumule ouro ao longo do mês.", tipo_objetivo: "GanharOuro", meta: 20000, xp: 550, pontos: 200 },
      { categoria: "Mensal", rank: null, nome: "Mestre Forjador do Mês", descricao: "Fabrique itens na Forja ao longo do mês.", tipo_objetivo: "Fabricar", meta: 40, xp: 550, pontos: 200 },

      // Rank — 2 por rank (pool pra variar o sorteio do ciclo de 6h),
      // meta/xp/pontos crescem com o Rank (F..S).
      { categoria: "Rank", rank: "F", nome: "Provas da Alcateia", descricao: "Derrote criaturas pela Guilda.", tipo_objetivo: "MatarInimigos", meta: 40, xp: 40, pontos: 20 },
      { categoria: "Rank", rank: "F", nome: "Cofre Inicial", descricao: "Junte ouro pela Guilda.", tipo_objetivo: "GanharOuro", meta: 1000, xp: 40, pontos: 20 },

      { categoria: "Rank", rank: "E", nome: "Caçada do Rank E", descricao: "Derrote criaturas pela Guilda.", tipo_objetivo: "MatarInimigos", meta: 60, xp: 83, pontos: 42 },
      { categoria: "Rank", rank: "E", nome: "Tesouro do Rank E", descricao: "Junte ouro pela Guilda.", tipo_objetivo: "GanharOuro", meta: 2000, xp: 83, pontos: 42 },

      { categoria: "Rank", rank: "D", nome: "Caçada do Rank D", descricao: "Derrote criaturas pela Guilda.", tipo_objetivo: "MatarInimigos", meta: 90, xp: 127, pontos: 63 },
      { categoria: "Rank", rank: "D", nome: "Expedições do Rank D", descricao: "Complete Expedições pela Guilda.", tipo_objetivo: "CompletarExpedicoes", meta: 30, xp: 127, pontos: 63 },

      { categoria: "Rank", rank: "C", nome: "Caçada do Rank C", descricao: "Derrote criaturas pela Guilda.", tipo_objetivo: "MatarInimigos", meta: 130, xp: 170, pontos: 85 },
      { categoria: "Rank", rank: "C", nome: "Forja do Rank C", descricao: "Fabrique itens pela Guilda.", tipo_objetivo: "Fabricar", meta: 15, xp: 170, pontos: 85 },

      { categoria: "Rank", rank: "B", nome: "Caçada do Rank B", descricao: "Derrote criaturas pela Guilda.", tipo_objetivo: "MatarInimigos", meta: 180, xp: 213, pontos: 107 },
      { categoria: "Rank", rank: "B", nome: "Duelos do Rank B", descricao: "Vença duelos de PvP pela Guilda.", tipo_objetivo: "VencerDuelos", meta: 25, xp: 213, pontos: 107 },

      { categoria: "Rank", rank: "A", nome: "Caçada do Rank A", descricao: "Derrote criaturas pela Guilda.", tipo_objetivo: "MatarInimigos", meta: 240, xp: 257, pontos: 128 },
      { categoria: "Rank", rank: "A", nome: "Tesouro do Rank A", descricao: "Junte ouro pela Guilda.", tipo_objetivo: "GanharOuro", meta: 10000, xp: 257, pontos: 128 },

      { categoria: "Rank", rank: "S", nome: "Caçada do Rank S", descricao: "Derrote criaturas pela Guilda.", tipo_objetivo: "MatarInimigos", meta: 320, xp: 300, pontos: 150 },
      { categoria: "Rank", rank: "S", nome: "Fortuna do Rank S", descricao: "Junte ouro pela Guilda.", tipo_objetivo: "GanharOuro", meta: 15000, xp: 300, pontos: 150 },
    ];

    for (const m of missoes) {
      await queryInterface.sequelize.query(
        `INSERT INTO guild_missions
           (categoria, rank, nome, descricao, tipo_objetivo, meta, xp_guilda, pontos_contribuicao, ativa, "createdAt", "updatedAt")
         VALUES
           (:categoria, :rank, :nome, :descricao, :tipo_objetivo, :meta, :xp, :pontos, true, :agora, :agora);`,
        { replacements: { ...m, agora } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DELETE FROM guild_missions;`);
  },
};
