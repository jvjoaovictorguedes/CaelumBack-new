// Progresso de missões — catálogo fixo em Mission (ver seeder), uma
// linha de progresso por (personagem, missão) em CharacterMissionProgress.
// Missões "Diaria" resetam IN-PLACE quando expira_em passa (zera
// progresso/concluida/recompensa_resgatada e marca uma nova janela de
// 24h) em vez de criar uma linha nova a cada dia — não há histórico de
// missão diária que valha a pena guardar.
const { Op } = require("sequelize");
const Mission = require("../models/Mission");
const CharacterMissionProgress = require("../models/CharacterMissionProgress");
const Character = require("../models/Character");
const Item = require("../models/Item");
const CharacterInventory = require("../models/CharacterInventory");
const { adicionarExperiencia } = require("./experienceService");
const { concederOuro } = require("./goldService");

const JANELA_DIARIA_MS = 24 * 60 * 60 * 1000;

function estaExpirada(progresso) {
  return Boolean(progresso.expira_em) && progresso.expira_em.getTime() <= Date.now();
}

// Garante que existe uma linha de progresso (não expirada) pra cada
// missão ativa e liberada pro nível do personagem, resetando as diárias
// vencidas. AlcancarNivel é sincronizada aqui mesmo com o nível atual —
// não incrementa por evento, é um limiar direto contra Character.nivel.
async function garantirProgresso(character, transaction) {
  const missoes = await Mission.findAll({
    where: { ativa: true, nivel_minimo: { [Op.lte]: character.nivel } },
    transaction,
  });

  const linhas = [];
  for (const mission of missoes) {
    let progresso = await CharacterMissionProgress.findOne({
      where: { id_personagem: character.id, id_mission: mission.id },
      transaction,
      lock: transaction?.LOCK?.UPDATE,
    });

    const precisaResetarDiaria =
      mission.categoria === "Diaria" && (!progresso || estaExpirada(progresso));

    if (!progresso) {
      progresso = await CharacterMissionProgress.create(
        {
          id_personagem: character.id,
          id_mission: mission.id,
          expira_em: mission.categoria === "Diaria" ? new Date(Date.now() + JANELA_DIARIA_MS) : null,
        },
        { transaction },
      );
    } else if (precisaResetarDiaria) {
      progresso.progresso = 0;
      progresso.concluida = false;
      progresso.recompensa_resgatada = false;
      progresso.expira_em = new Date(Date.now() + JANELA_DIARIA_MS);
      await progresso.save({ transaction });
    }

    if (mission.tipo === "AlcancarNivel") {
      const novoProgresso = Math.min(character.nivel, mission.meta);
      if (novoProgresso !== progresso.progresso || (!progresso.concluida && character.nivel >= mission.meta)) {
        progresso.progresso = novoProgresso;
        progresso.concluida = progresso.concluida || character.nivel >= mission.meta;
        await progresso.save({ transaction });
      }
    }

    linhas.push({ mission, progresso });
  }

  return linhas;
}

// Chamado pelos pontos de evento reais do jogo (vitória em PvE, vitória
// de duelo, ouro ganho) — sempre dentro da MESMA transação da operação
// que gerou o evento, pra progresso de missão nunca ficar dessincronizado
// do resultado que o originou (ex.: dinheiro creditado mas a missão de
// "ganhar ouro" não).
async function registrarProgresso(character, tipo, quantidade, transaction) {
  const linhas = await garantirProgresso(character, transaction);

  for (const { mission, progresso } of linhas) {
    if (mission.tipo !== tipo || progresso.concluida) continue;
    progresso.progresso = Math.min(mission.meta, progresso.progresso + quantidade);
    if (progresso.progresso >= mission.meta) progresso.concluida = true;
    await progresso.save({ transaction });
  }
}

async function listarMissoes(idPersonagem, transaction) {
  const character = await Character.findByPk(idPersonagem, { transaction });
  if (!character) return [];

  const linhas = await garantirProgresso(character, transaction);
  return linhas.map(({ mission, progresso }) => ({
    id: mission.id,
    nome: mission.nome,
    descricao: mission.descricao,
    tipo: mission.tipo,
    categoria: mission.categoria,
    meta: mission.meta,
    progresso: progresso.progresso,
    concluida: progresso.concluida,
    recompensa_resgatada: progresso.recompensa_resgatada,
    expira_em: progresso.expira_em,
    recompensa_dinheiro: mission.recompensa_dinheiro,
    recompensa_xp: mission.recompensa_xp,
    recompensa_item_id: mission.recompensa_item_id,
    recompensa_item_quantidade: mission.recompensa_item_quantidade,
  }));
}

async function resgatarRecompensa(idPersonagem, idMission, transaction) {
  const mission = await Mission.findByPk(idMission, { transaction });
  if (!mission || !mission.ativa) {
    throw Object.assign(new Error("Missão não encontrada."), { statusCode: 404 });
  }

  const progresso = await CharacterMissionProgress.findOne({
    where: { id_personagem: idPersonagem, id_mission: idMission },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!progresso || !progresso.concluida) {
    throw Object.assign(new Error("Esta missão ainda não foi concluída."), { statusCode: 400 });
  }
  if (progresso.recompensa_resgatada) {
    throw Object.assign(new Error("Recompensa desta missão já foi resgatada."), { statusCode: 400 });
  }
  if (mission.categoria === "Diaria" && estaExpirada(progresso)) {
    throw Object.assign(new Error("Esta missão expirou — ela já foi renovada."), { statusCode: 400 });
  }

  const character = await Character.findByPk(idPersonagem, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!character) {
    throw Object.assign(new Error("Personagem não encontrado."), { statusCode: 404 });
  }

  concederOuro(character, mission.recompensa_dinheiro);
  await character.save({ transaction });

  const resultadoXP = mission.recompensa_xp
    ? await adicionarExperiencia(idPersonagem, mission.recompensa_xp, { transaction, personagem: character })
    : null;

  let itemConcedido = null;
  if (mission.recompensa_item_id) {
    const item = await Item.findByPk(mission.recompensa_item_id, { transaction });
    if (item) {
      let entrada = await CharacterInventory.findOne({
        where: { id_personagem: idPersonagem, id_item: item.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (entrada) {
        entrada.quantidade += mission.recompensa_item_quantidade;
        await entrada.save({ transaction });
      } else {
        entrada = await CharacterInventory.create(
          { id_personagem: idPersonagem, id_item: item.id, quantidade: mission.recompensa_item_quantidade },
          { transaction },
        );
      }
      itemConcedido = { id: item.id, nome: item.nome, quantidade: mission.recompensa_item_quantidade };
    }
  }

  progresso.recompensa_resgatada = true;
  await progresso.save({ transaction });

  return {
    dinheiro: mission.recompensa_dinheiro,
    xp: mission.recompensa_xp,
    nivel: resultadoXP?.nivel ?? character.nivel,
    item: itemConcedido,
  };
}

module.exports = { listarMissoes, registrarProgresso, resgatarRecompensa };
