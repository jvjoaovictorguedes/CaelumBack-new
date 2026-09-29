// Ameaça Mundial V2 — Etapa 12 (§14.2): Simulador de balanceamento
// server-side. Roda N combates SINTÉTICOS entre o relógio real de ações
// do Boss e UM personagem-perfil (HP/Defesa/Agilidade), reaproveitando
// as MESMAS peças puras do combate de verdade (worldBossRuntimeService)
// — nenhuma fórmula de dano/Fúria/IA reimplementada aqui:
//   - furiaPctDe: curva de Fúria por ação da fase;
//   - habilidadesElegiveis/escolherHabilidade: mesma IA de seleção de
//     habilidade (fase/cooldown/Mana) do relógio real;
//   - resolverDanoBasico/resolverEfeitoDeHabilidade: mesmas fórmulas de
//     acerto/esquiva/mitigação de defesa (combatFormulas.js por baixo);
//   - cooldownDaHabilidade/custoManaDaHabilidade: mesmo cálculo de
//     custo/cooldown efetivo.
//
// Fora do escopo desta V1 (deliberado, mesmo critério do simulador de
// Aventura): não simula o ataque dos JOGADORES contra o Boss (o
// objetivo aqui é validar a LETALIDADE do Boss contra um perfil, não
// prever o resultado de uma raid inteira) — a duração de cada fase é
// estimada a partir do DPS agregado informado (ou de um número fixo de
// ações por fase, se omitido), nunca simulada ação a ação dos jogadores.
// Habilidades com tempo de conjuração (telegraph) são resolvidas na
// hora, sem separar o "início do cast" da "resolução" em dois ticks —
// simplificação aceitável pro objetivo de calibrar dano/Furia/fases.
const WorldBossConfig = require("../models/WorldBossConfig");
const WorldBossPhase = require("../models/WorldBossPhase");
const WorldBossAbility = require("../models/WorldBossAbility");
const Power = require("../models/Power");
const {
  furiaPctDe,
  habilidadesElegiveis,
  escolherHabilidade,
  resolverDanoBasico,
  resolverEfeitoDeHabilidade,
  cooldownDaHabilidade,
  custoManaDaHabilidade,
} = require("./worldBossRuntimeService");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

const SIMULACOES_PADRAO = 200;
const SIMULACOES_MAXIMAS = 1000;
const ACOES_POR_FASE_PADRAO = 30;
const ACOES_POR_FASE_MAXIMO = 300;

function arredondar(valor, casas = 0) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}
function media(lista) {
  if (lista.length === 0) return 0;
  return lista.reduce((acc, v) => acc + v, 0) / lista.length;
}

// Mesma projeção de "power_snapshot" que worldBossLifecycleService.
// montarSnapshotHabilidades usa ao despertar o Boss de verdade — nunca
// um id_power solto (o motor real trabalha só com valores efetivos
// congelados).
async function montarSnapshotParaSimulacao(idConfig) {
  const config = await WorldBossConfig.findByPk(idConfig);
  if (!config) throw erro("Ameaça Mundial não encontrada.", 404);

  const fases = await WorldBossPhase.findAll({ where: { id_world_boss_config: idConfig }, order: [["ordem", "ASC"]] });
  if (fases.length === 0) throw erro("Este catálogo ainda não tem nenhuma fase cadastrada.");

  const habilidades = await WorldBossAbility.findAll({
    where: { id_world_boss_config: idConfig, ativo: true },
    include: [{ model: Power }],
    order: [["prioridade", "DESC"]],
  });

  const snapshot = {
    nome: config.nome,
    forca: config.forca,
    vitalidade: config.vitalidade,
    agilidade: config.agilidade,
    inteligencia: config.inteligencia,
    velocidade: config.velocidade,
    nivel: config.nivel,
    defesa: config.defesa,
    mana_maxima: config.mana_maxima,
    regeneracao_mana_por_acao: config.regeneracao_mana_por_acao,
    intervalo_acao_ms: config.intervalo_acao_ms,
    vida_base: Number(config.vida_base),
    abilities: habilidades
      .filter((hab) => hab.Power)
      .map((hab) => ({
        id_ability: hab.id,
        power_snapshot: {
          id: hab.Power.id,
          nome: hab.Power.nome,
          dano_base: hab.Power.dano_base,
          cura_base: hab.Power.cura_base,
          custo_mana: hab.Power.custo_mana,
          cooldown: hab.Power.cooldown,
          escala_atributo: hab.Power.escala_atributo,
          valor_escala: hab.Power.valor_escala,
        },
        peso_uso: hab.peso_uso,
        prioridade: hab.prioridade,
        fases_permitidas: hab.fases_permitidas,
        tipo_alvo: hab.tipo_alvo,
        tempo_conjuracao_ms: hab.tempo_conjuracao_ms,
        cooldown_override: hab.cooldown_override,
        custo_mana_override: hab.custo_mana_override,
        escala_com_furia: hab.escala_com_furia,
      })),
  };

  const fasesOrdenadas = fases.map((f) => ({
    id: f.id,
    ordem: f.ordem,
    nome_fase: f.nome_fase,
    hp_percentual_max: Number(f.hp_percentual_max),
    modificador_dano_percentual: Number(f.modificador_dano_percentual || 0),
    dano_min: f.dano_min,
    dano_max: f.dano_max,
    furia_por_acao_pct: Number(f.furia_por_acao_pct || 0),
    limite_furia_pct: f.limite_furia_pct !== null ? Number(f.limite_furia_pct) : null,
    intervalo_acao_ms: f.intervalo_acao_ms,
    mana_ao_entrar: f.mana_ao_entrar,
  }));

  return { snapshot, fases: fasesOrdenadas };
}

// Nº de ações do Boss dentro de UMA fase — determinístico (não depende
// de RNG), então calculado uma única vez e reaproveitado por toda
// simulação: com dps_agregado informado, deriva da janela de HP da fase
// (% da vida_base) dividida pelo DPS; sem ele, usa acoesPorFase fixo.
function acoesNaFase(fase, faseAnterior, vidaBase, dpsAgregado, acoesPorFasePadrao) {
  const intervaloMs = fase.intervalo_acao_ms ?? undefined;
  if (dpsAgregado && dpsAgregado > 0 && vidaBase > 0) {
    const janelaPct = fase.hp_percentual_max - (faseAnterior?.hp_percentual_max ?? 0);
    const hpDaJanela = (Math.max(0, janelaPct) / 100) * vidaBase;
    const duracaoMs = (hpDaJanela / dpsAgregado) * 1000;
    const acoes = Math.round(duracaoMs / (intervaloMs || 3000));
    return Math.max(1, Math.min(ACOES_POR_FASE_MAXIMO, acoes));
  }
  return Math.max(1, Math.min(ACOES_POR_FASE_MAXIMO, acoesPorFasePadrao));
}

function simularUmaLuta({ snapshot, fases, personagem, acoesPorFaseCalculadas }) {
  let vidaAtual = personagem.hp_maximo;
  let manaAtual = 0;
  let bossActionSeq = 0;
  let cooldowns = {};
  let furiaSoma = 0;
  let furiaMaxima = 0;
  let totalAcoes = 0;
  let manaGastaTotal = 0;
  const frequenciaPowers = new Map();
  const danoPorFase = new Map();
  let acaoDaMorte = null;
  let faseDaMorte = null;

  for (let i = 0; i < fases.length; i++) {
    const fase = fases[i];
    if (fase.mana_ao_entrar !== null && fase.mana_ao_entrar !== undefined) {
      manaAtual = Math.max(0, Math.min(snapshot.mana_maxima || 0, fase.mana_ao_entrar));
    }
    let phaseActionSeq = 0;
    let danoNaFase = 0;
    const acoesDestaFase = acoesPorFaseCalculadas[i];

    for (let acao = 0; acao < acoesDestaFase; acao++) {
      if (vidaAtual <= 0) break;
      phaseActionSeq += 1;
      bossActionSeq += 1;
      totalAcoes += 1;

      const furiaPct = furiaPctDe(phaseActionSeq, fase);
      furiaSoma += furiaPct;
      if (furiaPct > furiaMaxima) furiaMaxima = furiaPct;
      manaAtual = Math.min(snapshot.mana_maxima || 0, manaAtual + (snapshot.regeneracao_mana_por_acao || 0));

      const elegiveis = habilidadesElegiveis(snapshot.abilities, {
        faseId: fase.id,
        manaAtual,
        cooldowns,
        bossActionSeqDaAcao: bossActionSeq,
      });
      const abilityEscolhida = escolherHabilidade(elegiveis);

      let danoDaAcao = 0;
      if (abilityEscolhida) {
        manaAtual = Math.max(0, manaAtual - custoManaDaHabilidade(abilityEscolhida));
        const cooldownEmAcoes = cooldownDaHabilidade(abilityEscolhida);
        if (cooldownEmAcoes > 0) {
          cooldowns = { ...cooldowns, [String(abilityEscolhida.id_ability)]: bossActionSeq + cooldownEmAcoes + 1 };
        }
        manaGastaTotal += custoManaDaHabilidade(abilityEscolhida);
        const nomePower = abilityEscolhida.power_snapshot?.nome ?? `#${abilityEscolhida.id_ability}`;
        frequenciaPowers.set(nomePower, (frequenciaPowers.get(nomePower) ?? 0) + 1);

        // Só existe UM personagem sintético nesta simulação — assume-se
        // que ele está sempre entre os alvos de qualquer habilidade não-
        // SELF (pior caso, o mais seguro pra uma checagem de
        // sobrevivência: nunca subestima quanto dano este perfil pode
        // vir a receber de uma habilidade em área/multi-alvo).
        if (abilityEscolhida.tipo_alvo !== "SELF") {
          const efeito = resolverEfeitoDeHabilidade({
            snapshot,
            fase,
            furiaPct,
            ability: abilityEscolhida,
            alvoBase: { agilidade: personagem.agilidade },
            alvoDefesa: personagem.defesa,
          });
          danoDaAcao = efeito.dano;
        }
      } else {
        const info = resolverDanoBasico({
          snapshot,
          fase,
          furiaPct,
          alvoBase: { agilidade: personagem.agilidade },
          alvoDefesa: personagem.defesa,
        });
        danoDaAcao = info.dano;
      }

      if (danoDaAcao > 0) {
        vidaAtual = Math.max(0, vidaAtual - danoDaAcao);
        danoNaFase += danoDaAcao;
        if (vidaAtual === 0 && acaoDaMorte === null) {
          acaoDaMorte = bossActionSeq;
          faseDaMorte = fase.ordem;
        }
      }
    }

    danoPorFase.set(fase.ordem, { nome_fase: fase.nome_fase, dano: danoNaFase, acoes: acoesDestaFase });
    if (vidaAtual <= 0) break;
  }

  return {
    sobreviveu: vidaAtual > 0,
    acao_da_morte: acaoDaMorte,
    fase_da_morte: faseDaMorte,
    furia_media: totalAcoes > 0 ? furiaSoma / totalAcoes : 0,
    furia_maxima: furiaMaxima,
    mana_gasta_total: manaGastaTotal,
    frequencia_powers: frequenciaPowers,
    dano_por_fase: danoPorFase,
  };
}

async function simularBalanceamentoWorldBossAdmin(idConfig, dados = {}) {
  const personagem = dados.personagem ?? {};
  if (!Number.isInteger(personagem.hp_maximo) || personagem.hp_maximo <= 0) {
    throw erro("personagem.hp_maximo é obrigatório (inteiro positivo).");
  }
  const defesa = Number.isInteger(personagem.defesa) && personagem.defesa >= 0 ? personagem.defesa : 0;
  const agilidade = Number.isInteger(personagem.agilidade) && personagem.agilidade >= 0 ? personagem.agilidade : 0;

  const quantidade = Math.max(1, Math.min(SIMULACOES_MAXIMAS, Number(dados.quantidade_simulacoes) || SIMULACOES_PADRAO));
  const dpsAgregado = Number(dados.dps_agregado) > 0 ? Number(dados.dps_agregado) : null;
  const acoesPorFasePadrao = Number.isInteger(dados.acoes_por_fase) && dados.acoes_por_fase > 0 ? dados.acoes_por_fase : ACOES_POR_FASE_PADRAO;

  const { snapshot, fases } = await montarSnapshotParaSimulacao(idConfig);

  const acoesPorFaseCalculadas = fases.map((fase, i) =>
    acoesNaFase(fase, fases[i - 1], snapshot.vida_base, dpsAgregado, acoesPorFasePadrao),
  );

  const personagemSim = { hp_maximo: personagem.hp_maximo, defesa, agilidade };
  const resultados = [];
  for (let i = 0; i < quantidade; i++) {
    resultados.push(simularUmaLuta({ snapshot, fases, personagem: personagemSim, acoesPorFaseCalculadas }));
  }

  const sobreviventes = resultados.filter((r) => r.sobreviveu);
  const derrotados = resultados.filter((r) => !r.sobreviveu);

  const frequenciaTotal = new Map();
  for (const r of resultados) {
    for (const [nome, qtd] of r.frequencia_powers) {
      frequenciaTotal.set(nome, (frequenciaTotal.get(nome) ?? 0) + qtd);
    }
  }

  const danoPorFaseAgregado = fases.map((fase, i) => {
    const amostras = resultados.map((r) => r.dano_por_fase.get(fase.ordem)?.dano ?? 0).filter((_, idx) => resultados[idx].dano_por_fase.has(fase.ordem));
    return {
      ordem: fase.ordem,
      nome_fase: fase.nome_fase,
      acoes_estimadas: acoesPorFaseCalculadas[i],
      duracao_estimada_ms: acoesPorFaseCalculadas[i] * (fase.intervalo_acao_ms ?? snapshot.intervalo_acao_ms ?? 3000),
      dano_medio: arredondar(media(amostras)),
      dano_min: amostras.length > 0 ? Math.min(...amostras) : 0,
      dano_max: amostras.length > 0 ? Math.max(...amostras) : 0,
      alcancada_em_pct: arredondar((amostras.length / resultados.length) * 100, 1),
    };
  });

  return {
    config: { id: Number(idConfig), nome: snapshot.nome },
    personagem: personagemSim,
    quantidade_simulacoes: quantidade,
    taxa_sobrevivencia_pct: arredondar((sobreviventes.length / resultados.length) * 100, 1),
    acao_media_ate_derrotar: derrotados.length > 0 ? arredondar(media(derrotados.map((r) => r.acao_da_morte))) : null,
    fase_mais_letal: derrotados.length > 0
      ? [...derrotados.reduce((mapa, r) => mapa.set(r.fase_da_morte, (mapa.get(r.fase_da_morte) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1])[0][0]
      : null,
    furia_media_pct: arredondar(media(resultados.map((r) => r.furia_media)), 1),
    furia_maxima_pct: arredondar(Math.max(...resultados.map((r) => r.furia_maxima)), 1),
    mana_gasta_media: arredondar(media(resultados.map((r) => r.mana_gasta_total))),
    frequencia_powers: [...frequenciaTotal.entries()]
      .map(([nome, total]) => ({ nome, usos_totais: total, usos_medios_por_simulacao: arredondar(total / quantidade, 2) }))
      .sort((a, b) => b.usos_totais - a.usos_totais),
    dano_por_fase: danoPorFaseAgregado,
  };
}

module.exports = { simularBalanceamentoWorldBossAdmin };
