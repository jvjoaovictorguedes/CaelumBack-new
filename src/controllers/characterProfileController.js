// Perfil de Jogador (Especificação Perfil de Jogador, §35/§36) —
// controller fino: toda composição/privacidade fica em
// characterProfileService.js.
const Character = require("../models/Character");
const characterProfileService = require("../services/characterProfileService");
const combatPowerService = require("../services/combatPowerService");

// GET /api/characters/:id/profile
exports.getPerfil = async (req, res) => {
  try {
    const idPersonagem = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(idPersonagem)) {
      return res.status(400).json({ message: "ID de personagem inválido." });
    }

    // Checagem de ownership barata (só id_usuario) antes de montar o
    // payload completo — evita agregar o perfil inteiro duas vezes.
    const alvo = await Character.findByPk(idPersonagem, { attributes: ["id", "id_usuario"] });
    if (!alvo) {
      return res.status(404).json({ message: "Aventureiro não encontrado." });
    }
    const ehProprio = alvo.id_usuario === req.user.id;

    const perfil = ehProprio
      ? await characterProfileService.obterPerfilProprio(idPersonagem)
      : await characterProfileService.obterPerfilPublico(idPersonagem, req.user.id);

    res.status(200).json({ status: "success", data: perfil });
  } catch (error) {
    const status = error.status || 500;
    // 404 amigável (§46) — nunca revela se o ID pertenceu a um usuário
    // específico, só "não encontrado".
    if (status === 500) console.error("Erro ao montar Perfil de Jogador:", error);
    res.status(status).json({ message: status ? error.message : "Erro interno do servidor ao montar o perfil." });
  }
};

// PATCH /api/characters/me/profile — identifica o personagem pelo
// JWT/currentCharacter (§6/§56), nunca por um id no corpo.
exports.atualizarPerfilProprio = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const perfil = await characterProfileService.atualizarPersonalizacao(idPersonagem, req.body ?? {});
    res.status(200).json({ status: "success", data: perfil });
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error("Erro ao atualizar Perfil de Jogador:", error);
    res.status(status).json({ message: status ? error.message : "Erro interno do servidor ao atualizar o perfil." });
  }
};

// GET /api/characters/me/combat-power — Poder do personagem atual, sem
// montar o perfil inteiro (aba Status de "Meu Personagem").
exports.getMeuPoder = async (req, res) => {
  try {
    const poder = await combatPowerService.calcularPoderPersonagem(req.personagemAtual.id);
    if (!poder) return res.status(404).json({ message: "Personagem não encontrado." });
    res.status(200).json({ status: "success", data: { total: poder.combatPower, version: poder.version } });
  } catch (error) {
    console.error("Erro ao calcular Poder de Combate:", error);
    res.status(500).json({ message: "Erro interno do servidor ao calcular o Poder." });
  }
};
