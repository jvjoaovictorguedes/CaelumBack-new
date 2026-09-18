"use strict";

// Substitui o antigo "1 evolução por classe" (booleano classe_evoluida)
// por uma árvore real: 3 caminhos exclusivos por classe, cada um com
// nível + relíquia próprios e um perfil de atributo diferente — pedido
// do jogador com um mockup de árvore (Mago -> Berserker/Paladino/
// Assassino como EXEMPLO lógico, não literal; aqui cada caminho recebeu
// um nome e foco condizentes com a própria classe).
const CAMINHOS = [
  {
    nomeClasse: "Guerreiro",
    caminhos: [
      {
        nome: "Berserker",
        descricao: "Abandona toda defesa em troca de fúria pura — cada golpe é mais forte que o anterior.",
        nomeItem: "Coração de Titã",
        bonus_forca: 20,
        bonus_agilidade: 6,
        bonus_velocidade: 6,
        ordem: 1,
      },
      {
        nome: "Paladino",
        descricao: "Um muro que não recua — sacrifica dano por uma resistência quase impossível de derrubar.",
        nomeItem: "Escudo de Luz Eterna",
        bonus_vitalidade: 20,
        bonus_forca: 8,
        ordem: 2,
      },
      {
        nome: "Cavaleiro Real",
        descricao: "Equilíbrio entre ataque, defesa e velocidade — não é o melhor em nada, mas nunca é o pior.",
        nomeItem: "Brasão do Guardião Real",
        bonus_forca: 10,
        bonus_vitalidade: 10,
        bonus_agilidade: 10,
        ordem: 3,
      },
    ],
  },
  {
    nomeClasse: "Mago",
    caminhos: [
      {
        nome: "Arquimago Eterno",
        descricao: "Domina o dano arcano em sua forma mais pura — cada feitiço sai mais devastador que o normal.",
        nomeItem: "Olho do Arcano Eterno",
        bonus_inteligencia: 22,
        bonus_agilidade: 6,
        ordem: 1,
      },
      {
        nome: "Nigromante",
        descricao: "Aprende a drenar vida junto com a magia — sustenta batalhas longas sem perder poder de fogo.",
        nomeItem: "Grimório das Sombras",
        bonus_inteligencia: 14,
        bonus_vitalidade: 14,
        ordem: 2,
      },
      {
        nome: "Feiticeiro Arcano",
        descricao: "Prioriza velocidade e reflexo — conjura mais rápido do que qualquer outro Mago consegue reagir.",
        nomeItem: "Pena do Vento Eterno",
        bonus_inteligencia: 12,
        bonus_velocidade: 8,
        bonus_agilidade: 6,
        ordem: 3,
      },
    ],
  },
];

const NIVEL_NECESSARIO = 40;

module.exports = {
  async up(queryInterface) {
    for (const grupo of CAMINHOS) {
      const [[classe]] = await queryInterface.sequelize.query(
        `SELECT id FROM "Classes" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: grupo.nomeClasse } },
      );
      if (!classe) {
        console.log(`[migration] Classe "${grupo.nomeClasse}" não encontrada — pulando.`);
        continue;
      }

      for (const caminho of grupo.caminhos) {
        const [existente] = await queryInterface.sequelize.query(
          `SELECT id FROM class_evolution_paths WHERE id_classe = :id_classe AND nome = :nome LIMIT 1;`,
          { replacements: { id_classe: classe.id, nome: caminho.nome } },
        );
        if (existente.length > 0) {
          console.log(`[migration] Caminho "${caminho.nome}" já existe — pulando.`);
          continue;
        }

        const [[item]] = await queryInterface.sequelize.query(
          `SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`,
          { replacements: { nome: caminho.nomeItem } },
        );
        if (!item) {
          throw new Error(`Item "${caminho.nomeItem}" não encontrado pro caminho "${caminho.nome}".`);
        }

        await queryInterface.sequelize.query(
          `INSERT INTO class_evolution_paths
             (id_classe, nome, descricao, nivel_necessario, id_item_requisito, quantidade_item_requisito,
              bonus_forca, bonus_vitalidade, bonus_agilidade, bonus_inteligencia, bonus_velocidade, ordem,
              "createdAt", "updatedAt")
           VALUES
             (:id_classe, :nome, :descricao, :nivel, :id_item, 1,
              :bonus_forca, :bonus_vitalidade, :bonus_agilidade, :bonus_inteligencia, :bonus_velocidade, :ordem,
              now(), now());`,
          {
            replacements: {
              id_classe: classe.id,
              nome: caminho.nome,
              descricao: caminho.descricao,
              nivel: NIVEL_NECESSARIO,
              id_item: item.id,
              bonus_forca: caminho.bonus_forca ?? 0,
              bonus_vitalidade: caminho.bonus_vitalidade ?? 0,
              bonus_agilidade: caminho.bonus_agilidade ?? 0,
              bonus_inteligencia: caminho.bonus_inteligencia ?? 0,
              bonus_velocidade: caminho.bonus_velocidade ?? 0,
              ordem: caminho.ordem,
            },
          },
        );
      }
    }

    console.log("[migration] 6 caminhos de evolução de classe criados.");
  },

  async down(queryInterface) {
    for (const grupo of CAMINHOS) {
      for (const caminho of grupo.caminhos) {
        await queryInterface.sequelize.query(`DELETE FROM class_evolution_paths WHERE nome = :nome;`, {
          replacements: { nome: caminho.nome },
        });
      }
    }
  },
};
