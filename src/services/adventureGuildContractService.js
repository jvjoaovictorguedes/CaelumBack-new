// Ciclo de vida de um contrato de Rank aceito (§16-§22/§39 da spec) —
// aceitar oferta, entregar itens (tipo Entregar é atômico: só conclui
// quando o servidor já debitou o inventário) e resgatar recompensa.
const Character = require("../models/Character");
const CharacterAdventureGuildContract = require("../models/CharacterAdventureGuildContract");
const CharacterAdventureGuildProgress = require("../models/CharacterAdventureGuildProgress");
const AdventureGuildOffer = require("../models/AdventureGuildOffer");
const AdventureGuildMission = require("../models/AdventureGuildMission");
const AdventureGuildMissionReward = require("../models/AdventureGuildMissionReward");
const CharacterInventory = require("../models/CharacterInventory");
const Item = require("../models/Item");
const { adicionarExperiencia } = require("./experienceService");
const { concederOuro } = require("./goldService");
const { registrarProgresso } = require("./missionService");
const { registrarConclusaoDeContrato, obterOuCriarProgresso } = require("./adventureGuildProgressionService");
const { CONTRATOS_ATIVOS_MAX, ROTACAO_MS, inicioDaJanelaAtual } = require("../config/adventureGuildConfig");

function erroGuilda(statusCode, mensagem) {
  return Object.assign(new Error(mensagem), { statusCode });
}

// §12/§17/§29/§39 — aceitar uma oferta da rotação atual, respeitando
// Rank atual, bloqueio por aptidão à promoção e o limite de 2
// contratos ativos. A trava fica na linha de PROGRESSO do personagem
// (reload com LOCK.UPDATE) — serializa qualquer aceite concorrente
// pro MESMO personagem, então duas requisições simultâneas nunca
// passam do limite juntas.
async function aceitarOferta(idPersonagem, idOferta, transaction) {
  const progresso = await obterOuCriarProgresso(idPersonagem, transaction);
  await progresso.reload({ transaction, lock: transaction.LOCK.UPDATE });

  const oferta = await AdventureGuildOffer.findByPk(idOferta, {
    include: [{ model: AdventureGuildMission, as: "missao" }],
    transaction,
  });
  if (!oferta) throw erroGuilda(404, "Oferta não encontrada.");

  if (oferta.rank !== progresso.rank) {
    throw erroGuilda(403, "Este contrato não pertence ao seu Rank atual.");
  }
  if (progresso.apto_para_promocao) {
    throw erroGuilda(409, "Você já atingiu os requisitos deste Rank — complete sua Provação para avançar.");
  }

  const janelaAtual = inicioDaJanelaAtual();
  if (oferta.janela_inicio.getTime() !== janelaAtual.getTime()) {
    throw erroGuilda(409, "Esta oferta já não faz parte da rotação atual.");
  }

  const jaAceito = await CharacterAdventureGuildContract.findOne({
    where: { id_personagem: idPersonagem, id_offer: idOferta },
    transaction,
  });
  if (jaAceito) throw erroGuilda(409, "Você já aceitou este contrato.");

  const ativos = await CharacterAdventureGuildContract.count({
    where: { id_personagem: idPersonagem, status: "Ativo" },
    transaction,
  });
  if (ativos >= CONTRATOS_ATIVOS_MAX) {
    throw erroGuilda(409, `Você já tem ${CONTRATOS_ATIVOS_MAX} contratos ativos — conclua ou aguarde um expirar.`);
  }

  const contrato = await CharacterAdventureGuildContract.create(
    {
      id_personagem: idPersonagem,
      id_offer: oferta.id,
      id_mission: oferta.id_mission,
      eh_provacao: false,
      aceito_em: new Date(),
      expira_em: new Date(janelaAtual.getTime() + ROTACAO_MS),
    },
    { transaction },
  );

  return contrato;
}

// §21/§22 — Entregar é atômico: só conclui quando o servidor confirma
// posse E já debitou o inventário, nunca por "possuir" contado à toa.
async function entregarItens(idPersonagem, idContrato, transaction) {
  const contrato = await CharacterAdventureGuildContract.findOne({
    where: { id: idContrato, id_personagem: idPersonagem },
    include: [{ model: AdventureGuildMission, as: "missao" }],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!contrato) throw erroGuilda(404, "Contrato não encontrado.");
  if (contrato.status !== "Ativo") throw erroGuilda(400, "Este contrato não está ativo.");
  if (contrato.missao.tipo_objetivo !== "Entregar") {
    throw erroGuilda(400, "Este contrato não é de entrega de itens.");
  }
  if (contrato.expira_em && contrato.expira_em.getTime() <= Date.now()) {
    contrato.status = "Expirado";
    await contrato.save({ transaction });
    throw erroGuilda(409, "Este contrato expirou.");
  }

  const quantidadeNecessaria = contrato.missao.quantidade_objetivo;
  const entrada = await CharacterInventory.findOne({
    where: { id_personagem: idPersonagem, id_item: contrato.missao.id_item_alvo },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!entrada || entrada.quantidade < quantidadeNecessaria) {
    throw erroGuilda(400, "Você não possui a quantidade necessária deste item.");
  }

  entrada.quantidade -= quantidadeNecessaria;
  if (entrada.quantidade <= 0) await entrada.destroy({ transaction });
  else await entrada.save({ transaction });

  contrato.progresso_atual = quantidadeNecessaria;
  contrato.status = "Concluido";
  contrato.concluido_em = new Date();
  await contrato.save({ transaction });

  await registrarConclusaoDeContrato(idPersonagem, contrato, transaction);

  return contrato;
}

// §33/§53 — resgate concede as recompensas (N linhas, não 1 item só) e
// nunca duplica o contador de promoção (isso já aconteceu na conclusão).
async function resgatarRecompensaContrato(idPersonagem, idContrato, transaction) {
  const contrato = await CharacterAdventureGuildContract.findOne({
    where: { id: idContrato, id_personagem: idPersonagem },
    include: [
      {
        model: AdventureGuildMission,
        as: "missao",
        include: [{ model: AdventureGuildMissionReward, as: "recompensas" }],
      },
    ],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!contrato) throw erroGuilda(404, "Contrato não encontrado.");
  if (contrato.status !== "Concluido") throw erroGuilda(400, "Este contrato ainda não foi concluído.");

  const character = await Character.findByPk(idPersonagem, { transaction, lock: transaction.LOCK.UPDATE });
  if (!character) throw erroGuilda(404, "Personagem não encontrado.");

  let dinheiro = 0;
  let xp = 0;
  const itensConcedidos = [];

  for (const recompensa of contrato.missao.recompensas) {
    if (recompensa.tipo === "Ouro") {
      concederOuro(character, recompensa.quantidade);
      dinheiro += recompensa.quantidade;
    } else if (recompensa.tipo === "XP") {
      xp += recompensa.quantidade;
    } else if (recompensa.tipo === "Item") {
      let entrada = await CharacterInventory.findOne({
        where: { id_personagem: idPersonagem, id_item: recompensa.id_item },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (entrada) {
        entrada.quantidade += recompensa.quantidade;
        await entrada.save({ transaction });
      } else {
        entrada = await CharacterInventory.create(
          { id_personagem: idPersonagem, id_item: recompensa.id_item, quantidade: recompensa.quantidade },
          { transaction },
        );
      }
      const item = await Item.findByPk(recompensa.id_item, { transaction });
      itensConcedidos.push({ id: recompensa.id_item, nome: item?.nome ?? "?", quantidade: recompensa.quantidade });
    }
  }

  await character.save({ transaction });
  const resultadoXP =
    xp > 0 ? await adicionarExperiencia(idPersonagem, xp, { transaction, personagem: character }) : null;

  contrato.status = "Resgatado";
  contrato.resgatado_em = new Date();
  await contrato.save({ transaction });

  // §8 — exemplo de missão Mensal "Complete 50 contratos da Guilda":
  // só contratos NORMAIS contam (a Provação não é um "contrato da
  // Guilda" no sentido do marco livre, é a promoção em si).
  if (!contrato.eh_provacao) {
    await registrarProgresso(character, "CompletarContratosGuilda", 1, transaction);
  }

  return { dinheiro, xp, nivel: resultadoXP?.nivel ?? character.nivel, itens: itensConcedidos };
}

async function listarContratosAtivos(idPersonagem, transaction) {
  return CharacterAdventureGuildContract.findAll({
    where: { id_personagem: idPersonagem, status: ["Ativo", "Concluido"] },
    include: [
      {
        model: AdventureGuildMission,
        as: "missao",
        include: [{ model: AdventureGuildMissionReward, as: "recompensas", include: [{ model: Item, as: "item" }] }],
      },
    ],
    order: [["aceito_em", "ASC"]],
    transaction,
  });
}

// §18 — varre contratos ativos vencidos e marca Expirado (nunca some
// silenciosamente antes disso — só quando alguém lista/consulta depois
// da janela já ter passado).
async function expirarContratosVencidos(idPersonagem, transaction) {
  await CharacterAdventureGuildContract.update(
    { status: "Expirado" },
    {
      where: {
        id_personagem: idPersonagem,
        status: "Ativo",
        expira_em: { [require("sequelize").Op.lte]: new Date() },
      },
      transaction,
    },
  );
}

module.exports = {
  aceitarOferta,
  entregarItens,
  resgatarRecompensaContrato,
  listarContratosAtivos,
  expirarContratosVencidos,
};
