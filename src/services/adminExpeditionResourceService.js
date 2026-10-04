// Painel Administrativo de Expedição — gestão de QUAIS recursos podem
// cair (ExpeditionResource.ativo) e o PESO relativo de cada um por
// região (ExpeditionRegionResource.peso), pras 3 profissões
// (Mineração/Silvicultura/Exploração). Diferente do balanceamento em
// expeditionSettingsService.js (que mexe em config hot-reload via
// GameSetting) — aqui é CRUD direto em cima de linhas reais do banco,
// mesmo padrão transacional + auditoria de adminItemService.js.
const { sequelize } = require("../config/database");
const ExpeditionResource = require("../models/ExpeditionResource");
const ExpeditionRegion = require("../models/ExpeditionRegion");
const ExpeditionRegionResource = require("../models/ExpeditionRegionResource");
const ExpeditionResourceItem = require("../models/ExpeditionResourceItem");
const Item = require("../models/Item");
const { registrarAcao } = require("./adminAuditService");

const PROFISSOES_VALIDAS = ["Mineracao", "Silvicultura", "Exploracao"];
const QUALIDADES_VALIDAS = ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"];

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function validarProfissao(profissao) {
  if (!PROFISSOES_VALIDAS.includes(profissao)) {
    throw erro(`Profissão inválida — use uma de: ${PROFISSOES_VALIDAS.join(", ")}.`);
  }
}

// Visão completa pra montar a tela: cada região da profissão com seus
// recursos possíveis (peso + ativo), e a lista de recursos SEM vínculo
// com nenhuma região (pra avisar o admin que esse recurso nunca vai
// cair em lugar nenhum, mesmo ativo).
async function listarPorProfissao(profissao) {
  validarProfissao(profissao);

  const [regioes, recursos] = await Promise.all([
    ExpeditionRegion.findAll({
      where: { profissao },
      order: [["ordem", "ASC"]],
      include: [
        {
          model: ExpeditionRegionResource,
          as: "recursosDaRegiao",
          include: [{ model: ExpeditionResource, as: "recurso" }],
        },
      ],
    }),
    ExpeditionResource.findAll({ where: { profissao }, order: [["nome", "ASC"]] }),
  ]);

  const idsVinculados = new Set();
  const regioesFormatadas = regioes.map((regiao) => {
    const vinculos = regiao.recursosDaRegiao
      .slice()
      .sort((a, b) => a.recurso.nome.localeCompare(b.recurso.nome));
    const pesoTotal = vinculos.reduce((soma, v) => soma + v.peso, 0);
    for (const v of vinculos) idsVinculados.add(v.id_recurso);
    return {
      id: regiao.id,
      nome: regiao.nome,
      nivel_minimo: regiao.nivel_minimo,
      ativo: regiao.ativo,
      recursos: vinculos.map((v) => ({
        id_recurso: v.id_recurso,
        nome: v.recurso.nome,
        ativo: v.recurso.ativo,
        peso: v.peso,
        peso_percentual: pesoTotal > 0 ? Math.round((v.peso / pesoTotal) * 1000) / 10 : 0,
      })),
    };
  });

  const recursosSemRegiao = recursos
    .filter((r) => !idsVinculados.has(r.id))
    .map((r) => ({ id: r.id, nome: r.nome, ativo: r.ativo }));

  return {
    profissao,
    regioes: regioesFormatadas,
    recursos: recursos.map((r) => ({ id: r.id, nome: r.nome, ativo: r.ativo })),
    recursos_sem_regiao: recursosSemRegiao,
  };
}

// Liga/desliga um recurso inteiro (todas as regiões onde ele aparece)
// — ex.: tirar "Ferro Amaldiçoado" de circulação sem precisar zerar o
// peso dele em cada região uma por uma.
async function atualizarAtivoDoRecurso(idRecurso, ativo, { idAdmin, req } = {}) {
  if (typeof ativo !== "boolean") throw erro("ativo precisa ser um boolean.");

  return sequelize.transaction(async (transaction) => {
    const recurso = await ExpeditionResource.findByPk(idRecurso, { transaction, lock: transaction.LOCK.UPDATE });
    if (!recurso) throw erro("Recurso de expedição não encontrado.", 404);

    const dadosAntes = recurso.toJSON();
    recurso.ativo = ativo;
    await recurso.save({ transaction });

    await registrarAcao({
      idAdmin,
      acao: ativo ? "ativar" : "desativar",
      entidade: "ExpeditionResource",
      idEntidade: recurso.id,
      dadosAntes,
      dadosDepois: recurso.toJSON(),
      req,
      transaction,
    });

    return { id: recurso.id, nome: recurso.nome, ativo: recurso.ativo };
  });
}

// Ajusta o peso relativo de UM recurso dentro de UMA região (0 =
// efetivamente nunca sorteado nessa região, sem precisar remover o
// vínculo). Cria o vínculo na hora se ainda não existir (admin pode
// querer adicionar um recurso novo a uma região já existente).
async function atualizarPesoNaRegiao(idRegiao, idRecurso, peso, { idAdmin, req } = {}) {
  if (!Number.isInteger(peso) || peso < 0) throw erro("peso precisa ser um inteiro >= 0.");

  return sequelize.transaction(async (transaction) => {
    // Sequencial, não Promise.all: compartilham a mesma transaction.
    const regiao = await ExpeditionRegion.findByPk(idRegiao, { transaction });
    const recurso = await ExpeditionResource.findByPk(idRecurso, { transaction });
    if (!regiao) throw erro("Região de expedição não encontrada.", 404);
    if (!recurso) throw erro("Recurso de expedição não encontrado.", 404);
    if (regiao.profissao !== recurso.profissao) {
      throw erro(`"${recurso.nome}" é de ${recurso.profissao}, não pode ser vinculado a uma região de ${regiao.profissao}.`);
    }

    let vinculo = await ExpeditionRegionResource.findOne({
      where: { id_regiao: idRegiao, id_recurso: idRecurso },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const dadosAntes = vinculo ? vinculo.toJSON() : null;

    if (vinculo) {
      vinculo.peso = peso;
      await vinculo.save({ transaction });
    } else {
      vinculo = await ExpeditionRegionResource.create({ id_regiao: idRegiao, id_recurso: idRecurso, peso }, { transaction });
    }

    await registrarAcao({
      idAdmin,
      acao: dadosAntes ? "editar" : "criar",
      entidade: "ExpeditionRegionResource",
      idEntidade: null,
      dadosAntes,
      dadosDepois: vinculo.toJSON(),
      req,
      transaction,
    });

    return { id_regiao: idRegiao, id_recurso: idRecurso, peso: vinculo.peso };
  });
}

// Pedido do jogador: "colocar mais itens se eu quiser" — cria um
// ExpeditionResource NOVO (ex.: "Minério de Titânio") já vinculado a um
// Item real por qualidade (ExpeditionResourceItem), pra virar
// imediatamente elegível a ser adicionado a regiões via
// atualizarPesoNaRegiao (que já cria o vínculo sozinho). `itensPorQualidade`
// é um objeto parcial { Comum: idItem, Raro: idItem, ... } — qualidade
// omitida simplesmente não ganha vínculo ainda (o admin pode voltar aqui
// e chamar de novo, ou ajustar depois; nunca obrigatório preencher as 6).
async function criarRecurso({ profissao, nome, itensPorQualidade }, { idAdmin, req } = {}) {
  validarProfissao(profissao);
  if (!nome || !nome.trim()) throw erro("Nome do recurso é obrigatório.");

  const entradas = Object.entries(itensPorQualidade ?? {}).filter(([, idItem]) => idItem != null && idItem !== "");
  for (const [qualidade] of entradas) {
    if (!QUALIDADES_VALIDAS.includes(qualidade)) {
      throw erro(`Qualidade inválida: "${qualidade}". Use uma de: ${QUALIDADES_VALIDAS.join(", ")}.`);
    }
  }

  return sequelize.transaction(async (transaction) => {
    if (entradas.length > 0) {
      const idsItem = entradas.map(([, idItem]) => Number(idItem));
      const itensEncontrados = await Item.findAll({ where: { id: idsItem }, transaction });
      if (itensEncontrados.length !== new Set(idsItem).size) {
        throw erro("Um ou mais itens selecionados não existem.");
      }
    }

    const recurso = await ExpeditionResource.create({ nome: nome.trim(), profissao, ativo: true }, { transaction });

    for (const [qualidade, idItem] of entradas) {
      await ExpeditionResourceItem.create(
        { id_recurso: recurso.id, qualidade, id_item: Number(idItem) },
        { transaction },
      );
    }

    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "ExpeditionResource",
      idEntidade: recurso.id,
      dadosAntes: null,
      dadosDepois: { ...recurso.toJSON(), itens_por_qualidade: Object.fromEntries(entradas) },
      req,
      transaction,
    });

    return { id: recurso.id, nome: recurso.nome, profissao: recurso.profissao, ativo: recurso.ativo };
  });
}

module.exports = {
  PROFISSOES_VALIDAS,
  QUALIDADES_VALIDAS,
  listarPorProfissao,
  atualizarAtivoDoRecurso,
  atualizarPesoNaRegiao,
  criarRecurso,
};
