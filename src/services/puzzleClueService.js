// Evento "O Coração da Máquina Celestial" — Fase 9 (Sistema de pistas e
// Caderno de Investigação).
//
// Duas responsabilidades deliberadamente separadas:
// 1. Catálogo ADMIN (criarDefinicao/listarDefinicoesAdmin) — pistas são
//    conteúdo curado por Admin, uma por PuzzleBlueprint (identidade,
//    nunca uma Version — mesmo raciocínio de objective_id ser só uma
//    string referenciada livremente pelo engine, sem validação contra
//    um schema de versão fixa).
// 2. Desbloqueio server-authoritative (sincronizarDesbloqueios) — NUNCA
//    aceita "desbloqueei a pista X" do cliente. O único dado de entrada
//    é o estado JÁ PERSISTIDO de uma PuzzleInstance (objetivos
//    concluídos — sticky, Fase 2 — e status COMPLETED), nunca um evento
//    transiente "acabei de concluir" (que não seria idempotente num
//    retry/crash). Isso significa: reavaliar a MESMA PuzzleInstance 2x
//    seguidas sempre produz o mesmo resultado (nenhuma pista nova na 2ª
//    vez) — a garantia real contra duplicação é dupla: idempotência da
//    condição (sempre recalculada do zero a partir do estado
//    persistido) + UNIQUE(id_personagem, id_clue_definition) no banco
//    (bulkCreate com ignoreDuplicates, nunca um INSERT solto).
const { Op } = require("sequelize");
const { PuzzleClueDefinition, CharacterClueUnlock, PuzzleBlueprint } = require("../models/eventPuzzleModels");

function erro(mensagem, statusCode = 400, code) {
  return Object.assign(new Error(mensagem), { statusCode, code });
}

const TRIGGERS_VALIDOS = new Set(["OBJECTIVE_COMPLETED", "INSTANCE_COMPLETED"]);

// ---------------------------------------------------------------------
// Catálogo ADMIN
// ---------------------------------------------------------------------

async function criarDefinicao(idBlueprint, { key, titulo, texto, triggerType, objectiveId, ordem } = {}, transaction) {
  const blueprint = await PuzzleBlueprint.findByPk(idBlueprint, { transaction });
  if (!blueprint) throw erro("Blueprint não encontrado.", 404);

  if (typeof key !== "string" || !/^[a-z0-9-]{3,60}$/.test(key)) {
    throw erro("Key inválida — use só letras minúsculas, números e hífen (3-60 caracteres).", 400);
  }
  if (typeof titulo !== "string" || titulo.trim().length < 3 || titulo.length > 160) {
    throw erro("Título inválido (3-160 caracteres).", 400);
  }
  if (typeof texto !== "string" || texto.trim().length === 0) {
    throw erro("Texto da pista não pode ser vazio.", 400);
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
  const ordemValida = Number.isInteger(ordem) ? ordem : 0;

  try {
    return await PuzzleClueDefinition.create(
      {
        id_blueprint: idBlueprint,
        key,
        titulo: titulo.trim(),
        texto,
        trigger_type: triggerType,
        objective_id: triggerType === "OBJECTIVE_COMPLETED" ? objectiveId : null,
        ordem: ordemValida,
      },
      { transaction },
    );
  } catch (e) {
    if (e.name === "SequelizeUniqueConstraintError") {
      throw erro("Já existe uma pista com essa key pra esse blueprint.", 409);
    }
    throw e;
  }
}

// Fase 15 — edição admin da pista. Mesmas validações de criarDefinicao
// pros campos informados; nunca permite mudar `key` (identidade
// estável, referenciada por nada externo hoje mas por convenção do
// domínio — mesmo critério de achievement_key em PuzzleRewardDefinition).
async function atualizarDefinicao(idClueDefinition, { titulo, texto, triggerType, objectiveId, ordem } = {}, transaction) {
  const pista = await PuzzleClueDefinition.findByPk(idClueDefinition, { transaction });
  if (!pista) throw erro("Pista não encontrada.", 404);

  if (titulo !== undefined) {
    if (typeof titulo !== "string" || titulo.trim().length < 3 || titulo.length > 160) {
      throw erro("Título inválido (3-160 caracteres).", 400);
    }
    pista.titulo = titulo.trim();
  }
  if (texto !== undefined) {
    if (typeof texto !== "string" || texto.trim().length === 0) throw erro("Texto da pista não pode ser vazio.", 400);
    pista.texto = texto;
  }
  const novoTrigger = triggerType ?? pista.trigger_type;
  if (triggerType !== undefined) {
    if (!TRIGGERS_VALIDOS.has(triggerType)) {
      throw erro(`trigger_type inválido: ${triggerType}. Esperado OBJECTIVE_COMPLETED ou INSTANCE_COMPLETED.`, 400);
    }
    pista.trigger_type = triggerType;
  }
  if (novoTrigger === "OBJECTIVE_COMPLETED") {
    const efetivo = objectiveId !== undefined ? objectiveId : pista.objective_id;
    if (typeof efetivo !== "string" || efetivo.trim().length === 0) {
      throw erro("objectiveId é obrigatório quando trigger_type=OBJECTIVE_COMPLETED.", 400);
    }
    pista.objective_id = efetivo;
  } else if (objectiveId !== undefined && objectiveId !== null) {
    throw erro("objectiveId não pode ser informado quando trigger_type=INSTANCE_COMPLETED.", 400);
  } else if (triggerType === "INSTANCE_COMPLETED") {
    pista.objective_id = null;
  }
  if (ordem !== undefined) {
    if (!Number.isInteger(ordem)) throw erro("ordem precisa ser um inteiro.", 400);
    pista.ordem = ordem;
  }

  await pista.save({ transaction });
  return pista;
}

// Fase 15 — exclusão admin. Bloqueia se algum personagem já desbloqueou
// (preserva histórico real do Caderno de Investigação — nunca some uma
// pista que alguém já leu, mesmo que o Admin queira remover do
// catálogo; a saída certa pra isso é desativar via Blueprint/Version,
// nunca apagar histórico do jogador).
async function excluirDefinicao(idClueDefinition, transaction) {
  const pista = await PuzzleClueDefinition.findByPk(idClueDefinition, { transaction });
  if (!pista) throw erro("Pista não encontrada.", 404);

  const totalDesbloqueios = await CharacterClueUnlock.count({ where: { id_clue_definition: idClueDefinition }, transaction });
  if (totalDesbloqueios > 0) {
    throw erro("Esta pista já foi desbloqueada por pelo menos um personagem — não pode ser excluída.", 409, "PISTA_JA_DESBLOQUEADA");
  }

  await pista.destroy({ transaction });
}

async function listarDefinicoesAdmin(idBlueprint) {
  return PuzzleClueDefinition.findAll({
    where: { id_blueprint: idBlueprint },
    order: [["ordem", "ASC"], ["id", "ASC"]],
  });
}

function dtoAdmin(clue) {
  return {
    id: clue.id,
    id_blueprint: clue.id_blueprint,
    key: clue.key,
    titulo: clue.titulo,
    texto: clue.texto,
    trigger_type: clue.trigger_type,
    objective_id: clue.objective_id,
    ordem: clue.ordem,
    createdAt: clue.createdAt,
    updatedAt: clue.updatedAt,
  };
}

// ---------------------------------------------------------------------
// Desbloqueio server-authoritative
// ---------------------------------------------------------------------

// Chamado pelo pipeline de ação (puzzleActionService) depois que o novo
// state de uma PuzzleInstance já está PERSISTIDO — nunca antes, nunca
// com um state especulativo que pode não vencer o UPDATE condicional.
// `objetivosConcluidos` é o array sticky já salvo (state.
// objetivosConcluidos, Fase 2); `completou` é `status === "COMPLETED"`
// já persistido. Devolve as PuzzleClueDefinition recém-desbloqueadas
// NESTA chamada (pra feedback/evento) — nunca a fonte de verdade de "o
// personagem tem essa pista": isso é sempre obterCaderno, recalculado
// do banco.
async function sincronizarDesbloqueios({ idPersonagem, idBlueprint, objetivosConcluidos = [], completou = false }, transaction) {
  if (!idPersonagem || !idBlueprint) return [];

  const definicoes = await PuzzleClueDefinition.findAll({
    where: { id_blueprint: idBlueprint },
    transaction,
  });
  if (definicoes.length === 0) return [];

  const concluidosSet = new Set(objetivosConcluidos);
  const satisfeitas = definicoes.filter((def) =>
    def.trigger_type === "OBJECTIVE_COMPLETED"
      ? concluidosSet.has(def.objective_id)
      : completou,
  );
  if (satisfeitas.length === 0) return [];

  const existentes = await CharacterClueUnlock.findAll({
    where: {
      id_personagem: idPersonagem,
      id_clue_definition: { [Op.in]: satisfeitas.map((d) => d.id) },
    },
    attributes: ["id_clue_definition"],
    transaction,
  });
  const jaDesbloqueadasSet = new Set(existentes.map((e) => e.id_clue_definition));
  const novas = satisfeitas.filter((def) => !jaDesbloqueadasSet.has(def.id));
  if (novas.length === 0) return [];

  // ignoreDuplicates (ON CONFLICT DO NOTHING no Postgres) — mesma
  // garantia final contra duplicação mesmo que 2 ações concorrentes
  // cheguem aqui tendo as duas calculado a MESMA pista como "nova"
  // (corrida real possível: nenhuma trava explícita aqui, de propósito
  // — a garantia não depende de serialização, depende do banco nunca
  // aceitar a 2ª linha).
  await CharacterClueUnlock.bulkCreate(
    novas.map((def) => ({ id_personagem: idPersonagem, id_clue_definition: def.id })),
    { ignoreDuplicates: true, transaction },
  );

  return novas;
}

// DTO pro Caderno de Investigação do jogador. Pistas bloqueadas NUNCA
// incluem titulo/texto/trigger — só confirmam que existem (pra UI
// mostrar "???" na posição certa), nunca o que revelam nem como
// desbloquear.
async function obterCaderno(idPersonagem, idEventDefinition) {
  const definicoes = await PuzzleClueDefinition.findAll({
    include: [
      {
        model: PuzzleBlueprint,
        as: "blueprint",
        where: { id_event_definition: idEventDefinition },
        attributes: [],
      },
    ],
    order: [["id_blueprint", "ASC"], ["ordem", "ASC"], ["id", "ASC"]],
  });
  if (definicoes.length === 0) return [];

  const desbloqueios = await CharacterClueUnlock.findAll({
    where: {
      id_personagem: idPersonagem,
      id_clue_definition: { [Op.in]: definicoes.map((d) => d.id) },
    },
  });
  const desbloqueioPorClue = new Map(desbloqueios.map((d) => [d.id_clue_definition, d]));

  return definicoes.map((def) => {
    const desbloqueio = desbloqueioPorClue.get(def.id);
    if (!desbloqueio) {
      return { id: def.id, bloqueada: true };
    }
    return {
      id: def.id,
      bloqueada: false,
      titulo: def.titulo,
      texto: def.texto,
      unlockedAt: desbloqueio.unlocked_at,
    };
  });
}

module.exports = {
  criarDefinicao,
  atualizarDefinicao,
  excluirDefinicao,
  listarDefinicoesAdmin,
  dtoAdmin,
  sincronizarDesbloqueios,
  obterCaderno,
};
