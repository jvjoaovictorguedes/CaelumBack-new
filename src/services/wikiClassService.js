const { Op } = require("sequelize");

const attributes = {
  forca: "Força", vitalidade: "Vitalidade", agilidade: "Agilidade",
  inteligencia: "Inteligência", velocidade: "Velocidade",
};
const label = value => String(value ?? "").replace(/[|\r\n<>]/g, " ");
const number = value => Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(row => `| ${row.map(label).join(" | ")} |`),
  ].join("\n");
}
function requirementLabel(requirement, items, discoveries) {
  const amount = number(requirement.quantidade);
  switch (requirement.tipo) {
    case "LEVEL": return `Nível ${amount}`;
    case "GOLD": return `${amount} de gold (consumido ao evoluir)`;
    case "ITEM": return `${amount} × ${items.get(requirement.reference_id)?.nome ?? "Item não disponível no catálogo"} (consumido ao evoluir)`;
    case "MONSTER_KILL": return `Derrotar ${amount} × ${discoveries.has(requirement.reference_key) ? requirement.reference_key : "criatura ainda não descoberta"}`;
    case "ADVENTURE_GUILD_RANK": return `Rank ${label(requirement.reference_key)} na Guilda dos Aventureiros`;
    case "ACHIEVEMENT": return `Conquista: ${label(requirement.reference_key)}`;
    case "REPUTATION": return "Requisito de reputação sem avaliação disponível; consulte a tela de evolução.";
    case "QUEST": return "Requisito de missão sem avaliação disponível; consulte a tela de evolução.";
    default: return "Requisito não reconhecido; consulte a tela de evolução.";
  }
}
// Only active, complete lineages are public. An inactive ancestor hides its descendants.
function publicPaths(classes, paths) {
  const classIds = new Set(classes.map(c => c.id));
  const byId = new Map(paths.filter(p => p.ativo && classIds.has(p.id_classe)).map(p => [p.id, p]));
  const valid = (path, visiting = new Set()) => {
    if (visiting.has(path.id)) return false;
    if (path.estagio === 1) return !path.id_evolucao_pai;
    const parent = byId.get(path.id_evolucao_pai);
    if (!parent || parent.id_classe !== path.id_classe || parent.estagio !== path.estagio - 1) return false;
    return valid(parent, new Set([...visiting, path.id]));
  };
  return [...byId.values()].filter(p => valid(p));
}
function buildClassArticles({ classes, paths, requirements, abilities, items, powers, discoveries }) {
  const visible = publicPaths(classes, paths);
  const itemMap = new Map(items.map(i => [i.id, i]));
  const powerMap = new Map(powers.filter(p => p.usage_scope !== "MONSTER" && p.acquisition_scope !== "UNIQUE_FEAT").map(p => [p.id, p]));
  return classes.filter(c => c.ativo).map(c => {
    const lineage = visible.filter(p => p.id_classe === c.id);
    const content = [
      c.descricao || "Os cronistas ainda não registraram a história desta classe.",
      `## Identidade\nPapel: **${label(c.papel) || "Não definido"}**. Atributo principal: **${attributes[String(c.atributo_principal).toLowerCase()] || label(c.atributo_principal) || "Não definido"}**. Secundário: **${attributes[String(c.atributo_secundario).toLowerCase()] || label(c.atributo_secundario) || "Não definido"}**.`,
      c.disponivel_criacao ? "Disponível na criação de personagem, respeitando as regras de desbloqueio do jogo." : "Não está disponível na criação de personagem.",
      "## Multiplicadores atuais", table(["Vida", "Mana", "Dano físico", "Dano mágico"], [[...[
        "multiplicador_vida_por_nivel", "multiplicador_mana_por_nivel", "multiplicador_dano_fisico", "multiplicador_dano_magico",
      ].map(key => `${number(c[key])}×`)]]),
      "## Caminhos de evolução",
      "Você escolhe um caminho por estágio. A escolha é definitiva e os próximos estágios seguem a linhagem escolhida. Gold e itens exigidos são consumidos; nível, abates, rank e conquistas são condições verificadas. A Wiki explica o cadastro: a tela de evolução verifica seu progresso e confirma se você pode evoluir.",
      ...(lineage.length ? [table(["Evolução", "Estágio", "Origem"], lineage.map(p => [p.nome, p.estagio, p.id_evolucao_pai ? lineage.find(parent => parent.id === p.id_evolucao_pai)?.nome : c.nome]))] : ["Nenhum caminho de evolução ativo foi cadastrado para esta classe."]),
    ];
    for (const path of lineage) {
      const required = requirements.filter(r => r.id_evolucao === path.id);
      const unlocked = abilities.filter(a => a.id_evolucao === path.id && powerMap.has(a.id_power));
      content.push(`## ${label(path.nome)} — estágio ${path.estagio}`, path.descricao,
        "### Requisitos", required.length ? required.map(r => `- ${requirementLabel(r, itemMap, discoveries)}`).join("\n") : "Nenhum requisito adicional cadastrado. A classe, o estágio e a linhagem continuam sendo validados.",
        "### Bônus permanentes", table(["Atributo", "Bônus"], Object.entries(attributes).map(([key, name]) => [name, number(path[`bonus_${key}`])])),
        "### Habilidades da evolução");
      if (!unlocked.length) content.push("Nenhuma habilidade disponível cadastrada para esta evolução.");
      for (const binding of unlocked) {
        const power = powerMap.get(binding.id_power);
        content.push(`#### ${label(power.nome)}`, power.descricao,
          table(["Propriedade", "Valor base"], [["Tipo", power.tipo_poder], ["Natureza do dano", power.tipo_dano], ["Dano", number(power.dano_base)], ["Cura", number(power.cura_base)], ["Escalamento", `${number(power.valor_escala)} × ${attributes[String(power.escala_atributo).toLowerCase()] || power.escala_atributo}`], ["Mana", number(power.custo_mana)], ["Recarga (turnos)", number(power.cooldown)]]),
          binding.auto_conceder ? "Aprendida automaticamente ao adquirir esta evolução." : "Vinculada à evolução, sem concessão automática configurada.",
          binding.auto_conceder && binding.ativar_se_houver_slot ? "A ativação automática exige um slot livre; o limite de combate continua sendo respeitado." : "Organize suas habilidades na tela de combate após aprender.");
      }
    }
    content.push("Os valores são do cadastro atual. Dano base e escalamento não representam dano final: atributos, nível da habilidade, multiplicadores, defesa e demais efeitos entram no combate.");
    return { id: `classe-${c.id}`, slug: `classe-${c.id}`, titulo: c.nome, categoria: "Classes e evoluções", kind: "class", resumo: c.descricao, imagem_url: c.banner_url || c.imagem_url || c.icone_url || null, ordem: c.ordem_exibicao, conteudo: content.join("\n\n") };
  });
}
async function getClassArticles(classes, kills, models) {
  if (!classes.length) return [];
  const paths = await models.EvolutionPath.findAll({ where: { ativo: true, id_classe: { [Op.in]: classes.map(c => c.id) } }, order: [["estagio", "ASC"], ["ordem", "ASC"]], raw: true });
  const visible = publicPaths(classes, paths);
  const ids = visible.map(p => p.id);
  const [requirements, abilities] = ids.length ? await Promise.all([
    models.EvolutionRequirement.findAll({ where: { id_evolucao: { [Op.in]: ids } }, order: [["ordem", "ASC"], ["id", "ASC"]], raw: true }),
    models.EvolutionAbility.findAll({ where: { id_evolucao: { [Op.in]: ids } }, raw: true }),
  ]) : [[], []];
  const itemIds = requirements.filter(r => r.tipo === "ITEM" && r.reference_id).map(r => r.reference_id);
  const powerIds = abilities.map(a => a.id_power);
  const [items, powers] = await Promise.all([
    itemIds.length ? models.Item.findAll({ where: { id: { [Op.in]: itemIds } }, attributes: ["id", "nome"], raw: true }) : [],
    powerIds.length ? models.Power.findAll({ where: { id: { [Op.in]: powerIds } }, raw: true }) : [],
  ]);
  return buildClassArticles({ classes, paths: visible, requirements, abilities, items, powers, discoveries: new Set(kills.map(k => k.nome_monstro)) });
}
module.exports = { buildClassArticles, getClassArticles, publicPaths };
