// src/controllers/combatController.js
//
// Motor de combate por turnos (PvE).
// O combate usa os atributos do personagem e os poderes aprendidos
// para resolver os turnos.
//
// A lógica de progressão de XP/level/pontos fica no
// experienceService.js.

const Character = require("../models/Character");
const Class = require("../models/Class");
const CharacterAbilities = require("../models/CharacterAbilities");
const Power = require("../models/Power");
const { adicionarExperiencia } = require("../services/experienceService");
const {
  calcularDanoBasico,
  calcularEfeitoPoder,
  chanceDeEsquiva,
  vidaMaximaDe,
  danoBasicoEsperado,
  comMultiplicadoresDeClasse,
} = require("../services/combatFormulas");
const {
  buscarBonusDeAtributos,
  personagemComBonus,
} = require("../services/equipmentBonusService");

const NOMES_INIMIGOS = [
  "Lobo das Sombras",
  "Bandido Errante",
  "Golem de Pedra",
  "Espectro Sussurrante",
  "Orc Guerreiro",
  "Aranha Venenosa",
  "Cultista Renegado",
  "Draconídeo Jovem",
  "Minotauro",
];

function sortear(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

// Quantos turnos de ataque básico, em média, cada lado precisa pra matar
// o outro. O do inimigo é maior de propósito: o jogador sai na frente
// (folga pra usar poder/errar um turno/tomar uma esquiva ruim), mas
// ainda precisa jogar direito — não é vitória de graça.
const RODADAS_PARA_MATAR_INIMIGO = 4;
const RODADAS_PARA_INIMIGO_MATAR_JOGADOR = 4.2;

// Gera um inimigo calibrado a partir dos ATRIBUTOS DE VERDADE do
// personagem (já com bônus de equipamento somado) — não mais só o nível.
// Antes o inimigo era pensado pra um "personagem médio" daquele nível
// (uma quantidade assumida de força/vitalidade); quem não investia
// pontos em vida, por exemplo, sempre enfrentava um inimigo tanque
// demais pro tanto de dano que conseguia causar, e vice-versa. Agora a
// vida do inimigo escala com o ataque real do jogador (se você bate
// forte, o inimigo aguenta mais golpes, mas você ainda mata em ~4
// turnos) e o dano do inimigo escala com a vida real do jogador (se
// você é frágil, o inimigo bate mais fraco, mas ainda ameaça em ~6
// turnos) — o resultado da luta depende do seu build de verdade, não
// de uma média que talvez nem seja a sua.
function gerarInimigo(jogador) {
  const nivel = Math.max(1, jogador.nivel || 1);
  const variacao = () => 0.9 + Math.random() * 0.2; // ±10%

  const vidaJogador = vidaMaximaDe(jogador);
  const ataqueJogador = Math.max(1, danoBasicoEsperado(jogador));

  const vidaMaxima = Math.max(
    20,
    Math.round(ataqueJogador * RODADAS_PARA_MATAR_INIMIGO * variacao()),
  );
  const danoBase = Math.max(
    1,
    Math.round((vidaJogador / RODADAS_PARA_INIMIGO_MATAR_JOGADOR) * variacao()),
  );

  // Agilidade/velocidade espelham as do próprio jogador (com variação),
  // pra esquiva e ordem de turno ficarem parelhas com o que ele tem —
  // em vez de, de novo, assumir uma agilidade "média" pro nível.
  const agilidade = Math.max(1, Math.round((jogador.agilidade || 1) * variacao()));
  const velocidade = Math.max(1, Math.round((jogador.velocidade || 1) * variacao()));

  // forca/vitalidade do inimigo aqui são só pra manter o formato da
  // resposta (a API sempre devolveu esses campos) — quem decide o
  // resultado da luta é vida_maxima/dano_base calculados acima.
  const forca = Math.max(1, Math.round((danoBase - 3) / 0.7));
  const vitalidade = Math.max(1, Math.round((vidaMaxima - 20) / 5));

  return {
    nome: sortear(NOMES_INIMIGOS),
    nivel,
    forca,
    vitalidade,
    agilidade,
    velocidade,
    vida_maxima: vidaMaxima,
    vida_atual: vidaMaxima,
    dano_base: danoBase,
  };
}

// GET /api/combat/enemy/:characterId
// Gera um inimigo compatível com o nível do personagem.
exports.gerarInimigoParaPersonagem = async (req, res) => {
  try {
    const character = await Character.findByPk(req.params.characterId, {
      include: [{ model: Class }],
    });

    if (!character) {
      return res.status(404).json({
        message: "Personagem não encontrado.",
      });
    }

    const bonusEquipamento = await buscarBonusDeAtributos(character.id);
    const jogadorEfetivo = comMultiplicadoresDeClasse(
      personagemComBonus(character.toJSON(), bonusEquipamento),
      character.Class,
    );
    const inimigo = gerarInimigo(jogadorEfetivo);

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

    const character = await Character.findByPk(characterId, {
      include: [{ model: Class }],
    });

    if (!character) {
      return res.status(404).json({
        message: "Personagem não encontrado.",
      });
    }

    const log = [];

    const bonusEquipamento = await buscarBonusDeAtributos(characterId);
    const personagemAtual = comMultiplicadoresDeClasse(
      personagemComBonus(character.toJSON(), bonusEquipamento),
      character.Class,
    );

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
          id_personagem: characterId,
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
        personagemAtual.vida_atual = Math.min(
          vidaMaximaDe(personagemAtual),
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

          nivel: character.nivel,
          experiencia: character.experiencia,
          pontos_distribuir: character.pontos_distribuir,
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