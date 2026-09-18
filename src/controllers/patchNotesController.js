// src/controllers/patchNotesController.js
const PatchNote = require("../models/PatchNote");
const UserPatchNoteSeen = require("../models/UserPatchNoteSeen");

// GET /api/patch-notes — lista tudo, mais recente primeiro (ordem DESC),
// junto com quantas o usuário ainda não viu. Sem paginação de propósito:
// a lista tende a ficar pequena (é por FUNCIONALIDADE, não por commit),
// não há necessidade de complicar ainda.
exports.getPatchNotes = async (req, res) => {
  try {
    const [notas, visto] = await Promise.all([
      PatchNote.findAll({ order: [["ordem", "DESC"]] }),
      UserPatchNoteSeen.findByPk(req.user.id),
    ]);

    const ultimoIdVisto = visto?.ultimo_id_visto ?? null;
    // Nunca visitou (ultimoIdVisto null) conta TUDO como não lido — é o
    // comportamento certo tanto pra conta nova quanto pra quem já jogava
    // antes desse sistema existir: "veja tudo que mudou até agora".
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
    console.error("Erro ao buscar patch notes:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar patch notes." });
  }
};

// POST /api/patch-notes/mark-seen — marca tudo que existe hoje como
// visto (usa o maior id da tabela, não "agora" em timestamp, pra não
// depender de relógio de cliente/servidor baterem).
exports.marcarComoVisto = async (req, res) => {
  try {
    const ultimaNota = await PatchNote.findOne({ order: [["id", "DESC"]] });
    const ultimoId = ultimaNota?.id ?? null;

    await UserPatchNoteSeen.upsert({ id_usuario: req.user.id, ultimo_id_visto: ultimoId });

    res.status(200).json({ status: "success", data: { ultimo_id_visto: ultimoId } });
  } catch (error) {
    console.error("Erro ao marcar patch notes como vistas:", error);
    res.status(500).json({ message: "Erro interno do servidor ao marcar patch notes como vistas." });
  }
};
