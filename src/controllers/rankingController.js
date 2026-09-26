// Controller do Ranking v2 — só valida `type`/`page` e delega pra
// rankingService.js (§20/§25/§26 da spec). "Sua posição" (quando a rota
// exige contexto de usuário) sempre vem de req.personagemAtual, nunca
// de um id vindo do cliente.
const rankingService = require("../services/rankingService");
const Character = require("../models/Character");
const GuildMember = require("../models/GuildMember");

// PvP v2 §3 — "pvp_ranked" é a Arena RANQUEADA (nome alinhado com o
// frontend, que usa esse valor na aba "PvP Ranqueado" desde a separação
// casual/ranqueado); "pvp_casual" é a categoria nova, pontuada só por
// PvpStatus. As duas nunca se misturam.
const TIPOS_VALIDOS = ["level", "gold", "guild", "pvp_ranked", "pvp_casual", "forge", "boss"];

// GET /api/ranking?type=level|gold|guild|pvp|pvp_casual|forge|boss&page=1
exports.obterRanking = async (req, res) => {
  const { type, page } = req.query;

  if (!TIPOS_VALIDOS.includes(type)) {
    return res.status(400).json({
      message: `Tipo de ranking inválido. Use um de: ${TIPOS_VALIDOS.join(", ")}.`,
    });
  }

  try {
    let dados;
    let minhaPosicao = null;

    // req.personagemAtual só existe quando a rota passa por
    // authMiddleware+carregarPersonagemAtual — a rota é montada com
    // esses middlewares, então isto sempre está disponível aqui, mas a
    // checagem defensiva evita quebrar se um dia a rota virar pública.
    const idPersonagem = req.personagemAtual?.id ?? null;

    switch (type) {
      case "level":
        dados = await rankingService.rankingNivel(page);
        if (idPersonagem) {
          dados.minhaPosicao = { posicao: await rankingService.posicaoNivel(idPersonagem) };
        }
        break;

      case "gold":
        dados = await rankingService.rankingGold(page);
        if (idPersonagem) {
          dados.minhaPosicao = { posicao: await rankingService.posicaoGold(idPersonagem) };
        }
        break;

      case "guild":
        dados = await rankingService.rankingGuilda(page);
        if (idPersonagem) {
          // §17 — no Ranking de Guilda, a posição própria é a da
          // GUILDA do jogador (se ele tiver uma), não a dele individual.
          const membro = await GuildMember.findOne({ where: { id_personagem: idPersonagem } });
          dados.minhaPosicao = membro
            ? { id_guilda: membro.id_guild, posicao: await rankingService.posicaoGuilda(membro.id_guild) }
            : { posicao: null, motivo: "Você ainda não pertence a uma guilda." };
        }
        break;

      case "pvp_ranked":
        dados = await rankingService.rankingPvp(page);
        if (idPersonagem) {
          dados.minhaPosicao = await rankingService.posicaoPvp(idPersonagem);
        }
        break;

      case "pvp_casual":
        dados = await rankingService.rankingPvpCasual(page);
        if (idPersonagem) {
          dados.minhaPosicao = await rankingService.posicaoPvpCasual(idPersonagem);
        }
        break;

      case "forge":
        dados = await rankingService.rankingForja(page);
        if (idPersonagem) {
          dados.minhaPosicao = { posicao: await rankingService.posicaoForja(idPersonagem) };
        }
        break;

      case "boss":
        dados = await rankingService.rankingBoss(page);
        if (idPersonagem) {
          // Mesmo padrão do Ranking de Guilda (§17) — posição é da
          // GUILDA do jogador, não dele individual.
          const membro = await GuildMember.findOne({ where: { id_personagem: idPersonagem } });
          dados.minhaPosicao = membro
            ? { id_guilda: membro.id_guild, posicao: await rankingService.posicaoBoss(membro.id_guild) }
            : { posicao: null, motivo: "Você ainda não pertence a uma guilda." };
        }
        break;
    }

    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    console.error("Erro ao obter ranking:", error);
    res.status(500).json({ message: "Erro interno do servidor ao obter o ranking." });
  }
};
