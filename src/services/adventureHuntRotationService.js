// Caçadas §3/§8 — ciclo de UMA oferta pessoal por personagem, por
// janela de 4h. Mesmo padrão preguiçoso de spoilOrderRotationService/
// adventureGuildRotationService: a primeira requisição de uma janela
// nova que não encontra a oferta a gera; concorrência é resolvida pela
// unique index (id_personagem, rotation_start) — nunca sorteando duas
// vezes.
const crypto = require("crypto");
const { Op } = require("sequelize");
const CharacterAdventureHunt = require("../models/CharacterAdventureHunt");
const CharacterHunterProgress = require("../models/CharacterHunterProgress");
const AdventureZone = require("../models/AdventureZone");
const AdventureZoneMonster = require("../models/AdventureZoneMonster");
const AdventureMonster = require("../models/AdventureMonster");
const {
  HUNT_ROTATION_MS,
  HUNT_DIFFICULTIES: HUNT_DIFFICULTIES_PADRAO,
  HUNT_STORY_TEMPLATES,
  inicioDaJanelaDeCacada,
} = require("../config/huntConfig");
const { sortearDificuldade } = require("./hunterReputationService");
const { sortearFatorAleatorio, calcularRecompensaOuro, calcularPoderRecomendado } = require("./hunterRewardService");
const gameSettingCache = require("./gameSettingCache");

// Painel Administrativo Fase 11 — admin pode sobrescrever via
// GameSetting ("hunts.difficulties", ver adminHuntConfigService.js).
function dificuldades() {
  return gameSettingCache.obter("hunts.difficulties", HUNT_DIFFICULTIES_PADRAO);
}

function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// §8 passos 1/2/3 — só zonas/monstros realmente ATIVOS entram no pool;
// "regiões liberadas" hoje equivale a "toda zona ativa" (mesmo
// raciocínio já documentado em spoilOrderRotationService.js: a
// Aventura não bloqueia entrada de zona por nível, §4 de AdventureZone).
async function obterPoolDeAlvos(transaction) {
  const vinculos = await AdventureZoneMonster.findAll({
    where: { ativo: true },
    include: [
      { model: AdventureMonster, as: "monstro", where: { ativo: true }, required: true },
      { model: AdventureZone, where: { ativa: true }, required: true },
    ],
    transaction,
  });

  return vinculos.map((v) => {
    const nivelMin = v.nivel_min_override ?? v.AdventureZone.nivel_monstro_min;
    const nivelMax = v.nivel_max_override ?? v.AdventureZone.nivel_monstro_max;
    return {
      idMonstro: v.id_monstro,
      nomeMonstro: v.monstro.nome,
      multiplicadores: {
        vida: v.monstro.multiplicador_vida,
        dano: v.monstro.multiplicador_dano,
      },
      idZona: v.AdventureZone.id,
      nomeZona: v.AdventureZone.nome,
      tipoAparicao: v.tipo_aparicao,
      nivelReferencia: Math.round((nivelMin + nivelMax) / 2),
    };
  });
}

async function obterOuCriarProgresso(idPersonagem, transaction) {
  const [progresso] = await CharacterHunterProgress.findOrCreate({
    where: { id_personagem: idPersonagem },
    defaults: {},
    transaction,
  });
  return progresso;
}

// §8 passos 4-8 — monta os dados completos de uma nova oferta (sem
// persistir ainda; quem chama decide create/update).
async function montarDadosDeOferta(idPersonagem, transaction) {
  const pool = await obterPoolDeAlvos(transaction);
  if (pool.length === 0) return null;

  const ofertaAnterior = await CharacterAdventureHunt.findOne({
    where: { id_personagem: idPersonagem },
    order: [["rotation_start", "DESC"]],
    transaction,
  });

  // §8 passo 4 — evita repetir o monstro da oferta imediatamente
  // anterior quando o pool permitir.
  const candidatos =
    pool.length > 1 && ofertaAnterior
      ? pool.filter((alvo) => alvo.idMonstro !== ofertaAnterior.id_monstro)
      : pool;
  const alvo = embaralhar(candidatos.length > 0 ? candidatos : pool)[0];

  const progresso = await obterOuCriarProgresso(idPersonagem, transaction);
  const dificuldadeChave = sortearDificuldade(progresso.reputation_points);
  const difficulty = dificuldades()[dificuldadeChave];

  const [minQtd, maxQtd] = difficulty.quantityRange;
  const quantidade = minQtd >= maxQtd ? minQtd : crypto.randomInt(minQtd, maxQtd + 1);

  const template = HUNT_STORY_TEMPLATES[crypto.randomInt(0, HUNT_STORY_TEMPLATES.length)];
  const historia = template.texto.replace("{regiao}", alvo.nomeZona).replace("{monstro}", alvo.nomeMonstro);
  const titulo = `Caçada: ${alvo.nomeMonstro} de ${alvo.nomeZona}`;

  const randomFactor = sortearFatorAleatorio();
  const goldReward = calcularRecompensaOuro({
    nivelReferencia: alvo.nivelReferencia,
    tipoAparicao: alvo.tipoAparicao,
    quantidade,
    difficulty,
    randomFactor,
  });
  const recommendedPower = calcularPoderRecomendado({
    nivelReferencia: alvo.nivelReferencia,
    multiplicadoresMonstro: alvo.multiplicadores,
    difficulty,
  });

  return {
    id_monstro: alvo.idMonstro,
    id_zona_referencia: alvo.idZona,
    difficulty: dificuldadeChave,
    quantity_required: quantidade,
    progress: 0,
    title_snapshot: titulo,
    story_template_key: template.key,
    story_snapshot: historia,
    hp_multiplier_snapshot: difficulty.hpMultiplier,
    damage_multiplier_snapshot: difficulty.damageMultiplier,
    reward_multiplier_snapshot: difficulty.rewardMultiplier,
    gold_reward_snapshot: goldReward,
    reputation_reward_snapshot: difficulty.reputationReward,
    recommended_power_snapshot: recommendedPower,
    random_factor_snapshot: randomFactor,
  };
}

// Garante a oferta da janela ATUAL do personagem, gerando se ainda não
// existir, e re-rolando em cima da MESMA linha se o monstro dela foi
// desativado depois de gerada (§19 "Monstro da oferta foi desativado
// antes da aceitação" — nunca cria uma segunda linha pra mesma janela,
// a unique index não permitiria).
async function garantirOfertaAtual(idPersonagem, transaction) {
  const janelaInicio = inicioDaJanelaDeCacada();
  const janelaFim = new Date(janelaInicio.getTime() + HUNT_ROTATION_MS);

  // §3.2 — ofertas de janelas passadas ainda "Offered" viram Expired.
  await CharacterAdventureHunt.update(
    { status: "Expired" },
    {
      where: { id_personagem: idPersonagem, status: "Offered", rotation_start: { [Op.lt]: janelaInicio } },
      transaction,
    },
  );

  let oferta = await CharacterAdventureHunt.findOne({
    where: { id_personagem: idPersonagem, rotation_start: janelaInicio },
    transaction,
  });

  if (!oferta) {
    const dados = await montarDadosDeOferta(idPersonagem, transaction);
    if (!dados) return null;
    try {
      oferta = await CharacterAdventureHunt.create(
        { id_personagem: idPersonagem, rotation_start: janelaInicio, rotation_end: janelaFim, status: "Offered", ...dados },
        { transaction },
      );
    } catch (erro) {
      if (erro.name !== "SequelizeUniqueConstraintError") throw erro;
      oferta = await CharacterAdventureHunt.findOne({
        where: { id_personagem: idPersonagem, rotation_start: janelaInicio },
        transaction,
      });
    }
  }

  if (oferta && oferta.status === "Offered") {
    const monstroValido = await AdventureMonster.findOne({
      where: { id: oferta.id_monstro, ativo: true },
      transaction,
    });
    if (!monstroValido) {
      const dadosNovos = await montarDadosDeOferta(idPersonagem, transaction);
      if (dadosNovos) {
        Object.assign(oferta, dadosNovos);
        await oferta.save({ transaction });
      }
    }
  }

  return oferta;
}

module.exports = { garantirOfertaAtual, obterPoolDeAlvos };
