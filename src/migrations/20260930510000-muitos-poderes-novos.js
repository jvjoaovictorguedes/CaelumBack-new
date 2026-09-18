"use strict";

// Pedido do jogador: "muitos lugares pra colocar poder pra pouco poder"
// — cada classe/raça só tinha um punhado de poderes espalhados em uns
// poucos níveis, deixando a progressão de personagem vazia entre eles.
// Esta migration adiciona 36 poderes novos (26 Ativos + 10 Passivos),
// espalhados por vários níveis (3 a 38) pras 2 classes e 5 raças,
// seguindo os mesmos critérios já usados: Ativo libera de graça ao
// bater o nível (concederPoderesIniciais), Passivo tem custo_ouro e
// precisa ser comprado na aba Habilidades (comprarPoder).
const CLASSES = [
  {
    nomeClasse: "Guerreiro",
    poderes: [
      {
        nome: "Corte Selvagem",
        descricao: "Um corte rápido e impreciso, mas que sai antes do inimigo perceber.",
        tipo_poder: "Ativo",
        custo_mana: 4,
        dano_base: 13,
        escala_atributo: "Forca",
        valor_escala: 1.22,
        nivel_necessario: 3,
      },
      {
        nome: "Investida Relâmpago",
        descricao: "Fecha a distância num piscar de olhos, usando pura velocidade em vez de força bruta.",
        tipo_poder: "Ativo",
        custo_mana: 9,
        dano_base: 19,
        escala_atributo: "Agilidade",
        valor_escala: 1.28,
        nivel_necessario: 8,
      },
      {
        nome: "Golpe Retumbante",
        descricao: "Um golpe pesado o suficiente pra fazer o chão tremer ao redor do impacto.",
        tipo_poder: "Ativo",
        custo_mana: 14,
        dano_base: 26,
        escala_atributo: "Forca",
        valor_escala: 1.38,
        nivel_necessario: 16,
      },
      {
        nome: "Instinto Assassino",
        descricao: "Anos de combate afiaram os reflexos até virarem puro instinto — bônus permanente de Força.",
        tipo_poder: "Passivo",
        custo_mana: 0,
        escala_atributo: "Forca",
        valor_escala: 10,
        nivel_necessario: 22,
        custo_ouro: 650,
      },
      {
        nome: "Investida Devastadora",
        descricao: "Concentra todo o peso do corpo num único golpe pra atravessar qualquer guarda.",
        tipo_poder: "Ativo",
        custo_mana: 18,
        dano_base: 33,
        escala_atributo: "Forca",
        valor_escala: 1.45,
        nivel_necessario: 25,
      },
      {
        nome: "Pele de Ferro",
        descricao: "A pele endurece de tanto absorver golpes em combate — bônus permanente de Vitalidade.",
        tipo_poder: "Passivo",
        custo_mana: 0,
        escala_atributo: "Vitalidade",
        valor_escala: 9,
        nivel_necessario: 30,
        custo_ouro: 900,
      },
      {
        nome: "Fúria Implacável",
        descricao: "Nada mais importa além de derrubar o inimigo à sua frente — cada golpe vem mais forte que o último.",
        tipo_poder: "Ativo",
        custo_mana: 26,
        dano_base: 46,
        escala_atributo: "Forca",
        valor_escala: 1.65,
        nivel_necessario: 35,
      },
      {
        nome: "Golpe do Titã",
        descricao: "O golpe mais pesado que um Guerreiro mortal consegue desferir, digno de quem está prestes a evoluir.",
        tipo_poder: "Ativo",
        custo_mana: 30,
        dano_base: 50,
        escala_atributo: "Forca",
        valor_escala: 1.75,
        nivel_necessario: 38,
      },
    ],
  },
  {
    nomeClasse: "Mago",
    poderes: [
      {
        nome: "Mísseis Arcanos",
        descricao: "Pequenos projéteis de energia pura, rápidos de conjurar e fáceis de mirar.",
        tipo_poder: "Ativo",
        custo_mana: 8,
        dano_base: 11,
        escala_atributo: "Inteligencia",
        valor_escala: 1.15,
        nivel_necessario: 3,
      },
      {
        nome: "Escudo de Mana",
        descricao: "Converte mana em uma barreira temporária que absorve parte do dano recebido.",
        tipo_poder: "Ativo",
        custo_mana: 14,
        cura_base: 20,
        escala_atributo: "Inteligencia",
        valor_escala: 1.1,
        nivel_necessario: 12,
      },
      {
        nome: "Corrente Arcana",
        descricao: "Um fio de energia que salta entre pontos fracos do inimigo antes de se dissipar.",
        tipo_poder: "Ativo",
        custo_mana: 24,
        dano_base: 30,
        escala_atributo: "Inteligencia",
        valor_escala: 1.42,
        nivel_necessario: 20,
      },
      {
        nome: "Mente Afiada",
        descricao: "O foco necessário pra conjurar sob pressão se torna permanente — bônus fixo de Inteligência.",
        tipo_poder: "Passivo",
        custo_mana: 0,
        escala_atributo: "Inteligencia",
        valor_escala: 9,
        nivel_necessario: 22,
        custo_ouro: 650,
      },
      {
        nome: "Nova Congelante",
        descricao: "Uma explosão de frio que se espalha em todas as direções a partir do conjurador.",
        tipo_poder: "Ativo",
        custo_mana: 30,
        dano_base: 36,
        escala_atributo: "Inteligencia",
        valor_escala: 1.5,
        nivel_necessario: 28,
      },
      {
        nome: "Reserva Arcana",
        descricao: "Aprende a manter um excedente de mana sempre pronto — bônus permanente de Inteligência.",
        tipo_poder: "Passivo",
        custo_mana: 0,
        escala_atributo: "Inteligencia",
        valor_escala: 10,
        nivel_necessario: 30,
        custo_ouro: 900,
      },
      {
        nome: "Tempestade Arcana",
        descricao: "Convoca uma tempestade de energia bruta que castiga uma área inteira de uma vez.",
        tipo_poder: "Ativo",
        custo_mana: 34,
        dano_base: 42,
        escala_atributo: "Inteligencia",
        valor_escala: 1.55,
        nivel_necessario: 32,
      },
      {
        nome: "Colapso Dimensional",
        descricao: "Rasga o tecido da magia por um instante — o feitiço mais destrutivo que um Mago mortal ousa conjurar.",
        tipo_poder: "Ativo",
        custo_mana: 42,
        dano_base: 58,
        escala_atributo: "Inteligencia",
        valor_escala: 1.7,
        nivel_necessario: 38,
      },
    ],
  },
];

const RACAS = [
  {
    nomeRaca: "Humano",
    poderes: [
      {
        nome: "Determinação",
        descricao: "A vontade humana de continuar de pé, mesmo depois de golpes que derrubariam qualquer outro.",
        tipo_poder: "Ativo",
        custo_mana: 8,
        cura_base: 12,
        escala_atributo: "Vitalidade",
        valor_escala: 1.0,
        nivel_necessario: 5,
      },
      {
        nome: "Coração Resiliente",
        descricao: "A resistência humana se aprofunda com cada batalha vencida — bônus permanente de Vitalidade.",
        tipo_poder: "Passivo",
        custo_mana: 0,
        escala_atributo: "Vitalidade",
        valor_escala: 6,
        nivel_necessario: 16,
        custo_ouro: 480,
      },
      {
        nome: "Fúria Silenciosa",
        descricao: "Sem grito de guerra, sem aviso — só o golpe.",
        tipo_poder: "Ativo",
        custo_mana: 12,
        dano_base: 24,
        escala_atributo: "Forca",
        valor_escala: 1.3,
        nivel_necessario: 18,
      },
      {
        nome: "Instinto de Sobrevivência",
        descricao: "No limite, o corpo humano encontra reservas de energia que ninguém sabia que existiam.",
        tipo_poder: "Ativo",
        custo_mana: 20,
        cura_base: 30,
        escala_atributo: "Vitalidade",
        valor_escala: 1.2,
        nivel_necessario: 28,
      },
    ],
  },
  {
    nomeRaca: "Elfo",
    poderes: [
      {
        nome: "Passo Élfico",
        descricao: "Um movimento leve o suficiente pra não fazer soar nem uma folha seca.",
        tipo_poder: "Ativo",
        custo_mana: 5,
        dano_base: 10,
        escala_atributo: "Agilidade",
        valor_escala: 1.15,
        nivel_necessario: 3,
      },
      {
        nome: "Chuva de Flechas",
        descricao: "Várias flechas disparadas em sucessão tão rápida que parecem uma só nuvem.",
        tipo_poder: "Ativo",
        custo_mana: 16,
        dano_base: 26,
        escala_atributo: "Agilidade",
        valor_escala: 1.35,
        nivel_necessario: 16,
      },
      {
        nome: "Reflexos Élficos",
        descricao: "Séculos de vida ensinam o corpo a reagir antes mesmo da mente perceber o perigo — bônus permanente de Agilidade.",
        tipo_poder: "Passivo",
        custo_mana: 0,
        escala_atributo: "Agilidade",
        valor_escala: 7,
        nivel_necessario: 18,
        custo_ouro: 550,
      },
      {
        nome: "Dança das Lâminas",
        descricao: "Uma sequência de cortes tão fluida que parece mais dança do que combate.",
        tipo_poder: "Ativo",
        custo_mana: 22,
        dano_base: 34,
        escala_atributo: "Agilidade",
        valor_escala: 1.5,
        nivel_necessario: 26,
      },
    ],
  },
  {
    nomeRaca: "Anao",
    poderes: [
      {
        nome: "Golpe de Martelo",
        descricao: "Um golpe direto e sem frescura, do jeito que os Anões preferem resolver as coisas.",
        tipo_poder: "Ativo",
        custo_mana: 6,
        dano_base: 14,
        escala_atributo: "Forca",
        valor_escala: 1.2,
        nivel_necessario: 4,
      },
      {
        nome: "Fúria da Montanha",
        descricao: "A teimosia anã em forma de golpe — não recua, não hesita.",
        tipo_poder: "Ativo",
        custo_mana: 16,
        dano_base: 28,
        escala_atributo: "Forca",
        valor_escala: 1.35,
        nivel_necessario: 17,
      },
      {
        nome: "Couraça de Pedra",
        descricao: "A pele endurece como a rocha das montanhas de onde os Anões vêm — bônus permanente de Vitalidade.",
        tipo_poder: "Passivo",
        custo_mana: 0,
        escala_atributo: "Vitalidade",
        valor_escala: 8,
        nivel_necessario: 19,
        custo_ouro: 580,
      },
      {
        nome: "Terremoto Anão",
        descricao: "Um golpe contra o chão forte o suficiente pra abalar tudo ao redor.",
        tipo_poder: "Ativo",
        custo_mana: 22,
        dano_base: 36,
        escala_atributo: "Forca",
        valor_escala: 1.5,
        nivel_necessario: 27,
      },
    ],
  },
  {
    nomeRaca: "Orc",
    poderes: [
      {
        nome: "Investida Bruta",
        descricao: "Sem técnica, sem estratégia — só força pura jogada pra frente.",
        tipo_poder: "Ativo",
        custo_mana: 4,
        dano_base: 15,
        escala_atributo: "Forca",
        valor_escala: 1.22,
        nivel_necessario: 4,
      },
      {
        nome: "Machadada Selvagem",
        descricao: "Um golpe largo o suficiente pra acertar qualquer coisa que ouse chegar perto.",
        tipo_poder: "Ativo",
        custo_mana: 14,
        dano_base: 30,
        escala_atributo: "Forca",
        valor_escala: 1.4,
        nivel_necessario: 18,
      },
      {
        nome: "Fúria Interminável",
        descricao: "A raiva do Orc nunca esfria de verdade — bônus permanente de Força.",
        tipo_poder: "Passivo",
        custo_mana: 0,
        escala_atributo: "Forca",
        valor_escala: 9,
        nivel_necessario: 20,
        custo_ouro: 600,
      },
      {
        nome: "Sede de Sangue",
        descricao: "Quanto mais longa a luta, mais selvagem o Orc fica — o golpe final de quem não pretende parar.",
        tipo_poder: "Ativo",
        custo_mana: 18,
        dano_base: 40,
        escala_atributo: "Forca",
        valor_escala: 1.55,
        nivel_necessario: 28,
      },
    ],
  },
  {
    nomeRaca: "Celestial",
    poderes: [
      {
        nome: "Aura Sagrada",
        descricao: "Uma luz suave que fecha ferimentos com a mesma naturalidade de respirar.",
        tipo_poder: "Ativo",
        custo_mana: 16,
        cura_base: 22,
        escala_atributo: "Inteligencia",
        valor_escala: 1.1,
        nivel_necessario: 10,
      },
      {
        nome: "Luz Interior",
        descricao: "Um traço da linhagem quase divina desperta de vez — bônus permanente de Inteligência.",
        tipo_poder: "Passivo",
        custo_mana: 0,
        escala_atributo: "Inteligencia",
        valor_escala: 9,
        nivel_necessario: 25,
        custo_ouro: 1000,
      },
      {
        nome: "Ira Celestial",
        descricao: "Quando a paciência acaba, resta apenas o julgamento — e ele nunca é gentil.",
        tipo_poder: "Ativo",
        custo_mana: 32,
        dano_base: 44,
        escala_atributo: "Inteligencia",
        valor_escala: 1.55,
        nivel_necessario: 30,
      },
      {
        nome: "Julgamento Final",
        descricao: "O poder mais próximo do divino que um Celestial pode invocar em combate.",
        tipo_poder: "Ativo",
        custo_mana: 44,
        dano_base: 60,
        escala_atributo: "Inteligencia",
        valor_escala: 1.75,
        nivel_necessario: 38,
      },
    ],
  },
];

async function criarPoder(queryInterface, dados) {
  const [existente] = await queryInterface.sequelize.query(
    `SELECT id FROM "Powers" WHERE nome = :nome LIMIT 1;`,
    { replacements: { nome: dados.nome } },
  );
  if (existente.length > 0) return existente[0].id;

  const [[criado]] = await queryInterface.sequelize.query(
    `INSERT INTO "Powers"
       (nome, descricao, tipo_poder, custo_mana, dano_base, cura_base, escala_atributo, valor_escala, "createdAt", "updatedAt")
     VALUES
       (:nome, :descricao, :tipo_poder, :custo_mana, :dano_base, :cura_base, :escala_atributo, :valor_escala, now(), now())
     RETURNING id;`,
    {
      replacements: {
        nome: dados.nome,
        descricao: dados.descricao,
        tipo_poder: dados.tipo_poder,
        custo_mana: dados.custo_mana ?? 0,
        dano_base: dados.dano_base ?? 0,
        cura_base: dados.cura_base ?? 0,
        escala_atributo: dados.escala_atributo,
        valor_escala: dados.valor_escala,
      },
    },
  );
  return criado.id;
}

module.exports = {
  async up(queryInterface) {
    for (const grupo of CLASSES) {
      const [[classe]] = await queryInterface.sequelize.query(
        `SELECT id FROM "Classes" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: grupo.nomeClasse } },
      );
      if (!classe) {
        console.log(`[migration] Classe "${grupo.nomeClasse}" não encontrada — pulando.`);
        continue;
      }

      for (const poder of grupo.poderes) {
        const idPoder = await criarPoder(queryInterface, poder);

        const [jaExiste] = await queryInterface.sequelize.query(
          `SELECT 1 FROM class_abilities WHERE id_classe = :id_classe AND id_poder = :id_poder LIMIT 1;`,
          { replacements: { id_classe: classe.id, id_poder: idPoder } },
        );
        if (jaExiste.length > 0) continue;

        await queryInterface.sequelize.query(
          `INSERT INTO class_abilities (id_classe, id_poder, nivel_aprendizagem, custo_ouro)
           VALUES (:id_classe, :id_poder, :nivel, :custo);`,
          {
            replacements: {
              id_classe: classe.id,
              id_poder: idPoder,
              nivel: poder.nivel_necessario,
              custo: poder.custo_ouro ?? null,
            },
          },
        );
      }
    }

    for (const grupo of RACAS) {
      const [[raca]] = await queryInterface.sequelize.query(
        `SELECT id FROM "Races" WHERE nome_masculino = :nome LIMIT 1;`,
        { replacements: { nome: grupo.nomeRaca } },
      );
      if (!raca) {
        console.log(`[migration] Raça "${grupo.nomeRaca}" não encontrada — pulando.`);
        continue;
      }

      for (const poder of grupo.poderes) {
        const idPoder = await criarPoder(queryInterface, poder);

        const [jaExiste] = await queryInterface.sequelize.query(
          `SELECT 1 FROM "RaceAbilities" WHERE id_raca = :id_raca AND id_power = :id_power LIMIT 1;`,
          { replacements: { id_raca: raca.id, id_power: idPoder } },
        );
        if (jaExiste.length > 0) continue;

        await queryInterface.sequelize.query(
          `INSERT INTO "RaceAbilities" (id_raca, id_power, nivel_aprendizado, custo_ouro, "createdAt", "updatedAt")
           VALUES (:id_raca, :id_power, :nivel, :custo, now(), now());`,
          {
            replacements: {
              id_raca: raca.id,
              id_power: idPoder,
              nivel: poder.nivel_necessario,
              custo: poder.custo_ouro ?? null,
            },
          },
        );
      }
    }

    console.log("[migration] 36 poderes novos (26 Ativos + 10 Passivos) criados.");
  },

  async down(queryInterface) {
    const nomes = [
      ...CLASSES.flatMap((g) => g.poderes.map((p) => p.nome)),
      ...RACAS.flatMap((g) => g.poderes.map((p) => p.nome)),
    ];
    for (const nome of nomes) {
      const [[poder]] = await queryInterface.sequelize.query(
        `SELECT id FROM "Powers" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome } },
      );
      if (!poder) continue;
      await queryInterface.sequelize.query(`DELETE FROM class_abilities WHERE id_poder = :id;`, {
        replacements: { id: poder.id },
      });
      await queryInterface.sequelize.query(`DELETE FROM "RaceAbilities" WHERE id_power = :id;`, {
        replacements: { id: poder.id },
      });
      await queryInterface.sequelize.query(`DELETE FROM "CharacterAbilities" WHERE id_power = :id;`, {
        replacements: { id: poder.id },
      });
      await queryInterface.sequelize.query(`DELETE FROM "Powers" WHERE id = :id;`, {
        replacements: { id: poder.id },
      });
    }
  },
};
