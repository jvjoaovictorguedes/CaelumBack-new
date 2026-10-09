const number = value => Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const cell = value => String(value ?? "").replace(/[|\r\n<>]/g, " ");
function table(headers, rows) {
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map(row => `| ${row.map(cell).join(" | ")} |`)].join("\n");
}
function article(slug, titulo, kind, categoria, parts, extra = {}) {
  return { id: slug, slug, titulo, kind, categoria, resumo: null, imagem_url: null, ordem: 0, conteudo: parts.filter(Boolean).join("\n\n"), ...extra };
}
module.exports = { number, cell, table, article };
