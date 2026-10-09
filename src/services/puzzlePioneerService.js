// Evento "O Coração da Máquina Celestial" — Fase 10 (Discovery/Pioneer).
//
// Mesma separação catálogo-admin (criarMilestone/listarMilestonesAdmin)
// + sincronização idempotente a partir de estado JÁ PERSISTIDO da
// Fase 9 (puzzleClueService) — a diferença real está em
// sincronizarConquistas: um PioneerMilestone tem vaga LIMITADA
// (max_claims), então "virou verdade pro jogador" não é suficiente pra
// decidir se ele ganha um PuzzlePioneerClaim — precisa também saber se
// ainda sobra vaga, e essa decisão TEM que ser atômica (2 jogadores
// terminando o mesmo marco ao mesmo tempo nunca podem os dois ganhar a
// última vaga). A garantia real é a mesma já usada em
// puzzleBlueprintService.criarNovaVersao: travar a linha ESTÁVEL do
// PioneerMilestone (SELECT ... FOR UPDATE) antes de contar claims
// existentes e decidir — nunca confiar só na UNIQUE(id_milestone,
// posicao) do banco (que pegaria o erro tarde demais, depois de já ter
// "prometido" a vaga errada pros dois).
const { sequelize } = require("../config/database");
const { PuzzlePioneerMilestone, PuzzlePioneerClaim, PuzzleBlueprint } = require("../models/eventPuzzleModels");
const Character = require("../models/Character");

function erro(mensagem, statusCode = 400, code) {
  return Object.assign(new Error(mensagem), { statusCode, code });
}

const TRIGGERS_VALIDOS = new Set(["OBJECTIVE_COMPLETED", "INSTANCE_COMPLETED"]);

// ---------------------------------------------------------------------
// Catálogo ADMIN
// ---------------------------------------------------------------------

async function criarMilestone(idBlueprint, { key, titulo, descricao, triggerType, objectiveId, maxClaims, ordem } = {}, transaction) {
  const blueprint = await PuzzleBlueprint.findByPk(idBlueprint, { transaction });
  if (!blueprint) throw erro("Blueprint não encontrado.", 404);

  if (typeof key !== "string" || !/^[a-z0-9-]{3,60}$/.test(key)) {
    throw erro("Key inválida — use só letras minúsculas, números e hífen (3-60 caracteres).", 400);
  }
  if (typeof titulo !== "string" || titulo.trim().length < 3 || titulo.length > 160) {
    throw erro("Título inválido (3-160 caracteres).", 400);
  }
  if (typeof descricao !== "string" || descricao.trim().length === 0) {
    throw erro("Descrição não pode ser vazia.", 400);
  }
  if (!TRIGGERS_VALIDOS.has(triggerType)) {
    throw erro(`trigger_type inválido: ${triggerType}. Esperado OBJECTIVE_COMPLETED ou INSTANCE_COMPLETED.`, 400);
  }
  if (triggerType === "OBJECTIVE_COMPLETED") {
    if (typeof objectiveId !== "string" || objectiveId.trim().length === 0) {
      throw erro("objectiveId é obrigatório quando trigger_type=OBJECTIVE_COMPLETED.", 400);
    }
  } else if (objectiveId !== undefined && objectiveId !== null) {
    throw erro("objectiveId não pode ser informado quando trigger_type=INSTANCE_COMPLETED.", 400);
  }
  const maxClaimsValido = maxClaims === undefined ? 1 : maxClaims;
  if (!Number.isInteger(maxClaimsValido) || maxClaimsValido < 1) {
    throw erro("maxClaims precisa ser um inteiro >= 1.", 400);
  }
  const ordemValida = Number.isInteger(ordem) ? ordem : 0;

  try {
    return await PuzzlePioneerMilestone.create(
      {
        id_blueprint: idBlueprint,
        key,
        titulo: titulo.trim(),
        descricao,
        trigger_type: triggerType,
        objective_id: triggerType === "OBJECTIVE_COMPLETED" ? objectiveId : null,
        max_claims: maxClaimsValido,
        ordem: ordemValida,
      },
      { transaction },
    );
  } catch (e) {
    if (e.name === "SequelizeUniqueConstraintError") {
      throw erro("Já existe um marco com essa key pra esse blueprint.", 409);
    }
    throw e;
  }
}

async function listarMilestonesAdmin(idBlueprint) {
  return PuzzlePioneerMilestone.findAll({
    where: { id_blueprint: idBlueprint },
    order: [["ordem", "ASC"], ["id", "ASC"]],
  });
}

function dtoAdmin(milestone) {
  return {
    id: milestone.id,
    id_blueprint: milestone.id_blueprint,
    key: milestone.key,
    titulo: milestone.titulo,
    descricao: milestone.descricao,
    trigger_type: milestone.trigger_type,
    objective_id: milestone.objective_id,
    max_claims: milestone.max_claims,
    ordem: milestone.ordem,
    createdAt: milestone.createdAt,
    updatedAt: milestone.updatedAt,
  };
}

// ---------------------------------------------------------------------
// Conquista server-authoritative — corrida com vaga limitada
// ---------------------------------------------------------------------

// Mesmo contrato de entrada de puzzleClueService.sincronizarDesbloqueios
// (estado JÁ PERSISTIDO, nunca especulativo). Devolve os
// PuzzlePioneerClaim recém-criados NESTA chamada (com `.marco` anexado
// pra feedback) — nunca a fonte de verdade de "quem já conquistou
// isso", que é sempre uma releitura (ver obterQuadroDeHonra).
async function sincronizarConquistas({ idPersonagem, idBlueprint, objetivosConcluidos = [], completou = false }, transaction) {
  if (!idPersonagem || !idBlueprint) return [];

  const marcos = await PuzzlePioneerMilestone.findAll({
    where: { id_blueprint: idBlueprint },
    transaction,
    order: [["id", "ASC"]], // ordem determinística de lock — nunca deadlock entre 2 ações que processam os mesmos marcos em ordens diferentes.
  });
  if (marcos.length === 0) return [];

  const concluidosSet = new Set(objetivosConcluidos);
  const satisfeitos = marcos.filter((m) =>
    m.trigger_type === "OBJECTIVE_COMPLETED" ? concluidosSet.has(m.objective_id) : completou,
  );
  if (satisfeitos.length === 0) return [];

  async function processarUm(marcoId, t) {
    // Trava a linha ESTÁVEL do milestone antes de decidir — serializa
    // qualquer concorrência pro MESMO marco (2 jogadores terminando ao
    // mesmo tempo nunca contam claims ao mesmo tempo).
    const marco = await PuzzlePioneerMilestone.findByPk(marcoId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!marco) return null;

    // Idempotência: se este personagem já tem claim nesse marco (ação
    // repetida, ou o state já tinha o objetivo concluído antes), nunca
    // cria 2ª linha — mas também nunca "rouba" uma vaga que já é dele.
    const jaTem = await PuzzlePioneerClaim.findOne({
      where: { id_milestone: marcoId, id_personagem: idPersonagem },
      transaction: t,
    });
    if (jaTem) return null;

    const totalClaims = await PuzzlePioneerClaim.count({ where: { id_milestone: marcoId }, transaction: t });
    if (totalClaims >= marco.max_claims) return null; // corrida já terminada — chegou tarde.

    const personagem = await Character.findByPk(idPersonagem, { attributes: ["nome"], transaction: t });
    const claim = await PuzzlePioneerClaim.create(
      {
        id_milestone: marcoId,
        id_personagem: idPersonagem,
        personagem_nome_snapshot: personagem?.nome ?? "???",
        posicao: totalClaims + 1,
      },
      { transaction: t },
    );
    claim.marco = marco;
    return claim;
  }

  async function processarTodos(t) {
    const resultados = [];
    for (const marco of satisfeitos) {
      const claim = await processarUm(marco.id, t);
      if (claim) resultados.push(claim);
    }
    return resultados;
  }

  if (transaction) return processarTodos(transaction);
  return sequelize.transaction(processarTodos);
}

// Quadro de Honra — leitura pública (Hall das Lendas, Fase 11 consome
// isto diretamente). Diferente do Caderno de Investigação: título/
// descrição do marco são SEMPRE visíveis, mesmo sem nenhum claim ainda
// — só as conquistas em si (quem/quando) variam.
async function obterQuadroDeHonra(idEventDefinition) {
  const marcos = await PuzzlePioneerMilestone.findAll({
    include: [
      {
        model: PuzzleBlueprint,
        as: "blueprint",
        where: { id_event_definition: idEventDefinition },
        attributes: [],
      },
      { model: PuzzlePioneerClaim, as: "conquistas" },
    ],
    order: [["id_blueprint", "ASC"], ["ordem", "ASC"], ["id", "ASC"]],
  });

  return marcos.map((marco) => ({
    id: marco.id,
    titulo: marco.titulo,
    descricao: marco.descricao,
    maxClaims: marco.max_claims,
    conquistas: marco.conquistas
      .sort((a, b) => a.posicao - b.posicao)
      .map((c) => ({
        posicao: c.posicao,
        nome: c.personagem_nome_snapshot,
        claimedAt: c.claimed_at,
      })),
  }));
}

// Fase 11 — Hall das Lendas. Diferente de obterQuadroDeHonra (agrupado
// POR MARCO, pensado pra "quem é o pioneiro de X"), isto é um feed
// CRONOLÓGICO cruzando todos os marcos do evento — "o que acabou de
// acontecer", mais recente primeiro. Mesma tabela, leitura diferente;
// nenhum dado novo precisa ser persistido pra isso.
async function obterFeedDeDescobertas(idEventDefinition, { limite = 20 } = {}) {
  const limiteValido = Number.isInteger(limite) && limite > 0 ? Math.min(limite, 100) : 20;
  const claims = await PuzzlePioneerClaim.findAll({
    include: [
      {
        model: PuzzlePioneerMilestone,
        as: "marco",
        required: true,
        include: [
          {
            model: PuzzleBlueprint,
            as: "blueprint",
            where: { id_event_definition: idEventDefinition },
            attributes: [],
          },
        ],
      },
    ],
    order: [["claimed_at", "DESC"]],
    limit: limiteValido,
  });

  return claims.map((c) => ({
    nome: c.personagem_nome_snapshot,
    posicao: c.posicao,
    titulo: c.marco.titulo,
    claimedAt: c.claimed_at,
  }));
}

module.exports = {
  criarMilestone,
  listarMilestonesAdmin,
  dtoAdmin,
  sincronizarConquistas,
  obterQuadroDeHonra,
  obterFeedDeDescobertas,
};
