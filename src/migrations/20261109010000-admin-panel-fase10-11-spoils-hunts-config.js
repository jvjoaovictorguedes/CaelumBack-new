"use strict";

// Painel Administrativo — Fases 10/11 (Balcão de Espólios: permissão
// spoils.manage; Caçadas: permissão hunts.manage). Nenhum dos dois
// sistemas tem uma tabela de catálogo/template pra CRUD (confirmado
// lendo spoilOrderRotationService.js/adventureHuntRotationService.js —
// ambos geram conteúdo em cima de config hardcoded, não de linhas
// admin-autoradas). O que É administrável é a CONFIGURAÇÃO de
// dificuldade/reputação/faixas — por isso vira linhas em game_settings
// (mesma tabela da Fase 14) em vez de uma tabela nova, lidas com
// fallback pelos services de jogo via gameSettingCache.js.
//
// Os valores aqui são EXATAMENTE os hardcoded em
// config/adventureGuildConfig.js (SPOIL_*) e config/huntConfig.js
// (HUNT_*) no momento desta migration — nasce sem mudar nenhum
// comportamento de jogo, só torna esses números editáveis.
module.exports = {
  async up(queryInterface) {
    const agora = new Date();

    const linhas = [
      {
        chave: "spoils.reputationLevels",
        tipo: "json",
        descricao:
          "Balcão de Espólios — níveis de Reputação Comercial (nivel/roman/nome/minimo de pontos/multiplicador de ouro por encomenda/faixa de bônus do lote 5/5).",
        valor: JSON.stringify([
          { nivel: 1, roman: "I", nome: "Desconhecido", minimo: 0, multiplicador: 1.2, bonusFaixa: [0.1, 0.2] },
          { nivel: 2, roman: "II", nome: "Reconhecido", minimo: 2000, multiplicador: 1.3, bonusFaixa: [0.15, 0.25] },
          { nivel: 3, roman: "III", nome: "Confiável", minimo: 7000, multiplicador: 1.42, bonusFaixa: [0.2, 0.3] },
          { nivel: 4, roman: "IV", nome: "Prestigiado", minimo: 17000, multiplicador: 1.55, bonusFaixa: [0.25, 0.4] },
          { nivel: 5, roman: "V", nome: "Renomado", minimo: 35500, multiplicador: 1.7, bonusFaixa: [0.35, 0.5] },
        ]),
      },
      {
        chave: "spoils.orderQuantityRanges",
        tipo: "json",
        descricao: "Balcão de Espólios — faixa [mínimo, máximo] de quantidade exigida por encomenda, por raridade do item.",
        valor: JSON.stringify({
          Comum: [12, 25],
          Incomum: [8, 18],
          Raro: [5, 12],
          Epico: [3, 8],
          Lendario: [2, 5],
          Mitico: [1, 3],
        }),
      },
      {
        chave: "spoils.orderReputationReward",
        tipo: "number",
        descricao: "Balcão de Espólios — pontos de Reputação Comercial concedidos por entregar 1 encomenda.",
        valor: "5",
      },
      {
        chave: "spoils.setBonusReputationReward",
        tipo: "number",
        descricao: "Balcão de Espólios — pontos de Reputação Comercial extra ao completar as 5 encomendas de um ciclo.",
        valor: "25",
      },
      {
        chave: "hunts.difficulties",
        tipo: "json",
        descricao:
          "Caçadas — tiers de dificuldade (chave = valor salvo em CharacterAdventureHunt.difficulty): ordem/nome/hpMultiplier/damageMultiplier/quantityRange/rewardMultiplier/reputationReward.",
        valor: JSON.stringify({
          Dangerous: { ordem: 1, nome: "Perigosa", hpMultiplier: 0.15, damageMultiplier: 0.1, quantityRange: [15, 25], rewardMultiplier: 1.25, reputationReward: 10 },
          Difficult: { ordem: 2, nome: "Difícil", hpMultiplier: 0.3, damageMultiplier: 0.2, quantityRange: [10, 18], rewardMultiplier: 1.5, reputationReward: 18 },
          Deadly: { ordem: 3, nome: "Mortal", hpMultiplier: 0.55, damageMultiplier: 0.35, quantityRange: [7, 12], rewardMultiplier: 2.0, reputationReward: 30 },
          Nightmare: { ordem: 4, nome: "Pesadelo", hpMultiplier: 0.9, damageMultiplier: 0.55, quantityRange: [4, 8], rewardMultiplier: 2.75, reputationReward: 50 },
          Extermination: { ordem: 5, nome: "Extermínio", hpMultiplier: 1.5, damageMultiplier: 0.8, quantityRange: [2, 5], rewardMultiplier: 4.0, reputationReward: 80 },
        }),
      },
      {
        chave: "hunts.reputationLevels",
        tipo: "json",
        descricao: "Caçadas — níveis de Reputação de Caçador (nivel/roman/titulo/minimo de pontos/pool de dificuldades liberadas).",
        valor: JSON.stringify([
          { nivel: 1, roman: "I", titulo: "Caçador Iniciante", minimo: 0, pool: ["Dangerous", "Difficult"] },
          { nivel: 2, roman: "II", titulo: "Caçador Intermediário", minimo: 2500, pool: ["Dangerous", "Difficult", "Deadly"] },
          { nivel: 3, roman: "III", titulo: "Caçador Experiente", minimo: 8500, pool: ["Difficult", "Deadly", "Nightmare"] },
          { nivel: 4, roman: "IV", titulo: "Caçador de Platina", minimo: 22000, pool: ["Deadly", "Nightmare", "Extermination"] },
          { nivel: 5, roman: "V", titulo: "Caçador de Monstros", minimo: 50000, pool: ["Deadly", "Nightmare", "Extermination"] },
        ]),
      },
      {
        chave: "hunts.difficultyWeightsByReputation",
        tipo: "json",
        descricao: "Caçadas — pesos de sorteio de dificuldade (somam ~100) dentro do pool liberado por nível de Reputação de Caçador.",
        valor: JSON.stringify({
          1: { Dangerous: 65, Difficult: 35 },
          2: { Dangerous: 35, Difficult: 50, Deadly: 15 },
          3: { Difficult: 35, Deadly: 50, Nightmare: 15 },
          4: { Deadly: 45, Nightmare: 45, Extermination: 10 },
          5: { Deadly: 30, Nightmare: 45, Extermination: 25 },
        }),
      },
    ];

    for (const linha of linhas) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT chave FROM game_settings WHERE chave = :chave LIMIT 1;`,
        { replacements: { chave: linha.chave } },
      );
      if (existente.length > 0) continue;

      await queryInterface.sequelize.query(
        `INSERT INTO game_settings (chave, valor, tipo, descricao, editavel_admin, "createdAt", "updatedAt")
         VALUES (:chave, :valor::jsonb, :tipo, :descricao, true, :agora, :agora);`,
        { replacements: { chave: linha.chave, valor: linha.valor, tipo: linha.tipo, descricao: linha.descricao, agora } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM game_settings WHERE chave IN (
        'spoils.reputationLevels', 'spoils.orderQuantityRanges', 'spoils.orderReputationReward', 'spoils.setBonusReputationReward',
        'hunts.difficulties', 'hunts.reputationLevels', 'hunts.difficultyWeightsByReputation'
      );`,
    );
  },
};
