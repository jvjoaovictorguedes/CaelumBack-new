// Mural da guilda (quadro de avisos — item da fila): só Fundador e
// Oficial (cargo logo abaixo do líder, ver guildPermissionService.js)
// podem postar/remover; o resto só lê. Reusa exigirPermissao/
// registrarLog de guildController.js — mesmo padrão cargo+permissão já
// usado em todo o resto da guilda, sem duplicar a checagem aqui.
const GuildMuralMessage = require("../models/GuildMuralMessage");
const Character = require("../models/Character");
const GuildMember = require("../models/GuildMember");
const { exigirPermissao, registrarLog } = require("./guildController");
const { emitParaGuild } = require("../socket/guildSocket");

const LIMITE_MENSAGENS = 100;

function mensagemPublica(mensagem) {
  return {
    id: mensagem.id,
    idPersonagemAutor: mensagem.id_personagem_autor,
    nomeAutor: mensagem.nome_personagem_autor,
    texto: mensagem.texto,
    createdAt: mensagem.createdAt,
  };
}

exports.listar = async (req, res) => {
  try {
    const mensagens = await GuildMuralMessage.findAll({
      where: { id_guild: req.params.id },
      order: [["createdAt", "DESC"]],
      limit: LIMITE_MENSAGENS,
    });

    // Abrir o Mural É o "ler" — marca aqui, não num endpoint à parte,
    // pra não depender do frontend lembrar de chamar mais uma rota.
    // exigirMembroDaGuild já garantiu que req.personagemAtual pertence
    // a essa guilda antes de chegar aqui (guardado mesmo assim porque
    // essa rota também é usada — sem personagemAtual — de forma
    // deliberada num teste view-only que não passa pelo middleware).
    if (req.personagemAtual) {
      await GuildMember.update(
        { mural_ultima_leitura_em: new Date() },
        { where: { id_personagem: req.personagemAtual.id, id_guild: req.params.id } },
      );
    }

    return res.status(200).json({ status: "success", data: { mensagens: mensagens.map(mensagemPublica) } });
  } catch (error) {
    console.error("Erro ao listar mural da guilda:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};

exports.criar = async (req, res) => {
  const idResponsavel = req.personagemAtual.id;
  const texto = typeof req.body?.texto === "string" ? req.body.texto.trim() : "";
  if (!texto) {
    return res.status(400).json({ message: "A mensagem não pode ficar vazia." });
  }
  if (texto.length > 1000) {
    return res.status(400).json({ message: "A mensagem pode ter no máximo 1000 caracteres." });
  }

  try {
    await exigirPermissao(req.params.id, idResponsavel, "gerenciar_mural");

    const personagem = await Character.findByPk(idResponsavel, { attributes: ["id", "nome"] });
    if (!personagem) return res.status(404).json({ message: "Personagem não encontrado." });

    const mensagem = await GuildMuralMessage.create({
      id_guild: req.params.id,
      id_personagem_autor: personagem.id,
      nome_personagem_autor: personagem.nome,
      texto,
    });

    await registrarLog(req.params.id, "mural_mensagem_criada", { responsavel: idResponsavel });

    const publica = mensagemPublica(mensagem);
    emitParaGuild(req.params.id, "guild:mural:nova-mensagem", publica);

    return res.status(201).json({ status: "success", data: { mensagem: publica } });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao postar no mural da guilda:", error);
    return res.status(statusCode).json({ message: error.message || "Erro interno do servidor." });
  }
};

exports.deletar = async (req, res) => {
  const idResponsavel = req.personagemAtual.id;
  try {
    await exigirPermissao(req.params.id, idResponsavel, "gerenciar_mural");

    const mensagem = await GuildMuralMessage.findByPk(req.params.messageId);
    if (!mensagem || mensagem.id_guild !== Number(req.params.id)) {
      return res.status(404).json({ message: "Mensagem não encontrada." });
    }

    await mensagem.destroy();
    await registrarLog(req.params.id, "mural_mensagem_removida", {
      responsavel: idResponsavel,
      alvo: mensagem.id_personagem_autor,
    });

    emitParaGuild(req.params.id, "guild:mural:mensagem-removida", { id: mensagem.id });

    return res.status(200).json({ status: "success", data: { id: mensagem.id } });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao remover mensagem do mural da guilda:", error);
    return res.status(statusCode).json({ message: error.message || "Erro interno do servidor." });
  }
};
