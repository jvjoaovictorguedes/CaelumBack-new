// Wiki do Jogo — leitura pública (qualquer jogador logado). Só mostra
// artigos publicado=true, nunca rascunho (mesmo espírito de
// patchNotesController: o que "está no ar" pro admin nem sempre é o
// que já foi liberado pro jogador ver).
const WikiArticle = require("../models/WikiArticle");

// GET /api/wiki — lista tudo publicado, agrupado por categoria (ordem
// de categoria = ordem alfabética; dentro da categoria, campo `ordem`
// do artigo). Sem paginação de propósito: é um índice pra navegação em
// sidebar, não uma lista que cresce sem limite feito Mercado/Inventário.
exports.listarArtigos = async (req, res) => {
  try {
    const artigos = await WikiArticle.findAll({
      where: { publicado: true },
      attributes: ["id", "categoria", "slug", "titulo", "resumo", "imagem_url", "ordem"],
      order: [["categoria", "ASC"], ["ordem", "ASC"], ["id", "ASC"]],
    });

    const porCategoria = new Map();
    for (const artigo of artigos) {
      if (!porCategoria.has(artigo.categoria)) porCategoria.set(artigo.categoria, []);
      porCategoria.get(artigo.categoria).push(artigo);
    }
    const categorias = Array.from(porCategoria.entries()).map(([categoria, itens]) => ({ categoria, artigos: itens }));

    res.status(200).json({ status: "success", data: { categorias } });
  } catch (error) {
    console.error("Erro ao listar artigos da Wiki:", error);
    res.status(500).json({ message: "Erro interno do servidor ao listar artigos da Wiki." });
  }
};

// GET /api/wiki/:slug — um artigo publicado por slug. 404 tanto pra
// slug inexistente quanto pra artigo em Rascunho — um jogador não pode
// distinguir "não existe" de "ainda não publicado" batendo direto na
// URL.
exports.obterArtigo = async (req, res) => {
  try {
    const artigo = await WikiArticle.findOne({ where: { slug: req.params.slug, publicado: true } });
    if (!artigo) return res.status(404).json({ message: "Artigo não encontrado." });
    res.status(200).json({ status: "success", data: { artigo } });
  } catch (error) {
    console.error("Erro ao buscar artigo da Wiki:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar artigo da Wiki." });
  }
};
