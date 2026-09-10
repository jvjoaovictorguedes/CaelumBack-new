// src/controllers/combatController.js
//
// Motor de combate por turnos (PvE). Não existia nenhuma lógica de batalha
// no projeto — só as tabelas de personagem e poderes. Este controller usa
// os atributos que já existem (forca, vitalidade, agilidade, inteligencia,
// velocidade) e os poderes aprendidos (CharacterAbilities + Power) para
// resolver os turnos, sem precisar de novas tabelas no banco.

const Character = require("../models/Character");
const CharacterAbilities = require("../models/CharacterAbilities");
const Power = require("../models/Power");

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
  const variacao = () => Math.floor(Math.random() * 3) - 1; // -1, 0 ou 1

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

// Calcula o dano de um ataque básico (sem poder).
function calcularDanoBasico(atacante) {
  const base = 4 + atacante.forca * 0.9;
  const variacao = 0.85 + Math.random() * 0.3; // 85% a 115%
  return Math.max(1, Math.round(base * variacao));
}

// Calcula o dano/cura de um poder, escalando pelo atributo configurado.
function calcularEfeitoPoder(power, personagem) {
  const campoAtributo = ATRIBUTO_PARA_CAMPO[power.escala_atributo] || "forca";
  const valorAtributo = personagem[campoAtributo] || 0;
  const variacao = 0.9 + Math.random() * 0.2; // 90% a 110%

  const dano = power.dano_base
    ? Math.round(
        (power.dano_base + valorAtributo * power.valor_escala) * variacao
      )
    : 0;
  const cura = power.cura_base
    ? Math.round(
        (power.cura_base + valorAtributo * power.valor_escala) * variacao
      )
    : 0;

  return { dano, cura };
}

function chanceDeEsquiva(defensor, atacante) {
  const diferenca = (defensor.agilidade || 0) - (atacante.agilidade || 0);
  const chanceBase = 0.05; // 5% de chance mínima de esquiva
  const chance = chanceBase + Math.max(0, diferenca) * 0.01;
  return Math.random() < Math.min(chance, 0.35); // trava em 35% no máximo
}

// GET /api/combat/enemy/:characterId
// Gera um inimigo compatível com o nível do personagem para iniciar a luta.
exports.gerarInimigoParaPersonagem = async (req, res) => {
  try {
    const character = await Character.findByPk(req.params.characterId);
    if (!character) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }

    const inimigo = gerarInimigo(character.nivel);

    res.status(200).json({
      status: "success",
      data: { enemy: inimigo },
    });
  } catch (error) {
    console.error("Erro ao gerar inimigo:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao gerar inimigo." });
  }
};

// POST /api/combat/action
// Resolve um turno completo: ação do jogador + resposta do inimigo.
// Body esperado:
// {
//   characterId: number,
//   enemy: { ...estado atual do inimigo, devolvido pelo front },
//   action: { type: "attack" } | { type: "power", powerId: number }
// }
exports.executarTurno = async (req, res) => {
  try {
    const { characterId, enemy, action } = req.body;

    if (!characterId || !enemy || !action) {
      return res.status(400).json({
        message: "Dados insuficientes para resolver o turno de combate.",
      });
    }

    const character = await Character.findByPk(characterId);
    if (!character) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }

    const log = [];
    const personagemAtual = {
      ...character.toJSON(),
    };
    const inimigoAtual = { ...enemy };

    if (personagemAtual.vida_atual <= 0) {
      return res.status(400).json({
        message: "Este personagem está derrotado e precisa se recuperar.",
      });
    }

    // ---------- Turno do jogador ----------
    let poderUsado = null;
    if (action.type === "power") {
      poderUsado = await Power.findByPk(action.powerId);
      if (!poderUsado) {
        return res.status(404).json({ message: "Poder não encontrado." });
      }

      const aprendeu = await CharacterAbilities.findOne({
        where: { id_character: characterId, id_power: poderUsado.id },
      });
      if (!aprendeu) {
        return res
          .status(403)
          .json({ message: "Este personagem não aprendeu este poder." });
      }

      if (personagemAtual.mana_atual < poderUsado.custo_mana) {
        return res.status(400).json({ message: "Mana insuficiente." });
      }
    }

    if (poderUsado) {
      personagemAtual.mana_atual -= poderUsado.custo_mana;
      const { dano, cura } = calcularEfeitoPoder(poderUsado, personagemAtual);

      if (dano > 0) {
        if (chanceDeEsquiva(inimigoAtual, personagemAtual)) {
          log.push(`${inimigoAtual.nome} esquivou de ${poderUsado.nome}!`);
        } else {
          inimigoAtual.vida_atual = Math.max(0, inimigoAtual.vida_atual - dano);
          log.push(
            `Você usou ${poderUsado.nome} e causou ${dano} de dano em ${inimigoAtual.nome}.`
          );
        }
      }
      if (cura > 0) {
        // O personagem não tem um campo de "vida máxima" no banco, então
        // usamos a mesma fórmula aplicada aos inimigos (vitalidade * 6 + 30)
        // como teto para a cura não ficar infinita.
        const vidaMaximaPersonagem = 30 + (personagemAtual.vitalidade || 0) * 6;
        personagemAtual.vida_atual = Math.min(
          vidaMaximaPersonagem,
          personagemAtual.vida_atual + cura
        );
        log.push(`Você usou ${poderUsado.nome} e recuperou ${cura} de vida.`);
      }
    } else {
      // Ataque básico
      if (chanceDeEsquiva(inimigoAtual, personagemAtual)) {
        log.push(`${inimigoAtual.nome} esquivou do seu ataque!`);
      } else {
        const dano = calcularDanoBasico(personagemAtual);
        inimigoAtual.vida_atual = Math.max(0, inimigoAtual.vida_atual - dano);
        log.push(`Você atacou e causou ${dano} de dano em ${inimigoAtual.nome}.`);
      }
    }

    // ---------- Checa vitória ----------
    if (inimigoAtual.vida_atual <= 0) {
      const xpGanho = 15 + inimigoAtual.nivel * 8;
      const dinheiroGanho = 5 + inimigoAtual.nivel * 4;

      let novaExperiencia = character.experiencia + xpGanho;
      let novoNivel = character.nivel;
      let pontosDistribuir = character.pontos_distribuir || 0;
      const custoParaSubir = () => novoNivel * 100;

      while (novaExperiencia >= custoParaSubir()) {
        novaExperiencia -= custoParaSubir();
        novoNivel += 1;
        pontosDistribuir += 5;
        log.push(`Seu personagem subiu para o nível ${novoNivel}!`);
      }

      await character.update({
        experiencia: novaExperiencia,
        nivel: novoNivel,
        pontos_distribuir: pontosDistribuir,
        dinheiro: character.dinheiro + dinheiroGanho,
        vida_atual: character.vida_atual, // vida é mantida, não cura sozinho
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
            vida_atual: character.vida_atual,
            mana_atual: personagemAtual.mana_atual,
            nivel: novoNivel,
            experiencia: novaExperiencia,
            dinheiro: character.dinheiro + dinheiroGanho,
            pontos_distribuir: pontosDistribuir,
          },
          enemy: inimigoAtual,
          rewards: { experiencia: xpGanho, dinheiro: dinheiroGanho },
        },
      });
    }

    // ---------- Turno do inimigo ----------
    if (chanceDeEsquiva(personagemAtual, inimigoAtual)) {
      log.push(`Você esquivou do ataque de ${inimigoAtual.nome}!`);
    } else {
      const danoRecebido = Math.max(
        1,
        Math.round(inimigoAtual.dano_base * (0.85 + Math.random() * 0.3))
      );
      personagemAtual.vida_atual = Math.max(
        0,
        personagemAtual.vida_atual - danoRecebido
      );
      log.push(`${inimigoAtual.nome} atacou e causou ${danoRecebido} de dano em você.`);
    }

    const derrotado = personagemAtual.vida_atual <= 0;
    if (derrotado) {
      log.push("Você foi derrotado e precisa se recuperar antes de lutar de novo.");
    }

    await character.update({
      vida_atual: derrotado ? 1 : personagemAtual.vida_atual,
      mana_atual: personagemAtual.mana_atual,
    });

    return res.status(200).json({
      status: "success",
      data: {
        done: derrotado,
        victory: false,
        log,
        character: {
          vida_atual: derrotado ? 1 : personagemAtual.vida_atual,
          mana_atual: personagemAtual.mana_atual,
        },
        enemy: inimigoAtual,
      },
    });
  } catch (error) {
    console.error("Erro ao processar turno de combate:", error);
    res
      .status(500)
      .json({ message: "Erro interno do servidor ao processar combate." });
  }
};
