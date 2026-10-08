// Zonas e sessão de caça do Modo Aventura (§16-§20, §22 da spec).
// Controller só valida a requisição e chama isto aqui (§25/§26) — nada
// de regra de negócio em adventureController.js.
const AdventureZone = require("../models/AdventureZone");
const AdventureZoneMonster = require("../models/AdventureZoneMonster");
const AdventureMonster = require("../models/AdventureMonster");
const CharacterAdventureSession = require("../models/CharacterAdventureSession");
const Character = require("../models/Character");
const { calcularPerigo } = require("../config/adventureConfig");

// Lista as zonas ativas com o suficiente pro frontend montar a UI de
// perigo sem inventar regra própria (§27) — nivel_recomendado como
// string pronta e perigo já calculado no servidor.
async function listarZonas(nivelPersonagem) {
  const zonas = await AdventureZone.findAll({
    where: { ativa: true },
    order: [["ordem", "ASC"]],
  });

  const event=await require("./worldCrisisService").current();
  const restricted=event?require("./worldCrisisService").restrictions(event):[];
  return zonas.map((zona) => ({
    bloqueada_por_crise:restricted.some(r=>r.target_id===zona.id),crise_restricao:restricted.find(r=>r.target_id===zona.id)??null,
    id: zona.id,
    nome: zona.nome,
    descricao: zona.descricao,
    imagem_url: zona.imagem_url,
    battle_background_url: zona.battle_background_url,
    nivel_monstro_min: zona.nivel_monstro_min,
    nivel_monstro_max: zona.nivel_monstro_max,
    nivel_recomendado: `${zona.nivel_monstro_min}-${zona.nivel_monstro_max}`,
    perigo: calcularPerigo(nivelPersonagem, zona.nivel_monstro_min, zona.nivel_monstro_max),
    // Gate de entrada de verdade (diferente do "perigo" acima, que é só
    // indicativo) — o frontend usa isto pra travar o botão de entrar,
    // e entrarNaZona() revalida o mesmo campo server-side (nunca confia
    // só no que o cliente decidiu mostrar).
    nivel_jogador_minimo: zona.nivel_jogador_minimo,
    bloqueada_por_nivel: nivelPersonagem < zona.nivel_jogador_minimo,
  }));
}

// Nomes dos monstros de uma zona (§27) — usado pelo Bestiário
// (masteryService.js) pra montar a lista de progresso por monstro da
// região. Não é mais usado pra escolha manual de alvo na Aventura (a
// caça é sempre 100% aleatória, pedido do jogador).
async function monstrosDaZona(idArea, transaction) {
  const vinculos = await AdventureZoneMonster.findAll({
    where: { id_area: idArea, ativo: true },
    // Mesmo fix de combatController.js — não lista monstro desativado
    // globalmente no progresso do Bestiário da zona.
    include: [{ model: AdventureMonster, as: "monstro", where: { ativo: true }, required: true }],
    transaction,
  });
  return vinculos.map((v) => ({ nome: v.monstro.nome, tipo_aparicao: v.tipo_aparicao }));
}

// Devolve a sessão ativa do personagem (ou null) — usada tanto pro
// endpoint de status quanto pelo gate de encontro no combatController.
// Sem lock por padrão: quem lê durante o gate de encontro já opera
// dentro da transação com o Character travado (LOCK.UPDATE), o que já
// serializa qualquer concorrência pro mesmo personagem — travar aqui
// TAMBÉM daria FOR UPDATE num LEFT JOIN (AdventureZone é opcional do
// ponto de vista do include), o mesmo problema já documentado em
// combatController.js sobre Class.
async function obterSessaoAtiva(idPersonagem, { transaction, lock } = {}) {
  return CharacterAdventureSession.findOne({
    where: { id_personagem: idPersonagem, ativo: true },
    include: [{ model: AdventureZone, as: "area" }],
    transaction,
    ...(lock ? { lock } : {}),
  });
}

// Entra numa zona (§16) — encerra qualquer sessão ativa anterior antes
// de abrir a nova (só uma ativa por personagem, garantido aqui em
// código, ver comentário no model). Quem chama já deve ter travado o
// Character na mesma transação (mesmo padrão de exclusão mútua com
// Portal de Ranque que o resto do combate usa).
async function entrarNaZona(idPersonagem, idZona, transaction) {
  await require("./worldCrisisAccessService").assertAccessible("ADVENTURE_ZONE",idZona,transaction);
  const zona = await AdventureZone.findOne({
    where: { id: idZona, ativa: true },
    transaction,
  });
  if (!zona) {
    const erro = new Error("Área de Caça não encontrada.");
    erro.status = 404;
    throw erro;
  }

  // Gate de nível de verdade (pedido do jogador) — sempre revalidado
  // aqui, nunca confia que o frontend só escondeu/desabilitou o botão
  // (§ mesma filosofia do resto do jogo: cliente nunca decide sozinho
  // se um requisito foi cumprido). Só nivel é lido, sem lock — quem
  // chama já travou o Character na mesma transação quando precisa
  // (ver comentário de obterSessaoAtiva acima sobre o motivo de nunca
  // travar aqui de novo).
  const personagem = await Character.findByPk(idPersonagem, { attributes: ["id", "nivel"], transaction });
  if (!personagem) {
    const erro = new Error("Personagem não encontrado.");
    erro.status = 404;
    throw erro;
  }
  if (personagem.nivel < zona.nivel_jogador_minimo) {
    const erro = new Error(
      `Você precisa ser nível ${zona.nivel_jogador_minimo} pra entrar em "${zona.nome}" (nível atual: ${personagem.nivel}).`,
    );
    erro.status = 403;
    throw erro;
  }

  await CharacterAdventureSession.update(
    { ativo: false, encerrado_em: new Date() },
    { where: { id_personagem: idPersonagem, ativo: true }, transaction },
  );

  const sessao = await CharacterAdventureSession.create(
    {
      id_personagem: idPersonagem,
      id_area: zona.id,
      iniciado_em: new Date(),
    },
    { transaction },
  );

  return { sessao, zona };
}

// Sai da zona (§20) — encerra a sessão e devolve o resumo já acumulado
// (os contadores já foram persistidos por kill, não em lote aqui).
async function sairDaZona(idPersonagem, transaction) {
  const sessao = await CharacterAdventureSession.findOne({
    where: { id_personagem: idPersonagem, ativo: true },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (!sessao) {
    const erro = new Error("Nenhuma sessão de caça ativa.");
    erro.status = 409;
    throw erro;
  }

  sessao.ativo = false;
  sessao.encerrado_em = new Date();
  await sessao.save({ transaction });

  return sessao;
}

module.exports = {
  listarZonas,
  monstrosDaZona,
  obterSessaoAtiva,
  entrarNaZona,
  sairDaZona,
};
