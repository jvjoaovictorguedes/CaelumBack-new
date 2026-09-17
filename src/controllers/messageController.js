const { Op } = require("sequelize");
const Message = require("../models/Message");
const User = require("../models/User");

Message.belongsTo(User, { foreignKey: "id_remetente", as: "remetente" });
Message.belongsTo(User, { foreignKey: "id_destinatario", as: "destinatario" });

// POST /api/messages
// body: { id_remetente, id_destinatario, conteudo }
exports.sendMessage = async (req, res) => {
  try {
    // Quem manda é sempre o usuário autenticado — nunca o id_remetente
    // que o corpo mandar, senão qualquer um enviava mensagem se passando
    // por outra pessoa.
    const id_remetente = req.user.id;
    const { id_destinatario, conteudo } = req.body;

    if (!id_destinatario || !conteudo?.trim()) {
      return res.status(400).json({
        message: "id_destinatario e conteudo são obrigatórios.",
      });
    }

    // String() em vez de Number(): duas entradas não-numéricas viravam
    // NaN dos dois lados e NaN === NaN é false, deixando passar o
    // "mandar mensagem pra si mesmo" com id malformado.
    if (String(id_remetente) === String(id_destinatario)) {
      return res.status(400).json({
        message: "Não é possível enviar mensagem para si mesmo.",
      });
    }

    if (conteudo.length > 2000) {
      return res.status(400).json({
        message: "Mensagem muito longa (máximo 2000 caracteres).",
      });
    }

    const [remetente, destinatario] = await Promise.all([
      User.findByPk(id_remetente),
      User.findByPk(id_destinatario),
    ]);
    if (!remetente) {
      return res.status(404).json({ message: "Remetente não encontrado." });
    }
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
    // Sem isso, dava pra ler a conversa de qualquer dupla de usuários só
    // trocando o :userId na URL — a única checagem real é que o :userId
    // seja o próprio usuário autenticado.
    if (Number(userId) !== req.user.id) {
      return res.status(403).json({ message: "Você só pode ver sua própria conversa." });
    }

    // Sem limite/paginação, essa consulta trazia TODO o histórico entre
    // os dois de uma vez — uma conversa antiga e longa virava uma
    // query cada vez mais pesada (e um payload cada vez maior) a cada
    // mensagem nova trocada, pra sempre. limit tem teto (100) pra não
    // virar um jeito de pedir "me dá tudo mesmo assim" só usando um
    // número grande; before pagina "mais antigas que este timestamp".
    const limiteBruto = Number(req.query.limit);
    const limit = Number.isInteger(limiteBruto) && limiteBruto > 0 ? Math.min(limiteBruto, 100) : 50;

    const condicaoPar = {
      [Op.or]: [
        { id_remetente: userId, id_destinatario: otherUserId },
        { id_remetente: otherUserId, id_destinatario: userId },
      ],
    };

    const before = req.query.before ? new Date(req.query.before) : null;
    const where =
      before && !Number.isNaN(before.getTime())
        ? { ...condicaoPar, createdAt: { [Op.lt]: before } }
        : condicaoPar;

    // Busca as mais RECENTES primeiro (pra respeitar o limit a partir
    // do fim da conversa, não do início) e devolve em ordem
    // cronológica, como o front já espera.
    const maisRecentesPrimeiro = await Message.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
    });
    const mensagens = maisRecentesPrimeiro.reverse();

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
    if (Number(userId) !== req.user.id) {
      return res.status(403).json({ message: "Você só pode ver suas próprias mensagens." });
    }

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
    if (Number(userId) !== req.user.id) {
      return res.status(403).json({ message: "Você só pode ver sua própria caixa de entrada." });
    }

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
