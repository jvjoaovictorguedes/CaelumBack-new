"use strict";

// Pergaminho das Atualizações v1.2 — primeira leva no novo formato
// (capa "O mundo mudou." + blocos por categoria, com screenshot real de
// cada funcionalidade). Reaproveita o modelo flat existente (ver
// PatchNote.js): a nota com destaque=true vira a capa; as demais, com o
// mesmo `versao`, viram os blocos — sem tabela nova.
//
// Cobre só o que é visível pro jogador dentre tudo que está em `dev` e
// ainda não foi pra `main` — ficaram de fora Caldeirão/editores de
// admin (só ferramenta interna) e a Ameaça Mundial V2 (só banco de
// dados pronto até agora, nada jogável ainda).
module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE versao = '1.2' LIMIT 1;`,
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
    await queryInterface.bulkDelete("patch_notes", { versao: "1.2" });
  },
};
