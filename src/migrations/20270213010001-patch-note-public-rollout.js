"use strict";
// Public release notes: intentionally excludes unreleased player features.
const NOTE = {
  "feature": "Caelum",
  "versao": "2026.10.08",
  "titulo": "Wiki completa, melhorias nas guildas e receitas na Expedição",
  "resumo": "Nova Wiki com fichas e guias, Tesouro e Contribuição da Guilda aprimorados, receitas raras na Expedição e correção do ranking PvP.",
  "descricao": "WIKI DO JOGO\nA Wiki agora reúne fichas dos monstros que seu personagem já descobriu, com atributos, dano base, habilidades, XP, gold e espólios. Consulte também classes e evoluções, habilidades e escalamento, itens, equipamentos, receitas conhecidas e guias de combate, afinidades, profissões e progressão. A busca e as seções ajudam a encontrar cada assunto. Mantivemos o estilo medieval e aumentamos os números para facilitar a leitura.\n\nTESOURO DA GUILDA\nO armazém compartilhado recebe materiais e equipamentos, preservando os dados das cópias. A capacidade acompanha o nível da guilda. Depósitos e retiradas respeitam permissões e ficam registrados no histórico; agora é possível escolher a quantidade retirada de materiais.\n\nCONTRIBUIÇÃO DA GUILDA\nOs pontos passam a registrar sua origem. Doações de gold têm limite semanal de pontuação: acima do limite, o gold continua entrando no tesouro, mas deixa de gerar pontos adicionais naquela semana.\n\nRECEITAS NA EXPEDIÇÃO\nColetas não interrompidas podem encontrar uma receita adicional em qualquer região e profissão. A chance base é de 0,1% de encontrar uma receita; quando o achado ocorre, uma das receitas habilitadas é escolhida com chances iguais. O material normal continua sendo sorteado. O admin pode configurar a chance e quais receitas físicas de Forja e Alquimia participam.\n\nRANKING E ADMINISTRAÇÃO\nO ranking de PvP Ranqueado agora mostra corretamente tier e divisão. O admin da Expedição ganhou um seletor para vincular recursos às regiões. O painel anti-automação foi reorganizado e identifica os personagens pelo nome."
};
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key));', {replacements:{key:'patch:Caelum:2026.10.08'},transaction});
      const [existing] = await queryInterface.sequelize.query('SELECT id FROM patch_notes WHERE feature=:feature AND versao=:versao LIMIT 1;', {replacements:NOTE,transaction});
      if(existing.length) return;
      await queryInterface.sequelize.query(`INSERT INTO patch_notes (ordem,feature,versao,titulo,descricao,resumo,status,destaque,publicado_em,"createdAt","updatedAt")
        SELECT COALESCE(MAX(ordem),0)+1,:feature,:versao,:titulo,:descricao,:resumo,'Publicado',false,'2026-10-08',now(),now() FROM patch_notes;`, {replacements:NOTE,transaction});
    });
  },
  async down() {
    // Published history and Discord delivery receipts survive application rollback.
  },
};
