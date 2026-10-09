const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Power = require("../models/Power");
const PatchNote = require("../models/PatchNote");
const WikiArticle = require("../models/WikiArticle");
const { Change } = require("../models/discordNewsModels");
const { config } = require("./config");
const { clean, changeText } = require("./presentation");
const like = (text) => `%${text.replace(/[\\%_]/g, "\\$&")}%`;
const SELECT_OPTIONS = { limit: 6, order: [["nome", "ASC"]] };
async function findPower(text) {
  const exact = await Power.findAll({
    where: {
      nome: { [Op.iLike]: text.replace(/[\\%_]/g, "\\$&") },
      usage_scope: { [Op.in]: ["CHARACTER", "BOTH"] },
    },
    ...SELECT_OPTIONS,
  });
  return exact.length
    ? exact
    : Power.findAll({
        where: {
          nome: { [Op.iLike]: like(text) },
          usage_scope: { [Op.in]: ["CHARACTER", "BOTH"] },
        },
        ...SELECT_OPTIONS,
      });
}
async function answer(command, options = {}) {
  const environment = config().environment;
  const prefix =
    environment === "production"
      ? ""
      : "[Ambiente de testes — não representa produção]\n";
  const term = options.nome || options.assunto;
  if (
    ["caelum-habilidade", "caelum-mudancas", "caelum-guia"].includes(command) &&
    (typeof term !== "string" || term.trim().length < 2 || term.length > 100)
  )
    return "Informe um nome ou assunto entre 2 e 100 caracteres.";
  let result;
  if (command === "caelum-ajuda")
    result =
      "News Caelum usa configurações atuais e publicações oficiais.\n/caelum-habilidade nome: dano base, escalamento, mana e cooldown.\n/caelum-mudancas nome: histórico aprovado, antes → depois.\n/caelum-noticias: últimas notícias publicadas.\n/caelum-guia assunto: artigos publicados da Wiki.\nO dano final depende do nível da habilidade, atributos, buffs e resistências. Não aprendo regras a partir das conversas dos jogadores.";
  else if (command === "caelum-habilidade" || command === "caelum-mudancas") {
    const powers = await findPower(term.trim());
    if (!powers.length)
      result =
        "Não encontrei uma habilidade de personagem com esse nome. Tente o nome exibido no jogo.";
    else if (powers.length > 1)
      result = `Encontrei mais de uma habilidade. Informe o nome completo:\n${powers.map((p) => clean(p.nome, 120)).join("\n")}`;
    else if (command === "caelum-habilidade") {
      const p = powers[0];
      result = `${clean(p.nome, 150)} — configuração atual\n${clean(p.descricao, 450)}\nDano base: ${p.dano_base ?? 0}\nCura base: ${p.cura_base ?? 0}\nEscalamento: ${p.escala_atributo} × ${p.valor_escala}\nMana base: ${p.custo_mana}\nCooldown: ${p.cooldown ?? 0} turnos\nEsses são valores do catálogo, não o dano final: nível da habilidade, atributos, buffs, classe e resistências podem alterar o resultado.`;
    } else {
      const changes = await Change.findAll({
        where: {
          entity: "Power",
          entity_id: powers[0].id,
          status: "Approved",
          release_env: environment,
        },
        order: [["id", "DESC"]],
        limit: 4,
      });
      result = changes.length
        ? changes
            .map(
              (c) =>
                `${new Date(c.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · alteração #${c.id}\n${changeText(c)}`,
            )
            .join("\n\n")
        : "Não há histórico publicado para esta habilidade. Não consigo afirmar um valor anterior sem registro aprovado.";
    }
  } else if (command === "caelum-noticias") {
    const notes = await PatchNote.findAll({
      where: {
        [Op.or]: [
          { status: "Publicado" },
          {
            status: "Agendado",
            publicado_em: { [Op.lte]: sequelize.literal("CURRENT_DATE") },
          },
        ],
      },
      order: [["ordem", "DESC"]],
      limit: 3,
    });
    result = notes.length
      ? notes
          .map(
            (n) =>
              `${clean(n.versao, 30)} — ${clean(n.titulo, 150)}\n${clean(n.resumo || n.descricao, 400)}`,
          )
          .join("\n\n")
      : "Ainda não há patch notes publicados.";
  } else if (command === "caelum-guia") {
    const articles = await WikiArticle.findAll({
      where: { publicado: true, titulo: { [Op.iLike]: like(term.trim()) } },
      order: [["titulo", "ASC"]],
      limit: 5,
    });
    result = !articles.length
      ? "Não encontrei um artigo publicado com esse assunto."
      : articles.length > 1
        ? `Informe um título mais específico:\n${articles.map((a) => clean(a.titulo, 150)).join("\n")}`
        : `${clean(articles[0].titulo, 180)}\n${clean(articles[0].conteudo, 1400)}\nFonte: Wiki oficial do Caelum.`;
  } else result = "Comando desconhecido. Use /caelum-ajuda.";
  return (prefix + result).slice(0, 1900);
}
module.exports = { answer, like };
