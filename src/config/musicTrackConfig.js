// Painel Administrativo de Músicas — limites de upload de áudio,
// SEPARADOS dos limites de imagem/Biblioteca de Mídia
// (mediaAssetConfig.js) e do limite genérico de áudio que a Biblioteca
// de Mídia usa pra uploads avulsos: este domínio é o dono de verdade da
// música de fundo do jogo (ver "IMPORTANT" na spec).
module.exports = {
  TAMANHO_MAXIMO_BYTES: 30 * 1024 * 1024, // 30 MB (§6.3)
  TIPOS_ACEITOS: ["audio/mpeg", "audio/mp3", "audio/ogg"],
  // key de track/pool: lowercase, números, hífen, underscore (§15.1).
  REGEX_KEY_VALIDA: /^[a-z0-9][a-z0-9_-]{1,78}[a-z0-9]$/,
  FADE_MS_MINIMO: 0,
  FADE_MS_MAXIMO: 10000,
};
