"use strict";

// Guilda dos Aventureiros — novos contratos de Rank (pedido do jogador).
// Ruínas de Cinza, Garganta de Ferro e Cavernas Rúnicas são zonas reais
// do Modo Aventura (nivel_monstro 21-25/31-35/36-40) que NUNCA ganharam
// contrato nenhum desde a expansão que as criou — cada uma entra no Rank
// que fecha a escada entre as zonas já usadas (Estrada dos Exilados=C,
// Terras Devastadas=D, Abismo Dracônico=A, Covil do Minotauro=B/A/S).
// Só referencia catálogo já existente por NOME (mesmo padrão dos seeds
// 20260930760000/20261026500000) — nunca cria/edita Item ou
// AdventureMonster.
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

    const missoes = [
      {
        nome: "O Cavaleiro que Não Descansa",
        rank: "D",
        descricao: "Um Cavaleiro Amaldiçoado ainda monta guarda nas Ruínas de Cinza, séculos depois de sua própria morte.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Cavaleiro Amaldiçoado",
        quantidade_objetivo: 6,
        recompensas: [{ tipo: "Ouro", quantidade: 210 }, { tipo: "XP", quantidade: 140 }],
      },
      {
        nome: "Silêncio nas Ruínas",
        rank: "D",
        descricao: "Qualquer coisa que ainda se mova entre as Ruínas de Cinza é uma ameaça viva demais pra ficar solta.",
        tipo_objetivo: "MatarNaRegiao",
        area: "Ruínas de Cinza",
        quantidade_objetivo: 15,
        recompensas: [{ tipo: "Ouro", quantidade: 200 }, { tipo: "XP", quantidade: 130 }],
      },
      {
        nome: "O Orc que Comanda a Garganta",
        rank: "B",
        descricao: "O Chefe Orc Sangrento organizou os orcs da Garganta de Ferro melhor do que a Guilda gostaria.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Chefe Orc Sangrento",
        quantidade_objetivo: 6,
        recompensas: [{ tipo: "Ouro", quantidade: 620 }, { tipo: "XP", quantidade: 400 }],
      },
      {
        nome: "Passagem pela Garganta de Ferro",
        rank: "B",
        descricao: "Trolls e harpias tornaram a Garganta de Ferro intransitável — a Guilda quer a passagem livre de novo.",
        tipo_objetivo: "MatarNaRegiao",
        area: "Garganta de Ferro",
        quantidade_objetivo: 20,
        recompensas: [{ tipo: "Ouro", quantidade: 600 }, { tipo: "XP", quantidade: 380 }],
      },
      {
        nome: "O Guardião Que Não Dorme",
        rank: "A",
        descricao: "Um Guardião Rúnico Ancestral protege as Cavernas Rúnicas há tempo demais pra qualquer um se lembrar do motivo.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Guardião Rúnico Ancestral",
        quantidade_objetivo: 6,
        recompensas: [{ tipo: "Ouro", quantidade: 1450 }, { tipo: "XP", quantidade: 900 }],
      },
      {
        nome: "Eco nas Cavernas Rúnicas",
        rank: "A",
        descricao: "Sentinelas e aranhas de pedra guardam segredos rúnicos antigos — a Guilda quer esse eco silenciado.",
        tipo_objetivo: "MatarNaRegiao",
        area: "Cavernas Rúnicas",
        quantidade_objetivo: 20,
        recompensas: [{ tipo: "Ouro", quantidade: 1300 }, { tipo: "XP", quantidade: 800 }],
      },
    ];

    for (const missao of missoes) {
      const existente = await idDeMissaoPorNome(missao.nome);
      if (existente) continue;

      const idMonstro = missao.monstro ? await idPorNome("AdventureMonsters", missao.monstro) : null;
      const idArea = missao.area ? await idPorNome("AdventureZones", missao.area) : null;

      const [linhas] = await queryInterface.sequelize.query(
        `INSERT INTO adventure_guild_missions
           (rank, nome, descricao, tipo_objetivo, id_monstro_alvo, id_area_alvo, id_item_alvo, quantidade_objetivo, qualidade_minima, eh_provacao, ativa, "createdAt", "updatedAt")
         VALUES
           (:rank, :nome, :descricao, :tipo_objetivo, :idMonstro, :idArea, NULL, :quantidade, NULL, false, true, now(), now())
         RETURNING id;`,
        {
          replacements: {
            rank: missao.rank,
            nome: missao.nome,
            descricao: missao.descricao,
            tipo_objetivo: missao.tipo_objetivo,
            idMonstro,
            idArea,
            quantidade: missao.quantidade_objetivo,
          },
        },
      );
      const idMissao = linhas[0].id;

      for (const recompensa of missao.recompensas) {
        await queryInterface.sequelize.query(
          `INSERT INTO adventure_guild_mission_rewards (id_mission, tipo, id_item, quantidade, "createdAt", "updatedAt")
           VALUES (:idMissao, :tipo, NULL, :quantidade, now(), now());`,
          { replacements: { idMissao, tipo: recompensa.tipo, quantidade: recompensa.quantidade } },
        );
      }
    }
  },

  async down(queryInterface) {
    // Não apaga (contratos já aceitos por personagens podem referenciar a
    // linha) — mesma decisão dos seeds anteriores desta feature.
    void queryInterface;
  },
};
