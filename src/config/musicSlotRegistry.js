// Painel Administrativo de Músicas §4 — registry FECHADO de slot_keys.
// Vive em CÓDIGO, não banco: impede o Admin de criar um slot que
// nenhum frontend consome. O endpoint GET /api/admin/music/slots só
// expõe este objeto pra montar a UI; validarSlotKey() é a única porta
// de entrada usada pelos services antes de gravar um MusicAssignment.
//
// `priority` aqui é só o NOME da prioridade técnica (§2.1) — o valor
// numérico continua fixo em musicPriority.js e NUNCA é editável pelo
// Admin.
const SLOTS = {
  // Páginas (kind: PAGE, prioridade PAGE) — espelha o que
  // constants/music.ts do frontend usa hoje (ver levantamento real das
  // páginas em CaelumFront-new/src/app/dashboard/**/page.tsx).
  PAGE_ADVENTURE: { label: "Aventura", kind: "PAGE", priority: "PAGE" },
  PAGE_GUIDE: { label: "Guia do Aventureiro", kind: "PAGE", priority: "PAGE" },
  PAGE_CHARACTER: { label: "Personagem", kind: "PAGE", priority: "PAGE" },
  PAGE_INVENTORY: { label: "Inventário", kind: "PAGE", priority: "PAGE" },
  PAGE_SHOP: { label: "Loja", kind: "PAGE", priority: "PAGE" },
  PAGE_MARKET: { label: "Mercado", kind: "PAGE", priority: "PAGE" },
  PAGE_FORGE: { label: "Forja", kind: "PAGE", priority: "PAGE" },
  PAGE_GUILDS: { label: "Guildas", kind: "PAGE", priority: "PAGE" },
  PAGE_QUESTS: { label: "Missões", kind: "PAGE", priority: "PAGE" },
  PAGE_MESSAGES: { label: "Mensagens", kind: "PAGE", priority: "PAGE" },
  PAGE_BESTIARY: { label: "Bestiário", kind: "PAGE", priority: "PAGE" },
  PAGE_TAVERN: { label: "Taverna", kind: "PAGE", priority: "PAGE" },
  PAGE_PVP: { label: "PvP", kind: "PAGE", priority: "PAGE" },
  PAGE_FISHING: { label: "Pesca/Navegação", kind: "PAGE", priority: "PAGE" },
  // Mapa é POOL por natureza (sorteia entre MAPA/MAPA_MEDIEVAL) — mesmo
  // slot, o admin escolhe TRACK fixa ou mantém o POOL.
  PAGE_MAP: { label: "Mapa", kind: "PAGE", priority: "PAGE" },

  // Contextos (kind: CONTEXT) — prioridade mais alta, sobrepõe página.
  CONTEXT_COMBAT_PVE: { label: "Combate PvE/Grupo", kind: "CONTEXT", priority: "COMBAT" },
  CONTEXT_PVP: { label: "PvP", kind: "CONTEXT", priority: "PVP" },
  CONTEXT_GUILD_BOSS: { label: "Boss de Guilda", kind: "CONTEXT", priority: "BOSS" },
  CONTEXT_WORLD_BOSS: { label: "Boss Global", kind: "CONTEXT", priority: "BOSS" },
};

function listarSlots() {
  return Object.entries(SLOTS).map(([slotKey, def]) => ({ slot_key: slotKey, ...def }));
}

function existeSlot(slotKey) {
  return Object.prototype.hasOwnProperty.call(SLOTS, slotKey);
}

function obterSlot(slotKey) {
  return SLOTS[slotKey] ?? null;
}

module.exports = { SLOTS, listarSlots, existeSlot, obterSlot };
