"use strict";

// Notas de patch do trabalho recente: música por tela ganhou trilhas de
// verdade, 42 equipamentos novos, fix do convite de party que sumia ao
// reconectar, e fix da edição de item no Painel Administrativo (sempre
// dava erro 500). Cada INSERT lê o MAX(ordem) de novo, senão as 4
// entrariam com a mesma ordem.
const NOTAS = [
  {
    feature: "Música",
    versao: "1.1",
    titulo: "Trilhas sonoras chegaram em todas as telas",
    descricao:
      "O sistema de música por tela (anunciado antes) agora tem música de verdade tocando: Guilda, Bestiário, Mercado/Loja, Inventário/Forja/Guia, Mapa (alternando entre duas trilhas) e uma trilha própria pra cada combate, sorteada entre 4 opções a cada encontro novo.",
  },
  {
    feature: "Forja",
    versao: "3.14",
    titulo: "42 equipamentos novos no catálogo",
    descricao:
      "Chegaram adagas, espadas, cimitarras, cajados, livros de feitiço, orbes, lanças, armaduras, elmos, botas e escudos novos — incluindo peças únicas de topo de linha como Manawall, Infernum, Sanguessuga, Draco Ceifadora e Empaladora de Dragões. Todos disponíveis pra fabricar na Forja, nas 6 qualidades de sempre.",
  },
  {
    feature: "Aventura",
    versao: "4.6",
    titulo: "Corrigido: convite de grupo sumia ao recarregar a página",
    descricao:
      "Se a página recarregasse (F5, aba reaberta, queda de conexão) enquanto um convite pra Aventura em Grupo estava pendente, ele desaparecia da tela sem aviso, mesmo continuando válido. Agora o convite reaparece certinho, com o tempo restante correto, assim que a conexão volta.",
  },
  {
    feature: "Administração",
    versao: "1.1",
    titulo: "Corrigido: editar item no Painel Administrativo dava erro",
    descricao:
      "Salvar a edição de qualquer item no Painel Administrativo estava retornando um erro interno o tempo todo. Já está corrigido — a edição salva normalmente.",
  },
];

module.exports = {
  async up(queryInterface) {
    for (const nota of NOTAS) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM patch_notes WHERE feature = :feature AND versao = :versao LIMIT 1;`,
        { replacements: { feature: nota.feature, versao: nota.versao } },
      );
      if (existente.length > 0) {
        console.log(`[migration] Nota ${nota.feature} ${nota.versao} já existe — pulando.`);
        continue;
      }

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
