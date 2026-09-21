const Character = require("../models/Character");
const {
  criarBatalha,
  buscarBatalha,
  adicionarAliado,
} = require("../services/battleService");

exports.iniciar = async (req, res) => {
  try {
    const character = await Character.findByPk(req.personagemAtual.id);

    if (!character) {
      return res.status(404).json({
        message: "Personagem não encontrado.",
      });
    }

    /*
     * IMPORTANTE:
     *
     * Aqui não vamos gerar outro monstro.
     *
     * O ideal é reaproveitar o inimigo que já foi criado
     * pelo sistema atual de aventura/PvE.
     */

    const encontro = character.encontro_pve;

    if (!encontro) {
      return res.status(400).json({
        message: "Nenhum inimigo encontrado.",
      });
    }

    const batalha = await criarBatalha({
      jogador: {
        ...character.toJSON(),

        vida_maxima: character.vida_maxima || character.vida_atual,

        vida_atual: character.vida_atual,

        mana_maxima: character.mana_maxima || character.mana_atual || 0,

        mana_atual: character.mana_atual || 0,
      },

      inimigo: encontro,
    });

    return res.status(201).json({
      status: "success",
      data: batalha,
    });
  } catch (error) {
    console.error("Erro ao iniciar batalha:", error);

    return res.status(500).json({
      message: "Não foi possível iniciar a batalha.",
    });
  }
};

exports.obter = async (req, res) => {
  try {
    const batalha = await buscarBatalha(req.params.battleId);

    if (!batalha) {
      return res.status(404).json({
        message: "Batalha não encontrada.",
      });
    }

    return res.json({
      status: "success",
      data: batalha,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao buscar batalha.",
    });
  }
};

exports.entrar = async (req, res) => {
  try {
    const character = await Character.findByPk(req.personagemAtual.id);

    if (!character) {
      return res.status(404).json({
        message: "Personagem não encontrado.",
      });
    }

    const batalha = await adicionarAliado({
      battleId: req.params.battleId,
      character,
    });

    return res.json({
      status: "success",
      data: batalha,
    });
  } catch (error) {
    console.error(error);

    return res.status(400).json({
      message: error.message,
    });
  }
};
