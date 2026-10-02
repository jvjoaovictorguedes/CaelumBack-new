// Busca pública de itens (qualquer jogador logado) — pedido do jogador:
// "nenhum jogador sabe id do produto". Usada pelos seletores de item da
// Loja do Aventureiro (Publicar demanda / Nova encomenda), onde o alvo
// é "qualquer item do jogo", não só o que já está no próprio inventário
// (esse caso usa GET /inventory/v2, nunca esta busca). Mesma filtragem
// de elegibilidade que marketService/playerShopDemandService já aplicam
// na hora de CRIAR (QuestItem/Currencia fora, só negociavel_mercado) —
// nunca deixar o jogador escolher aqui algo que o backend ia rejeitar
// na hora de publicar.
const { Op } = require("sequelize");
const Item = require("../models/Item");
const { TIPOS_INSTANCIAVEIS } = require("./equipmentInstanceService");

const LIMITE_RESULTADOS = 30;
const TIPOS_NUNCA_NEGOCIAVEIS = ["QuestItem", "Currencia"];

async function buscarItensNegociaveis({ busca, apenasEstocaveis } = {}) {
  // Demanda (diferente de Encomenda) não aceita equipamento — ver
  // playerShopDemandService.criarDemanda ("use Encomenda para isso").
  const tiposExcluidos = apenasEstocaveis
    ? [...TIPOS_NUNCA_NEGOCIAVEIS, ...TIPOS_INSTANCIAVEIS]
    : TIPOS_NUNCA_NEGOCIAVEIS;

  const where = {
    ativo: true,
    negociavel_mercado: true,
    tipo_item: { [Op.notIn]: tiposExcluidos },
  };

  const termo = typeof busca === "string" ? busca.trim() : "";
  if (termo) {
    where.nome = { [Op.iLike]: `%${termo}%` };
  }

  const itens = await Item.findAll({
    where,
    attributes: ["id", "nome", "tipo_item", "raridade", "imagem_url"],
    order: [["nome", "ASC"]],
    limit: LIMITE_RESULTADOS,
  });

  return itens;
}

module.exports = { buscarItensNegociaveis };
