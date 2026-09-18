// Orquestrador do sistema de Expedição — toda a matemática (sorteio,
// XP, cooldown) fica em expeditionRollService/expeditionProgressionService/
// expeditionConfig; este arquivo só orquestra transação + persistência,
// seguindo o mesmo padrão já validado na Forja v2 (craftingController.js):
// nunca combinar `lock` com `include` que gere LEFT OUTER JOIN (Postgres
// recusa FOR UPDATE do lado nullable do join) — quem precisa de lock é
// buscado "puro" primeiro, o include vem numa consulta separada sem lock.
const { sequelize } = require("../config/database");
const CharacterProfession = require("../models/CharacterProfession");
const ExpeditionRegion = require("../models/ExpeditionRegion");
const ExpeditionRegionResource = require("../models/ExpeditionRegionResource");
const ExpeditionResource = require("../models/ExpeditionResource");
const ExpeditionResourceItem = require("../models/ExpeditionResourceItem");
const CharacterInventory = require("../models/CharacterInventory");
const Item = require("../models/Item");
const { TEMPO_COLETA_MS, CHANCE_POR_NIVEL_PPM, BASE_SORTEIO, NIVEL_MAXIMO } = require("../config/expeditionConfig");
const { sortearQualidade, sortearRecurso, sortearQuantidade } = require("./expeditionRollService");
const { nivelPorXpTotal, xpParaProximoNivel, aplicarGanhoDeXp } = require("./expeditionProgressionService");

const PROFISSOES = ["Mineracao", "Silvicultura", "Exploracao"];

function formatarProfissao(profissao) {
  const nivel = nivelPorXpTotal(profissao.experiencia);
  const agora = Date.now();
  const disponivelEm = profissao.proxima_coleta_em ? new Date(profissao.proxima_coleta_em).getTime() : 0;
  return {
    tipo: profissao.tipo,
    nivel,
    experiencia: profissao.experiencia,
    xp_proximo_nivel: xpParaProximoNivel(nivel),
    proxima_coleta_em: profissao.proxima_coleta_em,
    disponivel_em_ms: Math.max(0, disponivelEm - agora),
  };
}

// Garante que o personagem tenha as 3 linhas de profissão (lazy-create
// na primeira vez que qualquer endpoint de expedição é consultado —
// evita depender de uma migration de dados por personagem existente).
async function garantirProfissoes(id_personagem, transaction) {
  const existentes = await CharacterProfession.findAll({ where: { id_personagem }, transaction });
  const tiposExistentes = new Set(existentes.map((p) => p.tipo));
  const faltantes = PROFISSOES.filter((tipo) => !tiposExistentes.has(tipo));

  if (faltantes.length > 0) {
    await CharacterProfession.bulkCreate(
      faltantes.map((tipo) => ({ id_personagem, tipo })),
      { transaction },
    );
    return CharacterProfession.findAll({ where: { id_personagem }, transaction });
  }
  return existentes;
}

async function listarProfissoes(id_personagem) {
  const profissoes = await garantirProfissoes(id_personagem);
  return profissoes
    .slice()
    .sort((a, b) => PROFISSOES.indexOf(a.tipo) - PROFISSOES.indexOf(b.tipo))
    .map(formatarProfissao);
}

// Tabela de qualidade da Expedição não depende da região, só do nível
// da profissão (ver expeditionConfig.js) — reaproveitada aqui só pra
// EXIBIR ao jogador o que ele pode encontrar, nunca pra decidir nada
// (o sorteio de verdade continua isolado em expeditionRollService.js).
function chancesDeQualidadePorNivel(nivel) {
  const nivelValido = Math.max(1, Math.min(NIVEL_MAXIMO, nivel));
  const chances = CHANCE_POR_NIVEL_PPM[nivelValido] ?? {};
  const somaPpm = Object.values(chances).reduce((soma, ppm) => soma + ppm, 0);
  const qualidades = Object.entries(chances)
    .filter(([, ppm]) => ppm > 0)
    .map(([qualidade, ppm]) => ({ qualidade, chance_percentual: ppm / 10_000 }));
  return { qualidades, chance_nada_percentual: (BASE_SORTEIO - somaPpm) / 10_000 };
}

async function listarRegioes(id_personagem, profissaoFiltro) {
  const profissoes = await garantirProfissoes(id_personagem);
  const nivelPorProfissao = new Map(profissoes.map((p) => [p.tipo, nivelPorXpTotal(p.experiencia)]));

  const where = { ativo: true };
  if (profissaoFiltro) where.profissao = profissaoFiltro;

  const regioes = await ExpeditionRegion.findAll({
    where,
    order: [["ordem", "ASC"]],
    include: [
      {
        model: ExpeditionRegionResource,
        as: "recursosDaRegiao",
        include: [{ model: ExpeditionResource, as: "recurso" }],
      },
    ],
  });

  return regioes.map((regiao) => {
    const nivelPersonagem = nivelPorProfissao.get(regiao.profissao) ?? 1;
    const pesoTotal = regiao.recursosDaRegiao.reduce((soma, r) => soma + r.peso, 0);
    const recursos = regiao.recursosDaRegiao
      .map((r) => ({
        id_recurso: r.id_recurso,
        nome: r.recurso.nome,
        peso_percentual: pesoTotal > 0 ? Math.round((r.peso / pesoTotal) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.peso_percentual - a.peso_percentual);

    return {
      id: regiao.id,
      nome: regiao.nome,
      profissao: regiao.profissao,
      nivel_minimo: regiao.nivel_minimo,
      descricao: regiao.descricao,
      imagem_url: regiao.imagem_url,
      desbloqueada: nivelPersonagem >= regiao.nivel_minimo,
      recursos,
      ...chancesDeQualidadePorNivel(nivelPersonagem),
    };
  });
}

// Fluxo transacional de coleta — a ÚNICA entrada de valor vinda do
// cliente é o id da região (via URL); tudo mais (profissão, nível,
// qualidade, recurso, quantidade, xp, item) é derivado no servidor
// (ver seção 15/17 da especificação — "o cliente não pode enviar
// resultado, item, quantidade ou xp").
async function coletar(id_personagem, id_regiao) {
  return sequelize.transaction(async (transaction) => {
    const regiao = await ExpeditionRegion.findByPk(id_regiao, { transaction });
    if (!regiao || !regiao.ativo) {
      throw Object.assign(new Error("Região de expedição não encontrada."), { statusCode: 404 });
    }

    // Cooldown é GLOBAL entre as 3 profissões (pedido do jogador: coletar
    // em Mineração também deve travar Silvicultura/Exploração por 3s,
    // não só a própria Mineração) — trava as 3 linhas de profissão do
    // personagem de uma vez, sempre na mesma ordem (PROFISSOES), pra
    // nunca dar deadlock entre duas coletas concorrentes de profissões
    // diferentes.
    const profissoesDoPersonagem = await CharacterProfession.findAll({
      where: { id_personagem, tipo: PROFISSOES },
      order: [["tipo", "ASC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const profissao = profissoesDoPersonagem.find((p) => p.tipo === regiao.profissao);
    if (!profissao || profissoesDoPersonagem.length < PROFISSOES.length) {
      throw Object.assign(new Error("Profissão não inicializada pra esse personagem."), { statusCode: 400 });
    }

    const nivelAtual = nivelPorXpTotal(profissao.experiencia);
    if (nivelAtual < regiao.nivel_minimo) {
      throw Object.assign(
        new Error(`Você precisa de nível ${regiao.nivel_minimo} em ${regiao.profissao} pra entrar nessa região.`),
        { statusCode: 400 },
      );
    }

    const agora = Date.now();
    const disponivelEm = profissao.proxima_coleta_em ? new Date(profissao.proxima_coleta_em).getTime() : 0;
    if (disponivelEm > agora) {
      throw Object.assign(new Error("Essa profissão ainda está em cooldown."), {
        statusCode: 429,
        disponivelEmMs: disponivelEm - agora,
      });
    }

    // Recursos possíveis da região (sem lock — pesos são estáticos,
    // não mudam durante uma coleta) buscados numa query separada do
    // lock acima, mesma técnica usada na Forja pra include+FOR UPDATE.
    const recursosDaRegiao = await ExpeditionRegionResource.findAll({
      where: { id_regiao: regiao.id },
      include: [{ model: ExpeditionResource, as: "recurso" }],
      transaction,
    });
    if (recursosDaRegiao.length === 0) {
      throw Object.assign(new Error("Região sem recursos configurados."), { statusCode: 500 });
    }

    const qualidadeSorteada = sortearQualidade(nivelAtual);
    let resultado = "Nada";
    let itemGanho = null;
    let quantidadeGanha = 0;

    if (qualidadeSorteada) {
      const recursoEscolhido = sortearRecurso(recursosDaRegiao);
      const quantidade = sortearQuantidade(nivelAtual, qualidadeSorteada);

      const vinculo = await ExpeditionResourceItem.findOne({
        where: { id_recurso: recursoEscolhido.id_recurso, qualidade: qualidadeSorteada },
        include: [{ model: Item, as: "item" }],
        transaction,
      });
      if (!vinculo) {
        throw Object.assign(
          new Error(
            `Recurso "${recursoEscolhido.recurso.nome}" sem Item cadastrado pra qualidade ${qualidadeSorteada}.`,
          ),
          { statusCode: 500 },
        );
      }

      const entradaInventario = await CharacterInventory.findOne({
        where: { id_personagem, id_item: vinculo.id_item },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (entradaInventario) {
        entradaInventario.quantidade += quantidade;
        await entradaInventario.save({ transaction });
      } else {
        await CharacterInventory.create(
          { id_personagem, id_item: vinculo.id_item, quantidade },
          { transaction },
        );
      }

      resultado = qualidadeSorteada;
      quantidadeGanha = quantidade;
      itemGanho = {
        id: vinculo.item.id,
        nome: vinculo.item.nome,
        raridade: vinculo.item.raridade,
        imagem_url: vinculo.item.imagem_url,
      };
    }

    const progresso = aplicarGanhoDeXp(profissao.experiencia, resultado);
    profissao.experiencia = progresso.xpTotal;

    // Grava o mesmo cooldown nas 3 linhas (não só na que coletou agora)
    // — é isso que faz o cooldown ser global entre profissões, não só
    // "por profissão".
    const proximaColetaEm = new Date(agora + TEMPO_COLETA_MS);
    for (const p of profissoesDoPersonagem) {
      p.proxima_coleta_em = proximaColetaEm;
      await p.save({ transaction });
    }

    return {
      resultado,
      item_ganho: itemGanho,
      quantidade: quantidadeGanha,
      xp_ganho: progresso.xpGanho,
      subiu_nivel: progresso.subiuNivel,
      nivel: progresso.nivelDepois,
      experiencia: progresso.xpTotal,
      xp_proximo_nivel: progresso.xpParaProximoNivel,
      proxima_coleta_em: profissao.proxima_coleta_em,
    };
  });
}

module.exports = { listarProfissoes, listarRegioes, coletar, formatarProfissao };
