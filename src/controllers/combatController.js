// src/controllers/combatController.js
//
// Motor de combate por turnos (PvE).
// O combate usa os atributos do personagem e os poderes aprendidos
// para resolver os turnos.
//
// A lógica de progressão de XP/level/pontos fica no
// experienceService.js.

const Character = require("../models/Character");
const CharacterAbilities = require("../models/CharacterAbilities");
const Power = require("../models/Power");
const { adicionarExperiencia } = require("../services/experienceService");

const ATRIBUTO_PARA_CAMPO = {
  Forca: "forca",
  Vitalidade: "vitalidade",
  Agilidade: "agilidade",
  Inteligencia: "inteligencia",
  Velocidade: "velocidade",
};

const NOMES_INIMIGOS = [
  "Lobo das Sombras",
  "Bandido Errante",
  "Golem de Pedra",
  "Espectro Sussurrante",
  "Orc Guerreiro",
  "Aranha Venenosa",
  "Cultista Renegado",
  "Draconídeo Jovem",
];

function sortear(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

// Gera um inimigo balanceado a partir do nível do personagem.
// Fica só na memória (não precisa de tabela própria no banco).
function gerarInimigo(nivelPersonagem) {
  const nivel = Math.max(1, nivelPersonagem);

  const variacao = () => Math.floor(Math.random() * 3) - 1;

  const vitalidade = 6 + nivel * 2 + variacao();
  const forca = 4 + nivel * 2 + variacao();
  const agilidade = 3 + Math.floor(nivel * 1.5) + variacao();
  const velocidade = 3 + Math.floor(nivel * 1.3) + variacao();

  const vidaMaxima = 30 + vitalidade * 6;

  return {
    nome: sortear(NOMES_INIMIGOS),
    nivel,
    forca,
    vitalidade,
    agilidade,
    velocidade,
    vida_maxima: vidaMaxima,
    vida_atual: vidaMaxima,
    dano_base: 5 + Math.floor(forca * 0.8),
  };
}

// Calcula o dano de um ataque básico.
function calcularDanoBasico(atacante) {
  const base = 4 + atacante.forca * 0.9;

  const variacao = 0.85 + Math.random() * 0.3;

  return Math.max(1, Math.round(base * variacao));
}

// Calcula o dano/cura de um poder,
// escalando pelo atributo configurado.
function calcularEfeitoPoder(power, personagem) {
  const campoAtributo =
    ATRIBUTO_PARA_CAMPO[power.escala_atributo] || "forca";

  const valorAtributo = personagem[campoAtributo] || 0;

  const variacao = 0.9 + Math.random() * 0.2;

  const dano = power.dano_base
    ? Math.round(
        (power.dano_base + valorAtributo * power.valor_escala) *
          variacao
      )
    : 0;

  const cura = power.cura_base
    ? Math.round(
        (power.cura_base + valorAtributo * power.valor_escala) *
          variacao
      )
    : 0;

  return { dano, cura };
}

function chanceDeEsquiva(defensor, atacante) {
  const diferenca =
    (defensor.agilidade || 0) - (atacante.agilidade || 0);

  const chanceBase = 0.05;

  const chance =
    chanceBase + Math.max(0, diferenca) * 0.01;

  return Math.random() < Math.min(chance, 0.35);
}

// GET /api/combat/enemy/:characterId
// Gera um inimigo compatível com o nível do personagem.
exports.gerarInimigoParaPersonagem = async (req, res) => {
  try {
    const character = await Character.findByPk(
      req.params.characterId
    );

    if (!character) {
      return res.status(404).json({
        message: "Personagem não encontrado.",
      });
    }

    const inimigo = gerarInimigo(character.nivel);

    res.status(200).json({
      status: "success",
      data: {
        enemy: inimigo,
      },
    });
  } catch (error) {
    console.error("Erro ao gerar inimigo:", error);

    res.status(500).json({
      message: "Erro interno do servidor ao gerar inimigo.",
    });
  }
};


exports.executarTurno = async (req, res) => {
  try {
    const { characterId, enemy, action } = req.body;

    if (!characterId || !enemy || !action) {
      return res.status(400).json({
        message:
          "Dados insuficientes para resolver o turno de combate.",
      });
    }

    const character = await Character.findByPk(characterId);

    if (!character) {
      return res.status(404).json({
        message: "Personagem não encontrado.",
      });
    }

    const log = [];

    const personagemAtual = {
      ...character.toJSON(),
    };

    const inimigoAtual = {
      ...enemy,
    };

    if (personagemAtual.vida_atual <= 0) {
      return res.status(400).json({
        message:
          "Este personagem está derrotado e precisa se recuperar.",
      });
    }

    // ==========================================================
    // TURNO DO JOGADOR
    // ==========================================================

    let poderUsado = null;

    if (action.type === "power") {
      poderUsado = await Power.findByPk(action.powerId);

      if (!poderUsado) {
        return res.status(404).json({
          message: "Poder não encontrado.",
        });
      }

      const aprendeu = await CharacterAbilities.findOne({
        where: {
          id_character: characterId,
          id_power: poderUsado.id,
        },
      });

      if (!aprendeu) {
        return res.status(403).json({
          message:
            "Este personagem não aprendeu este poder.",
        });
      }

      if (
        personagemAtual.mana_atual <
        poderUsado.custo_mana
      ) {
        return res.status(400).json({
          message: "Mana insuficiente.",
        });
      }
    }

    // ==========================================================
    // PODER
    // ==========================================================

    if (poderUsado) {
      personagemAtual.mana_atual -=
        poderUsado.custo_mana;

      const { dano, cura } =
        calcularEfeitoPoder(
          poderUsado,
          personagemAtual
        );

      if (dano > 0) {
        if (
          chanceDeEsquiva(
            inimigoAtual,
            personagemAtual
          )
        ) {
          log.push(
            `${inimigoAtual.nome} esquivou de ${poderUsado.nome}!`
          );
        } else {
          inimigoAtual.vida_atual = Math.max(
            0,
            inimigoAtual.vida_atual - dano
          );

          log.push(
            `Você usou ${poderUsado.nome} e causou ${dano} de dano em ${inimigoAtual.nome}.`
          );
        }
      }

      if (cura > 0) {
        const vidaMaximaPersonagem =
          30 +
          (personagemAtual.vitalidade || 0) * 6;

        personagemAtual.vida_atual = Math.min(
          vidaMaximaPersonagem,
          personagemAtual.vida_atual + cura
        );

        log.push(
          `Você usou ${poderUsado.nome} e recuperou ${cura} de vida.`
        );
      }
    }

    // ==========================================================
    // ATAQUE BÁSICO
    // ==========================================================

    else {
      if (
        chanceDeEsquiva(
          inimigoAtual,
          personagemAtual
        )
      ) {
        log.push(
          `${inimigoAtual.nome} esquivou do seu ataque!`
        );
      } else {
        const dano =
          calcularDanoBasico(personagemAtual);

        inimigoAtual.vida_atual = Math.max(
          0,
          inimigoAtual.vida_atual - dano
        );

        log.push(
          `Você atacou e causou ${dano} de dano em ${inimigoAtual.nome}.`
        );
      }
    }

    // ==========================================================
    // CHECA VITÓRIA
    // ==========================================================

    if (inimigoAtual.vida_atual <= 0) {
      const xpGanho =
        15 + inimigoAtual.nivel * 8;

      const dinheiroGanho =
        5 + inimigoAtual.nivel * 4;
      const resultadoXP =
        await adicionarExperiencia(
          characterId,
          xpGanho
        );

      // Se houve level up, adiciona ao log.
      if (resultadoXP.niveisGanhos > 0) {
        for (
          let i = 1;
          i <= resultadoXP.niveisGanhos;
          i++
        ) {
          const nivelSubido =
            resultadoXP.nivel -
            resultadoXP.niveisGanhos +
            i;

          log.push(
            `Seu personagem subiu para o nível ${nivelSubido}!`
          );
        }
      }

      await character.update({
        dinheiro:
          character.dinheiro +
          dinheiroGanho,

        vida_atual:
          character.vida_atual,

        mana_atual:
          personagemAtual.mana_atual,
      });

      log.push(
        `${inimigoAtual.nome} foi derrotado! Você ganhou ${xpGanho} de experiência e ${dinheiroGanho} moedas.`
      );

      return res.status(200).json({
        status: "success",

        data: {
          done: true,
          victory: true,

          log,

          character: {
            vida_atual:
              character.vida_atual,

            mana_atual:
              personagemAtual.mana_atual,

            nivel:
              resultadoXP.nivel,

            experiencia:
              resultadoXP.experiencia,

            dinheiro:
              character.dinheiro +
              dinheiroGanho,

            pontos_distribuir:
              resultadoXP.pontos_distribuir,
          },

          enemy: inimigoAtual,

          rewards: {
            experiencia: xpGanho,
            dinheiro: dinheiroGanho,
          },
        },
      });
    }

    // ==========================================================
    // TURNO DO INIMIGO
    // ==========================================================

    if (
      chanceDeEsquiva(
        personagemAtual,
        inimigoAtual
      )
    ) {
      log.push(
        `Você esquivou do ataque de ${inimigoAtual.nome}!`
      );
    } else {
      const danoRecebido = Math.max(
        1,
        Math.round(
          inimigoAtual.dano_base *
            (0.85 + Math.random() * 0.3)
        )
      );

      personagemAtual.vida_atual =
        Math.max(
          0,
          personagemAtual.vida_atual -
            danoRecebido
        );

      log.push(
        `${inimigoAtual.nome} atacou e causou ${danoRecebido} de dano em você.`
      );
    }

    // ==========================================================
    // DERROTA DO PERSONAGEM
    // ==========================================================

    const derrotado =
      personagemAtual.vida_atual <= 0;

    if (derrotado) {
      log.push(
        "Você foi derrotado e precisa se recuperar antes de lutar de novo."
      );
    }

    await character.update({
      vida_atual: derrotado
        ? 1
        : personagemAtual.vida_atual,

      mana_atual:
        personagemAtual.mana_atual,
    });

    return res.status(200).json({
      status: "success",

      data: {
        done: derrotado,
        victory: false,

        log,

        character: {
          vida_atual: derrotado
            ? 1
            : personagemAtual.vida_atual,

          mana_atual:
            personagemAtual.mana_atual,
        },

        enemy: inimigoAtual,
      },
    });
  } catch (error) {
    console.error(
      "Erro ao processar turno de combate:",
      error
    );

    res.status(500).json({
      message:
        "Erro interno do servidor ao processar combate.",
    });
  }
};