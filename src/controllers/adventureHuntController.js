// Caçadas — mesmo padrão de spoilCounterController.js: só valida
// entrada superficial e formata resposta; toda regra vive nos services.
const { sequelize } = require("../config/database");
const { obterEstado, aceitarOferta, abandonarCacada } = require("../services/adventureHuntService");
const CharacterHunterProgress = require("../models/CharacterHunterProgress");
const AdventureMonster = require("../models/AdventureMonster");
const AdventureZone = require("../models/AdventureZone");
const { formatarResumoReputacao } = require("../services/hunterReputationService");
const { HUNT_DIFFICULTIES } = require("../config/huntConfig");

async function obterMonstrosEZonas(hunts, transaction) {
  const idsMonstro = [...new Set(hunts.map((h) => h?.id_monstro).filter(Boolean))];
  const idsZona = [...new Set(hunts.map((h) => h?.id_zona_referencia).filter(Boolean))];
  const [monstros, zonas] = await Promise.all([
    idsMonstro.length ? AdventureMonster.findAll({ where: { id: idsMonstro }, transaction }) : [],
    idsZona.length ? AdventureZone.findAll({ where: { id: idsZona }, transaction }) : [],
  ]);
  return {
    monstroPorId: new Map(monstros.map((m) => [m.id, m])),
    zonaPorId: new Map(zonas.map((z) => [z.id, z])),
  };
}

function formatarCacada(hunt, { monstroPorId, zonaPorId }) {
  if (!hunt) return null;
  const monstro = monstroPorId.get(hunt.id_monstro);
  const zona = zonaPorId.get(hunt.id_zona_referencia);
  const difficultyInfo = HUNT_DIFFICULTIES[hunt.difficulty];
  return {
    id: hunt.id,
    status: hunt.status,
    title: hunt.title_snapshot,
    story: hunt.story_snapshot,
    target: monstro ? { id: monstro.id, nome: monstro.nome, imagem_url: monstro.imagem_url } : null,
    zone: zona ? { id: zona.id, nome: zona.nome } : null,
    difficulty: hunt.difficulty,
    difficultyLabel: difficultyInfo?.nome ?? hunt.difficulty,
    hpModifierPercent: Math.round(hunt.hp_multiplier_snapshot * 100),
    damageModifierPercent: Math.round(hunt.damage_multiplier_snapshot * 100),
    quantityRequired: hunt.quantity_required,
    progress: hunt.progress,
    goldReward: hunt.gold_reward_snapshot,
    reputationReward: hunt.reputation_reward_snapshot,
    recommendedPower: hunt.recommended_power_snapshot,
    rotationStart: hunt.rotation_start,
    rotationEndsAt: hunt.rotation_end,
    acceptedAt: hunt.accepted_at,
    completedAt: hunt.completed_at,
  };
}

async function montarPayloadDeEstado(idPersonagem, transaction) {
  const { oferta, ativa } = await obterEstado(idPersonagem, transaction);
  const progresso = await CharacterHunterProgress.findOne({ where: { id_personagem: idPersonagem }, transaction });
  const contexto = await obterMonstrosEZonas([oferta, ativa], transaction);

  return {
    serverTime: new Date(),
    hunterReputation: formatarResumoReputacao(progresso?.reputation_points ?? 0),
    stats: {
      total: progresso?.hunts_completed_total ?? 0,
      dangerous: progresso?.hunts_completed_dangerous ?? 0,
      difficult: progresso?.hunts_completed_difficult ?? 0,
      deadly: progresso?.hunts_completed_deadly ?? 0,
      nightmare: progresso?.hunts_completed_nightmare ?? 0,
      extermination: progresso?.hunts_completed_extermination ?? 0,
    },
    offer: oferta && oferta.status === "Offered" ? formatarCacada(oferta, contexto) : null,
    activeHunt: ativa ? formatarCacada(ativa, contexto) : null,
  };
}

// GET /api/adventure-guild/hunt
exports.obterEstadoDaCacada = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const dados = await sequelize.transaction((transaction) => montarPayloadDeEstado(idPersonagem, transaction));
    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    console.error("Erro ao obter estado das Caçadas:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

// POST /api/adventure-guild/hunt/:huntId/accept
exports.aceitarCacada = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const idOferta = Number.parseInt(req.params.huntId, 10);
    await sequelize.transaction((transaction) => aceitarOferta(idPersonagem, idOferta, transaction));
    const dados = await sequelize.transaction((transaction) => montarPayloadDeEstado(idPersonagem, transaction));
    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao aceitar Caçada:", error);
    res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};

// POST /api/adventure-guild/hunt/:huntId/abandon
exports.abandonarCacadaAtiva = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const idCacada = Number.parseInt(req.params.huntId, 10);
    await sequelize.transaction((transaction) => abandonarCacada(idPersonagem, idCacada, transaction));
    const dados = await sequelize.transaction((transaction) => montarPayloadDeEstado(idPersonagem, transaction));
    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao abandonar Caçada:", error);
    res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};
