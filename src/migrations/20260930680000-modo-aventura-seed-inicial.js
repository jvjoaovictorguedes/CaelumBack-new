"use strict";

// Conteúdo inicial do Modo Aventura v1 (§39/§40 da spec) — 3 Áreas de
// Caça cobrindo baixo/médio/alto nível, cada uma com 2 monstros Comuns
// + 1 Raro (§6/§7) e espólio próprio (§13/§15).
//
// Reaproveita os 9 nomes que já existiam em NOMES_INIMIGOS
// (combatController.js) como entradas do novo catálogo AdventureMonster,
// em vez de inventar 9 nomes novos do zero — decisão deliberada (ver
// relatório final da feature): assim o progresso já registrado em
// character_monster_kills (usado pelo requisito de Evolução de Classe,
// ex.: "matar 150 Minotauros") continua contando depois que a Aventura
// passa a ser 100% zona-gated, e o seletor de "caçar um alvo específico"
// (?alvo=) continua funcionando, só que agora escopado à zona atual.
// Nenhum nome é reaproveitado sem também ganhar um perfil de combate
// próprio (multiplicadores distintos) — não é só uma troca de nome.
module.exports = {
  async up(queryInterface, Sequelize) {
    async function buscarIdPorNome(tabela, nome) {
      const [linhas] = await queryInterface.sequelize.query(
        `SELECT id FROM "${tabela}" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome } },
      );
      return linhas[0]?.id ?? null;
    }

    // ------------------------------------------------------------
    // 1. Espólio (itens novos, tipo "Espolio" — ver migration
    //    20260930670000 que abriu esse valor no ENUM) — identidade de
    //    loot própria por zona (§13/§14/§15), nunca material genérico
    //    de Expedição.
    // ------------------------------------------------------------
    const itens = [
      { nome: "Presa de Lobo Sombrio", descricao: "Ainda pinga um resíduo escuro, mesmo horas depois da caçada.", raridade: "Comum", valor_venda: 15, peso: 0.2 },
      { nome: "Teia de Aranha Venenosa", descricao: "Gruda em qualquer coisa — inclusive nos dedos de quem tenta guardar.", raridade: "Comum", valor_venda: 15, peso: 0.1 },
      { nome: "Véu Espectral", descricao: "Um retalho do que sobrou de um Espectro Sussurrante — some se você olhar direto pra ele.", raridade: "Epico", valor_venda: 320, peso: 0.05 },
      { nome: "Adaga Enferrujada do Bandido", descricao: "Cabo gasto de tanto uso. A lâmina já viu dias melhores.", raridade: "Comum", valor_venda: 18, peso: 0.6 },
      { nome: "Amuleto do Cultista", descricao: "Símbolo de um culto que ninguém mais lembra o nome.", raridade: "Incomum", valor_venda: 40, peso: 0.1 },
      { nome: "Núcleo de Pedra Rúnica", descricao: "O que restou depois que um Golem de Pedra para de se mover — ainda pulsa fraco.", raridade: "Epico", valor_venda: 350, peso: 1.5 },
      { nome: "Presa de Orc", descricao: "Maior que o punho de um humano adulto.", raridade: "Incomum", valor_venda: 35, peso: 0.4 },
      { nome: "Escama Jovem de Dragão", descricao: "Ainda quente ao toque, mesmo depois de arrancada.", raridade: "Raro", valor_venda: 90, peso: 0.3 },
      { nome: "Chifre de Minotauro Ancestral", descricao: "Marcado com runas antigas — nenhum Minotauro comum carrega um chifre assim.", raridade: "Lendario", valor_venda: 900, peso: 2 },
    ];

    for (const item of itens) {
      const existente = await buscarIdPorNome("Items", item.nome);
      if (existente) continue;
      await queryInterface.bulkInsert("Items", [
        {
          nome: item.nome,
          descricao: item.descricao,
          tipo_item: "Espolio",
          raridade: item.raridade,
          valor_compra: 0,
          valor_venda: item.valor_venda,
          peso: item.peso,
          disponivel_loja: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    }

    // ------------------------------------------------------------
    // 2. Catálogo de monstros (§9/§10) — perfil de combate próprio via
    //    multiplicadores, em cima da MESMA calibração de gerarInimigo.
    // ------------------------------------------------------------
    const monstros = [
      { nome: "Lobo das Sombras", descricao: "Caça em silêncio — o primeiro aviso costuma ser o último.", mult: [0.85, 0.9, 1.3, 1.3] },
      { nome: "Aranha Venenosa", descricao: "Prefere ferroar de longe a arriscar o corpo perto.", mult: [0.8, 1.2, 1.1, 1.0] },
      { nome: "Espectro Sussurrante", descricao: "Meio presente, meio memória — golpeia como se já soubesse onde você vai se mexer.", mult: [1.8, 1.4, 1.4, 1.5] },
      { nome: "Bandido Errante", descricao: "Luta sujo e foge cedo — raramente aguenta uma troca de golpes de verdade.", mult: [0.9, 1.0, 1.2, 1.15] },
      { nome: "Cultista Renegado", descricao: "Grita palavras que não deveriam significar nada e, mesmo assim, doem.", mult: [0.85, 1.15, 0.95, 1.0] },
      { nome: "Golem de Pedra", descricao: "Lento, mas cada impacto lembra por que ninguém tenta trocar socos com pedra.", mult: [2.4, 1.3, 0.6, 0.6] },
      { nome: "Orc Guerreiro", descricao: "Não tem técnica nenhuma — só força bruta e teimosia.", mult: [1.2, 1.15, 0.9, 0.9] },
      { nome: "Draconídeo Jovem", descricao: "Ainda não cresceu o suficiente pra voar longe, mas já bate como um adulto.", mult: [1.1, 1.2, 1.0, 1.05] },
      { nome: "Minotauro", descricao: "Cada passo faz o chão tremer antes mesmo do golpe chegar.", mult: [2.2, 1.6, 0.85, 0.85] },
    ];

    for (const monstro of monstros) {
      const existente = await buscarIdPorNome("AdventureMonsters", monstro.nome);
      if (existente) continue;
      const [vida, dano, agilidade, velocidade] = monstro.mult;
      await queryInterface.bulkInsert("AdventureMonsters", [
        {
          nome: monstro.nome,
          descricao: monstro.descricao,
          imagem_url: null,
          multiplicador_vida: vida,
          multiplicador_dano: dano,
          multiplicador_agilidade: agilidade,
          multiplicador_velocidade: velocidade,
          ativo: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    }

    // ------------------------------------------------------------
    // 3. Áreas de Caça (§3/§22) — nivel_monstro_min/max é só
    //    recomendação, nunca bloqueia entrada (§4).
    // ------------------------------------------------------------
    const zonas = [
      {
        nome: "Bosque de Sussurros",
        descricao: "Uma floresta baixa nas bordas de Caelum — a névoa nunca dissipa de todo, nem de dia.",
        nivel_monstro_min: 1,
        nivel_monstro_max: 15,
        ordem: 1,
      },
      {
        nome: "Terras Devastadas",
        descricao: "Campos queimados por uma guerra que ninguém mais consegue explicar direito.",
        nivel_monstro_min: 15,
        nivel_monstro_max: 30,
        ordem: 2,
      },
      {
        nome: "Covil do Minotauro",
        descricao: "Um labirinto de pedra escavado nas montanhas — poucos que entram fundo voltam pra contar como é lá dentro.",
        nivel_monstro_min: 30,
        nivel_monstro_max: 50,
        ordem: 3,
      },
    ];

    for (const zona of zonas) {
      const existente = await buscarIdPorNome("AdventureZones", zona.nome);
      if (existente) continue;
      await queryInterface.bulkInsert("AdventureZones", [
        {
          nome: zona.nome,
          descricao: zona.descricao,
          nivel_monstro_min: zona.nivel_monstro_min,
          nivel_monstro_max: zona.nivel_monstro_max,
          imagem_url: null,
          ordem: zona.ordem,
          ativa: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    }

    // ------------------------------------------------------------
    // 4. Vínculo zona <-> monstro (§6/§7/§8) — pesos 475/475/50 de
    //    1000 (2 Comuns quase empatados + 1 Raro raro de verdade), Raro
    //    sempre com override pro topo da faixa da zona.
    // ------------------------------------------------------------
    const vinculos = [
      { zona: "Bosque de Sussurros", monstro: "Lobo das Sombras", peso: 475, tipo: "Comum" },
      { zona: "Bosque de Sussurros", monstro: "Aranha Venenosa", peso: 475, tipo: "Comum" },
      { zona: "Bosque de Sussurros", monstro: "Espectro Sussurrante", peso: 50, tipo: "Raro", min: 10, max: 15 },

      { zona: "Terras Devastadas", monstro: "Bandido Errante", peso: 475, tipo: "Comum" },
      { zona: "Terras Devastadas", monstro: "Cultista Renegado", peso: 475, tipo: "Comum" },
      { zona: "Terras Devastadas", monstro: "Golem de Pedra", peso: 50, tipo: "Raro", min: 25, max: 30 },

      { zona: "Covil do Minotauro", monstro: "Orc Guerreiro", peso: 475, tipo: "Comum" },
      { zona: "Covil do Minotauro", monstro: "Draconídeo Jovem", peso: 475, tipo: "Comum" },
      { zona: "Covil do Minotauro", monstro: "Minotauro", peso: 50, tipo: "Raro", min: 45, max: 50 },
    ];

    for (const v of vinculos) {
      const idArea = await buscarIdPorNome("AdventureZones", v.zona);
      const idMonstro = await buscarIdPorNome("AdventureMonsters", v.monstro);
      if (!idArea || !idMonstro) continue;

      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM "AdventureZoneMonsters" WHERE id_area = :idArea AND id_monstro = :idMonstro LIMIT 1;`,
        { replacements: { idArea, idMonstro } },
      );
      if (existente.length > 0) continue;

      await queryInterface.bulkInsert("AdventureZoneMonsters", [
        {
          id_area: idArea,
          id_monstro: idMonstro,
          peso_aparicao: v.peso,
          tipo_aparicao: v.tipo,
          nivel_min_override: v.min ?? null,
          nivel_max_override: v.max ?? null,
          ativo: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    }

    // ------------------------------------------------------------
    // 5. Espólio por zona (§13/§15) — 2 entradas comuns (caem com
    //    qualquer monstro da zona) + 1 exclusiva do Raro (§12).
    // ------------------------------------------------------------
    const loots = [
      { zona: "Bosque de Sussurros", item: "Presa de Lobo Sombrio", peso: 100, min: 1, max: 2, exclusivoRaro: false },
      { zona: "Bosque de Sussurros", item: "Teia de Aranha Venenosa", peso: 100, min: 1, max: 2, exclusivoRaro: false },
      { zona: "Bosque de Sussurros", item: "Véu Espectral", peso: 30, min: 1, max: 1, exclusivoRaro: true },

      { zona: "Terras Devastadas", item: "Adaga Enferrujada do Bandido", peso: 100, min: 1, max: 2, exclusivoRaro: false },
      { zona: "Terras Devastadas", item: "Amuleto do Cultista", peso: 80, min: 1, max: 1, exclusivoRaro: false },
      { zona: "Terras Devastadas", item: "Núcleo de Pedra Rúnica", peso: 30, min: 1, max: 1, exclusivoRaro: true },

      { zona: "Covil do Minotauro", item: "Presa de Orc", peso: 100, min: 1, max: 2, exclusivoRaro: false },
      { zona: "Covil do Minotauro", item: "Escama Jovem de Dragão", peso: 70, min: 1, max: 1, exclusivoRaro: false },
      { zona: "Covil do Minotauro", item: "Chifre de Minotauro Ancestral", peso: 25, min: 1, max: 1, exclusivoRaro: true },
    ];

    for (const l of loots) {
      const idArea = await buscarIdPorNome("AdventureZones", l.zona);
      const idItem = await buscarIdPorNome("Items", l.item);
      if (!idArea || !idItem) continue;

      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM "AdventureZoneLoots" WHERE id_area = :idArea AND id_item = :idItem LIMIT 1;`,
        { replacements: { idArea, idItem } },
      );
      if (existente.length > 0) continue;

      await queryInterface.bulkInsert("AdventureZoneLoots", [
        {
          id_area: idArea,
          id_item: idItem,
          peso: l.peso,
          quantidade_min: l.min,
          quantidade_max: l.max,
          exclusivo_raro: l.exclusivoRaro,
          ativo: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    }
  },

  async down(queryInterface) {
    const zonas = ["Bosque de Sussurros", "Terras Devastadas", "Covil do Minotauro"];
    const idsZonas = [];
    for (const nome of zonas) {
      const [linhas] = await queryInterface.sequelize.query(
        `SELECT id FROM "AdventureZones" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome } },
      );
      if (linhas[0]?.id) idsZonas.push(linhas[0].id);
    }
    if (idsZonas.length > 0) {
      await queryInterface.bulkDelete("AdventureZoneLoots", { id_area: idsZonas });
      await queryInterface.bulkDelete("AdventureZoneMonsters", { id_area: idsZonas });
    }
    await queryInterface.bulkDelete("AdventureZones", { nome: zonas });
    await queryInterface.bulkDelete("AdventureMonsters", {
      nome: [
        "Lobo das Sombras",
        "Aranha Venenosa",
        "Espectro Sussurrante",
        "Bandido Errante",
        "Cultista Renegado",
        "Golem de Pedra",
        "Orc Guerreiro",
        "Draconídeo Jovem",
        "Minotauro",
      ],
    });
    await queryInterface.bulkDelete("Items", {
      nome: [
        "Presa de Lobo Sombrio",
        "Teia de Aranha Venenosa",
        "Véu Espectral",
        "Adaga Enferrujada do Bandido",
        "Amuleto do Cultista",
        "Núcleo de Pedra Rúnica",
        "Presa de Orc",
        "Escama Jovem de Dragão",
        "Chifre de Minotauro Ancestral",
      ],
    });
  },
};
