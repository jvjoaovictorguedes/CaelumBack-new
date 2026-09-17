// src/controllers/combatController.js
//
// Motor de combate por turnos (PvE).
// O combate usa os atributos do personagem e os poderes aprendidos
// para resolver os turnos.
//
// A lógica de progressão de XP/level/pontos fica no
// experienceService.js.

const { sequelize } = require("../config/database");
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

// Estado do inimigo ativo por personagem, guardado no servidor —
// characterId (string) -> inimigo. Sem isso, o cliente tinha que devolver
// o objeto `enemy` inteiro a cada turno (POST /combat/turn), e nada
// impedia ele de mandar um inimigo forjado (vida_atual: 1, nivel:
// 999999, dano_base negativo) e "vencer" sem lutar de verdade. Agora o
// servidor é a única fonte de verdade sobre o HP/nível/dano do inimigo;
// qualquer `enemy` que o cliente ainda mande no corpo é ignorado.
//
// Expira sozinho depois de um tempo (encontro abandonado) pra não vazar
// memória indefinidamente num processo de longa duração.
const ENCONTROS_ATIVOS = new Map();
const VALIDADE_ENCONTRO_MS = 30 * 60 * 1000;

function encontroAtivoDe(characterId) {
  const chave = String(characterId);
  const encontro = ENCONTROS_ATIVOS.get(chave);
  if (!encontro) return null;
  if (Date.now() - encontro.criadoEm > VALIDADE_ENCONTRO_MS) {
    ENCONTROS_ATIVOS.delete(chave);
    return null;
  }
  return encontro;
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
    // TODO(auth): trocar por req.personagemAtual.id quando o front puder
    // mandar o JWT.
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
    ENCONTROS_ATIVOS.set(String(character.id), { ...inimigo, criadoEm: Date.now() });

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
    // TODO(auth): trocar por req.personagemAtual.id quando o front puder
    // mandar o JWT.
    const { characterId, action } = req.body;

    if (!characterId || !action) {
      return res.status(400).json({
        message:
          "Dados insuficientes para resolver o turno de combate.",
      });
    }

    // O inimigo nunca vem do cliente — só o servidor sabe o estado real
    // (ver ENCONTROS_ATIVOS acima). Qualquer `enemy` que o corpo da
    // requisição ainda contenha é ignorado de propósito.
    const inimigoAtual = encontroAtivoDe(characterId);
    if (!inimigoAtual) {
      return res.status(400).json({
        message:
          "Nenhum combate ativo para esse personagem. Busque um inimigo antes de atacar.",
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

      // Tudo numa transação com o personagem travado (LOCK.UPDATE): XP,
      // dinheiro, vida e mana saem num único save — evita perder uma
      // recompensa se duas vitórias do mesmo personagem forem
      // processadas ao mesmo tempo (double-click, duas abas).
      const resultadoXP = await sequelize.transaction(async (transaction) => {
        const characterTravado = await Character.findByPk(characterId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        characterTravado.dinheiro += dinheiroGanho;
        characterTravado.vida_atual = personagemAtual.vida_atual;
        characterTravado.mana_atual = personagemAtual.mana_atual;
        return adicionarExperiencia(characterId, xpGanho, {
          transaction,
          personagem: characterTravado,
        });
      });

      ENCONTROS_ATIVOS.delete(String(characterId));

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
              personagemAtual.vida_atual,

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
      ENCONTROS_ATIVOS.delete(String(characterId));
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