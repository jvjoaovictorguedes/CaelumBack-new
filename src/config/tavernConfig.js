// Sistema de Taverna (Caelum_Taverna_Claude.docx) §6/§10 — whitelists e
// parâmetros seguros. O banco NUNCA guarda fórmulas/nomes livres
// executáveis: toda buff_key/presentation_key/choice_key precisa bater
// com uma destas listas antes de ser aceita ou aplicada.

// §6 — cada chave é consumida por UM domínio específico (ver
// tavernBuffService.bonusesAtivosPara); nenhum controller central
// conhece a fórmula de cada uma.
const TAVERN_BUFF_KEYS = [
  "MAX_HP_PCT",
  "MAX_MANA_PCT",
  "PVE_DAMAGE_PCT",
  "PVE_DEFENSE_PCT",
  "ADVENTURE_XP_PCT",
  "EXPEDITION_XP_PCT",
  "FORGE_XP_PCT",
  "ALCHEMY_XP_PCT",
  "FISHING_CONTROL_PCT",
];

// Magnitude clamped por chave (§6: "Magnitude deve ser clamped por
// chave no backend") — a Taverna vende conveniência temporária paga em
// Gold, nunca poder permanente, então o teto fica bem abaixo do que um
// item de equipamento/refinamento entregaria.
const MAGNITUDE_MAXIMA_POR_CHAVE = {
  MAX_HP_PCT: 25,
  MAX_MANA_PCT: 25,
  PVE_DAMAGE_PCT: 20,
  PVE_DEFENSE_PCT: 20,
  ADVENTURE_XP_PCT: 25,
  EXPEDITION_XP_PCT: 25,
  FORGE_XP_PCT: 25,
  ALCHEMY_XP_PCT: 25,
  FISHING_CONTROL_PCT: 25,
};

function magnitudeMaximaPara(buffKey) {
  return MAGNITUDE_MAXIMA_POR_CHAVE[buffKey] ?? 0;
}

const CATEGORIAS_CARDAPIO = ["Refeicao", "Bebida"];

// §9 — apresentação visual do jogo 50/50; TODOS usam o MESMO motor
// (tavernGameService), só a apresentação/escolhas mudam.
const PRESENTATION_KEYS = ["COIN", "RUNES", "DICE_PARITY", "CARD_SIDE"];
const CHOICES_POR_PRESENTATION = {
  COIN: ["HEADS", "TAILS"],
  RUNES: ["GOLD", "SHADOW"],
  DICE_PARITY: ["EVEN", "ODD"],
  CARD_SIDE: ["LEFT", "RIGHT"],
};

const OUTCOMES = ["Win", "Lose"];
const ESCALA_PPM = 1_000_000;

// §10 — GameSettings operacionais/econômicos da Taverna, com o mesmo
// default hardcoded usado como fallback por gameSettingCache.obter
// antes de qualquer admin salvar uma config (mesmo padrão de
// spoilConfig/huntConfig).
const GAME_SETTINGS_DEFAULT = {
  "tavern.rest.base_gold": 20,
  "tavern.rest.level_factor": 4,
  "tavern.rest.missing_resource_factor": 120,
  "tavern.rest.minimum_gold": 10,
  "tavern.games.max_bet_global": 5000,
  "tavern.games.daily_wager_limit": 0,
  "tavern.enabled": true,
};

module.exports = {
  TAVERN_BUFF_KEYS,
  MAGNITUDE_MAXIMA_POR_CHAVE,
  magnitudeMaximaPara,
  CATEGORIAS_CARDAPIO,
  PRESENTATION_KEYS,
  CHOICES_POR_PRESENTATION,
  OUTCOMES,
  ESCALA_PPM,
  GAME_SETTINGS_DEFAULT,
};
