// src/controllers/pvpController.js
//
// PVP assíncrono: o duelo inteiro é resolvido de uma vez no servidor
// (o oponente não precisa estar online) e devolvido como uma lista de
// turnos pro front reproduzir a animação, igual ao combate PvE.

const { Op } = require("sequelize");
const Character = require("../models/Character");
const Race = require("../models/Race");
const Class = require("../models/Class");
const CharacterAbilities = require("../models/CharacterAbilities");
const Power = require("../models/Power");
const PvpStatus = require("../models/PvpStatus");
const PvpMatches = require("../models/PvpMatches");
const { adicionarExperiencia } = require("../services/experienceService");
const { vidaMaximaDe, manaMaximaDe } = require("../services/combatFormulas");
const { aplicarAcao } = require("../services/duelEngine");
const {
  buscarBonusDeAtributos,
  personagemComBonus,
} = require("../services/equipmentBonusService");

// Primeira vez que PvpStatus é consultado com include — nunca teve
// associação registrada em lugar nenhum.
Character.hasOne(PvpStatus, { foreignKey: "id_personagem" });
PvpStatus.belongsTo(Character, { foreignKey: "id_personagem" });

const NOME_ARENA = "Arena de Caelum";
const MAX_RODADAS = 40;

async function buscarPoderesDoPersonagem(idPersonagem) {
  const habilidades = await CharacterAbilities.findAll({
    where: { id_personagem: idPersonagem, is_active: true },
    include: [{ model: Power }],
  });
  return habilidades.map((h) => h.Power).filter(Boolean);
}

// Escolhe a ação de cada turno: usa o poder ofensivo mais forte que
// consegue pagar; se não tiver mana pra nenhum, ataca na unha.
function escolherAcao(personagemAtual, poderes) {
  const usaveis = poderes.filter(
    (p) => p.custo_mana <= personagemAtual.mana_atual && p.dano_base > 0,
  );
  if (usaveis.length === 0) return { tipo: "attack" };

  const melhor = usaveis.reduce((a, b) => (b.dano_base > a.dano_base ? b : a));
  return { tipo: "power", power: melhor };
}

function simularDuelo({ desafiante, desafiado, poderesDesafiante, poderesDesafiado }) {
  const vidaMaxA = vidaMaximaDe(desafiante);
  const vidaMaxB = vidaMaximaDe(desafiado);

  const estadoA = { ...desafiante, vida_atual: vidaMaxA, mana_atual: manaMaximaDe(desafiante) };
  const estadoB = { ...desafiado, vida_atual: vidaMaxB, mana_atual: manaMaximaDe(desafiado) };

  const primeiro = estadoA.velocidade >= estadoB.velocidade ? "A" : "B";
  const turnos = [];
  const log = [`${desafiante.nome} desafiou ${desafiado.nome} pra um duelo na ${NOME_ARENA}!`];

  function executarAcao(chave) {
    const atacante = chave === "A" ? estadoA : estadoB;
    const defensor = chave === "A" ? estadoB : estadoA;
    const poderes = chave === "A" ? poderesDesafiante : poderesDesafiado;
    const vidaMaxAtacante = chave === "A" ? vidaMaxA : vidaMaxB;

    const acao = escolherAcao(atacante, poderes);
    const { nomeAcao, dano, cura, esquivou } = aplicarAcao({
      atacante,
      defensor,
      acao,
      vidaMaxAtacante,
    });

    const nomeAtacante = chave === "A" ? desafiante.nome : desafiado.nome;
    const nomeDefensor = chave === "A" ? desafiado.nome : desafiante.nome;

    if (esquivou) {
      log.push(`${nomeDefensor} esquivou de ${nomeAcao} de ${nomeAtacante}!`);
    } else if (dano > 0) {
      log.push(`${nomeAtacante} usou ${nomeAcao} e causou ${dano} de dano em ${nomeDefensor}.`);
    } else if (cura > 0) {
      log.push(`${nomeAtacante} usou ${nomeAcao} e recuperou ${cura} de vida.`);
    }

    turnos.push({
      atacante: chave,
      nomeAcao,
      dano,
      cura,
      esquivou,
      vidaA: estadoA.vida_atual,
      vidaB: estadoB.vida_atual,
      manaA: estadoA.mana_atual,
      manaB: estadoB.mana_atual,
      vidaMaxA,
      vidaMaxB,
    });
  }

  let rodada = 0;
  while (estadoA.vida_atual > 0 && estadoB.vida_atual > 0 && rodada < MAX_RODADAS) {
    executarAcao(primeiro);
    if (estadoA.vida_atual <= 0 || estadoB.vida_atual <= 0) break;
    executarAcao(primeiro === "A" ? "B" : "A");
    rodada += 1;
  }

  let vencedorKey;
  if (estadoA.vida_atual <= 0) {
    vencedorKey = "B";
  } else if (estadoB.vida_atual <= 0) {
    vencedorKey = "A";
  } else {
    const percA = estadoA.vida_atual / vidaMaxA;
    const percB = estadoB.vida_atual / vidaMaxB;
    vencedorKey = percA >= percB ? "A" : "B";
    log.push("O tempo da arena se esgotou! O combate foi decidido pela vida restante.");
  }

  log.push(
    `${vencedorKey === "A" ? desafiante.nome : desafiado.nome} venceu o duelo!`,
  );

  return { turnos, log, vencedorKey, rodadas: turnos.length };
}

async function garantirStatus(idPersonagem, transaction) {
  const [status] = await PvpStatus.findOrCreate({
    where: { id_personagem: idPersonagem },
    defaults: { sistema_classificacao: "Vitorias" },
    transaction,
  });
  return status;
}

// Credita a recompensa, atualiza PvpStatus dos dois lados e registra a
// partida em PvpMatches. Usado tanto pelo duelo assíncrono (challenge,
// abaixo) quanto pelo duelo ao vivo (pvpLiveSocket).
async function aplicarResultadoDuelo({ vencedor, perdedor, rodadas }) {
  const recompensa = {
    dinheiro: 5 + perdedor.nivel * 2,
    experiencia: 10 + perdedor.nivel * 5,
  };

  await vencedor.update({ dinheiro: vencedor.dinheiro + recompensa.dinheiro });
  const resultadoXP = await adicionarExperiencia(vencedor.id, recompensa.experiencia);

  const [statusVencedor, statusPerdedor] = await Promise.all([
    garantirStatus(vencedor.id),
    garantirStatus(perdedor.id),
  ]);

  const novaSequenciaVencedor = statusVencedor.sequencia_vitorias + 1;
  await statusVencedor.update({
    total_batalhas: statusVencedor.total_batalhas + 1,
    vitorias: statusVencedor.vitorias + 1,
    sequencia_vitorias: novaSequenciaVencedor,
    maximo_sequencia_vitorias: Math.max(
      statusVencedor.maximo_sequencia_vitorias,
      novaSequenciaVencedor,
    ),
    ultima_batalha_dia: new Date(),
  });

  await statusPerdedor.update({
    total_batalhas: statusPerdedor.total_batalhas + 1,
    derrotas: statusPerdedor.derrotas + 1,
    sequencia_vitorias: 0,
    ultima_batalha_dia: new Date(),
  });

  await PvpMatches.create({
    id_vencedor: vencedor.id,
    id_perdedor: perdedor.id,
    nome_arena: NOME_ARENA,
    duracao_segundos: rodadas,
    vencedor_pontos: 1,
    perdedor_pontos: 0,
    tempo_final_combate: new Date(),
  });

  return { recompensa, nivelAposVitoria: resultadoXP.nivel };
}

// GET /api/pvp/opponents/:characterId
exports.getOpponents = async (req, res) => {
  try {
    const oponentes = await Character.findAll({
      where: { id: { [Op.ne]: req.params.characterId } },
      attributes: ["id", "nome", "nivel", "genero"],
      include: [{ model: Race, attributes: ["nome_masculino", "nome_feminino"] }, { model: Class, attributes: ["nome"] }],
      limit: 20,
      order: [["nivel", "ASC"]],
    });

    return res.status(200).json({
      status: "success",
      results: oponentes.length,
      data: { oponentes },
    });
  } catch (error) {
    console.error("Erro ao buscar oponentes de PVP:", error);
    return res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar oponentes." });
  }
};

// GET /api/pvp/status/:characterId
exports.getStatus = async (req, res) => {
  try {
    const status = await garantirStatus(req.params.characterId);
    return res.status(200).json({ status: "success", data: { pvpStatus: status } });
  } catch (error) {
    console.error("Erro ao buscar status de PVP:", error);
    return res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar status de PVP." });
  }
};

// GET /api/pvp/ranking
exports.getRanking = async (req, res) => {
  try {
    const ranking = await PvpStatus.findAll({
      include: [{ model: Character, attributes: ["id", "nome", "nivel"] }],
      order: [["vitorias", "DESC"], ["total_batalhas", "ASC"]],
      limit: 20,
    });

    return res.status(200).json({ status: "success", data: { ranking } });
  } catch (error) {
    console.error("Erro ao buscar ranking de PVP:", error);
    return res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar ranking." });
  }
};

// POST /api/pvp/challenge
// body: { id_desafiante, id_desafiado }
exports.challenge = async (req, res) => {
  try {
    const { id_desafiante, id_desafiado } = req.body;

    if (!id_desafiante || !id_desafiado) {
      return res.status(400).json({
        message: "id_desafiante e id_desafiado são obrigatórios.",
      });
    }

    if (Number(id_desafiante) === Number(id_desafiado)) {
      return res.status(400).json({ message: "Não é possível duelar contra si mesmo." });
    }

    const [desafiante, desafiado] = await Promise.all([
      Character.findByPk(id_desafiante, { include: [{ model: Class }] }),
      Character.findByPk(id_desafiado, { include: [{ model: Class }] }),
    ]);

    if (!desafiante || !desafiado) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }

    const [poderesDesafiante, poderesDesafiado, bonusDesafiante, bonusDesafiado] =
      await Promise.all([
        buscarPoderesDoPersonagem(desafiante.id),
        buscarPoderesDoPersonagem(desafiado.id),
        buscarBonusDeAtributos(desafiante.id),
        buscarBonusDeAtributos(desafiado.id),
      ]);

    const resultado = simularDuelo({
      desafiante: personagemComBonus(desafiante.toJSON(), bonusDesafiante),
      desafiado: personagemComBonus(desafiado.toJSON(), bonusDesafiado),
      poderesDesafiante,
      poderesDesafiado,
    });

    const vencedor = resultado.vencedorKey === "A" ? desafiante : desafiado;
    const perdedor = resultado.vencedorKey === "A" ? desafiado : desafiante;

    const { recompensa, nivelAposVitoria } = await aplicarResultadoDuelo({
      vencedor,
      perdedor,
      rodadas: resultado.rodadas,
    });

    return res.status(200).json({
      status: "success",
      data: {
        log: resultado.log,
        turnos: resultado.turnos,
        desafiante: {
          id: desafiante.id,
          nome: desafiante.nome,
          genero: desafiante.genero,
          classe: desafiante.Class?.nome,
          chave: "A",
        },
        desafiado: {
          id: desafiado.id,
          nome: desafiado.nome,
          genero: desafiado.genero,
          classe: desafiado.Class?.nome,
          chave: "B",
        },
        vencedorChave: resultado.vencedorKey,
        vencedor: { id: vencedor.id, nome: vencedor.nome },
        perdedor: { id: perdedor.id, nome: perdedor.nome },
        recompensa,
        nivelAposVitoria,
      },
    });
  } catch (error) {
    console.error("Erro ao processar duelo de PVP:", error);
    return res
      .status(500)
      .json({ message: "Erro interno do servidor ao processar o duelo." });
  }
};

// Reexporta peças internas para o motor de PVP ao vivo (pvpLiveSocket.js)
// reaproveitar em vez de duplicar.
exports.buscarPoderesDoPersonagem = buscarPoderesDoPersonagem;
exports.aplicarResultadoDuelo = aplicarResultadoDuelo;
