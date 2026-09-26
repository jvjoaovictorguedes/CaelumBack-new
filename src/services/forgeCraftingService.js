// Fabricação — jogador escolhe blueprint + qualidade dos materiais; o
// resultado (qual qualidade final o equipamento sai) é sorteado e
// persistido no MOMENTO de iniciar (spec §49), nunca revelado antes da
// coleta. Usa o slot "Forja" da fila, compartilhado com Refinamento
// (spec §46: nunca fabricação e refinamento ao mesmo tempo).
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const CharacterForgeProgress = require("../models/CharacterForgeProgress");
const CharacterForgeQueue = require("../models/CharacterForgeQueue");
const CharacterInventory = require("../models/CharacterInventory");
const ForgeBlueprint = require("../models/ForgeBlueprint");
const ForgeBlueprintIngredient = require("../models/ForgeBlueprintIngredient");
const Item = require("../models/Item");
const WeaponProperties = require("../models/WeaponProperties");
const ArmorProperties = require("../models/ArmorProperties");
// Só o require garante que a associação Item<->WeaponProperties/
// ArmorProperties (aliases "weaponProperties"/"armorProperties") já
// foi declarada — ver models/associations.js.
require("../models/associations");
const {
  ORDEM_QUALIDADE,
  NOME_EXIBICAO_QUALIDADE,
  TEMPO_BASE_FABRICACAO_MS_POR_QUALIDADE,
  XP_FABRICACAO_POR_QUALIDADE_EQUIPAMENTO,
  reducaoTempoPorNivelForja,
  multiplicadorAntiFarmXp,
  SLOTS_FORJA,
  TIPOS_ACAO_FORJA,
} = require("../config/forgeConfig");
const { FORGE_XP_TIER_MULTIPLIER } = require("../config/equipmentTierConfig");
const { resolverIdItemDoInsumo } = require("./forgeMaterialsService");
const { aplicarRaridadeArma, aplicarRaridadeArmadura, aplicarRaridadeVara } = require("./equipmentRarityService");
const { rolarDegrausQualidadeSuperior, qualidadeComDegraus } = require("./forgeRollService");
const { bonusesAtivosPara } = require("./guildBuffService");
const { nivelPorXpTotal } = require("./forgeProgressionService");

async function resolverIngredientesResolvidos(blueprint, qualidade, transaction) {
  const resolvidos = [];
  for (const ingrediente of blueprint.ingredientes) {
    const idItem = await resolverIdItemDoInsumo(
      { tipo_insumo: ingrediente.tipo_insumo, id_recurso: ingrediente.id_recurso, qualidade },
      transaction,
    );
    if (!idItem) return null;
    // Nome do Item de VERDADE (ex.: "Barra de Ferro — Raro" ou "Tronco
    // de Carvalho — Raro"), não só o nome do recurso base — sem isso a
    // tela de Fabricação mostrava "Barra de Ferro" pra qualquer
    // qualidade selecionada, sem deixar claro qual das 6 versões o
    // jogador precisa ter.
    const item = await Item.findByPk(idItem, { attributes: ["nome", "imagem_url"], transaction });
    resolvidos.push({
      id_item: idItem,
      quantidade_necessaria: ingrediente.quantidade_base,
      nome_recurso: ingrediente.recurso?.nome,
      nome_item: item?.nome ?? ingrediente.recurso?.nome,
      imagem_url: item?.imagem_url ?? null,
      tipo_insumo: ingrediente.tipo_insumo,
    });
  }
  return resolvidos;
}

// Versão em LOTE do mesmo resolvedor acima, usada só por listarBlueprints
// — resolverIngredientesResolvidos faz 2 queries por ingrediente por
// qualidade (resolverIdItemDoInsumo + Item.findByPk), uma de cada vez,
// dentro de um for-loop aninhado (blueprint x 6 qualidades x N
// ingredientes). Pra iniciarFabricacao (1 blueprint, 1 qualidade) isso é
// irrelevante, mas pra listar TODOS os blueprints de uma vez virava
// dezenas/centenas de round-trips sequenciais ao banco — exatamente o
// motivo da Fabricação demorar muito (e às vezes nem carregar, por
// timeout). ForgeBarItem/ExpeditionResourceItem são tabelas de LOOKUP
// pequenas (recurso x qualidade -> item), então carregamos as duas
// inteiras em memória com 2 queries só, e os nomes/imagens dos Items
// envolvidos com mais 1 query — todo o resto vira leitura de Map, sem
// tocar o banco de novo.
async function carregarResolvedorEmLote() {
  const [ForgeBarItem, ExpeditionResourceItem] = [require("../models/ForgeBarItem"), require("../models/ExpeditionResourceItem")];
  const [barras, recursos] = await Promise.all([ForgeBarItem.findAll(), ExpeditionResourceItem.findAll()]);

  const porChave = new Map();
  for (const linha of barras) porChave.set(`Barra:${linha.id_recurso}:${linha.qualidade}`, linha.id_item);
  for (const linha of recursos) porChave.set(`RecursoExpedicao:${linha.id_recurso}:${linha.qualidade}`, linha.id_item);

  return {
    idItemDoInsumo(tipoInsumo, idRecurso, qualidade) {
      return porChave.get(`${tipoInsumo}:${idRecurso}:${qualidade}`) ?? null;
    },
  };
}

function resolverIngredientesResolvidosEmLote(blueprint, qualidade, resolvedor, itensPorId) {
  const resolvidos = [];
  for (const ingrediente of blueprint.ingredientes) {
    const idItem = resolvedor.idItemDoInsumo(ingrediente.tipo_insumo, ingrediente.id_recurso, qualidade);
    if (!idItem) return null;
    const item = itensPorId.get(idItem);
    resolvidos.push({
      id_item: idItem,
      quantidade_necessaria: ingrediente.quantidade_base,
      nome_recurso: ingrediente.recurso?.nome,
      nome_item: item?.nome ?? ingrediente.recurso?.nome,
      imagem_url: item?.imagem_url ?? null,
      tipo_insumo: ingrediente.tipo_insumo,
    });
  }
  return resolvidos;
}

// Atributos do item resultante daquela qualidade, pro tooltip da tela
// de Fabricação (pedido do jogador: "colocar os atributos dos itens
// que estão na forja pro player entender qual fazer") — nunca usado
// pra decidir nada no servidor, só exibição.
// Reformulação V2 (§6.1): `item` é sempre o Item CANÔNICO do blueprint
// (blueprint.itemResultado) — a raridade não escolhe outro Item, só
// escala as propriedades-base dele (equipmentRarityService), pra
// mostrar no tooltip exatamente o que a instância teria naquela
// qualidade se fosse coletada agora.
function propriedadesDoResultado(item, raridade) {
  if (!item) return null;
  if (item.weaponProperties) {
    const p = aplicarRaridadeArma(item.weaponProperties, raridade);
    return {
      tipo: "Arma",
      dano_min: p.dano_min,
      dano_max: p.dano_max,
      tipo_dano: p.tipo_dano,
      bonus_atributo: p.bonus_atributo,
      valor_bonus_atributo: p.valor_bonus_atributo,
    };
  }
  if (item.armorProperties) {
    const p = aplicarRaridadeArmadura(item.armorProperties, raridade);
    return {
      tipo: "Armadura",
      defesa: p.defesa,
      bonus_forca: p.bonus_forca,
      bonus_vitalidade: p.bonus_vitalidade,
      bonus_inteligencia: p.bonus_inteligencia,
      bonus_agilidade: p.bonus_agilidade,
      bonus_velocidade: p.bonus_velocidade,
    };
  }
  if (item.fishingRodProperties) {
    const p = aplicarRaridadeVara(item.fishingRodProperties, raridade);
    return {
      tipo: "Ferramenta",
      forca_linha: p.forca_linha,
      controle: p.controle,
      recolhimento: p.recolhimento,
      precisao: p.precisao,
      estabilidade: p.estabilidade,
    };
  }
  return null;
}

// Contagem por categoria SEM resolver ingrediente nenhum (nada de
// ForgeBarItem/ExpeditionResourceItem/Item aqui) — só pros cabeçalhos
// de seção da tela de Fabricação mostrarem "N receita(s)" com a seção
// ainda FECHADA, antes do jogador pedir os dados completos daquela
// categoria (ver listarBlueprints com `categoria`).
async function listarResumoPorCategoria() {
  const blueprints = await ForgeBlueprint.findAll({
    where: { ativo: true },
    attributes: ["categoria_equipamento"],
  });
  const contagem = new Map();
  for (const b of blueprints) {
    contagem.set(b.categoria_equipamento, (contagem.get(b.categoria_equipamento) ?? 0) + 1);
  }
  return [...contagem.entries()].map(([categoria_equipamento, total]) => ({ categoria_equipamento, total }));
}

// Lista os blueprints ativos (opcionalmente só de UMA categoria — ver
// comentário de carregarResolvedorEmLote acima sobre por que filtrar
// por categoria importa pra performance) com, pra cada qualidade
// possível de material, os ingredientes resolvidos + quanto o
// personagem tem + prévia das chances de qualidade superior (spec §59:
// "mostrar as chances antes de consumir materiais").
// Mesmos valores do ENUM categoria_equipamento em ForgeBlueprint —
// `categoria` chega como query string vinda do cliente (GET
// /crafting/blueprints?categoria=...), então nunca repassar direto pro
// WHERE sem validar: um valor fora do ENUM faria o Postgres estourar
// erro 500 em vez de simplesmente "nenhum blueprint nessa categoria".
// "Ferramenta" (Vara de Pesca — spec Pesca §10.1) reusa exatamente o
// mesmo pipeline; NUNCA vira Arma nem entra em Combat Power.
const CATEGORIAS_BLUEPRINT_VALIDAS = new Set(["Arma", "Armadura", "Capacete", "Escudo", "Acessorio1", "Acessorio2", "Ferramenta"]);

async function listarBlueprints(characterId, categoria = null) {
  if (categoria && !CATEGORIAS_BLUEPRINT_VALIDAS.has(categoria)) return [];

  const [progresso, blueprints, inventario, resolvedor] = await Promise.all([
    CharacterForgeProgress.findOne({ where: { id_personagem: characterId } }),
    ForgeBlueprint.findAll({
      where: categoria ? { ativo: true, categoria_equipamento: categoria } : { ativo: true },
      include: [
        { model: ForgeBlueprintIngredient, as: "ingredientes", include: [{ model: require("../models/ExpeditionResource"), as: "recurso" }] },
        {
          model: Item,
          as: "itemResultado",
          include: [
            { model: WeaponProperties, as: "weaponProperties" },
            { model: ArmorProperties, as: "armorProperties" },
            { model: require("../models/FishingRodProperties"), as: "fishingRodProperties" },
          ],
        },
      ],
    }),
    CharacterInventory.findAll({ where: { id_personagem: characterId } }),
    carregarResolvedorEmLote(),
  ]);
  const nivelForja = nivelPorXpTotal(progresso?.experiencia ?? 0);
  const quantidadePorItem = new Map(inventario.map((e) => [e.id_item, e.quantidade]));
  const chances = require("../config/forgeConfig").CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL[nivelForja];

  // Descobre de antemão TODOS os id_item de ingrediente que vão ser
  // usados (qualquer blueprint x qualquer qualidade) e busca nome/
  // imagem deles numa única query — em vez de um Item.findByPk por
  // ingrediente por qualidade dentro do loop abaixo.
  const idsDeItemNecessarios = new Set();
  for (const blueprint of blueprints) {
    for (const ingrediente of blueprint.ingredientes) {
      for (const qualidade of ORDEM_QUALIDADE) {
        const idItem = resolvedor.idItemDoInsumo(ingrediente.tipo_insumo, ingrediente.id_recurso, qualidade);
        if (idItem) idsDeItemNecessarios.add(idItem);
      }
    }
  }
  const itensDeIngrediente = idsDeItemNecessarios.size
    ? await Item.findAll({
        where: { id: { [require("sequelize").Op.in]: [...idsDeItemNecessarios] } },
        attributes: ["id", "nome", "imagem_url"],
      })
    : [];
  const itensPorId = new Map(itensDeIngrediente.map((item) => [item.id, item]));

  const dados = [];
  for (const blueprint of blueprints) {
    const itemCanonico = blueprint.itemResultado;
    const variantes = [];
    for (const qualidade of ORDEM_QUALIDADE) {
      const ingredientesResolvidos = resolverIngredientesResolvidosEmLote(blueprint, qualidade, resolvedor, itensPorId);
      if (!ingredientesResolvidos) continue;

      const ingredientesComEstoque = ingredientesResolvidos.map((ing) => ({
        ...ing,
        quantidade_disponivel: quantidadePorItem.get(ing.id_item) ?? 0,
      }));
      const temMateriais = ingredientesComEstoque.every(
        (ing) => ing.quantidade_disponivel >= ing.quantidade_necessaria,
      );

      const indiceBase = ORDEM_QUALIDADE.indexOf(qualidade);
      const chancesExibicao = {};
      for (let degrau = 0; degrau <= 5; degrau += 1) {
        const indiceFinal = Math.min(ORDEM_QUALIDADE.length - 1, indiceBase + degrau);
        const qualidadeFinal = ORDEM_QUALIDADE[indiceFinal];
        const chavePpm = degrau === 0 ? "mesma" : `mais${degrau}`;
        const ppm = chances?.[chavePpm] ?? 0;
        if (ppm > 0 || degrau === 0) {
          chancesExibicao[qualidadeFinal] = (chancesExibicao[qualidadeFinal] ?? 0) + ppm / 10_000;
        }
      }

      variantes.push({
        qualidade,
        qualidade_exibicao: NOME_EXIBICAO_QUALIDADE[qualidade],
        ingredientes: ingredientesComEstoque,
        pode_fabricar: temMateriais && nivelForja >= blueprint.nivel_forja_minimo,
        chances_percentual: chancesExibicao,
        // Atributos do item nesta qualidade (resultado garantido se não
        // rolar degrau de qualidade superior) — pro tooltip do frontend.
        propriedades: propriedadesDoResultado(itemCanonico, qualidade),
        tempo_segundos: Math.round(
          (TEMPO_BASE_FABRICACAO_MS_POR_QUALIDADE[qualidade] *
            blueprint.multiplicador_tempo *
            (1 - reducaoTempoPorNivelForja(nivelForja))) /
            1000,
        ),
      });
    }

    dados.push({
      id: blueprint.id,
      nome: blueprint.nome,
      // Tier fixo da receita (spec de Tier §30: "o jogador deve saber
      // que está fabricando uma receita Tier II, independentemente da
      // Raridade final") — mostrado antes mesmo de escolher qualidade.
      tier_equipamento: blueprint.tier_equipamento,
      categoria_equipamento: blueprint.categoria_equipamento,
      // Só existe pra categoria "Arma" — usado pra montar a subseção por
      // tipo de arma (Espada/Cajado/etc.) na tela de Fabricação, já que
      // um blueprint não guarda isso direto (vem do item resultado).
      tipo_arma: itemCanonico?.weaponProperties?.tipo_arma ?? null,
      nivel_forja_minimo: blueprint.nivel_forja_minimo,
      imagem_url: itemCanonico?.imagem_url ?? null,
      variantes,
    });
  }
  return dados;
}

async function iniciarFabricacao(characterId, { id_blueprint, qualidade }) {
  return sequelize.transaction(async (transaction) => {
    // Trava o Character ANTES de checar o slot — Character é a única
    // linha garantidamente já existente pra esse personagem; travar uma
    // linha que talvez não exista ainda (a fila, no primeiro trabalho)
    // não serializa nada, porque um SELECT ... FOR UPDATE sem match não
    // bloqueia ninguém (10 requests concorrentes todas veem "fila vazia"
    // e todas tentam inserir, uma delas estoura a constraint unique como
    // erro 500 em vez de um 400 limpo). Travar Character primeiro faz a
    // segunda requisição esperar e só então reler a fila já atualizada.
    await Character.findByPk(characterId, { transaction, lock: transaction.LOCK.UPDATE });

    const filaExistente = await CharacterForgeQueue.findOne({
      where: { id_personagem: characterId, slot: SLOTS_FORJA.FORJA },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (filaExistente) {
      throw Object.assign(
        new Error("O slot de Forja já está ocupado — colete ou espere terminar antes de começar outro trabalho."),
        { statusCode: 400 },
      );
    }

    const progresso = await CharacterForgeProgress.findOne({
      where: { id_personagem: characterId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const nivelForja = nivelPorXpTotal(progresso?.experiencia ?? 0);

    const blueprint = await ForgeBlueprint.findByPk(id_blueprint, {
      include: [{ model: ForgeBlueprintIngredient, as: "ingredientes" }],
      transaction,
    });
    if (!blueprint || !blueprint.ativo) {
      throw Object.assign(new Error("Blueprint não encontrado."), { statusCode: 404 });
    }
    if (nivelForja < blueprint.nivel_forja_minimo) {
      throw Object.assign(
        new Error(`Você precisa de nível ${blueprint.nivel_forja_minimo} de Forja pra esse blueprint.`),
        { statusCode: 400 },
      );
    }
    if (!ORDEM_QUALIDADE.includes(qualidade)) {
      throw Object.assign(new Error("Qualidade de material inválida."), { statusCode: 400 });
    }

    const ingredientesResolvidos = await resolverIngredientesResolvidos(blueprint, qualidade, transaction);
    if (!ingredientesResolvidos) {
      throw Object.assign(new Error(`Sem materiais configurados nessa qualidade pra esse blueprint.`), {
        statusCode: 500,
      });
    }

    for (const ingrediente of ingredientesResolvidos) {
      const entrada = await CharacterInventory.findOne({
        where: { id_personagem: characterId, id_item: ingrediente.id_item },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!entrada || entrada.quantidade < ingrediente.quantidade_necessaria) {
        throw Object.assign(
          new Error(`Falta material pra essa fabricação (id_item ${ingrediente.id_item}).`),
          { statusCode: 400 },
        );
      }
    }
    for (const ingrediente of ingredientesResolvidos) {
      const entrada = await CharacterInventory.findOne({
        where: { id_personagem: characterId, id_item: ingrediente.id_item },
        transaction,
      });
      entrada.quantidade -= ingrediente.quantidade_necessaria;
      if (entrada.quantidade <= 0) await entrada.destroy({ transaction });
      else await entrada.save({ transaction });
    }

    // Resultado sorteado JÁ AGORA (spec §49) — nunca no collect. Buff de
    // Forja da Guilda (§21/§22) só afeta Fabricação, nunca Refinamento/
    // Fundição/Pergaminhos.
    const { forjaPontosPercentuais } = await bonusesAtivosPara(characterId, transaction);
    const degraus = rolarDegrausQualidadeSuperior(nivelForja, forjaPontosPercentuais);
    const qualidadeFinal = qualidadeComDegraus(qualidade, degraus);
    // Reformulação V2 (§6.1): o blueprint produz sempre o MESMO Item
    // canônico (id_item_resultado) — a qualidade sorteada vira a
    // raridade da instância no momento da coleta (forgeService.coletar),
    // nunca escolhe outro Item (ForgeBlueprintResult, legado, só existe
    // até o Contract).
    if (!blueprint.id_item_resultado) {
      throw Object.assign(
        new Error(`Blueprint "${blueprint.nome}" ainda não tem um Item resultado configurado — configure no Painel Administrativo antes de fabricar.`),
        { statusCode: 500 },
      );
    }

    // Multiplicador moderado por Tier (spec de Tier §32) — receitas mais
    // avançadas recompensam mais XP de Fabricação. Mantém o anti-farm
    // existente (multiplicadorAntiFarmXp) intacto, só multiplicando por
    // cima.
    const multiplicadorTier = FORGE_XP_TIER_MULTIPLIER[blueprint.tier_equipamento] ?? 1;
    const xpGanho = Math.round(
      XP_FABRICACAO_POR_QUALIDADE_EQUIPAMENTO[qualidadeFinal] *
        multiplicadorAntiFarmXp(nivelForja, qualidade) *
        multiplicadorTier,
    );
    const tempoMs = Math.round(
      TEMPO_BASE_FABRICACAO_MS_POR_QUALIDADE[qualidade] *
        blueprint.multiplicador_tempo *
        (1 - reducaoTempoPorNivelForja(nivelForja)),
    );

    const iniciadoEm = new Date();
    const prontoEm = new Date(iniciadoEm.getTime() + tempoMs);

    await CharacterForgeQueue.create(
      {
        id_personagem: characterId,
        slot: SLOTS_FORJA.FORJA,
        tipo_acao: TIPOS_ACAO_FORJA.FABRICACAO,
        referencia: { id_blueprint: blueprint.id, nome_blueprint: blueprint.nome, qualidade_material: qualidade },
        payload_resultado: { id_item: blueprint.id_item_resultado, qualidade_final: qualidadeFinal, xp: xpGanho },
        iniciado_em: iniciadoEm,
        pronto_em: prontoEm,
      },
      { transaction },
    );

    return { pronto_em: prontoEm, tempo_segundos: Math.round(tempoMs / 1000) };
  });
}

module.exports = { listarBlueprints, listarResumoPorCategoria, iniciarFabricacao, resolverIngredientesResolvidos };
