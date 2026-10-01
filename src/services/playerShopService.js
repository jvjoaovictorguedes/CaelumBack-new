// Loja do Aventureiro V2 (doc "loja_aventureiro_v2_caelum_final") §4.1/
// §11/§12 — perfil comercial do personagem. Produtos continuam sendo
// MarketListing de verdade (§5/§17: "Mercado Negro e Loja do
// Aventureiro chamam o mesmo service"); aqui só lê, nunca cria/edita
// anúncio (isso é playerShopListingService.js, Fase 4).
const { Op } = require("sequelize");
const Character = require("../models/Character");
const PlayerShop = require("../models/PlayerShop");
const MarketListing = require("../models/MarketListing");
const MarketTransaction = require("../models/MarketTransaction");
const CharacterForgeProgress = require("../models/CharacterForgeProgress");
const CharacterAlchemyProgress = require("../models/CharacterAlchemyProgress");
const Item = require("../models/Item");

const NOME_MIN = 3;
const NOME_MAX = 100;
const DESCRICAO_MAX = 500;

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

function validarPerfil({ nome, descricao }) {
  if (typeof nome !== "string" || nome.trim().length < NOME_MIN || nome.trim().length > NOME_MAX) {
    throw erro(`Nome da loja precisa ter entre ${NOME_MIN} e ${NOME_MAX} caracteres.`);
  }
  if (descricao !== undefined && descricao !== null && String(descricao).length > DESCRICAO_MAX) {
    throw erro(`Descrição da loja não pode passar de ${DESCRICAO_MAX} caracteres.`);
  }
}

// Cria na primeira vez, atualiza nas seguintes — sempre o mesmo
// personagem dono (unique em id_personagem garante 1 loja por
// personagem, mesmo sob corrida: o segundo upsert concorrente vira
// UPDATE, nunca uma segunda linha).
async function criarOuAtualizarLoja(idPersonagem, dados) {
  validarPerfil(dados);
  const [loja] = await PlayerShop.upsert(
    {
      id_personagem: idPersonagem,
      nome: dados.nome.trim(),
      descricao: dados.descricao != null ? String(dados.descricao).trim() : null,
      aceita_encomendas: dados.aceita_encomendas ?? true,
      ativa: dados.ativa ?? true,
    },
    { returning: true },
  );
  return loja;
}

async function obterMinhaLoja(idPersonagem) {
  return PlayerShop.findOne({ where: { id_personagem: idPersonagem } });
}

// Perfil público completo (§11/§12: "Perfil, profissões, produtos,
// demandas, botão Solicitar Encomenda") — demandas/encomendas entram
// como contadores zerados até as Fases 5/6 existirem; o formato já
// nasce certo pro frontend não precisar mudar depois.
async function obterPerfilPublico(characterId) {
  const [loja, personagem, forja, alquimia] = await Promise.all([
    PlayerShop.findOne({ where: { id_personagem: characterId } }),
    Character.findByPk(characterId, { attributes: ["id", "nome"] }),
    CharacterForgeProgress.findByPk(characterId),
    CharacterAlchemyProgress.findByPk(characterId),
  ]);
  if (!loja) throw erro("Esse personagem não tem uma loja.", 404);
  if (!personagem) throw erro("Personagem não encontrado.", 404);

  const [produtos, transacoesConcluidas] = await Promise.all([
    MarketListing.findAll({
      where: { id_personagem_vendedor: characterId, status: "Ativo" },
      include: [{ model: Item, as: "item" }],
      order: [["createdAt", "DESC"]],
      limit: 100,
    }),
    MarketTransaction.findAll({
      where: { id_personagem_vendedor: characterId },
      attributes: ["id", "preco_total", "valor_liquido_vendedor"],
      raw: true,
    }),
  ]);

  const ouroMovimentado = transacoesConcluidas.reduce((soma, t) => soma + t.valor_liquido_vendedor, 0);

  return {
    id_personagem: characterId,
    nome_personagem: personagem.nome,
    loja: {
      nome: loja.nome,
      descricao: loja.descricao,
      aceita_encomendas: loja.aceita_encomendas,
      ativa: loja.ativa,
    },
    profissoes: {
      ferreiro: forja ? { nivel: forja.nivel, experiencia: forja.experiencia } : null,
      alquimista: alquimia ? { nivel: alquimia.nivel, experiencia: alquimia.experiencia } : null,
    },
    produtos,
    estatisticas: {
      produtos_ativos: produtos.length,
      vendas_concluidas: transacoesConcluidas.length,
      ouro_movimentado: ouroMovimentado,
      // Preenchido de verdade nas Fases 5/6 — mantém o formato estável
      // desde já pro frontend.
      demandas_concluidas: 0,
      encomendas_concluidas: 0,
      encomendas_canceladas: 0,
      encomendas_expiradas: 0,
    },
  };
}

const LIMITE_PAGINA_PADRAO = 20;
const LIMITE_PAGINA_MAXIMO = 50;

// Descoberta (§12: "Busca por nome da loja/personagem, profissão,
// aceita encomendas") — só lojas ativas aparecem aqui; a dona sempre
// consegue ver a própria mesmo inativa via obterMinhaLoja/obterPerfilPublico.
async function listarLojasPublicas({ busca, profissao, aceitaEncomendas, page, limit } = {}) {
  const limiteReal = Math.min(LIMITE_PAGINA_MAXIMO, Math.max(1, Number(limit) || LIMITE_PAGINA_PADRAO));
  const paginaReal = Math.max(1, Number(page) || 1);
  const offset = (paginaReal - 1) * limiteReal;

  const whereLoja = { ativa: true };
  if (aceitaEncomendas !== undefined) whereLoja.aceita_encomendas = aceitaEncomendas;

  let idsPorProfissao = null;
  if (profissao === "Ferreiro") {
    const linhas = await CharacterForgeProgress.findAll({ where: { nivel: { [Op.gt]: 1 } }, attributes: ["id_personagem"], raw: true });
    idsPorProfissao = linhas.map((l) => l.id_personagem);
  } else if (profissao === "Alquimista") {
    const linhas = await CharacterAlchemyProgress.findAll({ where: { nivel: { [Op.gt]: 1 } }, attributes: ["id_personagem"], raw: true });
    idsPorProfissao = linhas.map((l) => l.id_personagem);
  }
  if (idsPorProfissao) {
    if (idsPorProfissao.length === 0) {
      return { lojas: [], pagina: paginaReal, limite: limiteReal, total: 0, totalPaginas: 1 };
    }
    whereLoja.id_personagem = { [Op.in]: idsPorProfissao };
  }

  // Busca por nome da loja OU nome do personagem — precisa de OR entre
  // os dois lados (loja.nome e personagem.nome), então monta a
  // condição direto no where em vez de só no include.
  const where = { ...whereLoja };
  if (busca && busca.trim()) {
    const termo = `%${busca.trim()}%`;
    where[Op.or] = [{ nome: { [Op.iLike]: termo } }, { "$personagem.nome$": { [Op.iLike]: termo } }];
  }

  const { rows, count } = await PlayerShop.findAndCountAll({
    where,
    include: [{ model: Character, as: "personagem", attributes: ["id", "nome"] }],
    order: [["nome", "ASC"]],
    limit: limiteReal,
    offset,
    distinct: true,
    subQuery: false,
  });

  return {
    lojas: rows.map((loja) => ({
      id_personagem: loja.id_personagem,
      nome_personagem: loja.personagem?.nome ?? null,
      nome: loja.nome,
      descricao: loja.descricao,
      aceita_encomendas: loja.aceita_encomendas,
    })),
    pagina: paginaReal,
    limite: limiteReal,
    total: count,
    totalPaginas: Math.max(1, Math.ceil(count / limiteReal)),
  };
}

module.exports = {
  criarOuAtualizarLoja,
  obterMinhaLoja,
  obterPerfilPublico,
  listarLojasPublicas,
};
