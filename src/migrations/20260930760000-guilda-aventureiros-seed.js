"use strict";

// Conteúdo inicial da Guilda dos Aventureiros (§13/§14/§24 da spec) —
// pool de contratos por Rank (bem maior que as 5 ofertas por rotação,
// §14) com dificuldade/complexidade crescente (§24: F é abate simples +
// entrega de material comum; C já mistura raros e Forja/PvP; A já usa
// materiais Épicos/Lendários e regiões perigosas). Cada transição de
// Rank ganha sua própria Provação nomeada (§31) — nunca uma missão
// genérica reaproveitada.
//
// Todo FK é resolvido por NOME (nunca ID fixo, que muda entre
// dev/prod) — mesmo padrão já usado no seed do Modo Aventura
// (20260930680000).
module.exports = {
  async up(queryInterface) {
    async function idPorNome(tabela, nome, colunaNome = "nome") {
      const [linhas] = await queryInterface.sequelize.query(
        `SELECT id FROM "${tabela}" WHERE "${colunaNome}" = :nome LIMIT 1;`,
        { replacements: { nome } },
      );
      return linhas[0]?.id ?? null;
    }

    async function idDeMissaoPorNome(nome) {
      const [linhas] = await queryInterface.sequelize.query(
        `SELECT id FROM adventure_guild_missions WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome } },
      );
      return linhas[0]?.id ?? null;
    }

    // { nome, rank, descricao, tipo_objetivo, monstro?, area?, item?,
    //   quantidade_objetivo, qualidade_minima?, eh_provacao?,
    //   recompensas: [{ tipo, item?, quantidade }] }
    const missoes = [
      // ---------------- RANK F ----------------
      {
        nome: "Caçada aos Lobos",
        rank: "F",
        descricao: "A Guilda recebeu queixas de viajantes atacados por lobos no Bosque de Sussurros. Reduza a matilha.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Lobo das Sombras",
        quantidade_objetivo: 5,
        recompensas: [{ tipo: "Ouro", quantidade: 40 }, { tipo: "XP", quantidade: 30 }],
      },
      {
        nome: "Suprimentos Medicinais",
        rank: "F",
        descricao: "O curandeiro da Guilda precisa repor o estoque de ervas antes do inverno.",
        tipo_objetivo: "Entregar",
        item: "Erva Medicinal — Comum",
        quantidade_objetivo: 8,
        recompensas: [{ tipo: "Ouro", quantidade: 50 }],
      },
      {
        nome: "Limpeza do Bosque",
        rank: "F",
        descricao: "Qualquer criatura que ronde o Bosque de Sussurros está incomodando os mercadores da estrada.",
        tipo_objetivo: "MatarNaRegiao",
        area: "Bosque de Sussurros",
        quantidade_objetivo: 8,
        recompensas: [{ tipo: "Ouro", quantidade: 45 }, { tipo: "XP", quantidade: 25 }],
      },
      {
        nome: "Patrulha de Valenor",
        rank: "F",
        descricao: "Contrato genérico de patrulha — qualquer combate vencido ajuda a manter as estradas seguras.",
        tipo_objetivo: "MatarInimigos",
        quantidade_objetivo: 10,
        recompensas: [{ tipo: "Ouro", quantidade: 35 }],
      },
      {
        nome: "Primeiros Fundos",
        rank: "F",
        descricao: "Junte ouro por qualquer meio legítimo — a Guilda não questiona a origem, só a quantia.",
        tipo_objetivo: "GanharOuro",
        quantidade_objetivo: 150,
        recompensas: [{ tipo: "XP", quantidade: 40 }],
      },
      {
        nome: "Coleta Rápida",
        rank: "F",
        descricao: "Traga recursos de qualquer Expedição — a Guilda paga por volume, não por origem.",
        tipo_objetivo: "CompletarExpedicoes",
        quantidade_objetivo: 3,
        recompensas: [{ tipo: "Ouro", quantidade: 40 }],
      },
      {
        nome: "A Primeira Marca",
        rank: "F",
        descricao: "Todo aventureiro precisa provar que consegue enfrentar algo fora do comum — encare o Espectro do Bosque.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Espectro Sussurrante",
        quantidade_objetivo: 3,
        eh_provacao: true,
        recompensas: [{ tipo: "Ouro", quantidade: 100 }, { tipo: "XP", quantidade: 80 }],
      },

      // ---------------- RANK E ----------------
      {
        nome: "Veneno na Água",
        rank: "E",
        descricao: "Aranhas venenosas contaminaram um poço próximo ao Bosque de Sussurros.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Aranha Venenosa",
        quantidade_objetivo: 10,
        recompensas: [{ tipo: "Ouro", quantidade: 90 }, { tipo: "XP", quantidade: 60 }],
      },
      {
        nome: "Madeira para os Muros",
        rank: "E",
        descricao: "Valenor precisa reforçar suas muralhas antes do próximo inverno.",
        tipo_objetivo: "Entregar",
        item: "Tronco de Madeira Arcana — Comum",
        quantidade_objetivo: 10,
        recompensas: [{ tipo: "Ouro", quantidade: 110 }],
      },
      {
        nome: "Vigília do Bosque",
        rank: "E",
        descricao: "Continue limpando o Bosque de Sussurros — a Guilda quer números maiores desta vez.",
        tipo_objetivo: "MatarNaRegiao",
        area: "Bosque de Sussurros",
        quantidade_objetivo: 15,
        recompensas: [{ tipo: "Ouro", quantidade: 100 }, { tipo: "XP", quantidade: 70 }],
      },
      {
        nome: "Bolsos Cheios",
        rank: "E",
        descricao: "Ganhe ouro por qualquer atividade reconhecida pela Guilda.",
        tipo_objetivo: "GanharOuro",
        quantidade_objetivo: 400,
        recompensas: [{ tipo: "XP", quantidade: 90 }],
      },
      {
        nome: "Provas na Arena",
        rank: "E",
        descricao: "A Guilda valoriza aventureiros capazes de vencer outros aventureiros.",
        tipo_objetivo: "VencerDuelos",
        quantidade_objetivo: 3,
        recompensas: [{ tipo: "Ouro", quantidade: 120 }],
      },
      {
        nome: "Rotas de Suprimento",
        rank: "E",
        descricao: "Complete Expedições para manter as rotas de suprimento da Guilda abastecidas.",
        tipo_objetivo: "CompletarExpedicoes",
        quantidade_objetivo: 6,
        recompensas: [{ tipo: "Ouro", quantidade: 90 }],
      },
      {
        nome: "Primeiro Equipamento",
        rank: "E",
        descricao: "Fabrique equipamentos pra provar domínio da Forja.",
        tipo_objetivo: "Fabricar",
        quantidade_objetivo: 2,
        recompensas: [{ tipo: "Ouro", quantidade: 100 }],
      },
      {
        nome: "O Sussurro Retorna",
        rank: "E",
        descricao: "O mesmo Espectro voltou a assombrar o Bosque — desta vez, mais forte.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Espectro Sussurrante",
        quantidade_objetivo: 5,
        eh_provacao: true,
        recompensas: [{ tipo: "Ouro", quantidade: 220 }, { tipo: "XP", quantidade: 150 }],
      },

      // ---------------- RANK D ----------------
      {
        nome: "Bandidos das Terras Devastadas",
        rank: "D",
        descricao: "Um bando de bandidos se instalou nas Terras Devastadas, assaltando quem passa.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Bandido Errante",
        quantidade_objetivo: 12,
        recompensas: [{ tipo: "Ouro", quantidade: 180 }, { tipo: "XP", quantidade: 120 }],
      },
      {
        nome: "Minério de Qualidade",
        rank: "D",
        descricao: "A Forja da Guilda precisa de minério de qualidade incomum ou melhor.",
        tipo_objetivo: "Entregar",
        item: "Fragmento de Minério Celestial — Incomum",
        quantidade_objetivo: 8,
        recompensas: [{ tipo: "Ouro", quantidade: 220 }],
      },
      {
        nome: "Ordem nas Terras Devastadas",
        rank: "D",
        descricao: "Qualquer criatura das Terras Devastadas conta pra este contrato.",
        tipo_objetivo: "MatarNaRegiao",
        area: "Terras Devastadas",
        quantidade_objetivo: 15,
        recompensas: [{ tipo: "Ouro", quantidade: 200 }, { tipo: "XP", quantidade: 130 }],
      },
      {
        nome: "Cofre da Guilda",
        rank: "D",
        descricao: "A Guilda está financiando uma expedição maior — precisa de fundos.",
        tipo_objetivo: "GanharOuro",
        quantidade_objetivo: 800,
        recompensas: [{ tipo: "XP", quantidade: 160 }],
      },
      {
        nome: "Reputação na Arena",
        rank: "D",
        descricao: "Vença duelos pra provar que já não é mais um novato.",
        tipo_objetivo: "VencerDuelos",
        quantidade_objetivo: 5,
        recompensas: [{ tipo: "Ouro", quantidade: 200 }],
      },
      {
        nome: "Equipamentos de Campanha",
        rank: "D",
        descricao: "Fabrique equipamentos pros aventureiros que partem pras Terras Devastadas.",
        tipo_objetivo: "Fabricar",
        quantidade_objetivo: 3,
        recompensas: [{ tipo: "Ouro", quantidade: 180 }],
      },
      {
        nome: "Refino de Guerra",
        rank: "D",
        descricao: "Refine equipamentos existentes — a Guilda paga por trabalho bem-acabado.",
        tipo_objetivo: "Refinar",
        quantidade_objetivo: 2,
        recompensas: [{ tipo: "Ouro", quantidade: 180 }],
      },
      {
        nome: "O Golem Desperta",
        rank: "D",
        descricao: "Um Golem de Pedra despertou nas Terras Devastadas — poucos ousam se aproximar.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Golem de Pedra",
        quantidade_objetivo: 5,
        eh_provacao: true,
        recompensas: [{ tipo: "Ouro", quantidade: 400 }, { tipo: "XP", quantidade: 260 }],
      },

      // ---------------- RANK C ----------------
      {
        nome: "O Culto Renegado",
        rank: "C",
        descricao: "Um culto se escondeu nas Terras Devastadas — a Guilda quer isso resolvido.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Cultista Renegado",
        quantidade_objetivo: 15,
        recompensas: [{ tipo: "Ouro", quantidade: 320 }, { tipo: "XP", quantidade: 200 }],
      },
      {
        nome: "Caça ao Golem",
        rank: "C",
        descricao: "Golems de Pedra raros ainda rondam as Terras Devastadas — a Guilda paga bem por cada um.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Golem de Pedra",
        quantidade_objetivo: 3,
        recompensas: [{ tipo: "Ouro", quantidade: 450 }, { tipo: "XP", quantidade: 260 }],
      },
      {
        nome: "Erva Rara",
        rank: "C",
        descricao: "A Forja alquímica da Guilda precisa de Erva Lunar de qualidade rara.",
        tipo_objetivo: "Entregar",
        item: "Erva Lunar — Raro",
        quantidade_objetivo: 6,
        recompensas: [{ tipo: "Ouro", quantidade: 380 }],
      },
      {
        nome: "Tesouraria Regional",
        rank: "C",
        descricao: "A Guilda está expandindo — precisa de fundos consideráveis.",
        tipo_objetivo: "GanharOuro",
        quantidade_objetivo: 1400,
        recompensas: [{ tipo: "XP", quantidade: 300 }],
      },
      {
        nome: "Duelista Reconhecido",
        rank: "C",
        descricao: "Vença duelos e ganhe reconhecimento entre os aventureiros de Rank C.",
        tipo_objetivo: "VencerDuelos",
        quantidade_objetivo: 8,
        recompensas: [{ tipo: "Ouro", quantidade: 350 }],
      },
      {
        nome: "Arsenal da Guilda",
        rank: "C",
        descricao: "Fabrique equipamentos de qualidade pro arsenal da Guilda.",
        tipo_objetivo: "Fabricar",
        quantidade_objetivo: 5,
        recompensas: [{ tipo: "Ouro", quantidade: 340 }],
      },
      {
        nome: "Refino Avançado",
        rank: "C",
        descricao: "Refinamentos bem-sucedidos valem cada vez mais conforme o equipamento melhora.",
        tipo_objetivo: "Refinar",
        quantidade_objetivo: 4,
        recompensas: [{ tipo: "Ouro", quantidade: 340 }],
      },
      {
        nome: "Marcha ao Covil",
        rank: "C",
        descricao: "Prove que está pronto pro Covil do Minotauro — sobreviva a uma incursão inicial.",
        tipo_objetivo: "MatarNaRegiao",
        area: "Covil do Minotauro",
        quantidade_objetivo: 10,
        eh_provacao: true,
        recompensas: [{ tipo: "Ouro", quantidade: 700 }, { tipo: "XP", quantidade: 450 }],
      },

      // ---------------- RANK B ----------------
      {
        nome: "Guerreiros do Covil",
        rank: "B",
        descricao: "Orcs guerreiros dominam boa parte do Covil do Minotauro.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Orc Guerreiro",
        quantidade_objetivo: 18,
        recompensas: [{ tipo: "Ouro", quantidade: 550 }, { tipo: "XP", quantidade: 350 }],
      },
      {
        nome: "Domando o Covil",
        rank: "B",
        descricao: "Qualquer criatura do Covil do Minotauro conta — a região é perigosa demais pra meio-termo.",
        tipo_objetivo: "MatarNaRegiao",
        area: "Covil do Minotauro",
        quantidade_objetivo: 20,
        recompensas: [{ tipo: "Ouro", quantidade: 600 }, { tipo: "XP", quantidade: 380 }],
      },
      {
        nome: "Madeira Dracônica",
        rank: "B",
        descricao: "Um material raríssimo, exigido pelos melhores ferreiros da Guilda.",
        tipo_objetivo: "Entregar",
        item: "Tronco de Madeira Dracônica — Épico",
        quantidade_objetivo: 5,
        recompensas: [{ tipo: "Ouro", quantidade: 650 }],
      },
      {
        nome: "Investimento Pesado",
        rank: "B",
        descricao: "A Guilda está financiando uma campanha contra o próprio Minotauro.",
        tipo_objetivo: "GanharOuro",
        quantidade_objetivo: 2400,
        recompensas: [{ tipo: "XP", quantidade: 500 }],
      },
      {
        nome: "Campeão em Ascensão",
        rank: "B",
        descricao: "Vença duelos e prove que merece ser chamado de campeão.",
        tipo_objetivo: "VencerDuelos",
        quantidade_objetivo: 10,
        recompensas: [{ tipo: "Ouro", quantidade: 600 }],
      },
      {
        nome: "Forja de Elite",
        rank: "B",
        descricao: "Fabrique equipamentos dignos de um Rank B.",
        tipo_objetivo: "Fabricar",
        quantidade_objetivo: 6,
        recompensas: [{ tipo: "Ouro", quantidade: 580 }],
      },
      {
        nome: "Refino de Elite",
        rank: "B",
        descricao: "Refine equipamentos de alto valor pra Guilda.",
        tipo_objetivo: "Refinar",
        quantidade_objetivo: 5,
        recompensas: [{ tipo: "Ouro", quantidade: 580 }],
      },
      {
        nome: "O Primeiro Encontro",
        rank: "B",
        descricao: "Poucos sobrevivem a um encontro direto com o Minotauro do Covil — prove que você consegue.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Minotauro",
        quantidade_objetivo: 5,
        eh_provacao: true,
        recompensas: [{ tipo: "Ouro", quantidade: 1200 }, { tipo: "XP", quantidade: 800 }],
      },

      // ---------------- RANK A ----------------
      {
        nome: "Sangue Jovem de Dragão",
        rank: "A",
        descricao: "Draconídeos jovens do Covil já são uma ameaça séria a qualquer vila próxima.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Draconídeo Jovem",
        quantidade_objetivo: 20,
        recompensas: [{ tipo: "Ouro", quantidade: 1100 }, { tipo: "XP", quantidade: 700 }],
      },
      {
        nome: "Minotauros em Série",
        rank: "A",
        descricao: "A Guilda quer o Covil do Minotauro drasticamente enfraquecido.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Minotauro",
        quantidade_objetivo: 8,
        recompensas: [{ tipo: "Ouro", quantidade: 1500 }, { tipo: "XP", quantidade: 900 }],
      },
      {
        nome: "Minério Lendário",
        rank: "A",
        descricao: "Só os ferreiros mais experientes trabalham com Minério Celestial de qualidade lendária.",
        tipo_objetivo: "Entregar",
        item: "Barra de Minério Celestial — Lendário",
        quantidade_objetivo: 3,
        recompensas: [{ tipo: "Ouro", quantidade: 1600 }],
      },
      {
        nome: "Tesouro de Guerra",
        rank: "A",
        descricao: "A Guilda está preparando algo grande — e precisa de muito ouro pra isso.",
        tipo_objetivo: "GanharOuro",
        quantidade_objetivo: 4000,
        recompensas: [{ tipo: "XP", quantidade: 1200 }],
      },
      {
        nome: "Lenda da Arena",
        rank: "A",
        descricao: "Vença duelos suficientes pra ser reconhecido como lenda viva da Arena.",
        tipo_objetivo: "VencerDuelos",
        quantidade_objetivo: 15,
        recompensas: [{ tipo: "Ouro", quantidade: 1400 }],
      },
      {
        nome: "Obras-Primas",
        rank: "A",
        descricao: "Fabrique equipamentos no mais alto padrão que a Forja permite.",
        tipo_objetivo: "Fabricar",
        quantidade_objetivo: 8,
        recompensas: [{ tipo: "Ouro", quantidade: 1350 }],
      },
      {
        nome: "Refino Supremo",
        rank: "A",
        descricao: "Refinamentos bem-sucedidos neste nível movem mercados inteiros.",
        tipo_objetivo: "Refinar",
        quantidade_objetivo: 6,
        recompensas: [{ tipo: "Ouro", quantidade: 1350 }],
      },
      {
        nome: "O Último Degrau",
        rank: "A",
        descricao: "Só quem enfrenta o Minotauro repetidas vezes, e vence, merece o Rank S.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Minotauro",
        quantidade_objetivo: 15,
        eh_provacao: true,
        recompensas: [{ tipo: "Ouro", quantidade: 3000 }, { tipo: "XP", quantidade: 2000 }],
      },

      // ---------------- RANK S (topo — sem Provação) ----------------
      {
        nome: "Extermínio do Covil",
        rank: "S",
        descricao: "O Covil do Minotauro nunca terá paz enquanto o próprio Minotauro reinar sobre ele.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Minotauro",
        quantidade_objetivo: 25,
        recompensas: [{ tipo: "Ouro", quantidade: 2600 }, { tipo: "XP", quantidade: 1600 }],
      },
      {
        nome: "Domínio Absoluto",
        rank: "S",
        descricao: "Nenhuma criatura do Covil do Minotauro deveria sobreviver a um aventureiro Rank S.",
        tipo_objetivo: "MatarNaRegiao",
        area: "Covil do Minotauro",
        quantidade_objetivo: 30,
        recompensas: [{ tipo: "Ouro", quantidade: 2800 }, { tipo: "XP", quantidade: 1700 }],
      },
      {
        nome: "Relíquia Ancestral",
        rank: "S",
        descricao: "Um chifre de Minotauro Ancestral é prova irrefutável de maestria total sobre o Covil.",
        tipo_objetivo: "Entregar",
        item: "Chifre de Minotauro Ancestral",
        quantidade_objetivo: 2,
        recompensas: [{ tipo: "Ouro", quantidade: 3200 }],
      },
      {
        nome: "Fortuna da Guilda",
        rank: "S",
        descricao: "Só os aventureiros Rank S movimentam esse tanto de ouro em nome da Guilda.",
        tipo_objetivo: "GanharOuro",
        quantidade_objetivo: 7000,
        recompensas: [{ tipo: "XP", quantidade: 2200 }],
      },
      {
        nome: "Sem Rival",
        rank: "S",
        descricao: "Vença duelos sem parar — no Rank S, perder não é bem aceito.",
        tipo_objetivo: "VencerDuelos",
        quantidade_objetivo: 20,
        recompensas: [{ tipo: "Ouro", quantidade: 2600 }],
      },
      {
        nome: "Lendas da Forja",
        rank: "S",
        descricao: "Fabrique equipamentos que só um Mestre Ferreiro Rank S conseguiria produzir.",
        tipo_objetivo: "Fabricar",
        quantidade_objetivo: 10,
        recompensas: [{ tipo: "Ouro", quantidade: 2500 }],
      },
    ];

    for (const missao of missoes) {
      const existente = await idDeMissaoPorNome(missao.nome);
      if (existente) continue;

      const idMonstro = missao.monstro ? await idPorNome("AdventureMonsters", missao.monstro) : null;
      const idArea = missao.area ? await idPorNome("AdventureZones", missao.area) : null;
      const idItem = missao.item ? await idPorNome("Items", missao.item) : null;

      const [linhas] = await queryInterface.sequelize.query(
        `INSERT INTO adventure_guild_missions
           (rank, nome, descricao, tipo_objetivo, id_monstro_alvo, id_area_alvo, id_item_alvo, quantidade_objetivo, qualidade_minima, eh_provacao, ativa, "createdAt", "updatedAt")
         VALUES
           (:rank, :nome, :descricao, :tipo_objetivo, :idMonstro, :idArea, :idItem, :quantidade, :qualidade, :ehProvacao, true, now(), now())
         RETURNING id;`,
        {
          replacements: {
            rank: missao.rank,
            nome: missao.nome,
            descricao: missao.descricao,
            tipo_objetivo: missao.tipo_objetivo,
            idMonstro,
            idArea,
            idItem,
            quantidade: missao.quantidade_objetivo,
            qualidade: missao.qualidade_minima ?? null,
            ehProvacao: Boolean(missao.eh_provacao),
          },
        },
      );
      const idMissao = linhas[0].id;

      for (const recompensa of missao.recompensas) {
        const idItemRecompensa = recompensa.item ? await idPorNome("Items", recompensa.item) : null;
        await queryInterface.sequelize.query(
          `INSERT INTO adventure_guild_mission_rewards (id_mission, tipo, id_item, quantidade, "createdAt", "updatedAt")
           VALUES (:idMissao, :tipo, :idItem, :quantidade, now(), now());`,
          {
            replacements: {
              idMissao,
              tipo: recompensa.tipo,
              idItem: idItemRecompensa,
              quantidade: recompensa.quantidade,
            },
          },
        );
      }
    }

    // §8 — missões livres novas (Semanal/Mensal) usando os tipos novos.
    const missoesLivres = [
      {
        nome: "Expedições da Semana",
        descricao: "Complete Expedições ao longo da semana.",
        tipo: "CompletarExpedicoes",
        meta: 20,
        categoria: "Semanal",
        recompensa_dinheiro: 300,
        recompensa_xp: 150,
      },
      {
        nome: "Forja Semanal",
        descricao: "Fabrique equipamentos ao longo da semana.",
        tipo: "Fabricar",
        meta: 5,
        categoria: "Semanal",
        recompensa_dinheiro: 350,
        recompensa_xp: 150,
      },
      {
        nome: "Duelos da Semana",
        descricao: "Vença combates PvP ao longo da semana.",
        tipo: "VencerDuelos",
        meta: 10,
        categoria: "Semanal",
        recompensa_dinheiro: 400,
        recompensa_xp: 180,
      },
      {
        nome: "Expedições do Mês",
        descricao: "Complete Expedições ao longo do mês.",
        tipo: "CompletarExpedicoes",
        meta: 100,
        categoria: "Mensal",
        recompensa_dinheiro: 1500,
        recompensa_xp: 600,
      },
      {
        nome: "Contratos do Mês",
        descricao: "Complete e resgate contratos da Guilda dos Aventureiros ao longo do mês.",
        tipo: "CompletarContratosGuilda",
        meta: 50,
        categoria: "Mensal",
        recompensa_dinheiro: 2000,
        recompensa_xp: 800,
      },
      {
        nome: "Batalhas do Mês",
        descricao: "Derrote monstros ao longo do mês.",
        tipo: "MatarInimigos",
        meta: 500,
        categoria: "Mensal",
        recompensa_dinheiro: 1800,
        recompensa_xp: 700,
      },
    ];

    for (const missao of missoesLivres) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM missions WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: missao.nome } },
      );
      if (existente.length > 0) continue;

      await queryInterface.bulkInsert("missions", [
        {
          nome: missao.nome,
          descricao: missao.descricao,
          tipo: missao.tipo,
          meta: missao.meta,
          categoria: missao.categoria,
          nivel_minimo: 1,
          recompensa_dinheiro: missao.recompensa_dinheiro,
          recompensa_xp: missao.recompensa_xp,
          recompensa_item_id: null,
          recompensa_item_quantidade: 1,
          ativa: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("missions", {
      nome: [
        "Expedições da Semana",
        "Forja Semanal",
        "Duelos da Semana",
        "Expedições do Mês",
        "Contratos do Mês",
        "Batalhas do Mês",
      ],
    });
    // As linhas de adventure_guild_missions ficam (contratos já aceitos
    // por personagens podem referenciá-las) — down() de conteúdo de
    // catálogo não é destrutivo nesta feature, mesmo padrão do seed do
    // Modo Aventura.
  },
};
