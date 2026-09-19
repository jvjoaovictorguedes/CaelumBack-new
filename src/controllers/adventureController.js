// Controller do Modo Aventura v1 — só valida a requisição e delega pra
// adventureService.js (§25/§26 da spec); nenhuma regra de negócio mora
// aqui.
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const {
  listarZonas,
  monstrosDaZona,
  obterSessaoAtiva,
  entrarNaZona,
  sairDaZona,
} = require("../services/adventureService");
const { encontroDoCampoValido } = require("../services/pveEncounterService");

async function sessaoParaResposta(sessao) {
  if (!sessao) return null;
  const monstros = sessao.id_area ? await monstrosDaZona(sessao.id_area) : [];
  return {
    id: sessao.id,
    id_area: sessao.id_area,
    area: sessao.area
      ? { id: sessao.area.id, nome: sessao.area.nome, imagem_url: sessao.area.imagem_url, monstros }
      : null,
    iniciado_em: sessao.iniciado_em,
    monstros_derrotados: sessao.monstros_derrotados,
    raros_encontrados: sessao.raros_encontrados,
    xp_obtida: sessao.xp_obtida,
    ouro_obtido: sessao.ouro_obtido,
    espolios_obtidos: sessao.espolios_obtidos,
  };
}

// GET /api/adventure/zones
exports.listarZonasDisponiveis = async (req, res) => {
  try {
    const zonas = await listarZonas(req.personagemAtual.nivel);
    res.status(200).json({ status: "success", data: { zonas } });
  } catch (error) {
    console.error("Erro ao listar áreas de caça:", error);
    res.status(500).json({ message: "Erro interno do servidor ao listar áreas de caça." });
  }
};

// GET /api/adventure/session
exports.obterSessaoAtual = async (req, res) => {
  try {
    const sessao = await obterSessaoAtiva(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { sessao: await sessaoParaResposta(sessao) } });
  } catch (error) {
    console.error("Erro ao obter sessão de caça:", error);
    res.status(500).json({ message: "Erro interno do servidor ao obter sessão de caça." });
  }
};

// POST /api/adventure/zones/:zoneId/enter
exports.entrarNaAreaDeCaca = async (req, res) => {
  const idZona = Number.parseInt(req.params.zoneId, 10);
  if (!Number.isInteger(idZona)) {
    return res.status(400).json({ message: "Área de Caça inválida." });
  }

  try {
    return await sequelize.transaction(async (transaction) => {
      const character = await Character.findByPk(req.personagemAtual.id, {
        transaction,
        lock: { level: transaction.LOCK.UPDATE, of: Character },
      });
      if (!character) {
        return res.status(404).json({ message: "Personagem não encontrado." });
      }

      // Não dá pra trocar de zona (perdendo o encontro atual sem
      // resolvê-lo) no meio de um combate em andamento.
      if (encontroDoCampoValido(character, "encontro_pve")) {
        return res.status(409).json({
          message: "Termine o combate em andamento antes de entrar em outra Área de Caça.",
        });
      }

      const { sessao, zona } = await entrarNaZona(character.id, idZona, transaction);
      res.status(201).json({
        status: "success",
        data: { sessao: await sessaoParaResposta({ ...sessao.toJSON(), area: zona }) },
      });
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Erro ao entrar na área de caça:", error);
    res.status(500).json({ message: "Erro interno do servidor ao entrar na área de caça." });
  }
};

// POST /api/adventure/leave
exports.sairDaAreaDeCaca = async (req, res) => {
  try {
    return await sequelize.transaction(async (transaction) => {
      const character = await Character.findByPk(req.personagemAtual.id, {
        transaction,
        lock: { level: transaction.LOCK.UPDATE, of: Character },
      });
      if (!character) {
        return res.status(404).json({ message: "Personagem não encontrado." });
      }

      // Sair da zona também encerra qualquer encontro em aberto daquela
      // sessão — não faz sentido deixar um combate pendurado sem área.
      if (character.encontro_pve) {
        character.encontro_pve = null;
        await character.save({ transaction });
      }

      const sessao = await sairDaZona(character.id, transaction);
      res.status(200).json({ status: "success", data: { resumo: await sessaoParaResposta(sessao) } });
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Erro ao sair da área de caça:", error);
    res.status(500).json({ message: "Erro interno do servidor ao sair da área de caça." });
  }
};
