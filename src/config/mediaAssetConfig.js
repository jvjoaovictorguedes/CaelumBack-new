// Biblioteca de Mídia do Painel Administrativo — limites de upload,
// centralizados aqui (mesmo raciocínio de guildEmblemConfig.js: mudar
// num lugar só se precisar recalibrar). Sem crop/resize forçado — ao
// contrário do emblema de guilda (sempre quadrado), a biblioteca serve
// categorias com proporções bem diferentes (ícone de item vs arte de
// monstro vs banner de conjunto), então só valida, nunca deforma.
module.exports = {
  DIMENSAO_MINIMA_PX: 16,
  DIMENSAO_MAXIMA_PX: 4096,
  TAMANHO_MAXIMO_BYTES: 5 * 1024 * 1024, // 5 MB
  TIPOS_ACEITOS: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  CATEGORIAS_VALIDAS: ["Item", "Power", "Monster", "EquipmentSet", "Outro"],
  // Slug do grupo: minúsculas, números, hífen e underscore — mesmo
  // formato de "key" já usado em EquipmentSet.key, pra ficar previsível
  // como identificador em URL (/api/media/:grupo).
  REGEX_GRUPO_VALIDO: /^[a-z0-9][a-z0-9_-]{1,148}[a-z0-9]$/,
};
