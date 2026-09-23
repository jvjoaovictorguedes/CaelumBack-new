"use strict";

// Expansão Aventura Beta §37/§38/§46 passo 12 — expande o pool de
// contratos da Guilda dos Aventureiros com o catálogo novo. Mira as 3
// coisas que a spec cita como exemplo e que NENHUM contrato existente
// ainda cobria (Javali Selvagem, a região do Pântano da Lua Morta,
// Draco de Obsidiana) — o resto do exemplo da spec (Aranha Venenosa,
// Espectro Sussurrante, Golem de Pedra) já tinha contrato desde o seed
// original da Guilda (20260930760000), não duplicado aqui. Mesmo padrão
// de "buscar por nome, nunca ID fixo" da migration original.
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
        nome: "Javali à Solta",
        rank: "F",
        descricao: "Javalis selvagens dos Campos dos Viajantes vêm atrapalhando os primeiros passos de novos aventureiros.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Javali Selvagem",
        quantidade_objetivo: 8,
        recompensas: [{ tipo: "Ouro", quantidade: 45 }, { tipo: "XP", quantidade: 30 }],
      },
      {
        nome: "Ar Pesado do Brejo",
        rank: "E",
        descricao: "Qualquer criatura do Pântano da Lua Morta conta — a Guilda só quer o brejo um pouco mais seguro.",
        tipo_objetivo: "MatarNaRegiao",
        area: "Pântano da Lua Morta",
        quantidade_objetivo: 12,
        recompensas: [{ tipo: "Ouro", quantidade: 100 }, { tipo: "XP", quantidade: 70 }],
      },
      {
        nome: "A Hidra do Brejo",
        rank: "D",
        descricao: "Uma Hidra Jovem regenera rápido demais pra qualquer aventureiro despreparado — a Guilda quer isso resolvido.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Hidra Jovem",
        quantidade_objetivo: 4,
        recompensas: [{ tipo: "Ouro", quantidade: 200 }, { tipo: "XP", quantidade: 130 }],
      },
      {
        nome: "Lei na Fronteira",
        rank: "C",
        descricao: "A Estrada dos Exilados abriga quem foi expulso de todo lugar — a Guilda quer a fronteira sob controle.",
        tipo_objetivo: "MatarNaRegiao",
        area: "Estrada dos Exilados",
        quantidade_objetivo: 15,
        recompensas: [{ tipo: "Ouro", quantidade: 350 }, { tipo: "XP", quantidade: 220 }],
      },
      {
        nome: "Sangue de Obsidiana",
        rank: "B",
        descricao: "Um Draco de Obsidiana escolheu o Abismo antes de aprender a temer qualquer coisa — prove que ele deveria.",
        tipo_objetivo: "MatarMonstroEspecifico",
        monstro: "Draco de Obsidiana",
        quantidade_objetivo: 5,
        recompensas: [{ tipo: "Ouro", quantidade: 900 }, { tipo: "XP", quantidade: 550 }],
      },
      {
        nome: "Domínio do Abismo",
        rank: "A",
        descricao: "Nenhuma criatura do Abismo Dracônico deveria sobreviver a um aventureiro deste Rank.",
        tipo_objetivo: "MatarNaRegiao",
        area: "Abismo Dracônico",
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
    // Não apaga (contratos já aceitos por personagens podem referenciar
    // a linha) — mesma decisão do seed original da Guilda.
    void queryInterface;
  },
};
