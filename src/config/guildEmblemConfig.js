// Fila: upload de emblema de guilda — tamanho e regras exigidas do
// jogador, centralizadas aqui (nunca espalhadas por controller/service/
// frontend) pra mudar num lugar só se precisar recalibrar.
module.exports = {
  // Quadrado, sempre — normalizado pra esse tamanho final depois de
  // validado (nunca fica "do jeito que o jogador mandou").
  DIMENSAO_FINAL_PX: 256,
  // Abaixo disso a imagem já nasce borrada quando ampliada pro tamanho
  // final; acima disso é upload desnecessariamente pesado pra um ícone.
  DIMENSAO_MINIMA_PX: 128,
  DIMENSAO_MAXIMA_PX: 2048,
  TAMANHO_MAXIMO_BYTES: 3 * 1024 * 1024, // 3 MB
  // Tolerância de proporção: a imagem PRECISA estar enquadrada em
  // quadrado (o jogador é avisado disso no frontend) — uma pequena
  // folga (5%) só absorve arredondamento de exportação, nunca deixa
  // passar uma foto claramente retangular.
  TOLERANCIA_PROPORCAO: 0.05,
  TIPOS_ACEITOS: ["image/png", "image/jpeg", "image/webp"],
};
