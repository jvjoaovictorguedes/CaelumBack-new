"use strict";

// A árvore de Evolution (por natureza mágica) só tinha 2 das 8 naturezas
// cadastradas (Ar e Escuridao) — pedido do jogador pra completar as
// outras 6 (Fogo, Agua, Terra, Luz, Raio, Yin&Yang), pras 2 classes,
// seguindo exatamente o mesmo formato que já existia: 3 estágios por
// árvore (nível 5/15/25, custo 100/300/600 em cadeia de pré-requisito),
// os dois primeiros só dão bônus de atributo, o terceiro também concede
// um Power novo (Ativo) — mesmo padrão de Investida do
// Vendaval/Tornado Arcano/Golpe das Sombras/Drenar Vida (que cobrem só
// Ar/Escuridao).
const ARVORES = [
  {
    natureza: "Fogo",
    porClasse: {
      Guerreiro: {
        tier1: { nome: "Brasa Interior", bonus: { Forca: 2, Velocidade: 2 } },
        tier2: { nome: "Fúria Incandescente", bonus: { Forca: 4, Velocidade: 3 } },
        tier3: {
          nome: "Explosão de Brasas",
          bonus: { Forca: 6 },
          poder: {
            nome: "Lâmina Flamejante",
            descricao: "A lâmina pega fogo no instante do impacto, queimando muito além do corte.",
            custo_mana: 16,
            dano_base: 28,
            escala_atributo: "Forca",
            valor_escala: 1.4,
          },
        },
      },
      Mago: {
        tier1: { nome: "Chama Interior", bonus: { Inteligencia: 2, Agilidade: 2 } },
        tier2: { nome: "Ignição Arcana", bonus: { Inteligencia: 4, Agilidade: 3 } },
        tier3: {
          nome: "Coração em Chamas",
          bonus: { Inteligencia: 6 },
          poder: {
            nome: "Erupção Arcana",
            descricao: "Uma coluna de fogo arcano irrompe do chão sob o inimigo.",
            custo_mana: 24,
            dano_base: 32,
            escala_atributo: "Inteligencia",
            valor_escala: 1.45,
          },
        },
      },
    },
  },
  {
    natureza: "Agua",
    porClasse: {
      Guerreiro: {
        tier1: { nome: "Fluxo Constante", bonus: { Vitalidade: 2, Agilidade: 2 } },
        tier2: { nome: "Correnteza Firme", bonus: { Vitalidade: 4, Agilidade: 3 } },
        tier3: {
          nome: "Maré Implacável",
          bonus: { Agilidade: 6 },
          poder: {
            nome: "Golpe da Maré",
            descricao: "Avança como uma onda que não recua — o golpe vem antes do inimigo se reposicionar.",
            custo_mana: 14,
            dano_base: 26,
            escala_atributo: "Agilidade",
            valor_escala: 1.35,
          },
        },
      },
      Mago: {
        tier1: { nome: "Toque das Águas", bonus: { Inteligencia: 2, Vitalidade: 2 } },
        tier2: { nome: "Correntes Curativas", bonus: { Inteligencia: 4, Vitalidade: 3 } },
        tier3: {
          nome: "Fonte da Vida",
          bonus: { Vitalidade: 6 },
          poder: {
            nome: "Maré Curativa",
            descricao: "Uma onda de água arcana lava os ferimentos, fechando-os em segundos.",
            custo_mana: 22,
            cura_base: 34,
            escala_atributo: "Inteligencia",
            valor_escala: 1.2,
          },
        },
      },
    },
  },
  {
    natureza: "Terra",
    porClasse: {
      Guerreiro: {
        tier1: { nome: "Raízes Profundas", bonus: { Vitalidade: 2, Forca: 2 } },
        tier2: { nome: "Peso da Montanha", bonus: { Vitalidade: 4, Forca: 3 } },
        tier3: {
          nome: "Vontade da Pedra",
          bonus: { Vitalidade: 6 },
          poder: {
            nome: "Investida Telúrica",
            descricao: "Avança como uma avalanche — nada no caminho continua de pé depois.",
            custo_mana: 16,
            dano_base: 27,
            escala_atributo: "Forca",
            valor_escala: 1.38,
          },
        },
      },
      Mago: {
        tier1: { nome: "Sussurro da Terra", bonus: { Inteligencia: 2, Vitalidade: 2 } },
        tier2: { nome: "Manto Pétreo", bonus: { Inteligencia: 4, Vitalidade: 3 } },
        tier3: {
          nome: "Coração da Montanha",
          bonus: { Inteligencia: 6 },
          poder: {
            nome: "Colapso Telúrico",
            descricao: "O chão sob o inimigo desaba num colapso de pedra e energia arcana.",
            custo_mana: 26,
            dano_base: 33,
            escala_atributo: "Inteligencia",
            valor_escala: 1.4,
          },
        },
      },
    },
  },
  {
    natureza: "Luz",
    porClasse: {
      Guerreiro: {
        tier1: { nome: "Fé Inabalável", bonus: { Vitalidade: 2, Forca: 2 } },
        tier2: { nome: "Juramento Sagrado", bonus: { Vitalidade: 4, Forca: 3 } },
        tier3: {
          nome: "Escudo Divino",
          bonus: { Vitalidade: 6 },
          poder: {
            nome: "Bênção Radiante",
            descricao: "Um clarão sagrado fecha ferimentos e reacende a vontade de continuar lutando.",
            custo_mana: 18,
            cura_base: 30,
            escala_atributo: "Vitalidade",
            valor_escala: 1.15,
          },
        },
      },
      Mago: {
        tier1: { nome: "Centelha Sagrada", bonus: { Inteligencia: 2, Vitalidade: 2 } },
        tier2: { nome: "Chama Purificadora", bonus: { Inteligencia: 4, Vitalidade: 3 } },
        tier3: {
          nome: "Comunhão Celestial",
          bonus: { Inteligencia: 6 },
          poder: {
            nome: "Raio de Cura Maior",
            descricao: "Um feixe de luz pura desce do alto, curando o que toca.",
            custo_mana: 24,
            cura_base: 36,
            escala_atributo: "Inteligencia",
            valor_escala: 1.25,
          },
        },
      },
    },
  },
  {
    natureza: "Raio",
    porClasse: {
      Guerreiro: {
        tier1: { nome: "Reflexos Elétricos", bonus: { Forca: 2, Velocidade: 2 } },
        tier2: { nome: "Fúria Fulminante", bonus: { Forca: 4, Velocidade: 3 } },
        tier3: {
          nome: "Tempestade Pessoal",
          bonus: { Velocidade: 6 },
          poder: {
            nome: "Golpe Relâmpago",
            descricao: "Um golpe rápido demais pro inimigo perceber antes de já ter acontecido.",
            custo_mana: 15,
            dano_base: 29,
            escala_atributo: "Velocidade",
            valor_escala: 1.4,
          },
        },
      },
      Mago: {
        tier1: { nome: "Faísca Arcana", bonus: { Inteligencia: 2, Velocidade: 2 } },
        tier2: { nome: "Circuito Arcano", bonus: { Inteligencia: 4, Velocidade: 3 } },
        tier3: {
          nome: "Núcleo Elétrico",
          bonus: { Inteligencia: 6 },
          poder: {
            nome: "Descarga Total",
            descricao: "Libera toda a energia acumulada numa descarga só, sem economizar nada.",
            custo_mana: 26,
            dano_base: 34,
            escala_atributo: "Inteligencia",
            valor_escala: 1.48,
          },
        },
      },
    },
  },
  {
    natureza: "Yin&Yang",
    porClasse: {
      Guerreiro: {
        tier1: { nome: "Equilíbrio Marcial", bonus: { Forca: 2, Inteligencia: 2 } },
        tier2: { nome: "Harmonia de Combate", bonus: { Forca: 3, Inteligencia: 3 } },
        tier3: {
          nome: "Unidade Perfeita",
          bonus: { Forca: 3, Inteligencia: 3 },
          poder: {
            nome: "Golpe do Equilíbrio",
            descricao: "Um golpe que fere o inimigo e devolve parte da força ao próprio corpo.",
            custo_mana: 18,
            dano_base: 22,
            cura_base: 10,
            escala_atributo: "Forca",
            valor_escala: 1.3,
          },
        },
      },
      Mago: {
        tier1: { nome: "Fluxo Dual", bonus: { Inteligencia: 2, Vitalidade: 2 } },
        tier2: { nome: "Ciclo Eterno", bonus: { Inteligencia: 4, Vitalidade: 3 } },
        tier3: {
          nome: "Grande Equilíbrio",
          bonus: { Inteligencia: 3, Vitalidade: 3 },
          poder: {
            nome: "Ciclo Vital",
            descricao: "Toma energia vital do inimigo e devolve parte dela como cura própria.",
            custo_mana: 22,
            dano_base: 18,
            cura_base: 18,
            escala_atributo: "Inteligencia",
            valor_escala: 1.25,
          },
        },
      },
    },
  },
];

const CAMPO_BONUS = {
  Forca: "bonus_forca",
  Vitalidade: "bonus_vitalidade",
  Agilidade: "bonus_agilidade",
  Inteligencia: "bonus_inteligencia",
  Velocidade: "bonus_velocidade",
};

function colunasBonus(bonus) {
  const valores = { bonus_forca: 0, bonus_vitalidade: 0, bonus_agilidade: 0, bonus_inteligencia: 0, bonus_velocidade: 0 };
  for (const [atributo, valor] of Object.entries(bonus)) {
    valores[CAMPO_BONUS[atributo]] = valor;
  }
  return valores;
}

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
       (:nome, :descricao, 'Ativo', :custo_mana, :dano_base, :cura_base, :escala_atributo, :valor_escala, now(), now())
     RETURNING id;`,
    {
      replacements: {
        nome: dados.nome,
        descricao: dados.descricao,
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
    for (const arvore of ARVORES) {
      for (const [nomeClasse, tiers] of Object.entries(arvore.porClasse)) {
        const [[classe]] = await queryInterface.sequelize.query(
          `SELECT id FROM "Classes" WHERE nome = :nome LIMIT 1;`,
          { replacements: { nome: nomeClasse } },
        );
        if (!classe) {
          console.log(`[migration] Classe "${nomeClasse}" não encontrada — pulando.`);
          continue;
        }

        const [existente] = await queryInterface.sequelize.query(
          `SELECT id FROM evolutions WHERE id_classe = :id_classe AND natureza_magica = :natureza LIMIT 1;`,
          { replacements: { id_classe: classe.id, natureza: arvore.natureza } },
        );
        if (existente.length > 0) {
          console.log(`[migration] Árvore ${nomeClasse}/${arvore.natureza} já existe — pulando.`);
          continue;
        }

        let idAnterior = null;
        const definicoes = [
          { chave: "tier1", nivel: 5, custo: 100, ordem: 1 },
          { chave: "tier2", nivel: 15, custo: 300, ordem: 2 },
          { chave: "tier3", nivel: 25, custo: 600, ordem: 3 },
        ];

        for (const def of definicoes) {
          const dadosTier = tiers[def.chave];
          const bonusColunas = colunasBonus(dadosTier.bonus);

          let idPoderConcedido = null;
          if (dadosTier.poder) {
            idPoderConcedido = await criarPoder(queryInterface, dadosTier.poder);
          }

          const [[criado]] = await queryInterface.sequelize.query(
            `INSERT INTO evolutions
               (nome, descricao, id_classe, natureza_magica, nivel_necessario, custo,
                bonus_forca, bonus_vitalidade, bonus_agilidade, bonus_inteligencia, bonus_velocidade,
                id_power_concedido, id_evolucao_pre_requisito, ordem, "createdAt", "updatedAt")
             VALUES
               (:nome, :descricao, :id_classe, :natureza, :nivel, :custo,
                :bonus_forca, :bonus_vitalidade, :bonus_agilidade, :bonus_inteligencia, :bonus_velocidade,
                :id_power_concedido, :id_pre_requisito, :ordem, now(), now())
             RETURNING id;`,
            {
              replacements: {
                nome: dadosTier.nome,
                descricao: `Estágio ${def.ordem} da natureza ${arvore.natureza}.`,
                id_classe: classe.id,
                natureza: arvore.natureza,
                nivel: def.nivel,
                custo: def.custo,
                ...bonusColunas,
                id_power_concedido: idPoderConcedido,
                id_pre_requisito: idAnterior,
                ordem: def.ordem,
              },
            },
          );
          idAnterior = criado.id;
        }
      }
    }
    console.log("[migration] Árvores de Evolution criadas pras 6 naturezas restantes (Fogo, Agua, Terra, Luz, Raio, Yin&Yang).");
  },

  async down(queryInterface) {
    for (const arvore of ARVORES) {
      const nomesPoderes = Object.values(arvore.porClasse)
        .map((tiers) => tiers.tier3?.poder?.nome)
        .filter(Boolean);

      await queryInterface.sequelize.query(`DELETE FROM evolutions WHERE natureza_magica = :natureza;`, {
        replacements: { natureza: arvore.natureza },
      });

      for (const nome of nomesPoderes) {
        const [[poder]] = await queryInterface.sequelize.query(
          `SELECT id FROM "Powers" WHERE nome = :nome LIMIT 1;`,
          { replacements: { nome } },
        );
        if (!poder) continue;
        await queryInterface.sequelize.query(`DELETE FROM "CharacterAbilities" WHERE id_power = :id;`, {
          replacements: { id: poder.id },
        });
        await queryInterface.sequelize.query(`DELETE FROM "Powers" WHERE id = :id;`, {
          replacements: { id: poder.id },
        });
      }
    }
  },
};
