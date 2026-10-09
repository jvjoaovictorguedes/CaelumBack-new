const { number: n, table, article } = require("./wikiContent");
function buildCraftingArticles({ forge, alchemy, legacy }) {
  const articles = [];
  for (const r of forge) {
    if (r.requires_recipe && !r.recipe_learned) continue;
    articles.push(article(`fabricacao-${r.id}`, r.nome, "recipe", "Fabricação de equipamentos", [
      "Modelo da Forja: o equipamento escolhido mantém sua identidade e tier; a qualidade final da cópia é resolvida pela fabricação.",
      table(["Requisito", "Valor"], [["Profissão", "Ferreiro"], ["Nível mínimo", n(r.nivel_forja_minimo)], ["Categoria", r.categoria_equipamento], ["Tier", r.tier_equipamento ? n(r.tier_equipamento) : "Não definido"], ["Aprendizado", r.requires_recipe ? "Receita já aprendida" : "Modelo automático"]]),
      "## Materiais e tempo por qualidade", table(["Qualidade dos materiais", "Ingredientes necessários", "Tempo estimado (segundos)"], r.variantes.map(v => [v.qualidade_exibicao || v.qualidade, v.ingredientes.map(i => `${n(i.quantidade_necessaria)} × ${i.nome_item || i.nome_recurso}`).join("; "), n(v.tempo_segundos)])),
      "## Prévia da qualidade final", table(["Materiais", "Resultados possíveis e chances base"], r.variantes.map(v => [v.qualidade_exibicao || v.qualidade, Object.entries(v.chances_percentual).map(([quality, chance]) => `${quality}: ${n(chance)}%`).join("; ")])),
      "As quantidades são os materiais exigidos pela prévia. Tempo e chances usam a prévia do seu nível de Forja; ferramentas e outros bônus podem alterar o resultado ao iniciar. Esta ficha não revela a qualidade sorteada de uma fabricação em andamento.",
      "Fabricação e refinamento compartilham o slot da Forja. Aguarde a conclusão e colete o equipamento na [Forja](/dashboard/forge).",
    ], { resumo: `Forja · nível ${r.nivel_forja_minimo} · ${r.categoria_equipamento}`, imagem_url: r.imagem_url, recipe_type: "Forja" }));
  }
  for (const r of alchemy) {
    if (!r.resultado || (r.modo_desbloqueio === "DESCOBERTA" && !r.desbloqueada)) continue;
    articles.push(article(`alquimia-${r.id}`, r.nome, "recipe", "Alquimia", [
      r.descricao,
      table(["Propriedade", "Valor"], [["Resultado", `${n(r.resultado.quantidade)} × ${r.resultado.nome}`], ["Nível de Alquimia", n(r.nivel_alquimia_minimo)], ["Gold por preparação", n(r.custo_ouro)], ["XP base de Alquimia", n(r.xp_alquimia)], ["Aprendizado", r.modo_desbloqueio === "DESCOBERTA" ? "Fórmula já aprendida" : "Liberação por nível"]]),
      "## Ingredientes por preparação", table(["Item", "Quantidade"], r.ingredientes.map(i => [i.nome, n(i.quantidade_necessaria)])),
      "Os custos e quantidades são por preparação. Em um lote, confira o total antes de confirmar. O nível de Alquimia é independente do nível de Forja e do nível do personagem.",
      "Abra o [Caldeirão na Forja](/dashboard/forge) para preparar a fórmula. Ter a receita visível por nível não significa que você já possui o nível, os materiais ou o gold necessários.",
    ], { resumo: `Alquimia · nível ${r.nivel_alquimia_minimo} · ${r.resultado.nome}`, imagem_url: r.resultado.imagem_url, recipe_type: "Alquimia" }));
  }
  for (const r of legacy) {
    if (!r.item || r.item.ativo === false) continue;
    articles.push(article(`receita-fixa-${r.id}`, r.item.nome, "recipe", "Receitas de fabricação fixa", [
      r.item.descricao,
      table(["Propriedade", "Valor"], [["Resultado", r.item.nome], ["Gold", n(r.ouro_custo)], ["Tempo (segundos)", n(r.tempo_segundos)]]),
      "## Materiais", table(["Item", "Quantidade"], r.ingredientes.map(i => [i.material?.nome || "Material não disponível", n(i.quantidade)])),
      "Esta é a receita fixa cadastrada: seu resultado é o item indicado. Ela usa o fluxo de fabricação fixa, distinto da qualidade sorteada dos modelos de equipamento. Confirme a disponibilidade e os custos na [Forja](/dashboard/forge).",
    ], { resumo: `Receita fixa · ${r.item.nome} · ${n(r.ouro_custo)} de gold`, imagem_url: r.item.imagem_url, recipe_type: "Fixa" }));
  }
  return articles;
}
module.exports = { buildCraftingArticles };
