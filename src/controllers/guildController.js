const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Guild = require("../models/Guild");
const GuildMember = require("../models/GuildMember");
const GuildRolePermission = require("../models/GuildRolePermission");
const GuildInvite = require("../models/GuildInvite");
const GuildApplication = require("../models/GuildApplication");
const GuildLog = require("../models/GuildLog");
const GuildTreasuryTransaction = require("../models/GuildTreasuryTransaction");
const GuildContribution = require("../models/GuildContribution");
const GuildMuralMessage = require("../models/GuildMuralMessage");
const Character = require("../models/Character");
const { temPermissao, podeGerenciarCargo, PADRAO, HIERARQUIA } = require("../services/guildPermissionService");
const { pontuarContribuicao, pontosPorDoacao } = require("../services/guildContributionService");
const { emitParaGuild, removerDaSalaDeGuild } = require("../socket/guildSocket");
const achievementService = require("../services/achievementService");

const CUSTO_CRIACAO = 500;
const NIVEL_MINIMO_CRIACAO = 5;
const CONVITE_VALIDADE_HORAS = 72;

Character.hasOne(GuildMember, { foreignKey: "id_personagem" });
GuildMember.belongsTo(Character, { foreignKey: "id_personagem" });
Guild.hasMany(GuildMember, { foreignKey: "id_guild", as: "membros" });
GuildMember.belongsTo(Guild, { foreignKey: "id_guild" });

GuildInvite.belongsTo(Guild, { foreignKey: "id_guild" });
GuildInvite.belongsTo(Character, { foreignKey: "id_personagem_convidado", as: "convidado" });
GuildApplication.belongsTo(Guild, { foreignKey: "id_guild" });
GuildApplication.belongsTo(Character, { foreignKey: "id_personagem" });
GuildTreasuryTransaction.belongsTo(Character, { foreignKey: "id_personagem" });
GuildContribution.belongsTo(Character, { foreignKey: "id_personagem" });

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function guildPublica(guild) {
  return {
    id: guild.id,
    nome: guild.nome,
    sigla: guild.sigla,
    descricao: guild.descricao,
    emblema_url: guild.emblema_url,
    nivel: guild.nivel,
    experiencia: guild.experiencia,
    prestigio: guild.prestigio,
    limite_membros: guild.limite_membros,
    tipo_recrutamento: guild.tipo_recrutamento,
    status: guild.status,
    id_lider: guild.id_lider,
    mural: guild.mural,
    meta_ativa: guild.meta_ativa,
    totalMembros: guild.membros ? guild.membros.length : undefined,
    // Rank da guilda — escada própria F..S (guildConfig.js), sobe só
    // por Missões de Rank (guildRankProgressionService), nunca mais
    // pelo Boss (ver guildBossController.js).
    rank: guild.rank,
    missoes_rank_concluidas_no_rank_atual: guild.missoes_rank_concluidas_no_rank_atual,
    experiencia_total_ganha: guild.experiencia_total_ganha,
    bosses_derrotados_total: guild.bosses_derrotados_total,
  };
}

// Igual a guildPublica, só que com o tesouro — usado nas respostas onde
// quem está olhando já é (ou está virando) membro daquela guilda. A
// listagem/busca pra jogadores de fora nunca usa essa versão (seção 13:
// "quais dados são públicos pra jogadores de fora" não inclui tesouro).
function guildDetalhada(guild) {
  return { ...guildPublica(guild), tesouro: guild.tesouro };
}

// Dados sensíveis (tesouro, logs, mensagens) nunca vão nesse retorno —
// jogadores de fora só veem identidade/progresso/recrutamento (seção 13
// do documento: "quais dados são públicos pra jogadores de fora").

async function carregarMembro(idGuild, idPersonagem) {
  const membro = await GuildMember.findOne({ where: { id_personagem: idPersonagem } });
  if (!membro || membro.id_guild !== Number(idGuild)) return null;
  return membro;
}

async function exigirPermissao(idGuild, idPersonagem, permissao) {
  const membro = await carregarMembro(idGuild, idPersonagem);
  if (!membro) throw erro("Você não pertence a essa guilda.", 403);
  const autorizado = await temPermissao(idGuild, membro.cargo, permissao);
  if (!autorizado) throw erro("Você não tem permissão para essa ação.", 403);
  return membro;
}

async function registrarLog(idGuild, tipo, { responsavel, alvo, detalhes, transaction } = {}) {
  await GuildLog.create(
    {
      id_guild: idGuild,
      tipo,
      id_personagem_responsavel: responsavel ?? null,
      id_personagem_alvo: alvo ?? null,
      detalhes: detalhes ?? null,
    },
    { transaction },
  );
}

// Reexportados pra guildMuralController.js poder reusar a mesma checagem
// de permissão/log em vez de duplicar (Mural usa exatamente o mesmo
// padrão cargo+permissão de todo o resto da guilda).
exports.exigirPermissao = exigirPermissao;
exports.registrarLog = registrarLog;

// ---------------------------------------------------------------------
// Identidade e ciclo de vida da guilda
// ---------------------------------------------------------------------

exports.criarGuild = async (req, res) => {
  // Quem funda é sempre o personagem do usuário autenticado — nunca o
  // id_personagem que o corpo mandar (senão qualquer um fundava guilda
  // em nome de outro personagem e ainda cobrava o custo dele).
  const id_personagem = req.personagemAtual.id;
  const { nome, sigla, descricao, tipo_recrutamento } = req.body;
  if (!nome || !sigla) {
    return res.status(400).json({ message: "nome e sigla são obrigatórios." });
  }
  if (nome.length < 3 || nome.length > 24) {
    return res.status(400).json({ message: "Nome deve ter entre 3 e 24 caracteres." });
  }
  if (sigla.length < 2 || sigla.length > 5) {
    return res.status(400).json({ message: "Sigla deve ter entre 2 e 5 caracteres." });
  }

  try {
    const guild = await sequelize.transaction(async (transaction) => {
      const personagem = await Character.findByPk(id_personagem, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!personagem) throw erro("Personagem não encontrado.", 404);
      if (personagem.nivel < NIVEL_MINIMO_CRIACAO) {
        throw erro(`Nível mínimo para criar uma guilda: ${NIVEL_MINIMO_CRIACAO}.`, 400);
      }
      if (personagem.dinheiro < CUSTO_CRIACAO) {
        throw erro(`Você precisa de ${CUSTO_CRIACAO} de ouro para criar uma guilda.`, 400);
      }

      const jaTemGuild = await GuildMember.findOne({
        where: { id_personagem },
        transaction,
      });
      if (jaTemGuild) throw erro("Esse personagem já pertence a uma guilda.", 409);

      const nomeEmUso = await Guild.findOne({ where: { nome }, transaction });
      if (nomeEmUso) throw erro("Já existe uma guilda com esse nome.", 409);
      const siglaEmUso = await Guild.findOne({ where: { sigla }, transaction });
      if (siglaEmUso) throw erro("Já existe uma guilda com essa sigla.", 409);

      personagem.dinheiro -= CUSTO_CRIACAO;
      await personagem.save({ transaction });

      const novaGuild = await Guild.create(
        {
          nome,
          sigla,
          descricao: descricao ?? null,
          id_fundador: id_personagem,
          id_lider: id_personagem,
          tipo_recrutamento: tipo_recrutamento ?? "Aprovacao",
        },
        { transaction },
      );

      await GuildMember.create(
        { id_personagem, id_guild: novaGuild.id, cargo: "Fundador" },
        { transaction },
      );
      await achievementService.grantByKey(id_personagem, "companheiro_de_armas", transaction);

      await registrarLog(novaGuild.id, "criacao", {
        responsavel: id_personagem,
        detalhes: `Guilda "${nome}" [${sigla}] fundada.`,
        transaction,
      });

      return novaGuild;
    });

    return res.status(201).json({ status: "success", data: { guild: guildDetalhada(guild) } });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao criar guilda:", error);
    return res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor ao criar guilda." });
  }
};

exports.listarGuilds = async (req, res) => {
  try {
    const { busca } = req.query;
    const where = { status: "Ativa" };
    if (busca) {
      where[Op.or] = [
        { nome: { [Op.iLike]: `%${busca}%` } },
        { sigla: { [Op.iLike]: `%${busca}%` } },
      ];
    }
    const guilds = await Guild.findAll({
      where,
      include: [{ model: GuildMember, as: "membros", attributes: ["id_personagem"] }],
      order: [["nivel", "DESC"], ["experiencia", "DESC"]],
      limit: 50,
    });
    return res.status(200).json({ status: "success", data: { guilds: guilds.map(guildPublica) } });
  } catch (error) {
    console.error("Erro ao listar guildas:", error);
    return res.status(500).json({ message: "Erro interno do servidor ao listar guildas." });
  }
};

exports.rankingGlobal = async (req, res) => {
  try {
    const guilds = await Guild.findAll({
      where: { status: "Ativa" },
      order: [["nivel", "DESC"], ["experiencia", "DESC"]],
      limit: 20,
    });
    return res.status(200).json({ status: "success", data: { ranking: guilds.map(guildPublica) } });
  } catch (error) {
    console.error("Erro ao montar ranking de guildas:", error);
    return res.status(500).json({ message: "Erro interno do servidor ao montar o ranking." });
  }
};

exports.buscarGuildPorId = async (req, res) => {
  try {
    const guild = await Guild.findByPk(req.params.id, {
      include: [
        {
          model: GuildMember,
          as: "membros",
          include: [{ model: Character, attributes: ["id", "nome", "nivel", "genero"] }],
        },
      ],
    });
    if (!guild) return res.status(404).json({ message: "Guilda não encontrada." });

    // Tesouro só aparece pra quem já é membro dessa guilda — jogador de
    // fora vendo os detalhes antes de entrar não vê saldo (seção 13).
    // Sempre a partir do personagem autenticado, nunca de um
    // characterId de query (senão qualquer um via tesouro alheio só
    // alegando ser membro de outra guilda).
    const ehMembro = req.personagemAtual
      ? guild.membros.some((m) => m.id_personagem === req.personagemAtual.id)
      : false;

    // Fila: notificação de mural até o player abrir — não lido = existe
    // pelo menos uma mensagem mais recente que a última leitura desse
    // membro (nunca abriu = null = qualquer mensagem já conta).
    let muralNaoLido = false;
    if (ehMembro) {
      const meuMembro = guild.membros.find((m) => m.id_personagem === req.personagemAtual.id);
      const ultimaMensagem = await GuildMuralMessage.findOne({
        where: { id_guild: guild.id },
        order: [["createdAt", "DESC"]],
        attributes: ["createdAt"],
      });
      muralNaoLido = Boolean(
        ultimaMensagem &&
          (!meuMembro.mural_ultima_leitura_em || ultimaMensagem.createdAt > meuMembro.mural_ultima_leitura_em),
      );
    }

    return res.status(200).json({
      status: "success",
      data: {
        guild: ehMembro ? guildDetalhada(guild) : guildPublica(guild),
        muralNaoLido,
        membros: guild.membros.map((m) => ({
          id_personagem: m.id_personagem,
          nome: m.Character?.nome,
          nivel: m.Character?.nivel,
          genero: m.Character?.genero,
          cargo: m.cargo,
          data_entrada: m.data_entrada,
        })),
      },
    });
  } catch (error) {
    console.error("Erro ao buscar guilda:", error);
    return res.status(500).json({ message: "Erro interno do servidor ao buscar guilda." });
  }
};

exports.buscarGuildDoPersonagem = async (req, res) => {
  try {
    // Sempre o próprio personagem autenticado — nunca o characterId da
    // URL, senão qualquer um lia o tesouro da guilda de outro jogador
    // só trocando o id na rota.
    const membro = await GuildMember.findOne({ where: { id_personagem: req.personagemAtual.id } });
    if (!membro) return res.status(200).json({ status: "success", data: { guild: null } });
    const guild = await Guild.findByPk(membro.id_guild);
    return res.status(200).json({
      status: "success",
      data: { guild: guild ? guildDetalhada(guild) : null, cargo: membro.cargo },
    });
  } catch (error) {
    console.error("Erro ao buscar guilda do personagem:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};

exports.editarGuild = async (req, res) => {
  const idResponsavel = req.personagemAtual.id;
  const { descricao, emblema_url, mural, meta_ativa, tipo_recrutamento } = req.body;
  try {
    const membro = await exigirPermissao(req.params.id, idResponsavel, "editar_identidade");
    const guild = await Guild.findByPk(req.params.id);
    if (!guild) return res.status(404).json({ message: "Guilda não encontrada." });

    if (descricao !== undefined) guild.descricao = descricao;
    if (emblema_url !== undefined) guild.emblema_url = emblema_url;
    if (mural !== undefined) guild.mural = mural;
    if (meta_ativa !== undefined) guild.meta_ativa = meta_ativa;
    if (tipo_recrutamento !== undefined) guild.tipo_recrutamento = tipo_recrutamento;
    await guild.save();

    await registrarLog(guild.id, "edicao_identidade", { responsavel: membro.id_personagem });
    return res.status(200).json({ status: "success", data: { guild: guildDetalhada(guild) } });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao editar guilda:", error);
    return res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor ao editar guilda." });
  }
};

exports.dissolver = async (req, res) => {
  const idResponsavel = req.personagemAtual.id;
  try {
    await sequelize.transaction(async (transaction) => {
      const guild = await Guild.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!guild) throw erro("Guilda não encontrada.", 404);
      if (guild.id_lider !== Number(idResponsavel)) {
        throw erro("Só o líder pode dissolver a guilda.", 403);
      }
      await GuildMember.destroy({ where: { id_guild: guild.id }, transaction });
      guild.status = "Encerrada";
      await guild.save({ transaction });
      await registrarLog(guild.id, "dissolucao", { responsavel: idResponsavel, transaction });
    });
    return res.status(200).json({ status: "success", message: "Guilda dissolvida." });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao dissolver guilda:", error);
    return res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor ao dissolver guilda." });
  }
};

exports.transferirLideranca = async (req, res) => {
  const idAtual = req.personagemAtual.id;
  const { idNovo } = req.body;
  try {
    await sequelize.transaction(async (transaction) => {
      const guild = await Guild.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!guild) throw erro("Guilda não encontrada.", 404);
      if (guild.id_lider !== Number(idAtual)) throw erro("Só o líder atual pode transferir a liderança.", 403);

      const novoMembro = await carregarMembro(guild.id, idNovo);
      if (!novoMembro) throw erro("O novo líder precisa já ser membro da guilda.", 400);

      const antigoMembro = await GuildMember.findOne({ where: { id_personagem: idAtual }, transaction });
      antigoMembro.cargo = "Oficial";
      novoMembro.cargo = "Fundador";
      await antigoMembro.save({ transaction });
      await novoMembro.save({ transaction });

      guild.id_lider = idNovo;
      await guild.save({ transaction });

      await registrarLog(guild.id, "lideranca_transferida", {
        responsavel: idAtual,
        alvo: idNovo,
        transaction,
      });
    });
    return res.status(200).json({ status: "success", message: "Liderança transferida." });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao transferir liderança:", error);
    return res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};

// ---------------------------------------------------------------------
// Membros, convites e candidaturas
// ---------------------------------------------------------------------

exports.convidar = async (req, res) => {
  const idConvidante = req.personagemAtual.id;
  const { idConvidado } = req.body;
  try {
    const guild = await Guild.findByPk(req.params.id);
    if (!guild) return res.status(404).json({ message: "Guilda não encontrada." });
    await exigirPermissao(guild.id, idConvidante, "convidar");

    const jaTemGuild = await GuildMember.findOne({ where: { id_personagem: idConvidado } });
    if (jaTemGuild) return res.status(409).json({ message: "Esse jogador já está em uma guilda." });

    const membrosAtuais = await GuildMember.count({ where: { id_guild: guild.id } });
    if (membrosAtuais >= guild.limite_membros) {
      return res.status(400).json({ message: "A guilda está com o limite de membros cheio." });
    }

    const convitePendente = await GuildInvite.findOne({
      where: { id_guild: guild.id, id_personagem_convidado: idConvidado, status: "Pendente" },
    });
    if (convitePendente) return res.status(409).json({ message: "Esse jogador já tem um convite pendente dessa guilda." });

    const convite = await GuildInvite.create({
      id_guild: guild.id,
      id_personagem_convidado: idConvidado,
      id_personagem_convidante: idConvidante,
      data_expiracao: new Date(Date.now() + CONVITE_VALIDADE_HORAS * 3600 * 1000),
    });

    await registrarLog(guild.id, "convite", { responsavel: idConvidante, alvo: idConvidado });
    return res.status(201).json({ status: "success", data: { convite } });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao convidar:", error);
    return res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor ao convidar." });
  }
};

exports.listarConvitesDaGuild = async (req, res) => {
  try {
    const convites = await GuildInvite.findAll({
      where: { id_guild: req.params.id, status: "Pendente" },
      include: [{ model: Character, as: "convidado", attributes: ["id", "nome", "nivel"] }],
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json({ status: "success", data: { convites } });
  } catch (error) {
    console.error("Erro ao listar convites:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};

exports.listarConvitesDoPersonagem = async (req, res) => {
  try {
    // Sempre o próprio personagem autenticado — não o characterId da URL,
    // senão qualquer um via os convites pendentes de outro jogador.
    const convites = await GuildInvite.findAll({
      where: {
        id_personagem_convidado: req.personagemAtual.id,
        status: "Pendente",
        data_expiracao: { [Op.gt]: new Date() },
      },
      include: [{ model: Guild, attributes: ["id", "nome", "sigla", "emblema_url", "nivel"] }],
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json({ status: "success", data: { convites } });
  } catch (error) {
    console.error("Erro ao listar convites do personagem:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};

exports.responderConvite = async (req, res) => {
  const idPersonagem = req.personagemAtual.id;
  const { aceitar } = req.body;
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const convite = await GuildInvite.findByPk(req.params.inviteId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!convite) throw erro("Convite não encontrado.", 404);
      if (convite.id_personagem_convidado !== Number(idPersonagem)) {
        throw erro("Esse convite não é seu.", 403);
      }
      if (convite.status !== "Pendente") throw erro("Esse convite já foi respondido.", 409);
      if (convite.data_expiracao < new Date()) {
        convite.status = "Expirado";
        await convite.save({ transaction });
        throw erro("Esse convite expirou.", 409);
      }

      if (!aceitar) {
        convite.status = "Recusado";
        await convite.save({ transaction });
        return { entrou: false };
      }

      const jaTemGuild = await GuildMember.findOne({ where: { id_personagem: idPersonagem }, transaction });
      if (jaTemGuild) throw erro("Você já está em uma guilda.", 409);

      const guild = await Guild.findByPk(convite.id_guild, { transaction, lock: transaction.LOCK.UPDATE });
      const membrosAtuais = await GuildMember.count({ where: { id_guild: guild.id }, transaction });
      if (membrosAtuais >= guild.limite_membros) throw erro("A guilda está com o limite de membros cheio.", 400);

      await GuildMember.create(
        { id_personagem: idPersonagem, id_guild: guild.id, cargo: "Recruta" },
        { transaction },
      );
      await achievementService.grantByKey(idPersonagem, "companheiro_de_armas", transaction);
      convite.status = "Aceito";
      await convite.save({ transaction });

      await registrarLog(guild.id, "entrada", { responsavel: idPersonagem, transaction });
      return { entrou: true, guild: guildDetalhada(guild) };
    });

    if (resultado.entrou) {
      emitParaGuild(resultado.guild.id, "guild:member:update", { tipo: "entrada", idPersonagem: Number(idPersonagem) });
    }
    return res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao responder convite:", error);
    return res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor ao responder convite." });
  }
};

// Guildas "Aberto" entram na hora, sem passar por candidatura (seção 5
// do documento: "Entrada imediata em guildas abertas, respeitando vagas").
exports.entrarDireto = async (req, res) => {
  const idPersonagem = req.personagemAtual.id;
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const guild = await Guild.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!guild) throw erro("Guilda não encontrada.", 404);
      if (guild.tipo_recrutamento !== "Aberto") {
        throw erro("Essa guilda não tem entrada aberta — precisa de convite ou candidatura.", 400);
      }

      const jaTemGuild = await GuildMember.findOne({ where: { id_personagem: idPersonagem }, transaction });
      if (jaTemGuild) throw erro("Você já está em uma guilda.", 409);

      const membrosAtuais = await GuildMember.count({ where: { id_guild: guild.id }, transaction });
      if (membrosAtuais >= guild.limite_membros) throw erro("A guilda está com o limite de membros cheio.", 400);

      await GuildMember.create(
        { id_personagem: idPersonagem, id_guild: guild.id, cargo: "Recruta" },
        { transaction },
      );
      await achievementService.grantByKey(idPersonagem, "companheiro_de_armas", transaction);
      await registrarLog(guild.id, "entrada", { responsavel: idPersonagem, transaction });
      return { guild: guildDetalhada(guild) };
    });
    emitParaGuild(resultado.guild.id, "guild:member:update", { tipo: "entrada", idPersonagem: Number(idPersonagem) });
    return res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao entrar na guilda:", error);
    return res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor ao entrar na guilda." });
  }
};

exports.candidatar = async (req, res) => {
  const idPersonagem = req.personagemAtual.id;
  const { mensagem } = req.body;
  try {
    const guild = await Guild.findByPk(req.params.id);
    if (!guild) return res.status(404).json({ message: "Guilda não encontrada." });
    if (guild.tipo_recrutamento !== "Aprovacao") {
      return res.status(400).json({ message: "Essa guilda não aceita candidaturas — é aberta ou só por convite." });
    }

    const jaTemGuild = await GuildMember.findOne({ where: { id_personagem: idPersonagem } });
    if (jaTemGuild) return res.status(409).json({ message: "Você já está em uma guilda." });

    const candidaturaPendente = await GuildApplication.findOne({
      where: { id_guild: guild.id, id_personagem: idPersonagem, status: "Pendente" },
    });
    if (candidaturaPendente) return res.status(409).json({ message: "Você já tem uma candidatura pendente nessa guilda." });

    const candidatura = await GuildApplication.create({
      id_guild: guild.id,
      id_personagem: idPersonagem,
      mensagem: mensagem ?? null,
    });
    return res.status(201).json({ status: "success", data: { candidatura } });
  } catch (error) {
    console.error("Erro ao candidatar-se:", error);
    return res.status(500).json({ message: "Erro interno do servidor ao se candidatar." });
  }
};

exports.listarCandidaturas = async (req, res) => {
  try {
    const candidaturas = await GuildApplication.findAll({
      where: { id_guild: req.params.id, status: "Pendente" },
      include: [{ model: Character, attributes: ["id", "nome", "nivel"] }],
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json({ status: "success", data: { candidaturas } });
  } catch (error) {
    console.error("Erro ao listar candidaturas:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};

exports.responderCandidatura = async (req, res) => {
  const idResponsavel = req.personagemAtual.id;
  const { aceitar } = req.body;
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const candidatura = await GuildApplication.findByPk(req.params.applicationId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!candidatura) throw erro("Candidatura não encontrada.", 404);
      if (candidatura.id_guild !== Number(req.params.id)) throw erro("Candidatura não pertence a essa guilda.", 400);
      if (candidatura.status !== "Pendente") throw erro("Essa candidatura já foi respondida.", 409);

      await exigirPermissao(candidatura.id_guild, idResponsavel, "aceitar_candidatura");

      if (!aceitar) {
        candidatura.status = "Recusada";
        candidatura.data_resposta = new Date();
        await candidatura.save({ transaction });
        return { entrou: false };
      }

      const jaTemGuild = await GuildMember.findOne({ where: { id_personagem: candidatura.id_personagem }, transaction });
      if (jaTemGuild) throw erro("Esse jogador já está em uma guilda.", 409);

      const guild = await Guild.findByPk(candidatura.id_guild, { transaction, lock: transaction.LOCK.UPDATE });
      const membrosAtuais = await GuildMember.count({ where: { id_guild: guild.id }, transaction });
      if (membrosAtuais >= guild.limite_membros) throw erro("A guilda está com o limite de membros cheio.", 400);

      await GuildMember.create(
        { id_personagem: candidatura.id_personagem, id_guild: guild.id, cargo: "Recruta" },
        { transaction },
      );
      await achievementService.grantByKey(candidatura.id_personagem, "companheiro_de_armas", transaction);
      candidatura.status = "Aceita";
      candidatura.data_resposta = new Date();
      await candidatura.save({ transaction });

      await registrarLog(guild.id, "candidatura_aceita", {
        responsavel: idResponsavel,
        alvo: candidatura.id_personagem,
        transaction,
      });
      return { entrou: true, idGuild: guild.id, idPersonagem: candidatura.id_personagem };
    });
    if (resultado.entrou) {
      emitParaGuild(resultado.idGuild, "guild:member:update", { tipo: "entrada", idPersonagem: resultado.idPersonagem });
    }
    return res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao responder candidatura:", error);
    return res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};

exports.sair = async (req, res) => {
  const idPersonagem = req.personagemAtual.id;
  try {
    const guild = await Guild.findByPk(req.params.id);
    if (!guild) return res.status(404).json({ message: "Guilda não encontrada." });
    if (guild.id_lider === Number(idPersonagem)) {
      return res.status(400).json({ message: "O líder precisa transferir a liderança ou dissolver a guilda antes de sair." });
    }
    const membro = await carregarMembro(guild.id, idPersonagem);
    if (!membro) return res.status(404).json({ message: "Você não pertence a essa guilda." });

    await membro.destroy();
    await registrarLog(guild.id, "saida", { responsavel: idPersonagem });
    emitParaGuild(guild.id, "guild:member:update", { tipo: "saida", idPersonagem: Number(idPersonagem) });
    // §51 — tira o socket da sala JÁ, não espera ele tentar mandar
    // mensagem de novo (a checagem em "guild:message" continua existindo
    // como segunda camada, pra sockets que nunca chamaram join-room).
    removerDaSalaDeGuild(Number(idPersonagem));
    return res.status(200).json({ status: "success", message: "Você saiu da guilda." });
  } catch (error) {
    console.error("Erro ao sair da guilda:", error);
    return res.status(500).json({ message: "Erro interno do servidor ao sair da guilda." });
  }
};

exports.expulsar = async (req, res) => {
  const idResponsavel = req.personagemAtual.id;
  const idAlvo = req.params.characterId;
  try {
    const guild = await Guild.findByPk(req.params.id);
    if (!guild) return res.status(404).json({ message: "Guilda não encontrada." });
    if (guild.id_lider === Number(idAlvo)) return res.status(400).json({ message: "O líder não pode ser expulso." });

    const responsavel = await exigirPermissao(guild.id, idResponsavel, "expulsar");
    const alvo = await carregarMembro(guild.id, idAlvo);
    if (!alvo) return res.status(404).json({ message: "Esse jogador não pertence a essa guilda." });
    if (!podeGerenciarCargo(responsavel.cargo, alvo.cargo)) {
      return res.status(403).json({ message: "Você não pode expulsar alguém do mesmo cargo ou superior ao seu." });
    }

    await alvo.destroy();
    await registrarLog(guild.id, "expulsao", { responsavel: idResponsavel, alvo: idAlvo });
    emitParaGuild(guild.id, "guild:member:update", { tipo: "expulsao", idPersonagem: Number(idAlvo) });
    removerDaSalaDeGuild(Number(idAlvo));
    return res.status(200).json({ status: "success", message: "Jogador expulso da guilda." });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao expulsar membro:", error);
    return res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};

exports.alterarCargo = async (req, res) => {
  const idResponsavel = req.personagemAtual.id;
  const { novoCargo } = req.body;
  const idAlvo = req.params.characterId;
  const CARGOS_ATRIBUIVEIS = ["Oficial", "Veterano", "Membro", "Recruta"];
  if (!CARGOS_ATRIBUIVEIS.includes(novoCargo)) {
    return res.status(400).json({ message: `Cargo inválido. Use um de: ${CARGOS_ATRIBUIVEIS.join(", ")}.` });
  }
  try {
    const guild = await Guild.findByPk(req.params.id);
    if (!guild) return res.status(404).json({ message: "Guilda não encontrada." });
    if (guild.id_lider === Number(idAlvo)) return res.status(400).json({ message: "Use a transferência de liderança para o líder." });

    const responsavel = await exigirPermissao(guild.id, idResponsavel, "promover_rebaixar");
    const alvo = await carregarMembro(guild.id, idAlvo);
    if (!alvo) return res.status(404).json({ message: "Esse jogador não pertence a essa guilda." });
    if (!podeGerenciarCargo(responsavel.cargo, alvo.cargo)) {
      return res.status(403).json({ message: "Você não pode alterar o cargo de alguém do mesmo cargo ou superior ao seu." });
    }
    if (!podeGerenciarCargo(responsavel.cargo, novoCargo) && novoCargo !== alvo.cargo) {
      return res.status(403).json({ message: "Você não pode promover alguém para um cargo igual ou superior ao seu." });
    }

    const cargoAntigo = alvo.cargo;
    alvo.cargo = novoCargo;
    await alvo.save();

    await registrarLog(guild.id, "cargo_alterado", {
      responsavel: idResponsavel,
      alvo: idAlvo,
      detalhes: `${cargoAntigo} -> ${novoCargo}`,
    });
    return res.status(200).json({ status: "success", data: { cargo: novoCargo } });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao alterar cargo:", error);
    return res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};

// ---------------------------------------------------------------------
// Permissões
// ---------------------------------------------------------------------

exports.listarPermissoes = async (req, res) => {
  try {
    const overrides = await GuildRolePermission.findAll({ where: { id_guild: req.params.id } });
    return res.status(200).json({ status: "success", data: { padrao: PADRAO, overrides } });
  } catch (error) {
    console.error("Erro ao listar permissões:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};

// Nunca confiar no ENUM do banco (GuildRolePermission.cargo) pra pegar
// entrada inválida — um valor fora do ENUM só estouraria como erro 500
// genérico na hora do INSERT, depois de já ter passado por toda a
// lógica de permissão. Valida explicitamente aqui, antes de qualquer
// escrita.
const PERMISSOES_VALIDAS = Object.keys(PADRAO.Fundador);

exports.atualizarPermissao = async (req, res) => {
  const idResponsavel = req.personagemAtual.id;
  const { cargo, permissao, permitido } = req.body;
  if (cargo === "Fundador") {
    return res.status(400).json({ message: "O cargo Fundador sempre tem todas as permissões." });
  }
  if (!HIERARQUIA.includes(cargo)) {
    return res.status(400).json({ message: "cargo inválido." });
  }
  if (!PERMISSOES_VALIDAS.includes(permissao)) {
    return res.status(400).json({ message: "permissao inválida." });
  }
  // Boolean("false") === true em JavaScript — sem essa checagem,
  // { "permitido": "false" } (uma string, não o booleano `false`) LIGAVA
  // a permissão em vez de desligar. Exige o tipo primitivo boolean de
  // verdade, não "qualquer coisa truthy".
  if (typeof permitido !== "boolean") {
    return res.status(400).json({ message: "permitido deve ser boolean." });
  }
  try {
    await exigirPermissao(req.params.id, idResponsavel, "editar_cargos");
    const [linha] = await GuildRolePermission.findOrCreate({
      where: { id_guild: req.params.id, cargo, permissao },
      defaults: { permitido: permitido },
    });
    linha.permitido = permitido;
    await linha.save();

    await registrarLog(req.params.id, "permissao_alterada", {
      responsavel: idResponsavel,
      detalhes: `${cargo}.${permissao} = ${permitido}`,
    });
    return res.status(200).json({ status: "success", data: { permissao: linha } });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao atualizar permissão:", error);
    return res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};

// ---------------------------------------------------------------------
// Tesouro, doação e contribuição
// ---------------------------------------------------------------------

exports.doar = async (req, res) => {
  const idPersonagem = req.personagemAtual.id;
  const { valor } = req.body;
  const valorNumerico = Number(valor);
  if (!Number.isInteger(valorNumerico) || valorNumerico <= 0) {
    return res.status(400).json({ message: "Valor de doação inválido." });
  }

  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const membro = await GuildMember.findOne({ where: { id_personagem: idPersonagem }, transaction });
      if (!membro || membro.id_guild !== Number(req.params.id)) {
        throw erro("Você não pertence a essa guilda.", 403);
      }

      const personagem = await Character.findByPk(idPersonagem, { transaction, lock: transaction.LOCK.UPDATE });
      if (personagem.dinheiro < valorNumerico) throw erro("Saldo insuficiente para essa doação.", 400);

      const guild = await Guild.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });

      // Servidor é a única autoridade sobre o saldo — nunca confia em
      // saldo final calculado no frontend (seção 7 do documento).
      // §15 — doação não gera mais XP de Guilda, só financia o Tesouro
      // (Buffs/Boss, ver guildBuffService.js/guildBossService.js). O
      // valor econômico da doação agora é isso, não "comprar nível".
      personagem.dinheiro -= valorNumerico;
      guild.tesouro += valorNumerico;
      await personagem.save({ transaction });
      await guild.save({ transaction });

      const [contribuicao] = await GuildContribution.findOrCreate({
        where: { id_guild: guild.id, id_personagem: idPersonagem },
        defaults: {},
        transaction,
      });
      contribuicao.ouro_doado_total += valorNumerico;
      await contribuicao.save({ transaction });

      // §43/§44 — contribuição normalizada, não o Gold cru.
      await pontuarContribuicao(guild.id, idPersonagem, pontosPorDoacao(valorNumerico), transaction);

      await GuildTreasuryTransaction.create(
        {
          id_guild: guild.id,
          tipo: "Doacao",
          id_personagem: idPersonagem,
          valor: valorNumerico,
          saldo_resultante: guild.tesouro,
          motivo: "Doação de ouro",
        },
        { transaction },
      );

      await registrarLog(guild.id, "doacao", {
        responsavel: idPersonagem,
        detalhes: `Doou ${valorNumerico} de ouro.`,
        transaction,
      });

      return {
        saldoPersonagem: personagem.dinheiro,
        tesouro: guild.tesouro,
      };
    });

    emitParaGuild(req.params.id, "guild:treasury:update", { tesouro: resultado.tesouro });
    return res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao processar doação:", error);
    return res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor ao processar doação." });
  }
};

exports.registrarGasto = async (req, res) => {
  const idResponsavel = req.personagemAtual.id;
  const { valor, motivo } = req.body;
  const valorNumerico = Number(valor);
  if (!Number.isInteger(valorNumerico) || valorNumerico <= 0) {
    return res.status(400).json({ message: "Valor de gasto inválido." });
  }
  if (!motivo) return res.status(400).json({ message: "Informe o motivo do gasto." });

  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      await exigirPermissao(req.params.id, idResponsavel, "autorizar_gastos");
      const guild = await Guild.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (guild.tesouro < valorNumerico) throw erro("O tesouro não tem saldo suficiente para esse gasto.", 400);

      guild.tesouro -= valorNumerico;
      await guild.save({ transaction });

      await GuildTreasuryTransaction.create(
        {
          id_guild: guild.id,
          tipo: "Gasto",
          id_personagem: idResponsavel,
          valor: valorNumerico,
          saldo_resultante: guild.tesouro,
          motivo,
        },
        { transaction },
      );

      await registrarLog(guild.id, "gasto", { responsavel: idResponsavel, detalhes: `${motivo} (${valorNumerico})`, transaction });
      return { tesouro: guild.tesouro };
    });
    emitParaGuild(req.params.id, "guild:treasury:update", { tesouro: resultado.tesouro });
    return res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao registrar gasto:", error);
    return res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};

exports.extratoTesouro = async (req, res) => {
  try {
    const transacoes = await GuildTreasuryTransaction.findAll({
      where: { id_guild: req.params.id },
      include: [{ model: Character, attributes: ["id", "nome"] }],
      order: [["createdAt", "DESC"]],
      limit: 100,
    });
    return res.status(200).json({ status: "success", data: { transacoes } });
  } catch (error) {
    console.error("Erro ao buscar extrato do tesouro:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};

exports.listarContribuicoes = async (req, res) => {
  try {
    const contribuicoes = await GuildContribution.findAll({
      where: { id_guild: req.params.id },
      include: [{ model: Character, attributes: ["id", "nome", "nivel"] }],
      order: [["contribuicao_total", "DESC"]],
    });
    return res.status(200).json({ status: "success", data: { contribuicoes } });
  } catch (error) {
    console.error("Erro ao listar contribuições:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};

// ---------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------

exports.listarLogs = async (req, res) => {
  try {
    const logs = await GuildLog.findAll({
      where: { id_guild: req.params.id },
      order: [["createdAt", "DESC"]],
      limit: 200,
    });

    // Bug relatado: o log só mostrava O QUE foi feito, nunca QUEM fez —
    // GuildLog sempre guardou id_personagem_responsavel/id_personagem_alvo,
    // mas essa rota nunca resolvia esses IDs pra nome antes de responder.
    // Um único lookup em lote (não N+1 por linha) pros dois campos juntos.
    const idsPersonagens = [
      ...new Set(
        logs
          .flatMap((log) => [log.id_personagem_responsavel, log.id_personagem_alvo])
          .filter((id) => id != null),
      ),
    ];
    const personagens = idsPersonagens.length
      ? await Character.findAll({ where: { id: idsPersonagens }, attributes: ["id", "nome"] })
      : [];
    const nomePorId = new Map(personagens.map((p) => [p.id, p.nome]));

    // Personagem pode ter sido removido/a conta excluída depois do log —
    // nome vem null nesse caso (nunca quebra a listagem), o frontend
    // decide como exibir.
    const logsComNomes = logs.map((log) => ({
      id: log.id,
      tipo: log.tipo,
      id_personagem_responsavel: log.id_personagem_responsavel,
      nome_responsavel: log.id_personagem_responsavel != null
        ? nomePorId.get(log.id_personagem_responsavel) ?? null
        : null,
      id_personagem_alvo: log.id_personagem_alvo,
      nome_alvo: log.id_personagem_alvo != null ? nomePorId.get(log.id_personagem_alvo) ?? null : null,
      detalhes: log.detalhes,
      createdAt: log.createdAt,
    }));

    return res.status(200).json({ status: "success", data: { logs: logsComNomes } });
  } catch (error) {
    console.error("Erro ao listar logs:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};
