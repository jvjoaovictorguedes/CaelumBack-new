// Simulador de Pesca (Pesca v3 §9/§10/§13.4) — mede combinações de vara
// x espécie x Nível de Pesca ANTES de publicar conteúdo, sem gravar
// nenhum percentual manual (spec §10.1: "chance estimada... nunca um
// valor cadastrado manualmente"). Reutiliza EXATAMENTE o fishingEngine
// de produção (resolverPassoDeReel) — nunca uma fórmula paralela, como
// o documento exige explicitamente (§9/§12.1).
//
// Política do "jogador simulado" (spec §14.2 "não precisa reproduzir
// toda a estratégia humana pra primeira versão"): recolhe (ON) enquanto
// a tensão está dentro ou abaixo da zona ideal, solta (OFF) quando
// passa do teto da zona ideal — heurística simples e determinística o
// bastante pra comparar vara/espécie/nível de forma consistente.
const FishingSpecies = require("../models/FishingSpecies");
const Item = require("../models/Item");
const FishingRodProperties = require("../models/FishingRodProperties");
const { propriedadesEfetivasVara } = require("./equipmentRefinementService");
const { resolverPassoDeReel } = require("./fishingEngine");
const { aplicarProficienciaPesca, TENSAO_MAXIMA, PROGRESSO_PARA_CAPTURA, ZONA_IDEAL_MAX } = require("../config/fishingConfig");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

const MAX_PASSOS_POR_LUTA = 300; // teto de segurança — evita loop sem fim numa combinação absurda (spec §9.4 "alerta de número médio de passos acima do limite").
const NUM_SIMULACOES_PADRAO = 1000;
const NUM_SIMULACOES_MAX = 10000;

// Rodada única de uma "luta" simulada — mesma matemática do runtime
// real (fishingService.recolher), nunca uma cópia divergente.
function simularUmaLuta({ comportamentoKey, dificuldadeBase, rodEfetivo }) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  let tensao = 0;
  let progresso = 0;
  let sequence = 0;
  let tensaoMaxima = 0;

  for (let passo = 0; passo < MAX_PASSOS_POR_LUTA; passo += 1) {
    sequence += 1;
    const active = tensao <= ZONA_IDEAL_MAX;
    const resultado = resolverPassoDeReel({
      behaviorKey: comportamentoKey,
      seed,
      sequence,
      tensaoAtual: tensao,
      progressoAtual: progresso,
      rod: rodEfetivo,
      active,
      dificuldadeBase,
    });
    tensao = resultado.tensao;
    progresso = resultado.progresso;
    if (tensao > tensaoMaxima) tensaoMaxima = tensao;

    if (tensao >= TENSAO_MAXIMA) return { desfecho: "BROKEN_LINE", passos: sequence, tensaoMaxima };
    if (progresso >= PROGRESSO_PARA_CAPTURA) return { desfecho: "CAUGHT", passos: sequence, tensaoMaxima };
  }
  return { desfecho: "TIMEOUT", passos: MAX_PASSOS_POR_LUTA, tensaoMaxima };
}

// Monte Carlo — spec §9.2 (entradas) / §9.3 (matriz) / §10 (chance
// estimada de captura). numSimulacoes tipicamente 1.000/5.000/10.000.
function simularCaptura({ comportamentoKey, dificuldadeBase, rodEfetivo, numSimulacoes }) {
  let capturas = 0;
  let quebras = 0;
  let timeouts = 0;
  let somaPassosCaptura = 0;
  let somaTensaoMaxima = 0;

  for (let i = 0; i < numSimulacoes; i += 1) {
    const { desfecho, passos, tensaoMaxima } = simularUmaLuta({ comportamentoKey, dificuldadeBase, rodEfetivo });
    somaTensaoMaxima += tensaoMaxima;
    if (desfecho === "CAUGHT") {
      capturas += 1;
      somaPassosCaptura += passos;
    } else if (desfecho === "BROKEN_LINE") {
      quebras += 1;
    } else {
      timeouts += 1;
    }
  }

  return {
    simulacoes: numSimulacoes,
    taxa_captura: capturas / numSimulacoes,
    taxa_broken_line: quebras / numSimulacoes,
    taxa_timeout: timeouts / numSimulacoes,
    passos_medio_captura: capturas > 0 ? Math.round((somaPassosCaptura / capturas) * 10) / 10 : null,
    tensao_maxima_media: Math.round(somaTensaoMaxima / numSimulacoes),
  };
}

// Ponto de entrada do Admin (POST /api/admin/fishing/balance/simulate,
// spec §17.4) — carrega vara+espécie reais do banco, aplica a MESMA
// composição de stats efetivos do runtime (base/refinamento ->
// proficiência do Nível de Pesca; buff de Taverna fica de fora por
// padrão, spec §9.1 "opcional, desativado por padrão"), e devolve o
// breakdown pra UI mostrar "Controle 100 base -> 112 com proficiência"
// (spec §4.1).
async function simularBalanceamento({ idSpecies, idRodItem, refinamentoVara = 0, nivelPesca = 1, numSimulacoes = NUM_SIMULACOES_PADRAO }) {
  if (!idSpecies || !idRodItem) throw erro("idSpecies e idRodItem são obrigatórios.");
  const n = Math.max(1, Math.min(NUM_SIMULACOES_MAX, Number(numSimulacoes) || NUM_SIMULACOES_PADRAO));

  const especie = await FishingSpecies.findByPk(idSpecies);
  if (!especie) throw erro("Espécie não encontrada.", 404);

  const item = await Item.findByPk(idRodItem, { include: [{ model: FishingRodProperties, as: "fishingRodProperties" }] });
  if (!item || !item.fishingRodProperties) throw erro("Vara de pesca não encontrada.", 404);

  const statsBase = item.fishingRodProperties.toJSON ? item.fishingRodProperties.toJSON() : item.fishingRodProperties;
  const comRefinamento = propriedadesEfetivasVara(statsBase, refinamentoVara);
  const comProficiencia = aplicarProficienciaPesca(comRefinamento, nivelPesca);

  const resultado = simularCaptura({
    comportamentoKey: especie.comportamento_key,
    dificuldadeBase: especie.dificuldade_base,
    rodEfetivo: comProficiencia,
    numSimulacoes: n,
  });

  return {
    especie: { id: especie.id, key: especie.key, comportamento_key: especie.comportamento_key, dificuldade_base: especie.dificuldade_base },
    vara: { id_item: item.id, nome: item.nome, refinamento: refinamentoVara },
    nivel_pesca: nivelPesca,
    breakdown_stats: {
      base: { forca_linha: statsBase.forca_linha, controle: statsBase.controle, recolhimento: statsBase.recolhimento, precisao: statsBase.precisao, estabilidade: statsBase.estabilidade },
      com_refinamento: comRefinamento,
      com_proficiencia: comProficiencia,
    },
    resultado,
  };
}

// Matriz rápida (spec §9.3/§10) — mesma vara/nível contra TODAS as
// espécies ativas, pra montar a tabela "Vara x Espécie" sem cadastro
// manual (§10.1 "reatividade obrigatória do balanceamento").
async function simularMatrizPorVara({ idRodItem, refinamentoVara = 0, nivelPesca = 1, numSimulacoes = 300 }) {
  if (!idRodItem) throw erro("idRodItem é obrigatório.");
  const item = await Item.findByPk(idRodItem, { include: [{ model: FishingRodProperties, as: "fishingRodProperties" }] });
  if (!item || !item.fishingRodProperties) throw erro("Vara de pesca não encontrada.", 404);

  const especies = await FishingSpecies.findAll({ where: { ativo: true }, include: [{ model: Item, as: "item", attributes: ["id", "nome"] }] });
  const statsBase = item.fishingRodProperties.toJSON ? item.fishingRodProperties.toJSON() : item.fishingRodProperties;
  const comRefinamento = propriedadesEfetivasVara(statsBase, refinamentoVara);
  const comProficiencia = aplicarProficienciaPesca(comRefinamento, nivelPesca);
  const n = Math.max(1, Math.min(NUM_SIMULACOES_MAX, Number(numSimulacoes) || 300));

  return especies.map((especie) => {
    const resultado = simularCaptura({
      comportamentoKey: especie.comportamento_key,
      dificuldadeBase: especie.dificuldade_base,
      rodEfetivo: comProficiencia,
      numSimulacoes: n,
    });
    return {
      id_species: especie.id,
      nome: especie.item?.nome ?? especie.key,
      taxa_captura: resultado.taxa_captura,
      passos_medio_captura: resultado.passos_medio_captura,
    };
  });
}

module.exports = { simularBalanceamento, simularMatrizPorVara, simularCaptura, simularUmaLuta };
