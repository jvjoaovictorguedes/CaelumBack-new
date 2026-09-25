// Painel Administrativo — "Busca": consultar jogador por nome/ID
// (players.view). Somente leitura — nunca altera nada; correções de
// inventário vivem em adminInventoryService.js (players.manage) e
// premiações em adminGrantService.js (players.reward).
const { Op } = require("sequelize");
const Character = require("../models/Character");
const User = require("../models/User");
const Race = require("../models/Race");
const Class = require("../models/Class");
const Guild = require("../models/Guild");
const GuildMember = require("../models/GuildMember");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

async function searchPlayers(termo) {
  if (!termo || termo.trim().length < 2) throw erro("Digite ao menos 2 caracteres pra buscar.");
  const termoLimpo = termo.trim();

  const usuarios = await User.findAll({
    where: { username: { [Op.iLike]: `%${termoLimpo}%` } },
    attributes: ["id", "username"],
    limit: 20,
  });
  const idsUsuarios = usuarios.map((u) => u.id);

  const where = Number.isInteger(Number(termoLimpo))
    ? { id: Number(termoLimpo) }
    : { [Op.or]: [{ nome: { [Op.iLike]: `%${termoLimpo}%` } }, ...(idsUsuarios.length ? [{ id_usuario: idsUsuarios }] : [])] };

  const personagens = await Character.findAll({
    where,
    attributes: ["id", "nome", "nivel", "id_usuario", "dinheiro"],
    include: [
      { model: Race, attributes: ["nome_masculino"] },
      { model: Class, attributes: ["nome"] },
    ],
    limit: 20,
    order: [["nome", "ASC"]],
  });

  const usuariosPorId = Object.fromEntries(usuarios.map((u) => [u.id, u]));
  const idsFaltando = personagens.map((p) => p.id_usuario).filter((id) => !usuariosPorId[id]);
  if (idsFaltando.length > 0) {
    const extras = await User.findAll({ where: { id: idsFaltando }, attributes: ["id", "username"] });
    for (const u of extras) usuariosPorId[u.id] = u;
  }

  return personagens.map((p) => ({
    id: p.id,
    nome: p.nome,
    nivel: p.nivel,
    dinheiro: p.dinheiro,
    classe: p.Class?.nome ?? null,
    raca: p.Race?.nome_masculino ?? null,
    username: usuariosPorId[p.id_usuario]?.username ?? null,
  }));
}

async function getPlayerDetail(idPersonagem) {
  const personagem = await Character.findByPk(idPersonagem, {
    include: [
      { model: User, attributes: ["id", "username", "email", "createdAt"] },
      { model: Race },
      { model: Class },
    ],
  });
  if (!personagem) throw erro("Personagem não encontrado.", 404);

  // Guilda não é FK direta em Character — vem de GuildMember, igual
  // characterController.js já faz pro "dados do jogador" do próprio
  // dono (ver getMe).
  const membroGuild = await GuildMember.findOne({
    where: { id_personagem: personagem.id },
    include: [{ model: Guild, attributes: ["id", "nome", "sigla"] }],
  });

  return {
    id: personagem.id,
    nome: personagem.nome,
    nivel: personagem.nivel,
    experiencia: personagem.experiencia,
    dinheiro: personagem.dinheiro,
    vida_atual: personagem.vida_atual,
    mana_atual: personagem.mana_atual,
    classe: personagem.Class?.nome ?? null,
    raca: personagem.Race?.nome_masculino ?? null,
    guilda: membroGuild?.Guild ? { id: membroGuild.Guild.id, nome: membroGuild.Guild.nome, sigla: membroGuild.Guild.sigla } : null,
    usuario: personagem.User
      ? { id: personagem.User.id, username: personagem.User.username, email: personagem.User.email, criado_em: personagem.User.createdAt }
      : null,
  };
}

module.exports = { searchPlayers, getPlayerDetail };
