"use strict";

// Primeiro conteúdo real da árvore de Evolução (ver comentário em
// 20260919020000-create-evolutions.js — "as evoluções de verdade
// entram depois, uma a uma, quando o design estiver definido"). Duas
// naturezas mágicas (Ar e Escuridão, com ícones que o jogador mandou),
// uma árvore linear de 3 nós por classe — mais naturezas entram depois
// conforme mais ícones chegarem.
//
// Cada árvore: 2 nós só de atributo, 1 nó final que também concede um
// poder novo (ver 20260926020000-poderes-vento-trevas.js). Custo e
// nível necessário sobem a cada nó; nó 2 exige o nó 1 comprado.
module.exports = {
  async up(queryInterface) {
    async function idDaClassePorNome(nome) {
      const [linhas] = await queryInterface.sequelize.query(
        `SELECT id FROM "Classes" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome } },
      );
      return linhas[0]?.id ?? null;
    }
    async function idDoPoderPorNome(nome) {
      const [linhas] = await queryInterface.sequelize.query(
        `SELECT id FROM "Powers" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome } },
      );
      return linhas[0]?.id ?? null;
    }
    async function jaExisteEvolucao(nome) {
      const [linhas] = await queryInterface.sequelize.query(
        `SELECT id FROM evolutions WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome } },
      );
      return linhas[0]?.id ?? null;
    }
    async function inserirEvolucao(dados) {
      const existente = await jaExisteEvolucao(dados.nome);
      if (existente) {
        console.log(`[migration] Evolução "${dados.nome}" já existe — pulando.`);
        return existente;
      }
      const [linhas] = await queryInterface.sequelize.query(
        `INSERT INTO evolutions
           (nome, descricao, id_classe, natureza_magica, nivel_necessario, custo,
            bonus_forca, bonus_vitalidade, bonus_agilidade, bonus_inteligencia, bonus_velocidade,
            id_power_concedido, id_evolucao_pre_requisito, ordem, imagem_url, "createdAt", "updatedAt")
         VALUES
           (:nome, :descricao, :id_classe, :natureza_magica, :nivel_necessario, :custo,
            :bonus_forca, :bonus_vitalidade, :bonus_agilidade, :bonus_inteligencia, :bonus_velocidade,
            :id_power_concedido, :id_evolucao_pre_requisito, :ordem, :imagem_url, now(), now())
         RETURNING id;`,
        { replacements: dados },
      );
      return linhas[0].id;
    }

    const idGuerreiro = await idDaClassePorNome("Guerreiro");
    const idMago = await idDaClassePorNome("Mago");
    if (!idGuerreiro || !idMago) {
      console.log("[migration] Classe Guerreiro/Mago não encontrada — pulando evoluções.");
      return;
    }

    const idInvestidaDoVendaval = await idDoPoderPorNome("Investida do Vendaval");
    const idTornadoArcano = await idDoPoderPorNome("Tornado Arcano");
    const idGolpeDasSombras = await idDoPoderPorNome("Golpe das Sombras");
    const idDrenarVida = await idDoPoderPorNome("Drenar Vida");

    const base = {
      bonus_forca: 0,
      bonus_vitalidade: 0,
      bonus_agilidade: 0,
      bonus_inteligencia: 0,
      bonus_velocidade: 0,
      id_power_concedido: null,
    };

    // ---------------- Guerreiro + Ar — "Passos do Vento" ----------------
    const g_ar_1 = await inserirEvolucao({
      ...base,
      nome: "Fôlego do Vento",
      descricao: "O primeiro passo de quem aprende a lutar leve como o vento.",
      id_classe: idGuerreiro,
      natureza_magica: "Ar",
      nivel_necessario: 5,
      custo: 100,
      bonus_agilidade: 2,
      bonus_velocidade: 2,
      id_evolucao_pre_requisito: null,
      ordem: 1,
      imagem_url: "/icons/evolutions/ar/folego-do-vento.png",
    });
    const g_ar_2 = await inserirEvolucao({
      ...base,
      nome: "Lâmina Veloz",
      descricao: "Cada golpe chega antes do inimigo perceber que o vento mudou.",
      id_classe: idGuerreiro,
      natureza_magica: "Ar",
      nivel_necessario: 15,
      custo: 300,
      bonus_agilidade: 4,
      bonus_velocidade: 3,
      id_evolucao_pre_requisito: g_ar_1,
      ordem: 2,
      imagem_url: "/icons/evolutions/ar/lamina-veloz.png",
    });
    await inserirEvolucao({
      ...base,
      nome: "Fúria do Vendaval",
      descricao: "O guerreiro se torna a própria tempestade — ninguém consegue acompanhar o ritmo.",
      id_classe: idGuerreiro,
      natureza_magica: "Ar",
      nivel_necessario: 25,
      custo: 600,
      bonus_agilidade: 6,
      bonus_velocidade: 5,
      id_power_concedido: idInvestidaDoVendaval,
      id_evolucao_pre_requisito: g_ar_2,
      ordem: 3,
      imagem_url: "/icons/evolutions/ar/furia-do-vendaval.png",
    });

    // ---------------- Mago + Ar — "Tempestade Arcana" ----------------
    const m_ar_1 = await inserirEvolucao({
      ...base,
      nome: "Sopro Arcano",
      descricao: "As primeiras correntes de vento respondem ao chamado do mago.",
      id_classe: idMago,
      natureza_magica: "Ar",
      nivel_necessario: 5,
      custo: 100,
      bonus_inteligencia: 2,
      bonus_velocidade: 2,
      id_evolucao_pre_requisito: null,
      ordem: 1,
      imagem_url: "/icons/evolutions/ar/sopro-arcano.png",
    });
    const m_ar_2 = await inserirEvolucao({
      ...base,
      nome: "Redemoinho Místico",
      descricao: "Um círculo de vento e energia arcana gira ao redor de quem já domina os ventos.",
      id_classe: idMago,
      natureza_magica: "Ar",
      nivel_necessario: 15,
      custo: 300,
      bonus_inteligencia: 4,
      bonus_agilidade: 3,
      id_evolucao_pre_requisito: m_ar_1,
      ordem: 2,
      imagem_url: "/icons/evolutions/ar/redemoinho-mistico.png",
    });
    await inserirEvolucao({
      ...base,
      nome: "Fúria da Tempestade",
      descricao: "O céu obedece — a tempestade que o mago convoca não perdoa nada em seu caminho.",
      id_classe: idMago,
      natureza_magica: "Ar",
      nivel_necessario: 25,
      custo: 600,
      bonus_inteligencia: 6,
      id_power_concedido: idTornadoArcano,
      id_evolucao_pre_requisito: m_ar_2,
      ordem: 3,
      imagem_url: "/icons/evolutions/ar/furia-da-tempestade.png",
    });

    // ---------------- Guerreiro + Escuridão — "Cavaleiro das Sombras" ----------------
    const g_esc_1 = await inserirEvolucao({
      ...base,
      nome: "Toque Sombrio",
      descricao: "Uma sombra fria começa a seguir cada golpe do guerreiro.",
      id_classe: idGuerreiro,
      natureza_magica: "Escuridao",
      nivel_necessario: 5,
      custo: 100,
      bonus_forca: 2,
      bonus_vitalidade: 2,
      id_evolucao_pre_requisito: null,
      ordem: 1,
      imagem_url: "/icons/evolutions/escuridao/toque-sombrio.png",
    });
    const g_esc_2 = await inserirEvolucao({
      ...base,
      nome: "Armadura Espectral",
      descricao: "Uma couraça feita de sombra densa protege quem já não teme a escuridão.",
      id_classe: idGuerreiro,
      natureza_magica: "Escuridao",
      nivel_necessario: 15,
      custo: 300,
      bonus_vitalidade: 4,
      bonus_forca: 3,
      id_evolucao_pre_requisito: g_esc_1,
      ordem: 2,
      imagem_url: "/icons/evolutions/escuridao/armadura-espectral.png",
    });
    await inserirEvolucao({
      ...base,
      nome: "Fúria das Trevas",
      descricao: "A escuridão toma conta por completo — o que ataca agora mal parece humano.",
      id_classe: idGuerreiro,
      natureza_magica: "Escuridao",
      nivel_necessario: 25,
      custo: 600,
      bonus_forca: 6,
      id_power_concedido: idGolpeDasSombras,
      id_evolucao_pre_requisito: g_esc_2,
      ordem: 3,
      imagem_url: "/icons/evolutions/escuridao/furia-das-trevas.png",
    });

    // ---------------- Mago + Escuridão — "Domínio das Trevas" ----------------
    const m_esc_1 = await inserirEvolucao({
      ...base,
      nome: "Sussurro das Trevas",
      descricao: "Vozes baixas, vindas de lugar nenhum, começam a responder aos chamados do mago.",
      id_classe: idMago,
      natureza_magica: "Escuridao",
      nivel_necessario: 5,
      custo: 100,
      bonus_inteligencia: 2,
      bonus_vitalidade: 1,
      id_evolucao_pre_requisito: null,
      ordem: 1,
      imagem_url: "/icons/evolutions/escuridao/sussurro-das-trevas.png",
    });
    const m_esc_2 = await inserirEvolucao({
      ...base,
      nome: "Pacto Sombrio",
      descricao: "Um acordo selado com algo que mora na escuridão — o preço ainda não foi cobrado.",
      id_classe: idMago,
      natureza_magica: "Escuridao",
      nivel_necessario: 15,
      custo: 300,
      bonus_inteligencia: 4,
      bonus_vitalidade: 2,
      id_evolucao_pre_requisito: m_esc_1,
      ordem: 2,
      imagem_url: "/icons/evolutions/escuridao/pacto-sombrio.png",
    });
    await inserirEvolucao({
      ...base,
      nome: "Domínio das Trevas",
      descricao: "Já não é o mago que comanda as sombras — as duas coisas viraram uma só.",
      id_classe: idMago,
      natureza_magica: "Escuridao",
      nivel_necessario: 25,
      custo: 600,
      bonus_inteligencia: 6,
      id_power_concedido: idDrenarVida,
      id_evolucao_pre_requisito: m_esc_2,
      ordem: 3,
      imagem_url: "/icons/evolutions/escuridao/dominio-das-trevas.png",
    });
  },

  async down(queryInterface) {
    const nomes = [
      "Fôlego do Vento", "Lâmina Veloz", "Fúria do Vendaval",
      "Sopro Arcano", "Redemoinho Místico", "Fúria da Tempestade",
      "Toque Sombrio", "Armadura Espectral", "Fúria das Trevas",
      "Sussurro das Trevas", "Pacto Sombrio", "Domínio das Trevas",
    ];
    await queryInterface.sequelize.query(
      `DELETE FROM evolutions WHERE nome IN (:nomes);`,
      { replacements: { nomes } },
    );
  },
};
