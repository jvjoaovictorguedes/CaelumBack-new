// Classes V2 §8 — avaliação dos requisitos extensíveis de uma evolução
// (ClassEvolutionRequirement), substituindo as 5 colunas ad hoc que
// existiam em ClassEvolutionPath (nivel_necessario/id_item_requisito/
// quantidade_item_requisito/custo_ouro/nome_monstro_alvo/
// quantidade_monstro_necessaria — mantidas na tabela só como histórico/
// compat, nunca mais lidas por aqui). Todo requisito é reavaliado
// SEMPRE server-side (spec §24 "cliente nunca informa que requisito foi
// cumprido") — nunca confia em nada vindo do body da requisição.
//
// Tipos implementados de verdade: LEVEL, GOLD, ITEM, MONSTER_KILL (via
// reference_key — CharacterMonsterKill é indexado por NOME de monstro
// em todo o jogo, não só em Classes; ver comentário no model) e
// ADVENTURE_GUILD_RANK (via Character.rank + RANKS_AVENTUREIRO). Os
// tipos ACHIEVEMENT e REPUTATION são avaliados de verdade quando o
// requisito aponta pra uma conquista/reputação já modelada no jogo.
// QUEST fica documentado no schema (catálogo do §8), mas nenhum sistema
// genérico de "missão" com id estável existe hoje fora da Guilda dos
// Aventureiros (que já tem seu próprio tipo aqui) — sempre reportado
// como não atendido, nunca falha aberto.
const CharacterInventory = require("../models/CharacterInventory");
const CharacterAchievement = require("../models/CharacterAchievement");
const Achievement = require("../models/Achievement");
const Item = require("../models/Item");
const { contarMortes } = require("./monsterKillService");
const { RANKS_AVENTUREIRO, indiceDoRankAventureiro } = require("../config/adventureGuildConfig");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

// `rotulo` é um texto pronto pro Admin/jogador exibir sem precisar
// reimplementar formatação por tipo no frontend (§8/§24) — sempre
// resolvido aqui, nunca no cliente.
async function avaliarUmRequisito(requisito, personagem, transaction) {
  switch (requisito.tipo) {
    case "LEVEL": {
      const atual = personagem.nivel;
      return { atendido: atual >= requisito.quantidade, atual, meta: requisito.quantidade, rotulo: `Nível ${requisito.quantidade}` };
    }
    case "GOLD": {
      const atual = personagem.dinheiro;
      return { atendido: atual >= requisito.quantidade, atual, meta: requisito.quantidade, rotulo: `${requisito.quantidade} de ouro` };
    }
    case "ITEM": {
      const [entrada, item] = await Promise.all([
        CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: requisito.reference_id }, transaction }),
        Item.findByPk(requisito.reference_id, { attributes: ["id", "nome", "imagem_url"], transaction }),
      ]);
      const atual = entrada?.quantidade ?? 0;
      return {
        atendido: atual >= requisito.quantidade,
        atual,
        meta: requisito.quantidade,
        rotulo: `${requisito.quantidade}x ${item?.nome ?? "Item"}`,
        item: item ? { id: item.id, nome: item.nome, imagem_url: item.imagem_url } : null,
      };
    }
    case "MONSTER_KILL": {
      const atual = await contarMortes(personagem.id, requisito.reference_key, transaction);
      return {
        atendido: atual >= requisito.quantidade,
        atual,
        meta: requisito.quantidade,
        rotulo: `Derrotar ${requisito.quantidade}x ${requisito.reference_key}`,
      };
    }
    case "ADVENTURE_GUILD_RANK": {
      const indiceAtual = indiceDoRankAventureiro(personagem.rank);
      const indiceNecessario = RANKS_AVENTUREIRO.indexOf(requisito.reference_key);
      const atendido = indiceNecessario !== -1 && indiceAtual >= indiceNecessario;
      return { atendido, atual: personagem.rank, meta: requisito.reference_key, rotulo: `Rank ${requisito.reference_key} na Guilda dos Aventureiros` };
    }
    case "ACHIEVEMENT": {
      const [conquista, achievement] = await Promise.all([
        CharacterAchievement.findOne({
          where: { id_personagem: personagem.id },
          include: [{ model: Achievement, as: "achievement", where: { key: requisito.reference_key } }],
          transaction,
        }),
        Achievement.findOne({ where: { key: requisito.reference_key }, transaction }),
      ]);
      return {
        atendido: Boolean(conquista),
        atual: Boolean(conquista),
        meta: requisito.reference_key,
        rotulo: `Conquista: ${achievement?.nome ?? requisito.reference_key}`,
      };
    }
    case "REPUTATION":
    case "QUEST":
    default:
      // Sem sistema genérico modelado ainda pra esses dois tipos (ver
      // header) — nunca falha aberto: reporta como não atendido em vez
      // de deixar passar um requisito que na prática ninguém checou.
      return {
        atendido: false,
        atual: null,
        meta: requisito.quantidade ?? requisito.reference_key,
        rotulo: `${requisito.tipo === "REPUTATION" ? "Reputação" : "Missão"} (ainda não implementado)`,
        naoImplementado: true,
      };
  }
}

// Devolve { atendidos: bool, detalhes: [...] } — `atendidos` só é true
// se TODOS os requisitos da evolução passarem. Usado tanto pela leitura
// (mostrar progresso na árvore) quanto pela validação de verdade dentro
// da transação de evoluir (characterController).
async function avaliarRequisitosDaEvolucao(idEvolucao, personagem, transaction) {
  const ClassEvolutionRequirement = require("../models/ClassEvolutionRequirement");
  const requisitos = await ClassEvolutionRequirement.findAll({
    where: { id_evolucao: idEvolucao },
    order: [["ordem", "ASC"]],
    transaction,
  });

  const detalhes = [];
  let atendidos = true;
  for (const requisito of requisitos) {
    const resultado = await avaliarUmRequisito(requisito, personagem, transaction);
    if (!resultado.atendido) atendidos = false;
    detalhes.push({ id: requisito.id, tipo: requisito.tipo, quantidade: requisito.quantidade, reference_id: requisito.reference_id, reference_key: requisito.reference_key, ...resultado });
  }
  return { atendidos, detalhes };
}

// Consome os recursos gastáveis (GOLD/ITEM) de uma lista de requisitos
// JÁ VALIDADA como atendida — chamado dentro da MESMA transação que cria
// o CharacterClassEvolution, depois de relock/revalidação (spec §24
// "transação e lock" contra corrida concorrente). Nunca consome
// requisito que não seja um recurso gastável (LEVEL/MONSTER_KILL/RANK/
// ACHIEVEMENT são só checados, nunca "gastos").
async function consumirRequisitosGastaveis(idEvolucao, personagem, transaction) {
  const ClassEvolutionRequirement = require("../models/ClassEvolutionRequirement");
  const requisitos = await ClassEvolutionRequirement.findAll({ where: { id_evolucao: idEvolucao }, transaction });

  for (const requisito of requisitos) {
    if (requisito.tipo === "GOLD") {
      if (personagem.dinheiro < requisito.quantidade) {
        throw erro(`Requisito de ouro não cumprido (precisa de ${requisito.quantidade}).`);
      }
      personagem.dinheiro -= requisito.quantidade;
    } else if (requisito.tipo === "ITEM") {
      const entrada = await CharacterInventory.findOne({
        where: { id_personagem: personagem.id, id_item: requisito.reference_id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!entrada || entrada.quantidade < requisito.quantidade) {
        throw erro(`Item requisito não encontrado em quantidade suficiente.`);
      }
      entrada.quantidade -= requisito.quantidade;
      if (entrada.quantidade > 0) {
        await entrada.save({ transaction });
      } else {
        await entrada.destroy({ transaction });
      }
    }
  }
}

module.exports = { avaliarRequisitosDaEvolucao, consumirRequisitosGastaveis, avaliarUmRequisito };
