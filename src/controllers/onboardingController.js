// Guia do Aventureiro — checklist de primeiros passos pro jogador novo.
// De propósito NÃO persiste progresso numa tabela própria: cada passo é
// derivado de dados que já existem (o personagem já matou um monstro?
// já tem algo equipado? já entrou numa guilda?). Menos uma tabela pra
// manter sincronizada, e o progresso nunca "destoa" da realidade —
// vender de volta o único equipamento, por exemplo, automaticamente
// volta a mostrar aquele passo como pendente, o que é o comportamento
// certo (o objetivo é "tenha isso feito agora", não "já fez uma vez").
const { Op } = require("sequelize");
const CharacterMonsterKill = require("../models/CharacterMonsterKill");
const CharacterEquipmentInstance = require("../models/CharacterEquipmentInstance");
const MarketListing = require("../models/MarketListing");
const MarketTransaction = require("../models/MarketTransaction");
const GuildMember = require("../models/GuildMember");
const PvpStatus = require("../models/PvpStatus");
const CharacterPvpSeason = require("../models/CharacterPvpSeason");
const CharacterMissionProgress = require("../models/CharacterMissionProgress");
const Message = require("../models/Message");

// GET /api/onboarding/progresso
exports.obterProgresso = async (req, res) => {
  try {
    const personagem = req.personagemAtual;
    const idUsuario = req.user.id;

    const [
      derrotouMonstro,
      equipouItem,
      refinouItem,
      anuncios,
      transacoes,
      entrouGuilda,
      statusPvp,
      partidasRanked,
      enviouMensagem,
      concluiuMissao,
    ] = await Promise.all([
      CharacterMonsterKill.count({ where: { id_personagem: personagem.id, quantidade: { [Op.gt]: 0 } } }),
      CharacterEquipmentInstance.count({ where: { id_personagem: personagem.id, estado: "Equipada" } }),
      CharacterEquipmentInstance.count({ where: { id_personagem: personagem.id, refinamento: { [Op.gt]: 0 } } }),
      MarketListing.count({ where: { id_personagem_vendedor: personagem.id } }),
      MarketTransaction.count({
        where: { [Op.or]: [{ id_personagem_vendedor: personagem.id }, { id_personagem_comprador: personagem.id }] },
      }),
      GuildMember.count({ where: { id_personagem: personagem.id } }),
      PvpStatus.findOne({ where: { id_personagem: personagem.id }, attributes: ["total_batalhas"] }),
      CharacterPvpSeason.count({ where: { character_id: personagem.id, jogos: { [Op.gt]: 0 } } }),
      Message.count({ where: { id_remetente: idUsuario } }),
      CharacterMissionProgress.count({ where: { id_personagem: personagem.id, concluida: true } }),
    ]);

    const passos = [
      {
        chave: "aventura",
        titulo: "Derrote seu primeiro monstro",
        descricao: "Vá em Aventura, escolha uma área e comece a caçar. É assim que você ganha XP, ouro e itens.",
        rota: "/dashboard/adventure",
        concluido: derrotouMonstro > 0,
      },
      {
        chave: "equipamento",
        titulo: "Equipe um item",
        descricao: "Abra seu Inventário e equipe uma arma, armadura ou acessório pra ficar mais forte.",
        rota: "/dashboard/inventory",
        concluido: equipouItem > 0,
      },
      {
        chave: "forja",
        titulo: "Refine um equipamento na Forja",
        descricao: "Melhore as propriedades de um item que você já tem equipado.",
        rota: "/dashboard/forge",
        concluido: refinouItem > 0,
      },
      {
        chave: "mercado",
        titulo: "Negocie no Mercado Negro",
        descricao: "Compre algo de outro jogador ou anuncie um item seu pra vender.",
        rota: "/dashboard/market",
        concluido: anuncios > 0 || transacoes > 0,
      },
      {
        chave: "guilda",
        titulo: "Entre em uma Guilda",
        descricao: "Junte-se a outros jogadores pra missões, benefícios e o Boss da Guilda em grupo.",
        rota: "/dashboard/guilds",
        concluido: entrouGuilda > 0,
      },
      {
        chave: "pvp",
        titulo: "Dispute um Duelo",
        descricao: "Desafie outro jogador no Duelo casual, ou entre na fila da Arena Ranqueada.",
        rota: "/dashboard/pvp",
        concluido: (statusPvp?.total_batalhas ?? 0) > 0 || partidasRanked > 0,
      },
      {
        chave: "mensagens",
        titulo: "Envie uma mensagem",
        descricao: "Mande uma mensagem pra outro jogador em Mensagens.",
        rota: "/dashboard/messages",
        concluido: enviouMensagem > 0,
      },
      {
        chave: "missao",
        titulo: "Conclua uma missão",
        descricao: "Cumpra uma missão na Guilda dos Aventureiros pra recompensas extras.",
        rota: "/dashboard/quests",
        concluido: concluiuMissao > 0,
      },
    ];

    const concluidos = passos.filter((passo) => passo.concluido).length;

    return res.status(200).json({
      status: "success",
      data: { passos, concluidos, total: passos.length },
    });
  } catch (error) {
    console.error("Erro ao calcular progresso do Guia do Aventureiro:", error);
    return res.status(500).json({ message: "Não foi possível carregar seu progresso agora." });
  }
};
