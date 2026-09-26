// Painel Administrativo Fase 12 — "Premiações": conceder ouro/XP/itens a
// um jogador específico. Reaproveita os mesmos services que toda fonte
// legítima de recompensa já usa (goldService.concederOuro,
// experienceService.adicionarExperiencia, inventoryService.addStack,
// equipmentInstanceService.create — este último já documenta "toda
// fonte, inclusive Admin" no próprio comentário), nunca reimplementa a
// lógica de concessão. Toda concessão é UMA transação só, com motivo
// obrigatório e log de auditoria completo (o que foi concedido, pra
// quem, por quê).
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const User = require("../models/User");
const Item = require("../models/Item");
const { concederOuro } = require("./goldService");
const { adicionarExperiencia } = require("./experienceService");
const { addStack } = require("./inventoryService");
const { ehInstanciavel, create: criarInstanciaEquipamento } = require("./equipmentInstanceService");
const { validarRaridade } = require("./equipmentRarityService");
const { registrarAcao } = require("./adminAuditService");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

// Busca por nome de personagem OU username da conta — o painel não tem
// uma tela de "Busca" própria ainda (fase separada, não construída
// nesta rodada), então essa busca mínima vive aqui, só o suficiente
// pra achar quem vai receber a premiação.
async function searchCharacters(termo) {
  if (!termo || termo.trim().length < 2) throw erro("Digite ao menos 2 caracteres pra buscar.");
  const termoLimpo = termo.trim();

  const usuarios = await User.findAll({
    where: { username: { [Op.iLike]: `%${termoLimpo}%` } },
    attributes: ["id", "username"],
    limit: 20,
  });
  const idsUsuarios = usuarios.map((u) => u.id);

  const personagens = await Character.findAll({
    where: {
      [Op.or]: [{ nome: { [Op.iLike]: `%${termoLimpo}%` } }, ...(idsUsuarios.length ? [{ id_usuario: idsUsuarios }] : [])],
    },
    attributes: ["id", "nome", "nivel", "id_usuario", "dinheiro"],
    limit: 20,
    order: [["nome", "ASC"]],
  });

  const usuariosPorId = Object.fromEntries(usuarios.map((u) => [u.id, u]));
  const idsFaltando = personagens.map((p) => p.id_usuario).filter((id) => !usuariosPorId[id]);
  if (idsFaltando.length > 0) {
    const extras = await User.findAll({ where: { id: idsFaltando }, attributes: ["id", "username"] });
    for (const u of extras) usuariosPorId[u.id] = u;
  }

  return personagens.map((p) => ({
    id: p.id,
    nome: p.nome,
    nivel: p.nivel,
    dinheiro: p.dinheiro,
    username: usuariosPorId[p.id_usuario]?.username ?? null,
  }));
}

async function grantToCharacter(idPersonagem, payload, { idAdmin, req }) {
  const { ouro, xp, itens, motivo } = payload;
  if (!motivo || !motivo.trim()) throw erro("motivo é obrigatório — toda premiação fica registrada na auditoria com o porquê.");
  if (ouro == null && xp == null && (!itens || itens.length === 0)) {
    throw erro("Conceda ao menos ouro, xp ou um item.");
  }
  if (ouro != null && (!Number.isInteger(ouro) || ouro <= 0)) throw erro("ouro precisa ser um inteiro positivo.");
  if (xp != null && (!Number.isInteger(xp) || xp <= 0)) throw erro("xp precisa ser um inteiro positivo.");

  const itensValidados = [];
  for (const linha of itens ?? []) {
    if (!linha.id_item || !Number.isInteger(linha.quantidade) || linha.quantidade <= 0) {
      throw erro("Cada item precisa de id_item e quantidade (inteiro positivo).");
    }
    // Reformulação V2 (§11) — "Admin give/grant exige raridade para
    // equipamento": se o admin passar `raridade` explicitamente, ela é
    // validada e usada (é o caminho que sobrevive ao colapso de Item
    // único, quando a raridade deixa de estar implícita no id_item
    // escolhido). Sem ela, cai pro item.raridade (linha abaixo, dentro
    // da transação) — comportamento de transição enquanto o catálogo
    // ainda não foi colapsado.
    if (linha.raridade !== undefined) validarRaridade(linha.raridade);
    itensValidados.push(linha);
  }

  return sequelize.transaction(async (transaction) => {
    const character = await Character.findByPk(idPersonagem, { transaction, lock: transaction.LOCK.UPDATE });
    if (!character) throw erro("Personagem não encontrado.", 404);

    const concedido = { ouro: 0, xp: 0, niveisGanhos: 0, itens: [], equipamentos: [] };

    if (ouro != null) {
      concederOuro(character, ouro);
      concedido.ouro = ouro;
    }

    for (const linha of itensValidados) {
      const item = await Item.findByPk(linha.id_item, { transaction });
      if (!item) throw erro(`Item #${linha.id_item} não encontrado.`);
      if (ehInstanciavel(item.tipo_item)) {
        const raridade = linha.raridade ?? item.raridade;
        for (let i = 0; i < linha.quantidade; i++) {
          await criarInstanciaEquipamento({ idPersonagem, idItem: item.id, raridade, refinamento: linha.refinamento ?? 0 }, transaction);
        }
        concedido.equipamentos.push({ id_item: item.id, nome: item.nome, raridade, quantidade: linha.quantidade });
      } else {
        await addStack(idPersonagem, item.id, linha.quantidade, transaction);
        concedido.itens.push({ id_item: item.id, nome: item.nome, quantidade: linha.quantidade });
      }
    }

    await character.save({ transaction });

    // adicionarExperiencia já salva o character sozinha (inclusive
    // recalculando vida/mana no level up) — roda por último, depois do
    // save acima, pra não sobrescrever o ouro concedido com um character
    // desatualizado.
    if (xp != null) {
      const resultado = await adicionarExperiencia(idPersonagem, xp, { transaction, personagem: character });
      concedido.xp = xp;
      concedido.niveisGanhos = resultado.niveisGanhos;
    }

    await registrarAcao({
      idAdmin,
      acao: "conceder",
      entidade: "CharacterGrant",
      idEntidade: idPersonagem,
      dadosDepois: concedido,
      motivo,
      req,
      transaction,
    });

    return { personagem: { id: character.id, nome: character.nome, nivel: character.nivel, dinheiro: character.dinheiro }, concedido };
  });
}

module.exports = { searchCharacters, grantToCharacter };
