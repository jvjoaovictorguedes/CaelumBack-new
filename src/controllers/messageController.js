const { Op } = require("sequelize");
const Message = require("../models/Message");
const User = require("../models/User");

Message.belongsTo(User, { foreignKey: "id_remetente", as: "remetente" });
Message.belongsTo(User, { foreignKey: "id_destinatario", as: "destinatario" });

// POST /api/messages
// body: { id_remetente, id_destinatario, conteudo }
exports.sendMessage = async (req, res) => {
  try {
    const { id_remetente, id_destinatario, conteudo } = req.body;

    if (!id_remetente || !id_destinatario || !conteudo?.trim()) {
      return res.status(400).json({
        message: "id_remetente, id_destinatario e conteudo são obrigatórios.",
      });
    }

    if (Number(id_remetente) === Number(id_destinatario)) {
      return res.status(400).json({
        message: "Não é possível enviar mensagem para si mesmo.",
      });
    }

    if (conteudo.length > 2000) {
      return res.status(400).json({
        message: "Mensagem muito longa (máximo 2000 caracteres).",
      });
    }

    const destinatario = await User.findByPk(id_destinatario);
    if (!destinatario) {
      return res.status(404).json({ message: "Destinatário não encontrado." });
    }

    const mensagem = await Message.create({
      id_remetente,
      id_destinatario,
      conteudo: conteudo.trim(),
    });

    return res.status(201).json({
      status: "success",
      message: "Mensagem enviada com sucesso!",
      data: { mensagem },
    });
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
    return res
      .status(500)
      .json({ message: "Erro interno do servidor ao enviar mensagem." });
  }
};

// GET /api/messages/conversation/:userId/:otherUserId
// Marca como lidas as mensagens que o outro usuário mandou pra este.
exports.getConversation = async (req, res) => {
  try {
    const { userId, otherUserId } = req.params;

    const mensagens = await Message.findAll({
      where: {
        [Op.or]: [
          { id_remetente: userId, id_destinatario: otherUserId },
          { id_remetente: otherUserId, id_destinatario: userId },
        ],
      },
      order: [["createdAt", "ASC"]],
    });

    await Message.update(
      { lida: true },
      {
        where: {
          id_remetente: otherUserId,
          id_destinatario: userId,
          lida: false,
        },
      },
    );

    return res.status(200).json({
      status: "success",
      results: mensagens.length,
      data: { mensagens },
    });
  } catch (error) {
    console.error("Erro ao buscar conversa:", error);
    return res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar conversa." });
  }
};

// GET /api/messages/unread-count/:userId
// Só o total de não lidas — pensado pra ficar sendo consultado em
// segundo plano (ex: badge no menu) sem o custo de montar a inbox inteira.
exports.getUnreadCount = async (req, res) => {
  try {
    const { userId } = req.params;

    const total = await Message.count({
      where: { id_destinatario: userId, lida: false },
    });

    return res.status(200).json({
      status: "success",
      data: { naoLidas: total },
    });
  } catch (error) {
    console.error("Erro ao contar mensagens não lidas:", error);
    return res
      .status(500)
      .json({ message: "Erro interno do servidor ao contar mensagens." });
  }
};

// GET /api/messages/inbox/:userId
// Uma linha por pessoa com quem o usuário já trocou mensagem, com a
// última mensagem e quantidade de não lidas.
exports.getInbox = async (req, res) => {
  try {
    const { userId } = req.params;

    const mensagens = await Message.findAll({
      where: {
        [Op.or]: [{ id_remetente: userId }, { id_destinatario: userId }],
      },
      include: [
        { model: User, as: "remetente", attributes: ["id", "username"] },
        { model: User, as: "destinatario", attributes: ["id", "username"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    const conversasPorUsuario = new Map();

    for (const mensagem of mensagens) {
      const ehRemetente = mensagem.id_remetente === Number(userId);
      const outroUsuario = ehRemetente
        ? mensagem.destinatario
        : mensagem.remetente;

      if (!outroUsuario) continue;

      if (!conversasPorUsuario.has(outroUsuario.id)) {
        conversasPorUsuario.set(outroUsuario.id, {
          usuario: { id: outroUsuario.id, username: outroUsuario.username },
          ultimaMensagem: mensagem.conteudo,
          ultimaMensagemEm: mensagem.createdAt,
          naoLidas: 0,
        });
      }

      if (!ehRemetente && !mensagem.lida) {
        conversasPorUsuario.get(outroUsuario.id).naoLidas += 1;
      }
    }

    return res.status(200).json({
      status: "success",
      data: { conversas: Array.from(conversasPorUsuario.values()) },
    });
  } catch (error) {
    console.error("Erro ao buscar caixa de entrada:", error);
    return res
      .status(500)
      .json({ message: "Erro interno do servidor ao buscar mensagens." });
  }
};
