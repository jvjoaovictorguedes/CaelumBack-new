"use strict";

// 7 poderes Passivos novos (1 por classe + 1 por raça) — o jogo só tinha
// poderes Ativos até aqui. Diferente dos poderes de sempre (liberados de
// graça quando o personagem bate o nível), estes têm custo_ouro: só
// aparecem pra comprar na aba Habilidades depois do nível mínimo, e só
// entram em CharacterAbilities quando o jogador de fato compra (ver
// comprarPoder em characterController.js). Uma vez comprado, o passivo
// fica sempre ativo (is_active:true) e dá um bônus PERMANENTE e FIXO num
// atributo — igual a bônus de equipamento, ver equipmentBonusService.js —
// que evolui de nível junto com o resto do sistema de Grimório
// (abilityLevelService.multiplicadorEfeito), gastando ouro+fragmento como
// qualquer outra habilidade.
const CLASSES = [
  {
    nomeClasse: "Guerreiro",
    poder: {
      nome: "Couraça de Batalha",
      descricao:
        "Anos de combate corpo a corpo endureceram o corpo do Guerreiro — bônus permanente de Vitalidade.",
      escala_atributo: "Vitalidade",
      valor_escala: 6,
    },
    nivel_necessario: 15,
    custo_ouro: 500,
  },
  {
    nomeClasse: "Mago",
    poder: {
      nome: "Fluxo Arcano",
      descricao:
        "O Mago aprende a manter um fluxo constante de mana correndo pelo corpo — bônus permanente de Inteligência.",
      escala_atributo: "Inteligencia",
      valor_escala: 6,
    },
    nivel_necessario: 15,
    custo_ouro: 500,
  },
];

const RACAS = [
  {
    nomeRaca: "Humano",
    poder: {
      nome: "Adaptação Rápida",
      descricao:
        "A versatilidade humana se traduz em reflexos que melhoram com a prática — bônus permanente de Velocidade.",
      escala_atributo: "Velocidade",
      valor_escala: 5,
    },
    nivel_necessario: 12,
    custo_ouro: 350,
  },
  {
    nomeRaca: "Elfo",
    poder: {
      nome: "Graça Élfica",
      descricao:
        "Movimentos precisos e naturais, refinados ao longo de séculos de vida — bônus permanente de Agilidade.",
      escala_atributo: "Agilidade",
      valor_escala: 6,
    },
    nivel_necessario: 12,
    custo_ouro: 350,
  },
  {
    nomeRaca: "Anao",
    poder: {
      nome: "Pele de Granito",
      descricao:
        "A resistência natural do Anão se aprofunda com o tempo, como a própria rocha — bônus permanente de Vitalidade.",
      escala_atributo: "Vitalidade",
      valor_escala: 7,
    },
    nivel_necessario: 12,
    custo_ouro: 350,
  },
  {
    nomeRaca: "Orc",
    poder: {
      nome: "Sangue Selvagem",
      descricao:
        "A fúria contida no sangue do Orc se manifesta em força bruta permanente — bônus permanente de Força.",
      escala_atributo: "Forca",
      valor_escala: 7,
    },
    nivel_necessario: 12,
    custo_ouro: 350,
  },
  {
    nomeRaca: "Celestial",
    poder: {
      nome: "Bênção Celestial",
      descricao:
        "Um traço da linhagem quase divina do Celestial desperta, ampliando sua mente muito além do comum — bônus permanente de Inteligência.",
      escala_atributo: "Inteligencia",
      valor_escala: 8,
    },
    nivel_necessario: 20,
    custo_ouro: 900,
  },
];

async function criarPoderPassivo(queryInterface, dados) {
  const [existente] = await queryInterface.sequelize.query(
    `SELECT id FROM "Powers" WHERE nome = :nome LIMIT 1;`,
    { replacements: { nome: dados.nome } },
  );
  if (existente.length > 0) return existente[0].id;

  const [[criado]] = await queryInterface.sequelize.query(
    `INSERT INTO "Powers"
       (nome, descricao, tipo_poder, custo_mana, dano_base, cura_base, escala_atributo, valor_escala, "createdAt", "updatedAt")
     VALUES
       (:nome, :descricao, 'Passivo', 0, 0, 0, :escala_atributo, :valor_escala, now(), now())
     RETURNING id;`,
    { replacements: dados },
  );
  return criado.id;
}

module.exports = {
  async up(queryInterface) {
    for (const entrada of CLASSES) {
      const idPoder = await criarPoderPassivo(queryInterface, entrada.poder);

      const [[classe]] = await queryInterface.sequelize.query(
        `SELECT id FROM "Classes" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: entrada.nomeClasse } },
      );
      if (!classe) {
        console.log(`[migration] Classe "${entrada.nomeClasse}" não encontrada — pulando.`);
        continue;
      }

      const [jaExiste] = await queryInterface.sequelize.query(
        `SELECT 1 FROM class_abilities WHERE id_classe = :id_classe AND id_poder = :id_poder LIMIT 1;`,
        { replacements: { id_classe: classe.id, id_poder: idPoder } },
      );
      if (jaExiste.length > 0) {
        console.log(`[migration] Vínculo classe ${entrada.nomeClasse} <-> "${entrada.poder.nome}" já existe — pulando.`);
        continue;
      }

      await queryInterface.sequelize.query(
        `INSERT INTO class_abilities (id_classe, id_poder, nivel_aprendizagem, custo_ouro)
         VALUES (:id_classe, :id_poder, :nivel, :custo);`,
        {
          replacements: {
            id_classe: classe.id,
            id_poder: idPoder,
            nivel: entrada.nivel_necessario,
            custo: entrada.custo_ouro,
          },
        },
      );
    }

    for (const entrada of RACAS) {
      const idPoder = await criarPoderPassivo(queryInterface, entrada.poder);

      const [[raca]] = await queryInterface.sequelize.query(
        `SELECT id FROM "Races" WHERE nome_masculino = :nome LIMIT 1;`,
        { replacements: { nome: entrada.nomeRaca } },
      );
      if (!raca) {
        console.log(`[migration] Raça "${entrada.nomeRaca}" não encontrada — pulando.`);
        continue;
      }

      const [jaExiste] = await queryInterface.sequelize.query(
        `SELECT 1 FROM "RaceAbilities" WHERE id_raca = :id_raca AND id_power = :id_power LIMIT 1;`,
        { replacements: { id_raca: raca.id, id_power: idPoder } },
      );
      if (jaExiste.length > 0) {
        console.log(`[migration] Vínculo raça ${entrada.nomeRaca} <-> "${entrada.poder.nome}" já existe — pulando.`);
        continue;
      }

      await queryInterface.sequelize.query(
        `INSERT INTO "RaceAbilities" (id_raca, id_power, nivel_aprendizado, custo_ouro, "createdAt", "updatedAt")
         VALUES (:id_raca, :id_power, :nivel, :custo, now(), now());`,
        {
          replacements: {
            id_raca: raca.id,
            id_power: idPoder,
            nivel: entrada.nivel_necessario,
            custo: entrada.custo_ouro,
          },
        },
      );
    }

    console.log("[migration] 7 poderes passivos de classe/raça criados.");
  },

  async down(queryInterface) {
    const nomes = [...CLASSES, ...RACAS].map((e) => e.poder.nome);
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
