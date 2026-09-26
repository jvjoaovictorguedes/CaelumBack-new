// Painel Administrativo — Excluir Contas de Usuário. Lista todas as
// contas (não só admins, ao contrário de adminRoleService.listAdmins)
// e permite exclusão em massa, protegendo SEMPRE contas administrativas
// (isAdmin=true nunca é excluível por aqui, mesmo que o id venha
// selecionado por engano) e reaproveitando exatamente a mesma trava de
// integridade de guilda que characterController.deleteCharacter já usa
// (personagem líder/fundador de guilda Ativa bloqueia a exclusão).
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const User = require("../models/User");
const Character = require("../models/Character");
const Guild = require("../models/Guild");
const GuildMember = require("../models/GuildMember");
const AdminRole = require("../models/AdminRole");
const { registrarAcao } = require("./adminAuditService");

const PAGINA_TAMANHO_PADRAO = 50;

function whereBusca(busca) {
  if (!busca) return undefined;
  return {
    [Op.or]: [{ username: { [Op.iLike]: `%${busca}%` } }, { email: { [Op.iLike]: `%${busca}%` } }],
  };
}

// Listagem paginada/pesquisável — este ambiente de dev chegou a
// acumular ~19 mil contas de teste, então carregar tudo de uma vez
// numa tela com checkbox travaria o navegador. A tela usa isto pra
// EXIBIR; "selecionar tudo" usa listEligibleUserIds (mais leve) em vez
// desta função.
async function listUsers({ busca, pagina = 1, porPagina = PAGINA_TAMANHO_PADRAO } = {}) {
  const paginaNum = Math.max(1, Number(pagina) || 1);
  const porPaginaNum = Math.min(200, Math.max(1, Number(porPagina) || PAGINA_TAMANHO_PADRAO));
  const where = whereBusca(busca);

  const { count, rows: usuarios } = await User.findAndCountAll({
    where,
    attributes: ["id", "username", "email", "isAdmin", "dataCriacao", "ultimoLogin"],
    include: [{ model: AdminRole, as: "adminRoles", attributes: ["id", "nome"], through: { attributes: [] } }],
    order: [["id", "ASC"]],
    limit: porPaginaNum,
    offset: (paginaNum - 1) * porPaginaNum,
  });

  // Character não tem association Sequelize com User (só a FK crua
  // id_usuario) — busca só os personagens dos usuários desta página.
  const idsDaPagina = usuarios.map((u) => u.id);
  const personagens = idsDaPagina.length
    ? await Character.findAll({ where: { id_usuario: idsDaPagina }, attributes: ["id", "nome", "nivel", "id_usuario"] })
    : [];

  const personagensPorUsuario = new Map();
  for (const p of personagens) {
    const lista = personagensPorUsuario.get(p.id_usuario) ?? [];
    lista.push({ id: p.id, nome: p.nome, nivel: p.nivel });
    personagensPorUsuario.set(p.id_usuario, lista);
  }

  return {
    total: count,
    pagina: paginaNum,
    porPagina: porPaginaNum,
    totalPaginas: Math.max(1, Math.ceil(count / porPaginaNum)),
    usuarios: usuarios.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      isAdmin: u.isAdmin,
      adminRoles: (u.adminRoles ?? []).map((r) => r.nome),
      dataCriacao: u.dataCriacao,
      ultimoLogin: u.ultimoLogin,
      personagens: personagensPorUsuario.get(u.id) ?? [],
    })),
  };
}

// Versão leve (só ids) pra alimentar "selecionar todos os resultados
// filtrados" no frontend sem precisar paginar manualmente milhares de
// linhas — já exclui contas admin, então o frontend nunca marca uma
// admin como selecionada via "selecionar tudo".
async function listEligibleUserIds({ busca } = {}) {
  const where = { ...(whereBusca(busca) ?? {}), isAdmin: false };
  const usuarios = await User.findAll({ where, attributes: ["id"], order: [["id", "ASC"]] });
  return usuarios.map((u) => u.id);
}

// Exclui UM usuário e todos os seus personagens numa transaction
// própria — cada usuário do lote é isolado dos demais, então um
// bloqueio (ex: personagem líder de guilda Ativa) num usuário nunca
// derruba a exclusão dos outros selecionados no mesmo lote.
async function excluirUmUsuario(idUser, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const usuario = await User.findByPk(idUser, { transaction, lock: transaction.LOCK.UPDATE });
    if (!usuario) {
      return { id: idUser, excluido: false, motivo: "Usuário não encontrado." };
    }

    // Proteção obrigatória e incondicional — nunca exclui uma conta
    // administrativa por essa ferramenta, mesmo que tenha sido
    // selecionada (por engano ou por um "selecionar tudo" no
    // frontend). Rebaixar a admin comum antes, se for essa a intenção.
    if (usuario.isAdmin) {
      return {
        id: idUser,
        username: usuario.username,
        excluido: false,
        motivo: "Conta administrativa — protegida contra exclusão em massa.",
      };
    }

    const personagens = await Character.findAll({ where: { id_usuario: idUser }, transaction });

    for (const personagem of personagens) {
      // Mesma trava de characterController.deleteCharacter: nunca
      // excluir personagem líder/fundador de guilda, qualquer que seja
      // o status (Guild.id_fundador/id_lider não tem onDelete — a FK
      // não distingue guilda Ativa de Inativa/Dissolvida, então checar
      // só "Ativa" deixava passar exclusões que ainda estourariam).
      const guildComoLiderOuFundador = await Guild.findOne({
        where: {
          [Op.or]: [{ id_fundador: personagem.id }, { id_lider: personagem.id }],
        },
        transaction,
      });
      if (guildComoLiderOuFundador) {
        return {
          id: idUser,
          username: usuario.username,
          excluido: false,
          motivo: `Personagem "${personagem.nome}" lidera/fundou a guilda "${guildComoLiderOuFundador.nome}" — transfira a liderança ou dissolva a guilda antes.`,
        };
      }
    }

    for (const personagem of personagens) {
      await GuildMember.destroy({ where: { id_personagem: personagem.id }, transaction });
      await personagem.destroy({ transaction });
    }

    const dadosAntes = {
      username: usuario.username,
      email: usuario.email,
      personagens: personagens.map((p) => ({ id: p.id, nome: p.nome, nivel: p.nivel })),
    };
    await usuario.destroy({ transaction });

    await registrarAcao({
      idAdmin,
      acao: "excluir-usuario",
      entidade: "User",
      idEntidade: idUser,
      dadosAntes,
      req,
      transaction,
    });

    return { id: idUser, username: dadosAntes.username, excluido: true };
  });
}

// Traduz um erro inesperado (ex: SequelizeForeignKeyConstraintError de
// alguma tabela nova que ainda não ganhou ON DELETE CASCADE/SET NULL
// pra Characters) num motivo legível, incluindo tabela/constraint reais
// do Postgres — sem isso, o erro virava só "Erro interno do servidor",
// sem pista nenhuma de qual tabela travou.
function formatarErroInesperado(error) {
  const tabela = error?.table ?? error?.parent?.table ?? error?.original?.table;
  const constraint = error?.parent?.constraint ?? error?.original?.constraint;
  if (tabela || constraint) {
    return `Falha inesperada — restrição de chave estrangeira na tabela "${tabela ?? "?"}" (constraint "${constraint ?? "?"}") ainda bloqueia a exclusão. Avise o time técnico.`;
  }
  return `Falha inesperada ao excluir: ${error?.message ?? "erro desconhecido"}.`;
}

async function bulkDeleteUsers(userIds, { idAdmin, req }) {
  const idsUnicos = [...new Set((userIds ?? []).map(Number).filter(Number.isInteger))];
  const resultados = [];
  for (const idUser of idsUnicos) {
    // Sequencial (não Promise.all) — cada exclusão já abre sua própria
    // transaction/lock; rodar em paralelo só aumentaria contenção sem
    // nenhum ganho real numa operação administrativa pontual.
    //
    // Try/catch aqui (e não só dentro de excluirUmUsuario) é essencial:
    // qualquer exceção não prevista (ex: uma FK nova que ainda não
    // ganhou CASCADE) antes derrubava o LOTE INTEIRO com 500 genérico —
    // inclusive contas já excluídas com sucesso antes dela na mesma
    // chamada sumiam da resposta, embora já commitadas no banco. Agora
    // vira um resultado "não excluído" só daquela conta, com o motivo
    // real, e o lote continua pras próximas.
    try {
      resultados.push(await excluirUmUsuario(idUser, { idAdmin, req }));
    } catch (error) {
      console.error(`Falha inesperada ao excluir usuário ${idUser}:`, error);
      resultados.push({ id: idUser, excluido: false, motivo: formatarErroInesperado(error) });
    }
  }
  return {
    total: idsUnicos.length,
    excluidos: resultados.filter((r) => r.excluido).length,
    resultados,
  };
}

module.exports = { listUsers, listEligibleUserIds, bulkDeleteUsers };
