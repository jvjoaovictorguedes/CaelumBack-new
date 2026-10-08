// Templo do Véu Celestial — Fase 2: status público da Convergência
// atual (§13.1/§13.2). Mesmo princípio de worldBossStatusService: o
// runtime lê SÓ o config_snapshot (nunca o catálogo editável), e
// estados "fechados" (DRAFT) nunca aparecem — o jogador só sabe que
// uma Convergência existe a partir de SCHEDULED.
const TempleEvent = require("../models/TempleEvent");
const CharacterInventory = require("../models/CharacterInventory");
const { EVENT_STATUS } = require("../config/templeConfig");

const STATUS_PUBLICOS = [
  EVENT_STATUS.SCHEDULED,
  EVENT_STATUS.ACTIVE,
  EVENT_STATUS.RELICARY_ONLY,
  EVENT_STATUS.ENDED,
];

// §13.1 — "Próxima Convergência: 12d 04h 31m" quando adormecido; só a
// próxima SCHEDULED/ACTIVE/RELICARY_ONLY importa pro jogador, nunca
// histórico de ENDED antigo (ver obterHistoricoRecente pra isso).
async function obterEventoAtual() {
  const aberto = await TempleEvent.findOne({
    where: { status: [EVENT_STATUS.ACTIVE, EVENT_STATUS.RELICARY_ONLY] },
    order: [["id", "DESC"]],
  });
  if (aberto) return aberto;

  return TempleEvent.findOne({
    where: { status: EVENT_STATUS.SCHEDULED },
    order: [["starts_at", "ASC"]],
  });
}

async function obterStatusPublico(characterId) {
  const evento = await obterEventoAtual();
  if (!evento) return { status: "Nenhum" };

  const snapshot = evento.config_snapshot ?? {};
  let meusSigilos = 0;
  if (characterId) {
    const entrada = await CharacterInventory.findOne({
      where: { id_personagem: characterId, id_item: evento.id_currency_item },
    });
    meusSigilos = entrada?.quantidade ?? 0;
  }

  return {
    status: evento.status,
    event_id: evento.id,
    key: evento.key,
    nome: evento.status === EVENT_STATUS.SCHEDULED ? evento.nome : (snapshot.nome ?? evento.nome),
    lore: evento.status === EVENT_STATUS.SCHEDULED ? evento.lore : (snapshot.lore ?? evento.lore),
    teaser: evento.teaser,
    imagem_url: evento.status === EVENT_STATUS.SCHEDULED ? evento.imagem_url : (snapshot.imagem_url ?? evento.imagem_url),
    starts_at: evento.starts_at,
    missions_end_at: evento.missions_end_at,
    relicary_end_at: evento.relicary_end_at,
    ended_at: evento.ended_at,
    meus_sigilos: meusSigilos,
    id_currency_item: evento.id_currency_item,
  };
}

module.exports = { obterEventoAtual, obterStatusPublico, STATUS_PUBLICOS };
