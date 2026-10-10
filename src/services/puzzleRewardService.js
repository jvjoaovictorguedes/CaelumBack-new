// Evento "O Coração da Máquina Celestial" — Fase 14 (Recompensas
// temáticas do evento).
//
// Duas responsabilidades deliberadamente separadas, mesmo padrão das
// Fases 9/10 (pistas/pioneiros):
// 1. Catálogo ADMIN (criarDefinicao/listarDefinicoesAdmin) — recompensa
//    é conteúdo curado por Admin, N por PuzzleBlueprint.
// 2. Concessão server-authoritative (sincronizarRecompensas) — NUNCA
//    aceita "ganhei a recompensa X" do cliente. Mesmo contrato de
//    entrada de puzzleClueService.sincronizarDesbloqueios/
//    puzzlePioneerService.sincronizarConquistas (estado JÁ PERSISTIDO,
//    nunca especulativo) — chamado pelo pipeline de ação
//    (puzzleActionService) sempre depois da persistência.
//
// Diferente de pistas (que só revelam texto) e pioneiros (que só
// registram um claim), uma recompensa aqui MOVE recursos reais (ouro/
// xp/item via rewardPayoutService, conquista/título via
// achievementService.grantByKey) — por isso o CharacterPuzzleRewardGrant
// é criado ANTES do payout dentro da mesma transaction: se a criação
// falhar por UNIQUE (outra chamada já concedeu), o payout nunca roda;
// se tudo correr bem, grant+payout+conquista commitam juntos ou nenhum
// dos três.
const { sequelize } = require("../config/database");
const { PuzzleRewardDefinition, CharacterPuzzleRewardGrant } = require("../models/eventPuzzleRewardModels");
const { PuzzleBlueprint } = require("../models/eventPuzzleModels");
const Item = require("../models/Item");
const Achievement = require("../models/Achievement");
const rewardPayoutService = require("./rewardPayoutService");
const achievementService = require("./achievementService");

function erro(mensagem, statusCode = 400, code) {
  return Object.assign(new Error(mensagem), { statusCode, code });
}

const TRIGGERS_VALIDOS = new Set(["OBJECTIVE_COMPLETED", "INSTANCE_COMPLETED"]);

// ---------------------------------------------------------------------
// Catálogo ADMIN
// ---------------------------------------------------------------------

async function criarDefinicao(
  idBlueprint,
  { key, tituloExibicao, descricaoExibicao, triggerType, objectiveId, rewardOuro, rewardXp, idItem, itemQuantidade, achievementKey, ordem } = {},
  transaction,
) {
  const blueprint = await PuzzleBlueprint.findByPk(idBlueprint, { transaction });
  if (!blueprint) throw erro("Blueprint não encontrado.", 404);

  if (typeof key !== "string" || !/^[a-z0-9-]{3,60}$/.test(key)) {
    throw erro("Key inválida — use só letras minúsculas, números e hífen (3-60 caracteres).", 400);
  }
  if (typeof tituloExibicao !== "string" || tituloExibicao.trim().length < 3 || tituloExibicao.length > 160) {
    throw erro("Título inválido (3-160 caracteres).", 400);
  }
  if (typeof descricaoExibicao !== "string" || descricaoExibicao.trim().length === 0) {
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

  const ouroValido = rewardOuro === undefined ? 0 : rewardOuro;
  const xpValido = rewardXp === undefined ? 0 : rewardXp;
  if (!Number.isInteger(ouroValido) || ouroValido < 0) throw erro("rewardOuro precisa ser um inteiro >= 0.", 400);
  if (!Number.isInteger(xpValido) || xpValido < 0) throw erro("rewardXp precisa ser um inteiro >= 0.", 400);

  let item = null;
  if (idItem !== undefined && idItem !== null) {
    item = await Item.findByPk(idItem, { transaction });
    if (!item) throw erro("Item da recompensa não encontrado.", 404);
  }
  const quantidadeValida = itemQuantidade === undefined ? 1 : itemQuantidade;
  if (!Number.isInteger(quantidadeValida) || quantidadeValida < 1) {
    throw erro("itemQuantidade precisa ser um inteiro >= 1.", 400);
  }

  if (achievementKey !== undefined && achievementKey !== null) {
    const achievement = await Achievement.findOne({ where: { key: achievementKey }, transaction });
    if (!achievement) throw erro(`Achievement com key "${achievementKey}" não existe.`, 404);
  }

  if (ouroValido === 0 && xpValido === 0 && !item && !achievementKey) {
    throw erro("A recompensa precisa conceder pelo menos um de: ouro, xp, item ou conquista.", 400);
  }

  const ordemValida = Number.isInteger(ordem) ? ordem : 0;

  try {
    return await PuzzleRewardDefinition.create(
      {
        id_blueprint: idBlueprint,
        key,
        titulo_exibicao: tituloExibicao.trim(),
        descricao_exibicao: descricaoExibicao,
        trigger_type: triggerType,
        objective_id: triggerType === "OBJECTIVE_COMPLETED" ? objectiveId : null,
        reward_ouro: ouroValido,
        reward_xp: xpValido,
        id_item: item ? item.id : null,
        item_quantidade: quantidadeValida,
        achievement_key: achievementKey ?? null,
        ordem: ordemValida,
      },
      { transaction },
    );
  } catch (e) {
    if (e.name === "SequelizeUniqueConstraintError") {
      throw erro("Já existe uma recompensa com essa key pra esse blueprint.", 409);
    }
    throw e;
  }
}

async function listarDefinicoesAdmin(idBlueprint) {
  return PuzzleRewardDefinition.findAll({
    where: { id_blueprint: idBlueprint },
    order: [["ordem", "ASC"], ["id", "ASC"]],
  });
}

function dtoAdmin(def) {
  return {
    id: def.id,
    id_blueprint: def.id_blueprint,
    key: def.key,
    titulo_exibicao: def.titulo_exibicao,
    descricao_exibicao: def.descricao_exibicao,
    trigger_type: def.trigger_type,
    objective_id: def.objective_id,
    reward_ouro: def.reward_ouro,
    reward_xp: def.reward_xp,
    id_item: def.id_item,
    item_quantidade: def.item_quantidade,
    achievement_key: def.achievement_key,
    ordem: def.ordem,
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  };
}

// ---------------------------------------------------------------------
// Concessão server-authoritative
// ---------------------------------------------------------------------

async function processarUma(def, idPersonagem, t) {
  // Idempotência via SELECT-então-INSERT (mesmo critério de
  // puzzleClueService.sincronizarDesbloqueios) — nunca um try/catch de
  // UNIQUE aqui: isto roda num loop reaproveitando a MESMA transaction
  // pra todas as definições satisfeitas nesta chamada, e um erro de
  // UNIQUE capturado no meio deixaria a transaction inteira abortada
  // pro Postgres (precisaria de SAVEPOINT por definição pra ser seguro,
  // complexidade desproporcional aqui). Na prática nunca há 2 chamadas
  // concorrentes pro MESMO personagem+blueprint — aplicarMutacao já
  // serializa por state_version, então só uma ação jamais vence a
  // transição de conclusão ao mesmo tempo (mesma garantia que o resto
  // do pipeline de Fase 9/10 já aceita). A UNIQUE no banco continua como
  // defesa em profundidade contra bug/replay, nunca o mecanismo
  // primário de decisão aqui.
  const existente = await CharacterPuzzleRewardGrant.findOne({
    where: { id_personagem: idPersonagem, id_reward_definition: def.id },
    transaction: t,
  });
  if (existente) return null;

  if (def.reward_ouro > 0 || def.reward_xp > 0 || def.id_item) {
    await rewardPayoutService.aplicarPacoteDeRecompensa(
      idPersonagem,
      {
        ouro: def.reward_ouro > 0 ? def.reward_ouro : undefined,
        xp: def.reward_xp > 0 ? def.reward_xp : undefined,
        itens: def.id_item ? [{ id_item: def.id_item, quantidade: def.item_quantidade }] : undefined,
      },
      t,
    );
  }

  let conquista = null;
  if (def.achievement_key) {
    conquista = await achievementService.grantByKey(idPersonagem, def.achievement_key, t);
  }

  // Registro do grant por ÚLTIMO — se qualquer coisa acima lançar, a
  // transaction inteira desfaz tudo (nunca uma recompensa "paga mas sem
  // registro", nem "registrada mas sem pagamento").
  await CharacterPuzzleRewardGrant.create(
    { id_personagem: idPersonagem, id_reward_definition: def.id },
    { transaction: t },
  );

  return { definicao: def, conquista };
}

// Chamado pelo pipeline de ação (puzzleActionService) depois que o novo
// state de uma PuzzleInstance já está PERSISTIDO — nunca antes, nunca
// com um state especulativo. `objetivosConcluidos` é o array sticky já
// salvo (state.objetivosConcluidos); `completou` é `status ===
// "COMPLETED"` já persistido. Devolve as recompensas recém-concedidas
// NESTA chamada (pra feedback/evento) — nunca a fonte de verdade de "o
// personagem já ganhou isto" (não há leitura pública dessa fonte ainda;
// ver relatório final da Fase 14 pra essa lacuna conhecida).
async function sincronizarRecompensas({ idPersonagem, idBlueprint, objetivosConcluidos = [], completou = false }, transaction) {
  if (!idPersonagem || !idBlueprint) return [];

  const definicoes = await PuzzleRewardDefinition.findAll({
    where: { id_blueprint: idBlueprint },
    transaction,
    order: [["id", "ASC"]],
  });
  if (definicoes.length === 0) return [];

  const concluidosSet = new Set(objetivosConcluidos);
  const satisfeitas = definicoes.filter((def) =>
    def.trigger_type === "OBJECTIVE_COMPLETED" ? concluidosSet.has(def.objective_id) : completou,
  );
  if (satisfeitas.length === 0) return [];

  async function processarTodas(t) {
    const resultados = [];
    for (const def of satisfeitas) {
      const r = await processarUma(def, idPersonagem, t);
      if (r) resultados.push(r);
    }
    return resultados;
  }

  if (transaction) return processarTodas(transaction);
  return sequelize.transaction(processarTodas);
}

// Leitura pública — "o que eu já ganhei nesta sala" (mesmo papel que
// obterCaderno tem pras pistas, só que recompensas nunca ficam
// "bloqueadas": são sempre conteúdo visível, só o booleano `obtida`
// muda). Nunca usado pela sincronização em si (aquela decide sempre do
// zero via findOne por definição, nunca confia nesta listagem).
async function listarObtidasPorPersonagem(idPersonagem, idBlueprint) {
  const definicoes = await listarDefinicoesAdmin(idBlueprint);
  if (definicoes.length === 0) return [];

  const { Op } = require("sequelize");
  const concessoes = await CharacterPuzzleRewardGrant.findAll({
    where: { id_personagem: idPersonagem, id_reward_definition: { [Op.in]: definicoes.map((d) => d.id) } },
  });
  const concedidaPorDef = new Map(concessoes.map((c) => [c.id_reward_definition, c]));

  return definicoes.map((def) => {
    const concessao = concedidaPorDef.get(def.id);
    return {
      id: def.id,
      titulo: def.titulo_exibicao,
      descricao: def.descricao_exibicao,
      obtida: Boolean(concessao),
      obtidaEm: concessao?.granted_at ?? null,
    };
  });
}

module.exports = {
  criarDefinicao,
  listarDefinicoesAdmin,
  dtoAdmin,
  sincronizarRecompensas,
  listarObtidasPorPersonagem,
};
