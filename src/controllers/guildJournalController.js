const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const GuildJournalEntry = require("../models/GuildJournalEntry");
const UserGuildJournalSeen = require("../models/UserGuildJournalSeen");

// GET /api/guild-journal — lista tudo que já está "no ar" (Publicado
// sempre, ou Agendado cuja publicado_em já chegou — mesmo critério do
// patchNotesController, sem precisar de cron), mais recente primeiro,
// mais quantidade_nao_lida/ultimo_id_visto — mesmo padrão de
// patchNotesController.getPatchNotes, pra alimentar a notificação tanto
// na aba "Jornal" da Guilda dos Aventureiros quanto no próprio Jornal
// (marcador "Novo" por nota, calculado no front a partir de
// ultimo_id_visto).
exports.getGuildJournal = async (req, res) => {
  try {
    const [notas, visto] = await Promise.all([
      GuildJournalEntry.findAll({
        where: {
          [Op.or]: [
            { status: "Publicado" },
            { status: "Agendado", publicado_em: { [Op.lte]: sequelize.literal("CURRENT_DATE") } },
          ],
        },
        order: [["ordem", "DESC"]],
      }),
      UserGuildJournalSeen.findByPk(req.user.id),
    ]);

    const ultimoIdVisto = visto?.ultimo_id_visto ?? null;
    // Nunca visitou (ultimoIdVisto null) conta TUDO como não lido — mesmo
    // comportamento do patchNotesController: conta nova ou conta que já
    // jogava antes desse sistema existir vê "tudo que já foi publicado"
    // como novidade.
    const quantidadeNaoLida = notas.filter(
      (nota) => ultimoIdVisto === null || nota.id > ultimoIdVisto,
    ).length;

    res.status(200).json({
      status: "success",
      data: {
        notas,
        ultimo_id_visto: ultimoIdVisto,
        quantidade_nao_lida: quantidadeNaoLida,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar o Jornal da Guilda:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar o Jornal da Guilda." });
  }
};

// POST /api/guild-journal/mark-seen — marca tudo que existe hoje como
// visto (usa o maior id da tabela, não "agora" em timestamp — mesmo
// motivo do patchNotesController). Só entre as VISÍVEIS (mesmo filtro
// do getGuildJournal) — senão uma nota Rascunho/Agendada com id maior
// que qualquer nota publicada faria a contagem de não lidas ficar
// errada.
exports.marcarComoVisto = async (req, res) => {
  try {
    const ultimaNota = await GuildJournalEntry.findOne({
      where: {
        [Op.or]: [
          { status: "Publicado" },
          { status: "Agendado", publicado_em: { [Op.lte]: sequelize.literal("CURRENT_DATE") } },
        ],
      },
      order: [["id", "DESC"]],
    });
    const ultimoId = ultimaNota?.id ?? null;

    await UserGuildJournalSeen.upsert({ id_usuario: req.user.id, ultimo_id_visto: ultimoId });

    res.status(200).json({ status: "success", data: { ultimo_id_visto: ultimoId } });
  } catch (error) {
    console.error("Erro ao marcar o Jornal da Guilda como visto:", error);
    res.status(500).json({ message: "Erro interno do servidor ao marcar o Jornal da Guilda como visto." });
  }
};
