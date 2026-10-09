const { Op } = require("sequelize");
const { publicPaths } = require("./wikiClassService");
const levels = require("./abilityLevelService");
const modifiers = require("../config/combatModifierConfig");
const triggers = require("../config/combatTriggerConfig");
const { definicaoDoStatus } = require("../config/statusEffectConfig");

const attributes = { Forca: "Força", Vitalidade: "Vitalidade", Agilidade: "Agilidade", Inteligencia: "Inteligência", Velocidade: "Velocidade" };
const n = value => Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const safe = value => String(value ?? "").replace(/[|\r\n<>]/g, " ");
const table = (headers, rows) => [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map(row => `| ${row.map(safe).join(" | ")} |`)].join("\n");
const statusName = key => definicaoDoStatus(key)?.nomeUi || "Status não identificado";
function effectCondition(effect) {
  const config = effect.condition_config || {};
  switch (effect.condition_key) {
    case "SELF_HP_BELOW_PCT": return `Sua vida abaixo de ${n(config.limite_pct)}%`;
    case "TARGET_HP_BELOW_PCT": return `Vida do alvo abaixo de ${n(config.limite_pct)}%`;
    case "SELF_HAS_STATUS": return `Você está sob ${statusName(config.status_key)}`;
    case "TARGET_HAS_STATUS": return `Alvo está sob ${statusName(config.status_key)}`;
    case "TARGET_HAS_DEBUFF_GROUP": return "Alvo possui o grupo de penalidades exigido pelo efeito";
    case null: case undefined: case "": return "Sem condição adicional";
    default: return "Condicional; depende das regras do efeito";
  }
}
function sourceLabels(power, data) {
  const result = [];
  for (const b of data.classBindings.filter(b => b.id_poder === power.id)) {
    const c = data.classes.find(c => c.id === b.id_classe && c.ativo);
    if (c) result.push(`Classe ${c.nome}: nível ${n(b.nivel_aprendizagem)}${b.custo_ouro == null ? ", liberação gratuita" : `, compra por ${n(b.custo_ouro)} de gold`}`);
  }
  for (const b of data.raceBindings.filter(b => b.id_power === power.id)) {
    const r = data.races.find(r => r.id === b.id_raca);
    if (r) result.push(`Raça ${r.nome_masculino} / ${r.nome_feminino}: nível ${n(b.nivel_aprendizado)}${b.custo_ouro == null ? ", liberação gratuita" : `, compra por ${n(b.custo_ouro)} de gold`}`);
  }
  for (const b of data.natureBindings.filter(b => b.id_poder === power.id)) {
    result.push(`Natureza mágica ${b.natureza_magica}: nível ${n(b.nivel_aprendizagem)}${b.custo_ouro == null ? ", liberação gratuita" : `, compra por ${n(b.custo_ouro)} de gold`}. Quando houver uma evolução vinculada na árvore mágica de sua classe, adquira essa evolução primeiro.`);
  }
  for (const e of data.magicEvolutions.filter(e => e.id_power_concedido === power.id)) {
    const c = data.classes.find(c => c.id === e.id_classe);
    const parent = data.magicEvolutions.find(p => p.id === e.id_evolucao_pre_requisito);
    result.push(`Árvore mágica: ${e.nome} (${c.nome}, natureza ${e.natureza_magica}), nível ${n(e.nivel_necessario)}, ${n(e.custo)} de gold${e.id_evolucao_pre_requisito ? `; exige a evolução ${parent?.nome || "anterior da árvore"}` : ""}`);
  }
  for (const b of data.evolutionBindings.filter(b => b.id_power === power.id)) {
    const p = data.paths.find(p => p.id === b.id_evolucao);
    const c = p && data.classes.find(c => c.id === p.id_classe);
    if (p) result.push(`Evolução ${p.nome} (${c.nome}, estágio ${p.estagio}): ${b.auto_conceder ? "aprendida ao adquirir a evolução" : "sem concessão automática configurada"}`);
  }
  for (const b of data.books.filter(b => b.id_power === power.id && b.ativo)) {
    const item = data.items.find(i => i.id === b.id_item && i.tipo_item === "LivroHabilidade");
    if (!item) continue;
    const constraints = [];
    if (b.nivel_minimo) constraints.push(`nível ${n(b.nivel_minimo)}`);
    if (b.id_classe) constraints.push(`classe ${data.classes.find(c => c.id === b.id_classe)?.nome || "exigida pelo livro"}`);
    if (b.id_raca) constraints.push(`raça ${data.races.find(r => r.id === b.id_raca)?.nome_masculino || "exigida pelo livro"}`);
    if (b.natureza_magica) constraints.push(`natureza mágica ${b.natureza_magica}`);
    if (b.id_power_prerequisito) constraints.push(`habilidade prévia ${data.publicPowerNames.get(b.id_power_prerequisito) || "ainda não revelada"}${b.nivel_power_prerequisito ? ` no nível ${n(b.nivel_power_prerequisito)}` : ""}`);
    result.push(`Livro ${item.nome}${constraints.length ? `: ${constraints.join("; ")}` : ": sem requisitos adicionais"}. O livro é consumido ao aprender.`);
  }
  return result;
}
function progressionGuide() {
  const rows = Array.from({ length: levels.NIVEL_MAXIMO_HABILIDADE }, (_, i) => {
    const level = i + 1, cost = levels.custoParaEvoluir(level);
    return [level, `${n(levels.multiplicadorEfeito(level))}×`, `${n(levels.multiplicadorCustoMana(level))}×`, cost ? `${n(cost.ouro)} de gold + ${n(cost.fragmentos)} ${levels.NOME_ITEM_FRAGMENTO}` : "Nível máximo"];
  });
  return { id: "referencia-habilidades", slug: "referencia-habilidades", titulo: "Habilidades: aprender, equipar e evoluir", categoria: "Habilidades", kind: "skill", resumo: "Entenda escalamento, slots de combate, níveis e custos de evolução.", imagem_url: null, ordem: -1, conteudo: [
    "Habilidades ativas precisam ser escolhidas no combate; passivas aplicam os efeitos cadastrados quando são válidas para o personagem e o modo. Consulte a ficha para saber a origem e as exigências de aquisição.",
    `## Prepare o combate\nVocê pode manter até ${levels.MAX_HABILIDADES_ATIVAS_COMBATE} habilidades ativas nos slots de combate. Aprender um poder não significa que ele já esteja equipado. Confira a organização dos slots na tela de combate.`,
    "## Base, escalamento e dano final\nDano base e cura base são componentes do efeito. O escalamento informa qual atributo contribui e seu coeficiente. O nível da habilidade, o nível do personagem, multiplicadores, defesa, afinidades e demais efeitos podem alterar o resultado. Um poder que escala com Força não precisa causar dano físico; confira a natureza do dano separadamente.",
    "## Evolução da habilidade", table(["Nível", "Multiplicador de efeito", "Multiplicador de mana", "Custo para o próximo nível"], rows),
    "A tabela mostra a curva compartilhada do jogo. Efeitos adicionais só seguem o nível da habilidade quando isso estiver configurado. A recarga não é reduzida automaticamente por esta curva. Os custos e a possibilidade de evoluir são confirmados na tela de habilidades.",
    "## Como ler os efeitos\nChances são valores base. Resistências, contexto de combate, alvo, condição e regras de reaplicação podem modificar o que acontece. Uma descrição de efeito não garante que ele será aplicado em toda ação ou em todos os modos.",
  ].join("\n\n") };
}
function buildPowerArticles(data) {
  const learned = new Map(data.learned.map(a => [a.id_power, a]));
  data = { natureBindings: [], magicEvolutions: [], ...data, classes: data.classes.filter(c => c.ativo) };
  data.magicEvolutions = data.magicEvolutions.filter(e => data.classes.some(c => c.id === e.id_classe));
  data.paths = publicPaths(data.classes, data.paths);
  data.evolutionBindings = data.evolutionBindings.filter(b => data.paths.some(p => p.id === b.id_evolucao));
  data.books = data.books.filter(b => b.ativo && data.items.some(i => i.id === b.id_item && i.tipo_item === "LivroHabilidade") && (!b.id_classe || data.classes.some(c => c.id === b.id_classe)) && (!b.id_raca || data.races.some(r => r.id === b.id_raca)));
  const eligible = data.powers.filter(p => p.usage_scope !== "MONSTER");
  const candidateIds = new Set([
    ...data.classBindings.filter(b => data.classes.some(c => c.id === b.id_classe)).map(b => b.id_poder),
    ...data.raceBindings.filter(b => data.races.some(r => r.id === b.id_raca)).map(b => b.id_power),
    ...data.evolutionBindings.map(b => b.id_power),
    ...data.natureBindings.map(b => b.id_poder),
    ...data.magicEvolutions.map(e => e.id_power_concedido).filter(Boolean),
    ...data.books.filter(b => b.ativo && data.items.some(i => i.id === b.id_item && i.tipo_item === "LivroHabilidade") && (!b.id_classe || data.classes.some(c => c.id === b.id_classe)) && (!b.id_raca || data.races.some(r => r.id === b.id_raca))).map(b => b.id_power),
  ]);
  const visible = eligible.filter(p => learned.has(p.id) || (p.acquisition_scope !== "UNIQUE_FEAT" && candidateIds.has(p.id)));
  data.publicPowerNames = new Map(visible.map(p => [p.id, p.nome]));
  const articles = [progressionGuide()];
  for (const power of visible.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))) {
    const own = learned.get(power.id);
    const sources = power.acquisition_scope === "UNIQUE_FEAT" ? ["Habilidade de proeza única já aprendida por seu personagem."] : sourceLabels(power, data);
    const content = [power.descricao, "## Valores base", table(["Propriedade", "Valor"], [["Tipo", power.tipo_poder], ["Natureza do dano", power.tipo_dano], ["Dano base", n(power.dano_base)], ["Cura base", n(power.cura_base)], ["Escalamento", `${n(power.valor_escala)} × ${attributes[power.escala_atributo] || power.escala_atributo}`], ["Mana base", n(power.custo_mana)], ["Recarga (turnos)", n(power.cooldown)]]),
      "São os valores cadastrados, antes dos modificadores de combate. Consulte o manual de habilidades para entender a curva de níveis e o dano final.",
      "## Como obter", sources.length ? sources.map(s => `- ${s}`).join("\n") : "Já aprendida por seu personagem. Nenhuma forma pública de aquisição está cadastrada.",
      "Os caminhos de aquisição listados são alternativas; sua classe, raça, evolução e os requisitos do livro continuam sendo verificados pelo jogo.",
      "## Seu personagem", own ? `Aprendida no nível de habilidade **${n(own.nivel_habilidade || 1)}**. ${own.is_active ? "Marcada como ativa para combate." : "Não está marcada como ativa para combate."}` : "Ainda não aprendida. Consulte a tela de habilidades para conferir as condições de aquisição."];
    const statuses = data.statuses.filter(s => s.id_power === power.id && s.ativo);
    content.push("## Status aplicados", statuses.length ? table(["Status", "Alvo", "Chance base", "Duração", "Potência base"], statuses.map(s => {
      const def = definicaoDoStatus(s.status_key);
      const potency = def?.unidadeHoje === "SEM_MAGNITUDE" ? "Sem potência numérica" : s.percentual_vida_maxima != null ? `${n(s.percentual_vida_maxima)}% da vida máxima` : `${n(s.potency_base)}${def?.unidadeHoje?.startsWith("PERCENTUAL") ? "%" : " pontos"}${s.potency_scale_attribute ? ` + ${n(s.potency_scale_value)} × ${attributes[s.potency_scale_attribute] || s.potency_scale_attribute}` : ""}`;
      return [statusName(s.status_key), s.target === "Self" ? "Você" : "Inimigo", `${n(s.chance_ppm / 10000)}%`, `${n(s.duration_turns)} turnos`, potency];
    })) : "Nenhum status adicional cadastrado.");
    const effects = data.effects.filter(e => e.id_power === power.id && e.ativo);
    content.push("## Efeitos adicionais");
    if (!effects.length) content.push("Nenhum modificador adicional cadastrado.");
    for (const e of effects) {
      const meta = modifiers.metadadosDoEfeito(e.effect_key);
      const magnitude = meta?.unidade === "SEM_MAGNITUDE" ? (e.effect_key === "CLEANSE_STATUS" ? `Remove ${statusName(e.config?.status_key)}` : e.effect_key === "CLEANSE_CATEGORY" ? `Remove ${e.config?.category === "DOT" ? "dano periódico" : e.config?.category === "CONTROL" ? "controle" : "a categoria configurada"}` : "Sem magnitude numérica") : `${n(e.magnitude_base)}${meta?.unidade === "PERCENTUAL" ? "%" : meta?.unidade === "TURNOS" ? " turnos" : " pontos"}${e.scale_attribute ? ` + ${n(e.scale_value)} × ${attributes[e.scale_attribute] || e.scale_attribute}` : ""}`;
      const contexts = [["allow_pve", "Aventura"], ["allow_party", "Grupo"], ["allow_guild_boss", "Boss da Guilda"], ["allow_world_boss", "Boss Mundial"], ["allow_temple_boss", "Templo"], ["allow_pvp_casual", "PvP casual"], ["allow_ranked", "Rankeado"], ["allow_tournament", "Torneio"]].filter(([key]) => e[key]).map(([,name]) => name);
      content.push(`### ${meta?.label || "Efeito cadastrado"}`, table(["Regra", "Descrição"], [["Magnitude base", magnitude], ["Escala com nível da habilidade", e.scale_with_ability_level ? "Sim" : "Não"], ["Alvo", modifiers.DESCRICAO_DO_ALVO[e.target] || "Conforme a ação"], ["Quando ocorre", (triggers.DESCRICAO_DO_TRIGGER[e.trigger] || "Conforme a ação").replace("Power/passiva", "habilidade").replace("Power ativa", "habilidade ativa").replace("Power", "habilidade")], ["Condição", effectCondition(e)], ["Chance base", `${n(e.chance_ppm / 10000)}%`], ["Duração", e.duration_turns == null ? "Sem duração fixa; depende do gatilho e do efeito" : `${n(e.duration_turns)} turnos`], ["Reaplicação", modifiers.DESCRICAO_DA_POLITICA[e.reapply_policy] || "Conforme o efeito"], ...(e.reapply_policy === "STACK" ? [["Máximo de acúmulos", n(e.max_stacks)]] : []), ["Modos permitidos", contexts.join(", ") || "Nenhum"]]));
    }
    articles.push({ id: `habilidade-${power.id}`, slug: `habilidade-${power.id}`, titulo: power.nome, categoria: "Habilidades", kind: "skill", tipo_poder: power.tipo_poder, aprendida: Boolean(own), resumo: `${power.descricao} ${sources.join("; ")}`, imagem_url: power.imagem_url, ordem: 0, conteudo: content.join("\n\n") });
  }
  return articles;
}
async function getPowerArticles(characterId, classes, races, models) {
  const [learned, classBindings, raceBindings, paths, books, natureBindings, magicEvolutions] = await Promise.all([
    models.LearnedAbility.findAll({ where: { id_personagem: characterId }, raw: true }),
    models.ClassAbility.findAll({ where: { id_classe: { [Op.in]: classes.map(c => c.id) } }, raw: true }),
    models.RaceAbility.findAll({ where: { id_raca: { [Op.in]: races.map(r => r.id) } }, raw: true }),
    models.EvolutionPath.findAll({ where: { ativo: true, id_classe: { [Op.in]: classes.map(c => c.id) } }, raw: true }),
    models.PowerBook.findAll({ where: { ativo: true }, raw: true }),
    models.NatureAbility.findAll({ raw: true }),
    models.MagicEvolution.findAll({ where: { id_classe: { [Op.in]: classes.map(c => c.id) } }, raw: true }),
  ]);
  const visiblePaths = publicPaths(classes, paths);
  const evolutionBindings = visiblePaths.length ? await models.EvolutionAbility.findAll({ where: { id_evolucao: { [Op.in]: visiblePaths.map(p => p.id) } }, raw: true }) : [];
  const ids = [...new Set([...learned.map(a => a.id_power), ...classBindings.map(b => b.id_poder), ...raceBindings.map(b => b.id_power), ...evolutionBindings.map(b => b.id_power), ...books.map(b => b.id_power), ...natureBindings.map(b => b.id_poder), ...magicEvolutions.map(e => e.id_power_concedido).filter(Boolean)])];
  if (!ids.length) return [progressionGuide()];
  const [powers, items, statuses, effects] = await Promise.all([
    models.Power.findAll({ where: { id: { [Op.in]: ids }, usage_scope: { [Op.ne]: "MONSTER" } }, raw: true }),
    books.length ? models.Item.findAll({ where: { id: { [Op.in]: books.map(b => b.id_item) }, tipo_item: "LivroHabilidade" }, attributes: ["id", "nome", "tipo_item"], raw: true }) : [],
    models.StatusEffect.findAll({ where: { id_power: { [Op.in]: ids }, ativo: true }, raw: true }),
    models.CombatEffect.findAll({ where: { id_power: { [Op.in]: ids }, ativo: true }, raw: true }),
  ]);
  return buildPowerArticles({ natureBindings, magicEvolutions, learned, classes, races, classBindings, raceBindings, paths: visiblePaths, evolutionBindings, books, items, powers, statuses, effects });
}
module.exports = { getPowerArticles, buildPowerArticles, progressionGuide };
