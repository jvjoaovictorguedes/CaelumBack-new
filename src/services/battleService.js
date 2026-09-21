const { Op } = require("sequelize");
const Battle = require("../models/Battle");
const BattleParticipant = require("../models/BattleParticipant");

function calcularDistancia(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  return Math.sqrt(dx * dx + dy * dy);
}

function calcularPosicaoDeAtaque(atacante, alvo, distancia = 100) {
  const dx = alvo.x - atacante.x;
  const dy = alvo.y - atacante.y;

  const tamanho = Math.sqrt(dx * dx + dy * dy);

  if (tamanho === 0) {
    return {
      x: alvo.x - distancia,
      y: alvo.y,
    };
  }

  return {
    x: alvo.x - (dx / tamanho) * distancia,
    y: alvo.y - (dy / tamanho) * distancia,
  };
}

async function buscarBatalha(battleId) {
  return Battle.findByPk(battleId, {
    include: [
      {
        model: BattleParticipant,
        as: "participants",
      },
    ],
  });
}

async function criarBatalha({ jogador, inimigo }) {
  const battle = await Battle.create({
    status: "active",
    turn_number: 1,
  });

  await BattleParticipant.create({
    battle_id: battle.id,
    character_id: jogador.id,
    unit_type: "player",
    team: "allies",

    name: jogador.nome,
    level: jogador.nivel,

    hp: jogador.vida_atual,
    max_hp: jogador.vida_maxima,

    mana: jogador.mana_atual || 0,
    max_mana: jogador.mana_maxima || 0,

    x: 300,
    y: 380,
  });

  await BattleParticipant.create({
    battle_id: battle.id,
    enemy_id: inimigo.id_monstro ?? null,
    unit_type: "enemy",
    team: "enemies",

    name: inimigo.nome,
    level: inimigo.nivel,

    hp: inimigo.vida_atual,
    max_hp: inimigo.vida_maxima,

    mana: 0,
    max_mana: 0,

    x: 720,
    y: 240,
  });

  return buscarBatalha(battle.id);
}

async function adicionarAliado({ battleId, character }) {
  const battle = await buscarBatalha(battleId);

  if (!battle) {
    throw new Error("Batalha não encontrada.");
  }

  if (battle.status !== "active") {
    throw new Error("Essa batalha não está ativa.");
  }

  const jaEstaNaBatalha = battle.participants.some(
    (participant) => participant.character_id === character.id,
  );

  if (jaEstaNaBatalha) {
    return battle;
  }

  const aliados = battle.participants.filter((p) => p.team === "allies");

  const index = aliados.length;

  await BattleParticipant.create({
    battle_id: battle.id,
    character_id: character.id,

    unit_type: "player",
    team: "allies",

    name: character.nome,
    level: character.nivel,

    hp: character.vida_atual,
    max_hp: character.vida_maxima,

    mana: character.mana_atual || 0,
    max_mana: character.mana_maxima || 0,

    // posições iniciais dos aliados
    x: 220 + index * 140,
    y: 400,
  });

  return buscarBatalha(battleId);
}

async function moverParaAtaque({ battleId, attackerId, targetId }) {
  const battle = await buscarBatalha(battleId);

  if (!battle) {
    throw new Error("Batalha não encontrada.");
  }

  const atacante = battle.participants.find((p) => p.id === attackerId);

  const alvo = battle.participants.find((p) => p.id === targetId);

  if (!atacante || !alvo) {
    throw new Error("Participante não encontrado.");
  }

  const novaPosicao = calcularPosicaoDeAtaque(atacante, alvo, 100);

  await atacante.update({
    x: novaPosicao.x,
    y: novaPosicao.y,
  });

  return {
    attackerId,
    targetId,
    from: {
      x: atacante.x,
      y: atacante.y,
    },
    to: novaPosicao,
  };
}

module.exports = {
  buscarBatalha,
  criarBatalha,
  adicionarAliado,
  calcularDistancia,
  calcularPosicaoDeAtaque,
  moverParaAtaque,
};
