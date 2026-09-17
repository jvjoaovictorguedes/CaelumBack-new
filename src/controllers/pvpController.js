// src/controllers/pvpController.js
//
// PVP assíncrono: o duelo inteiro é resolvido de uma vez no servidor
// (o oponente não precisa estar online) e devolvido como uma lista de
// turnos pro front reproduzir a animação, igual ao combate PvE.

const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Race = require("../models/Race");
const Class = require("../models/Class");
const CharacterAbilities = require("../models/CharacterAbilities");
const Power = require("../models/Power");
const PvpStatus = require("../models/PvpStatus");
const PvpMatches = require("../models/PvpMatches");
const { adicionarExperiencia } = require("../services/experienceService");
const {
  vidaMaximaDe,
  manaMaximaDe,
  comMultiplicadoresDeClasse,
} = require("../services/combatFormulas");
const { aplicarAcao } = require("../services/duelEngine");
const {
  buscarBonusDeAtributos,
  personagemComBonus,
} = require("../services/equipmentBonusService");
const {
  verificarCooldownDesafiante,
  verificarAntifarmPar,
} = require("../services/pvpAntifarmService");

// Primeira vez que PvpStatus é consultado com include — nunca teve
// associação registrada em lugar nenhum.
Character.hasOne(PvpStatus, { foreignKey: "id_personagem" });
PvpStatus.belongsTo(Character, { foreignKey: "id_personagem" });

const NOME_ARENA = "Arena de Caelum";
const MAX_RODADAS = 40;

// Trava em memória (por processo, mesmo padrão já usado no combate PvE
// via ENCONTROS_ATIVOS) pra impedir que DOIS POST /pvp/challenge do
// mesmo personagem — desafiante ou desafiado — sejam processados ao
// mesmo tempo. Sem isso, duas requisições disparadas quase juntas (ex.:
// duplo-clique, retry de rede) liam o mesmo cooldown/estado ANTES de
// qualquer uma commitar, e as duas simulavam e aplicavam um duelo
// completo — o lock por linha dentro de aplicarResultadoDuelo evita
// perder crédito entre elas, mas não evita as DUAS acontecerem (o que já
// é, sozinho, ouro/XP em dobro). Aqui a segunda requisição concorrente é
// simplesmente rejeitada em vez de reprocessada.
const personagensProcessandoDesafio = new Set();

async function buscarPoderesDoPersonagem(idPersonagem) {
  const habilidades = await CharacterAbilities.findAll({
    where: { id_personagem: idPersonagem, is_active: true },
    include: [{ model: Power }],
  });
  return habilidades.map((h) => h.Power).filter(Boolean);
}

// Escolhe a ação de cada turno: usa o poder ofensivo mais forte que
// consegue pagar; se não tiver mana pra nenhum, ataca na unha.
// Duelo assíncrono resolve os dois lados sozinho (sem jogador na hora),
// então precisa "decidir" qual ação tomar — sorteia entre os poderes
// ofensivos que dá pra pagar, em vez de sempre usar o de maior dano.
// Isso deixa cada duelo com uma pegada diferente mesmo entre os mesmos
// dois personagens, em vez de sempre repetir a mesma sequência ótima.
function escolherAcao(personagemAtual, poderes) {
  const usaveis = poderes.filter(
    (p) => p.custo_mana <= personagemAtual.mana_atual && p.dano_base > 0,
  );
  if (usaveis.length === 0) return { tipo: "attack" };

  const escolhido = usaveis[Math.floor(Math.random() * usaveis.length)];
  return { tipo: "power", power: escolhido };
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
    lock: transaction?.LOCK?.UPDATE,
  });
  return status;
}

// Credita a recompensa, atualiza PvpStatus dos dois lados e registra a
// partida em PvpMatches. Usado tanto pelo duelo assíncrono (challenge,
// abaixo) quanto pelo duelo ao vivo (pvpLiveSocket).
//
// Tudo numa única transação com o personagem vencedor travado
// (LOCK.UPDATE): sem isso, dois créditos de recompensa concorrentes pro
// mesmo personagem (ex.: um duelo assíncrono terminando bem na hora de
// um duelo ao vivo) liam o mesmo saldo antes de qualquer um salvar e uma
// das recompensas se perdia — e um crash no meio do caminho podia
// deixar o dinheiro creditado sem o PvpMatches correspondente.
async function aplicarResultadoDuelo({ vencedor, perdedor, rodadas }) {
  const recompensa = {
    dinheiro: 5 + perdedor.nivel * 2,
    experiencia: 10 + perdedor.nivel * 5,
  };

  const resultadoXP = await sequelize.transaction(async (transaction) => {
    const vencedorTravado = await Character.findByPk(vencedor.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!vencedorTravado) {
      throw new Error("Personagem vencedor não encontrado.");
    }
    vencedorTravado.dinheiro += recompensa.dinheiro;

    const resultado = await adicionarExperiencia(vencedor.id, recompensa.experiencia, {
      transaction,
      personagem: vencedorTravado,
    });

    const [statusVencedor, statusPerdedor] = await Promise.all([
      garantirStatus(vencedor.id, transaction),
      garantirStatus(perdedor.id, transaction),
    ]);

    const novaSequenciaVencedor = statusVencedor.sequencia_vitorias + 1;
    await statusVencedor.update(
      {
        total_batalhas: statusVencedor.total_batalhas + 1,
        vitorias: statusVencedor.vitorias + 1,
        sequencia_vitorias: novaSequenciaVencedor,
        maximo_sequencia_vitorias: Math.max(
          statusVencedor.maximo_sequencia_vitorias,
          novaSequenciaVencedor,
        ),
        ultima_batalha_dia: new Date(),
      },
      { transaction },
    );

    await statusPerdedor.update(
      {
        total_batalhas: statusPerdedor.total_batalhas + 1,
        derrotas: statusPerdedor.derrotas + 1,
        sequencia_vitorias: 0,
        ultima_batalha_dia: new Date(),
      },
      { transaction },
    );

    await PvpMatches.create(
      {
        id_vencedor: vencedor.id,
        id_perdedor: perdedor.id,
        nome_arena: NOME_ARENA,
        duracao_segundos: rodadas,
        vencedor_pontos: 1,
        perdedor_pontos: 0,
        tempo_final_combate: new Date(),
      },
      { transaction },
    );

    return resultado;
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
      include: [
        {
          model: Character,
          attributes: ["id", "nome", "nivel", "genero"],
          include: [
            { model: Race, attributes: ["nome_masculino", "nome_feminino"] },
            { model: Class, attributes: ["nome"] },
          ],
        },
      ],
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
// body: { id_desafiado }
// O desafiante é sempre o personagem do usuário autenticado
// (req.personagemAtual, carregado por carregarPersonagemAtual) — nunca um
// valor vindo do body, senão qualquer um podia desafiar em nome de outro
// personagem só informando o ID.
exports.challenge = async (req, res) => {
  const id_desafiante = req.personagemAtual.id;
  const { id_desafiado } = req.body;

  if (!id_desafiado) {
    return res.status(400).json({
      message: "id_desafiado é obrigatório.",
    });
  }

  // Comparar como string em vez de Number(): dois valores inválidos
  // (ex.: strings não-numéricas) viravam NaN dos dois lados, e
  // NaN === NaN é false — a checagem "não pode duelar contra si
  // mesmo" passava batido pra entrada malformada.
  if (String(id_desafiante) === String(id_desafiado)) {
    return res.status(400).json({ message: "Não é possível duelar contra si mesmo." });
  }

  const chaveDesafiante = String(id_desafiante);
  const chaveDesafiado = String(id_desafiado);

  // Ver comentário em personagensProcessandoDesafio acima: se qualquer
  // um dos dois personagens já tem um /challenge em andamento agora,
  // rejeita na hora em vez de deixar rodar em paralelo.
  if (
    personagensProcessandoDesafio.has(chaveDesafiante) ||
    personagensProcessandoDesafio.has(chaveDesafiado)
  ) {
    return res.status(429).json({
      message: "Já existe um duelo sendo processado para um dos personagens. Aguarde.",
    });
  }
  personagensProcessandoDesafio.add(chaveDesafiante);
  personagensProcessandoDesafio.add(chaveDesafiado);

  try {
    // Cooldown curto por personagem: sem isso, dava pra scriptar
    // POST /pvp/challenge em loop contra um personagem fraco (ex.: um
    // alt de nível baixo) e farmar ouro/XP sem risco nenhum.
    const erroCooldown = await verificarCooldownDesafiante(id_desafiante);
    if (erroCooldown) {
      return res.status(429).json({ message: erroCooldown });
    }

    // Antifarm por PAR: mesmo respeitando o cooldown acima, nada
    // impedia duas contas combinadas se desafiarem repetidamente uma à
    // outra pra farmar ouro/XP sem risco de perder pra um oponente de
    // verdade.
    const erroAntifarmPar = await verificarAntifarmPar(id_desafiante, id_desafiado);
    if (erroAntifarmPar) {
      return res.status(429).json({ message: erroAntifarmPar });
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
      desafiante: comMultiplicadoresDeClasse(
        personagemComBonus(desafiante.toJSON(), bonusDesafiante),
        desafiante.Class,
      ),
      desafiado: comMultiplicadoresDeClasse(
        personagemComBonus(desafiado.toJSON(), bonusDesafiado),
        desafiado.Class,
      ),
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
  } finally {
    personagensProcessandoDesafio.delete(chaveDesafiante);
    personagensProcessandoDesafio.delete(chaveDesafiado);
  }
};

// Reexporta peças internas para o motor de PVP ao vivo (pvpLiveSocket.js)
// reaproveitar em vez de duplicar.
exports.buscarPoderesDoPersonagem = buscarPoderesDoPersonagem;
exports.aplicarResultadoDuelo = aplicarResultadoDuelo;
