// Painel Administrativo de Músicas §2.1 — prioridades TÉCNICAS,
// nunca editáveis pelo Admin (evita configuração acidental em que uma
// página sobreponha um Boss/PvP). Espelha exatamente
// CaelumFront-new/src/constants/music.ts (MUSIC_PRIORITY) — se um dia
// mudar lá, muda aqui também.
const MUSIC_PRIORITY = {
  PAGE: 10,
  AREA: 20,
  COMBAT: 50,
  PVP: 60,
  BOSS: 100,
};

module.exports = { MUSIC_PRIORITY };
