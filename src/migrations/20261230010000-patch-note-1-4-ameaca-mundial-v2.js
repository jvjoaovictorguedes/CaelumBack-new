"use strict";

// Pergaminho das Atualizações v1.4 — mesmo formato do v1.2 (capa +
// blocos por categoria, reaproveitando o modelo flat de PatchNote.js).
//
// Cobre só o que é visível pro jogador dentre tudo que acabou de ir de
// `dev` pra `main`: a Ameaça Mundial V2 (anunciada em 1.0 como "banco
// de dados pronto, nada jogável ainda" — agora está completamente
// jogável, com combate ao vivo), a nova profissão de Ferreiro, a Wiki
// do Jogo, e um punhado de fixes/QoL menores. Ficou de fora TUDO que é
// só ferramenta de admin (painel de Aventura, painel de Classes,
// simulador/editor/métricas da Ameaça Mundial, painel de Guilda,
// painel da Wiki, criação de item, rota marítima) — nada disso é
// visível pro jogador comum.
module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE versao = '1.4' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Pergaminho das Atualizações 1.4 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(`SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`);
    const agora = new Date();

    const linhas = [
      {
        feature: "Caelum",
        titulo: "A luta começou de verdade.",
        resumo: "A Ameaça Mundial finalmente pode ser enfrentada, chegou a profissão de Ferreiro, e uma Wiki do Jogo pra tirar qualquer dúvida.",
        descricao:
          "A Ameaça Mundial anunciada antes agora está completamente jogável, com combate ao vivo contra o servidor inteiro. Chegou também a profissão de Ferreiro e uma Wiki do Jogo com referência de todos os sistemas. Confira abaixo o que mudou de verdade dentro do jogo.",
        imagem_url: "/patch-notes/1.4/ameaca-mundial.webp",
        destaque: true,
      },
      {
        feature: "Ameaça Mundial",
        titulo: "O combate está ao vivo",
        descricao:
          "A Ameaça Mundial deixou de ser só uma descoberta: agora, quando ela desperta, qualquer aventureiro pode entrar na luta e atacar em tempo real, vendo a vida do chefe, sua própria vida/mana e o ranking ao vivo de quem mais causou dano. A aba \"Ameaça Mundial\" na Guilda dos Aventureiros mostra tudo isso, e um aviso aparece no topo da tela assim que uma ameaça é descoberta ou desperta.",
        imagem_url: "/patch-notes/1.4/ameaca-mundial.webp",
        destaque: false,
      },
      {
        feature: "Ferreiro",
        titulo: "Nova profissão: Ferreiro",
        descricao:
          "Funda fragmentos da Expedição em barras, fabrique equipamentos a partir delas e refine o que já tem — tudo dentro da Forja, num posto de trabalho próprio (Fundição, Fabricação, Refinamento e Caldeirão). O Ferreiro sobe de nível como qualquer profissão, com Ferraria (ferramentas que melhoram sua produção), Habilidades de Ferreiro e um Livro de Receitas que registra tudo que você já aprendeu a fabricar.",
        imagem_url: "/patch-notes/1.4/ferreiro.webp",
        destaque: false,
      },
      {
        feature: "Wiki do Jogo",
        titulo: "Referência de todos os sistemas, sem sair do jogo",
        descricao:
          "Uma Wiki completa chegou ao menu lateral, com artigos organizados por sistema — Aventura, Expedição, Forja, Guildas, Pesca, PvP, Ameaça Mundial e muito mais — pra tirar dúvida na hora, sem precisar caçar em fórum ou Discord.",
        imagem_url: "/patch-notes/1.4/wiki.webp",
        destaque: false,
      },
      {
        feature: "Combate",
        titulo: "Regeneração mais rápida e status corrigidos",
        descricao:
          "Vida e mana agora regeneram 100% em 30 minutos fora de combate, bem mais rápido que as 12 horas de antes. Também corrigimos o momento em que efeitos de status como Queimadura, Sangramento e Veneno causam dano — agora sempre no fim do turno, nunca mais no início.",
        imagem_url: null,
        destaque: false,
      },
      {
        feature: "Mercado Negro",
        titulo: "Atributos aparecem certinho no hover",
        descricao:
          "Corrigimos um caso em que os atributos de um item à venda (arma, armadura, consumível ou vara de pesca) não apareciam no hover/toque — agora todo tipo de item mostra seus bônus reais antes da compra.",
        imagem_url: "/patch-notes/1.2/mercado-negro.webp",
        destaque: false,
      },
      {
        feature: "Pesca",
        titulo: "Vara fraca não vence mais peixe difícil",
        descricao:
          "Corrigimos um desequilíbrio em que uma vara com atributos no mínimo conseguia vencer peixes de alta dificuldade com facilidade demais.",
        imagem_url: "/patch-notes/1.2/pesca.webp",
        destaque: false,
      },
      {
        feature: "Expedição",
        titulo: "Cooldown sincronizado entre profissões",
        descricao:
          "O cooldown global de expedição agora fica sincronizado corretamente entre as 3 profissões na tela, sem mostrar tempos diferentes pra cada uma.",
        imagem_url: null,
        destaque: false,
      },
      {
        feature: "Comunidade",
        titulo: "WhatsApp e Discord na barra lateral",
        descricao:
          "Novos ícones de WhatsApp e Discord da comunidade agora aparecem ao lado do brasão de Caelum, sempre visíveis no menu lateral.",
        imagem_url: "/patch-notes/1.4/comunidade.webp",
        destaque: false,
      },
    ];

    await queryInterface.bulkInsert(
      "patch_notes",
      linhas.map((linha, indice) => ({
        ordem: max + 1 + indice,
        feature: linha.feature,
        versao: "1.4",
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
    await queryInterface.bulkDelete("patch_notes", { versao: "1.4" });
  },
};
