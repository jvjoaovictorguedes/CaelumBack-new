// Fundição — Fragmentos (Mineração) -> Barras, sempre preservando a
// qualidade (spec §5: nunca Fragmento Raro -> Barra Comum nem o
// contrário). Roda de forma síncrona (sem fila): a tela de Fundição da
// spec (§58) não mostra tempo/contagem nenhuma, diferente de Fabricação
// (§59, "Tempo: 20 minutos") e Refinamento (§60) — então, embora §46-48
// desenhem um "slot Fundição" na arquitetura da fila, a decisão tomada
// aqui é resolver a Fundição na hora (mesma transação do pedido), e
// deixar o slot "Fundicao" da fila reservado pra uso futuro caso a spec
// realmente precise de tempo de espera nele. Documentado no relatório
// final como a adaptação técnica pedida pela própria spec quando duas
// seções entram em conflito.
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const CharacterForgeProgress = require("../models/CharacterForgeProgress");
const CharacterInventory = require("../models/CharacterInventory");
const ExpeditionResource = require("../models/ExpeditionResource");
const ExpeditionResourceItem = require("../models/ExpeditionResourceItem");
const ForgeBarItem = require("../models/ForgeBarItem");
const Item = require("../models/Item");
const {
  ORDEM_QUALIDADE,
  FRAGMENTOS_POR_BARRA,
  QUALIDADE_MAXIMA_FUNDICAO_POR_NIVEL,
  CHANCE_BARRA_BONUS_PPM_POR_NIVEL,
  XP_FUNDICAO_POR_QUALIDADE_BARRA,
} = require("../config/forgeConfig");
const { rolarBarraBonus } = require("./forgeRollService");
const { aplicarGanhoDeXp, nivelPorXpTotal } = require("./forgeProgressionService");
const { addStack } = require("./inventoryService");
const forgeTelemetryService = require("./forgeTelemetryService");

function indiceQualidadeMaxima(nivelForja) {
  const qualidadeMaxima = QUALIDADE_MAXIMA_FUNDICAO_POR_NIVEL[nivelForja] ?? "Comum";
  return ORDEM_QUALIDADE.indexOf(qualidadeMaxima);
}

// Menor nível de Forja que já funde essa qualidade — inverte
// QUALIDADE_MAXIMA_FUNDICAO_POR_NIVEL (que é "maior qualidade POR nível")
// pra achar "menor nível QUE libera essa qualidade", pra tela de Fundição
// poder mostrar o requisito de cada qualidade ainda travada, não só a
// que já está liberada.
function nivelForjaMinimoParaQualidade(qualidade) {
  const indiceAlvo = ORDEM_QUALIDADE.indexOf(qualidade);
  const niveis = Object.keys(QUALIDADE_MAXIMA_FUNDICAO_POR_NIVEL)
    .map(Number)
    .sort((a, b) => a - b);
  for (const nivel of niveis) {
    if (indiceQualidadeMaxima(nivel) >= indiceAlvo) return nivel;
  }
  return niveis[niveis.length - 1];
}

async function garantirProgresso(characterId, transaction) {
  const [progresso] = await CharacterForgeProgress.findOrCreate({
    where: { id_personagem: characterId },
    defaults: { id_personagem: characterId },
    transaction,
  });
  return progresso;
}

// Lista, pra cada recurso de Mineração x qualidade DESBLOQUEADA pelo
// nível de Forja atual, quantos fragmentos o personagem tem — a tela de
// Fundição (spec §58) mostra isso por qualidade.
async function listarOpcoes(characterId) {
  const progresso = await garantirProgresso(characterId);
  const nivelForja = nivelPorXpTotal(progresso.experiencia);
  const indiceMax = indiceQualidadeMaxima(nivelForja);

  const recursos = await ExpeditionResource.findAll({ where: { profissao: "Mineracao" } });
  const inventario = await CharacterInventory.findAll({ where: { id_personagem: characterId } });
  const quantidadePorItem = new Map(inventario.map((entrada) => [entrada.id_item, entrada.quantidade]));

  // Lista TODAS as 6 qualidades por minério (não só as já desbloqueadas)
  // — as travadas vêm com desbloqueada:false + nivel_forja_necessario,
  // pra tela de Fundição mostrar o requisito de cada uma em vez de só
  // sumir com o que o jogador ainda não alcançou.
  const opcoes = [];
  for (const recurso of recursos) {
    for (let indice = 0; indice < ORDEM_QUALIDADE.length; indice += 1) {
      const qualidade = ORDEM_QUALIDADE[indice];
      const fragmento = await ExpeditionResourceItem.findOne({
        where: { id_recurso: recurso.id, qualidade },
        include: [{ model: Item, as: "item" }],
      });
      const barra = await ForgeBarItem.findOne({
        where: { id_recurso: recurso.id, qualidade },
        include: [{ model: Item, as: "item" }],
      });
      if (!fragmento || !barra) continue;

      const desbloqueada = indice <= indiceMax;
      opcoes.push({
        id_recurso: recurso.id,
        nome_recurso: recurso.nome,
        qualidade,
        desbloqueada,
        nivel_forja_necessario: nivelForjaMinimoParaQualidade(qualidade),
        fragmentos_disponiveis: desbloqueada ? (quantidadePorItem.get(fragmento.id_item) ?? 0) : 0,
        fragmentos_por_barra: FRAGMENTOS_POR_BARRA[qualidade],
        bonus_chance_percentual: desbloqueada ? (CHANCE_BARRA_BONUS_PPM_POR_NIVEL[nivelForja] ?? 0) / 10_000 : 0,
        nome_fragmento: fragmento.item.nome,
        imagem_fragmento: fragmento.item.imagem_url,
        nome_barra: barra.item.nome,
        imagem_barra: barra.item.imagem_url,
      });
    }
  }
  return opcoes;
}

// Funde `quantidadeBarras` barras-base (cada uma consumindo
// FRAGMENTOS_POR_BARRA fragmentos) — o bônus de +1 barra é rolado
// individualmente POR barra-base (spec §8), nunca em lote.
async function fundir(characterId, { id_recurso, qualidade, quantidadeBarras }) {
  return sequelize.transaction(async (transaction) => {
    if (!Number.isInteger(quantidadeBarras) || quantidadeBarras < 1) {
      throw Object.assign(new Error("Quantidade de barras inválida."), { statusCode: 400 });
    }

    // Trava Character primeiro — mesma razão do forgeCraftingService.js:
    // serializa fundições concorrentes do mesmo personagem antes de
    // qualquer SELECT ... FOR UPDATE em linhas que podem não existir
    // ainda (progresso de Forja na primeira vez, ou o próprio item de
    // barra no inventário, que não tem unique constraint em
    // (id_personagem, id_item) — duas criações concorrentes virariam
    // duas linhas de inventário duplicadas em vez de uma só somada).
    await Character.findByPk(characterId, { transaction, lock: transaction.LOCK.UPDATE });

    const progresso = await CharacterForgeProgress.findOne({
      where: { id_personagem: characterId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const nivelForja = nivelPorXpTotal(progresso?.experiencia ?? 0);
    const indiceQualidade = ORDEM_QUALIDADE.indexOf(qualidade);
    if (indiceQualidade === -1 || indiceQualidade > indiceQualidadeMaxima(nivelForja)) {
      throw Object.assign(
        new Error(`Seu nível de Forja ainda não permite fundir qualidade ${qualidade}.`),
        { statusCode: 400 },
      );
    }

    const fragmento = await ExpeditionResourceItem.findOne({ where: { id_recurso, qualidade }, transaction });
    const barra = await ForgeBarItem.findOne({ where: { id_recurso, qualidade }, transaction });
    if (!fragmento || !barra) {
      throw Object.assign(new Error("Recurso/qualidade sem fragmento ou barra configurados."), { statusCode: 500 });
    }

    const fragmentosNecessarios = FRAGMENTOS_POR_BARRA[qualidade] * quantidadeBarras;
    const entradaFragmento = await CharacterInventory.findOne({
      where: { id_personagem: characterId, id_item: fragmento.id_item },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!entradaFragmento || entradaFragmento.quantidade < fragmentosNecessarios) {
      throw Object.assign(
        new Error(
          `Fragmentos insuficientes: precisa de ${fragmentosNecessarios}, tem ${entradaFragmento?.quantidade ?? 0}.`,
        ),
        { statusCode: 400 },
      );
    }

    let totalBarras = 0;
    for (let i = 0; i < quantidadeBarras; i += 1) {
      totalBarras += 1;
      if (rolarBarraBonus(nivelForja)) totalBarras += 1;
    }

    entradaFragmento.quantidade -= fragmentosNecessarios;
    if (entradaFragmento.quantidade <= 0) {
      await entradaFragmento.destroy({ transaction });
    } else {
      await entradaFragmento.save({ transaction });
    }

    await addStack(characterId, barra.id_item, totalBarras, transaction);

    // XP contado só pelas barras-BASE pedidas, não pelas de bônus — senão
    // o próprio bônus de sorte vira uma segunda fonte de XP em cima da
    // primeira.
    const ganhoXp = XP_FUNDICAO_POR_QUALIDADE_BARRA[qualidade] * quantidadeBarras;
    const progressoAtualizado =
      progresso ?? (await CharacterForgeProgress.create({ id_personagem: characterId }, { transaction }));
    const resultadoXp = aplicarGanhoDeXp(progressoAtualizado.experiencia, ganhoXp);
    progressoAtualizado.experiencia = resultadoXp.xpTotal;
    progressoAtualizado.nivel = resultadoXp.nivelDepois;
    await progressoAtualizado.save({ transaction });

    await forgeTelemetryService.registrarEvento(
      {
        tipo_acao: "Fundicao",
        id_personagem: characterId,
        id_recurso,
        qualidade_base: qualidade,
        qualidade_final: qualidade,
        xp_ganho: ganhoXp,
      },
      transaction,
    );

    return {
      barras_produzidas: totalBarras,
      barras_bonus: totalBarras - quantidadeBarras,
      xp_ganho: resultadoXp.xpGanho,
      subiu_nivel: resultadoXp.subiuNivel,
      nivel_forja: resultadoXp.nivelDepois,
    };
  });
}

module.exports = { listarOpcoes, fundir, garantirProgresso };
