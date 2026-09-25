// Navegação — fatia MÍNIMA da Fase 5 (spec §18, escopo reduzido: ver
// relatório final). Gate de acesso a FishingZone via Porto -> Embarcação
// -> Rota Marítima; viagem instantânea (spec §18.3 permite
// explicitamente na V1: "sem criar combustível").
const { sequelize } = require("../config/database");
const Vessel = require("../models/Vessel");
const CharacterVessel = require("../models/CharacterVessel");
const FishingPort = require("../models/FishingPort");
const MarineRoute = require("../models/MarineRoute");
const FishingZone = require("../models/FishingZone");
const WorldMapConnection = require("../models/WorldMapConnection");
const CharacterNavigationState = require("../models/CharacterNavigationState");
const Character = require("../models/Character");
const { garantirProgresso } = require("./fishingProgressionService");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

async function listarPortos() {
  return FishingPort.findAll({ where: { ativo: true } });
}

async function listarEmbarcacoes(characterId) {
  const [catalogo, posse] = await Promise.all([
    Vessel.findAll({ where: { ativo: true }, order: [["tier", "ASC"]] }),
    CharacterVessel.findAll({ where: { id_personagem: characterId } }),
  ]);
  const possuidas = new Set(posse.map((p) => p.id_vessel));
  return catalogo.map((v) => ({ ...v.toJSON(), possuida: possuidas.has(v.id) }));
}

async function listarRotas() {
  return MarineRoute.findAll({
    where: { ativo: true },
    include: [
      { model: WorldMapConnection, foreignKey: "id_world_connection" },
      { model: FishingPort, as: "portoOrigem" },
      { model: FishingZone, as: "zonaDestino" },
    ],
  });
}

async function adquirirEmbarcacao(characterId, vesselId) {
  return sequelize.transaction(async (transaction) => {
    const vessel = await Vessel.findOne({ where: { id: vesselId, ativo: true }, transaction });
    if (!vessel) throw erro("Embarcação não encontrada.", 404);

    const progresso = await garantirProgresso(characterId, transaction);
    if (progresso.nivel < vessel.nivel_pesca_minimo) {
      throw erro(`Exige Nível de Pesca ${vessel.nivel_pesca_minimo}.`, 400);
    }

    const character = await Character.findByPk(characterId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!character) throw erro("Personagem não encontrado.", 404);
    if (vessel.preco > 0) {
      if (character.dinheiro < vessel.preco) throw erro("Ouro insuficiente.", 400);
      character.dinheiro -= vessel.preco;
      await character.save({ transaction });
    }

    const [posse, criado] = await CharacterVessel.findOrCreate({
      where: { id_personagem: characterId, id_vessel: vesselId },
      defaults: { id_personagem: characterId, id_vessel: vesselId },
      transaction,
    });
    if (!criado) throw erro("Você já possui essa embarcação.", 400);
    return posse;
  });
}

// POST /api/fishing/navigation/travel — { routeId } — valida barco apto
// + rota ativa (spec §18.3) e troca CharacterNavigationState. V1: viagem
// instantânea, sem tempo/combustível.
async function viajar(characterId, routeId) {
  return sequelize.transaction(async (transaction) => {
    const rota = await MarineRoute.findOne({
      where: { id: routeId, ativo: true },
      transaction,
    });
    if (!rota) throw erro("Rota marítima não encontrada ou inativa.", 404);

    const conexao = await WorldMapConnection.findByPk(rota.id_world_connection, { transaction });
    if (!conexao || !conexao.ativo || conexao.tipo !== "RotaMaritima") {
      throw erro("Rota inválida.", 400);
    }

    const embarcacoes = await CharacterVessel.findAll({
      where: { id_personagem: characterId },
      include: [{ model: Vessel, as: "vessel" }],
      transaction,
    });
    const temBarcoApto = embarcacoes.some((e) => (e.vessel?.tier ?? 0) >= rota.min_vessel_tier);
    if (!temBarcoApto) {
      throw erro(`Você precisa de uma embarcação tier ${rota.min_vessel_tier} ou superior para essa rota.`, 400);
    }

    const zona = await FishingZone.findByPk(rota.id_zone_destino, { transaction });
    if (!zona || !zona.ativo) throw erro("Zona de destino indisponível.", 400);

    await CharacterNavigationState.upsert(
      { id_personagem: characterId, id_port_atual: rota.id_port_origem, id_zone_atual: zona.id },
      { transaction },
    );
    return { id_zone_atual: zona.id, id_port_atual: rota.id_port_origem };
  });
}

async function obterEstado(characterId) {
  const estado = await CharacterNavigationState.findOne({ where: { id_personagem: characterId } });
  return estado ?? { id_personagem: characterId, id_port_atual: null, id_zone_atual: null };
}

module.exports = { listarPortos, listarEmbarcacoes, listarRotas, adquirirEmbarcacao, viajar, obterEstado };
