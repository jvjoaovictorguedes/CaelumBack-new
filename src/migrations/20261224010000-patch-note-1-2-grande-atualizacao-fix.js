"use strict";

// Correção da 20261223010000-patch-note-1-2-grande-atualizacao.js: aquela
// migration rodou (aparece "up" no status) mas não inseriu nada, porque
// a trava de "já existe, pular" checava só `versao = '1.2'` — e já
// existia uma nota completamente não relacionada ("Manutenção de
// Rebalanceamento", feature "Manutenção Emergencial") que por acaso
// também usa "1.2" como número (versionamento antigo por funcionalidade,
// livre por natureza — ver ~37 valores distintos históricos de
// `feature`). A trava viu esse "1.2" de outra feature e concluiu que o
// Pergaminho v1.2 já tinha sido publicado, pulando a inserção inteira.
//
// Correção: trava por `feature = 'Caelum' AND versao = '1.2'` (mesmo
// padrão já usado em 20261130010000-reset-patch-notes-beta-1-0.js e
// 20261107020000-patch-note-pesca-almanaque-ranking-torneio.js — nunca
// checar `versao` sozinho, já que não é único no domínio).
module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Caelum' AND versao = '1.2' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Pergaminho das Atualizações 1.2 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(`SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`);
    const agora = new Date();

    const linhas = [
      {
        feature: "Caelum",
        titulo: "O mundo mudou.",
        resumo: "Uma nova camada de aventura, comércio e progressão chegou em Caelum.",
        descricao:
          "Uma nova camada de aventura, comércio e progressão chegou em Caelum. Confira abaixo o que mudou de verdade dentro do jogo.",
        imagem_url: "/patch-notes/1.2/pesca.webp",
        destaque: true,
      },
      {
        feature: "Pesca",
        titulo: "Pesca & Navegação",
        descricao:
          "O minigame de pesca foi reformulado: cada espécie agora tem sua própria dificuldade e zona ideal, reveladas aos poucos no Almanaque Marinho conforme você pesca. Também chegaram o Ranking e o Torneio de Pesca.",
        imagem_url: "/patch-notes/1.2/pesca.webp",
        destaque: false,
      },
      {
        feature: "Identidade Visual",
        titulo: "Um novo brasão para Caelum",
        descricao:
          'O emblema oficial de Caelum estreia no login, registro, recuperação de senha e no topo do menu lateral — substituindo o texto solto "CAELUM" de antes.',
        imagem_url: "/patch-notes/1.2/identidade-visual.webp",
        destaque: false,
      },
      {
        feature: "Diário da Guilda",
        titulo: "Aviso de nota nova",
        descricao:
          "A aba Jornal da Guilda agora avisa com um selo vermelho sempre que sai uma nota nova, sem precisar entrar pra conferir.",
        imagem_url: "/patch-notes/1.2/diario-guilda.webp",
        destaque: false,
      },
      {
        feature: "Guilda dos Aventureiros",
        titulo: "Status real do contrato de Rank",
        descricao:
          'Um contrato de Missão de Rank já aceito não some mais da tela mostrando só "Já aceito" — agora aparece o progresso de verdade até a entrega.',
        imagem_url: "/patch-notes/1.2/guilda-aventureiros.webp",
        destaque: false,
      },
      {
        feature: "Evolução de Classe",
        titulo: "Evolução em Estágios",
        descricao:
          "A evolução de classe ganhou estágios de verdade, e o tipo de dano de cada poder agora é separado da escala de atributo — mais controle sobre como seu personagem cresce.",
        imagem_url: "/patch-notes/1.2/evolucao-classe.webp",
        destaque: false,
      },
      {
        feature: "Combate",
        titulo: "Monstros com Defesa própria",
        descricao:
          "Monstros agora têm um atributo de Defesa próprio, e o Poder de Combate foi recalculado (v2) levando isso em conta. Também corrigimos uma falha em que o Silêncio podia travar o motor de combate.",
        imagem_url: null,
        destaque: false,
      },
      {
        feature: "Mercado Negro",
        titulo: "Veja tudo antes de comprar",
        descricao:
          "Passe o mouse (ou toque) num item à venda pra ver a descrição completa e o bônus de atributo da arma, sem precisar comprar pra descobrir.",
        imagem_url: "/patch-notes/1.2/mercado-negro.webp",
        destaque: false,
      },
      {
        feature: "Cadastro",
        titulo: "Quem te indicou?",
        descricao:
          "A tela de registro ganhou um campo opcional pra contar quem te trouxe até Caelum — o início do sistema de indicação.",
        imagem_url: "/patch-notes/1.2/cadastro.webp",
        destaque: false,
      },
      {
        feature: "Progresso do Personagem",
        titulo: "XP visível na barra lateral",
        descricao:
          "O número de experiência (atual/necessário pro próximo nível) agora aparece logo abaixo do círculo do seu avatar, além do anel de progresso.",
        imagem_url: "/patch-notes/1.2/progresso-xp.webp",
        destaque: false,
      },
    ];

    await queryInterface.bulkInsert(
      "patch_notes",
      linhas.map((linha, indice) => ({
        ordem: max + 1 + indice,
        feature: linha.feature,
        versao: "1.2",
        titulo: linha.titulo,
        descricao: linha.descricao,
        resumo: linha.resumo ?? null,
        imagem_url: linha.imagem_url,
        destaque: linha.destaque,
        status: "Publicado",
        publicado_em: agora,
        createdAt: agora,
        updatedAt: agora,
      })),
    );
  },

  async down(queryInterface) {
    const features = [
      "Caelum",
      "Pesca",
      "Identidade Visual",
      "Diário da Guilda",
      "Guilda dos Aventureiros",
      "Evolução de Classe",
      "Combate",
      "Mercado Negro",
      "Cadastro",
      "Progresso do Personagem",
    ];
    await queryInterface.bulkDelete("patch_notes", { feature: features, versao: "1.2" });
  },
};
