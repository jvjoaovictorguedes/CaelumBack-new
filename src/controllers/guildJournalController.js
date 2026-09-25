const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const GuildJournalEntry = require("../models/GuildJournalEntry");

// GET /api/guild-journal — lista tudo que já está "no ar" (Publicado
// sempre, ou Agendado cuja publicado_em já chegou — mesmo critério do
// patchNotesController, sem precisar de cron), mais recente primeiro.
exports.getGuildJournal = async (req, res) => {
  try {
    const notas = await GuildJournalEntry.findAll({
      where: {
        [Op.or]: [
          { status: "Publicado" },
          { status: "Agendado", publicado_em: { [Op.lte]: sequelize.literal("CURRENT_DATE") } },
        ],
      },
      order: [["ordem", "DESC"]],
    });

    res.status(200).json({ status: "success", data: { notas } });
  } catch (error) {
    console.error("Erro ao buscar o Jornal da Guilda:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar o Jornal da Guilda." });
  }
};
