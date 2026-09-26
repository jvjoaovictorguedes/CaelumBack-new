// src/services/monsterBalancePreviewService.js
//
// Admin Aventura — Editor de Balanceamento de Monstros por Resultado
// (§9.1). Camada de TRADUÇÃO/PREVIEW por cima das fórmulas reais de
// combate — nunca uma segunda fórmula paralela (§9.2). Tudo aqui é
// determinístico (sem Math.random): a variação real de ±10% do jogo
// continua só em combatController.gerarInimigo; aqui só aproximamos os
// extremos (variacao 0.9/1.1) pra exibir min/máx sem depender de RNG.
//
// NUNCA persiste nada (§9.3/§13) — só lê AdventureZone/AdventureZoneMonster
// pra descobrir a faixa de nível vinculada ao monstro, quando existir.
const combatController = require("../controllers/combatController");
const {
  vidaMaximaDe,
  danoBasicoEsperado,
  aplicarMitigacaoDeDefesa,
  probabilidadeDeEsquiva,
} = require("./combatFormulas");
const AdventureZone = require("../models/AdventureZone");
const AdventureZoneMonster = require("../models/AdventureZoneMonster");
const {
  MULTIPLICADOR_MINIMO,
  MULTIPLICADOR_MAXIMO,
  ESQUIVA_MINIMA_PCT,
  ESQUIVA_MAXIMA_PCT,
  PERFIS_SINTETICOS,
  classificarDificuldade,
  multiplicadorValido,
} = require("../config/monsterBalanceConfig");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

// ---------------------------------------------------------- BASE/NÍVEL

// Base determinística (multiplicador 1, sem RNG) do monstro num nível —
// a MESMA fórmula de gerarInimigo, só sem variação (§9.1 "obter a BASE
// MÉDIA do monstro no nível selecionado").
function basePorNivel(nivel) {
  const stats = combatController.statsFinaisDoMonstroPorNivel(nivel, {}, () => 1);
  return {
    vidaMedia: stats.vidaMaxima,
    danoMedio: stats.danoBase,
    agilidadeMedia: stats.agilidade,
    velocidadeMedia: stats.velocidade,
  };
}

// min/média/máx aproximados da variação real de ±10% — mesma fórmula,
// sem depender de Math.random (§5 "mínimo aproximado (-10%), média
// determinística e máximo aproximado (+10%)").
function statsFinaisComFaixa(nivel, multiplicadores) {
  const media = combatController.statsFinaisDoMonstroPorNivel(nivel, multiplicadores, () => 1);
  const minimo = combatController.statsFinaisDoMonstroPorNivel(nivel, multiplicadores, () => 0.9);
  const maximo = combatController.statsFinaisDoMonstroPorNivel(nivel, multiplicadores, () => 1.1);

  return {
    vida: { min: minimo.vidaMaxima, media: media.vidaMaxima, max: maximo.vidaMaxima },
    dano: { min: minimo.danoBase, media: media.danoBase, max: maximo.danoBase },
    agilidade: { min: minimo.agilidade, media: media.agilidade, max: maximo.agilidade },
    velocidade: { min: minimo.velocidade, media: media.velocidade, max: maximo.velocidade },
  };
}

// -------------------------------------------------- PERFIS SINTÉTICOS

// Perfil de jogador sintético SÓ pra comparação (§6) — nunca lê
// personagem real, nunca influencia a geração do monstro de verdade.
// Mesmo formato de personagem que combatFormulas espera (forca/
// vitalidade/agilidade/inteligencia/velocidade/defesa/arma_equipada).
function construirPerfilSintetico(nivel, perfilChave = "MEDIO") {
  const cfg = PERFIS_SINTETICOS[perfilChave] ?? PERFIS_SINTETICOS.MEDIO;
  const referencia = combatController.statsDeReferenciaPorNivel(nivel);
  const atributo = Math.max(1, Math.round(referencia.forca * (1 + cfg.bonusAtributoPct)));

  return {
    nivel: referencia.nivel,
    forca: atributo,
    vitalidade: atributo,
    agilidade: atributo,
    inteligencia: atributo,
    velocidade: atributo,
    defesa: Math.max(0, Math.round(referencia.nivel * cfg.defesaPorNivel)),
    arma_equipada: { dano_min: cfg.armaDanoMinBase, dano_max: cfg.armaDanoMaxBase },
    multiplicador_dano_fisico: 1,
    multiplicador_dano_magico: 1,
    multiplicador_vida_por_nivel: 1,
    multiplicador_mana_por_nivel: 1,
  };
}

function perfisDisponiveis() {
  return Object.keys(PERFIS_SINTETICOS).map((chave) => ({ chave, label: PERFIS_SINTETICOS[chave].label }));
}

// --------------------------------------------------------- ESQUIVA/TTK

// Esquiva do MONSTRO contra cada perfil sintético (§5 "chance estimada
// contra perfis Fraco, Médio e Forte") — monstro é o defensor, o
// jogador sintético é quem ataca. Mesma fórmula real de esquiva
// (combatFormulas.probabilidadeDeEsquiva), nunca reimplementada.
function esquivaContraPerfis(nivel, agilidadeMonstro) {
  const monstro = { agilidade: agilidadeMonstro };
  const saida = {};
  for (const chave of Object.keys(PERFIS_SINTETICOS)) {
    const jogador = construirPerfilSintetico(nivel, chave);
    saida[chave] = Math.round(probabilidadeDeEsquiva(monstro, jogador) * 1000) / 10; // 1 casa decimal, em %
  }
  return saida;
}

// Estimativa de turnos pra matar/morrer — determinística (valor
// ESPERADO, não simulação estocástica; o botão "Simular" é quem dá o
// número estatístico real). Reusa exatamente calcularDanoBasico/
// danoBasicoEsperado/aplicarMitigacaoDeDefesa/probabilidadeDeEsquiva —
// nunca uma fórmula de dano nova.
function estimarTurnos(nivel, statsMonstroMedia, perfilChave = "MEDIO") {
  const jogador = construirPerfilSintetico(nivel, perfilChave);
  const monstro = { agilidade: statsMonstroMedia.agilidade };

  const chanceMonstroEsquivar = probabilidadeDeEsquiva(monstro, jogador);
  const danoJogadorPorTurno = Math.max(
    0.01,
    danoBasicoEsperado(jogador) * (1 - chanceMonstroEsquivar),
  );
  const turnosParaMatar = Math.max(1, Math.ceil(statsMonstroMedia.vidaMaxima / danoJogadorPorTurno));

  const chanceJogadorEsquivar = probabilidadeDeEsquiva(jogador, monstro);
  const danoMonstroMitigado = aplicarMitigacaoDeDefesa(statsMonstroMedia.danoBase, jogador);
  const danoMonstroPorTurno = Math.max(0.01, danoMonstroMitigado * (1 - chanceJogadorEsquivar));
  const turnosParaMorrer = Math.max(1, Math.ceil(vidaMaximaDe(jogador) / danoMonstroPorTurno));

  return { turnosParaMatar, turnosParaMorrer };
}

// Classificação heurística (sem rodar 1.000 combates) — proporção do
// "orçamento de turnos" que sobra pro jogador. É só uma aproximação de
// UX pra já mostrar algo no preview em tempo real; a classificação real
// vem de monsterBalanceSimulationService (botão "Simular").
function dificuldadeHeuristica(turnosParaMatar, turnosParaMorrer) {
  const taxaAproximada = turnosParaMorrer / Math.max(1, turnosParaMatar + turnosParaMorrer);
  const faixa = classificarDificuldade(taxaAproximada);
  return { ...faixa, taxaVitoriaJogadorAproximada: Math.round(taxaAproximada * 1000) / 10, origem: "heuristica" };
}

// ------------------------------------------------------- CONVERSÃO §4

// desired -> multiplicadores (§4.1-§4.4). Nunca confia no que o
// frontend eventualmente já calculou — sempre recalcula aqui (§13
// "Backend é autoridade").
function converterDesejadoParaMultiplicadores(nivel, desired) {
  const base = basePorNivel(nivel);
  const avisos = [];

  function razaoValida(valorDesejado, valorBase, nomeCampo) {
    if (!Number.isFinite(valorDesejado) || valorDesejado <= 0) {
      throw erro(`${nomeCampo} desejado precisa ser um número positivo.`);
    }
    return valorDesejado / valorBase;
  }

  const multiplicador_vida = razaoValida(desired?.hpMean, base.vidaMedia, "Vida média");
  const multiplicador_dano = razaoValida(desired?.damageMean, base.danoMedio, "Dano médio");
  const multiplicador_velocidade = razaoValida(desired?.speedMean, base.velocidadeMedia, "Velocidade final");

  // Esquiva/Agilidade (§4.3) — sempre contra o perfil "Médio", que é o
  // rótulo mostrado no Modo Simples ("Esquiva vs perfil médio").
  let dodgeAlvoPct = Number(desired?.dodgeVsAveragePct);
  if (!Number.isFinite(dodgeAlvoPct)) throw erro("Esquiva desejada precisa ser um número.");
  if (dodgeAlvoPct < ESQUIVA_MINIMA_PCT) {
    avisos.push(
      `Esquiva desejada (${dodgeAlvoPct}%) está abaixo do piso real do motor (${ESQUIVA_MINIMA_PCT}%) — ajustada para ${ESQUIVA_MINIMA_PCT}%.`,
    );
    dodgeAlvoPct = ESQUIVA_MINIMA_PCT;
  } else if (dodgeAlvoPct > ESQUIVA_MAXIMA_PCT) {
    avisos.push(
      `Esquiva desejada (${dodgeAlvoPct}%) está acima do teto real do motor (${ESQUIVA_MAXIMA_PCT}%) — ajustada para ${ESQUIVA_MAXIMA_PCT}%.`,
    );
    dodgeAlvoPct = ESQUIVA_MAXIMA_PCT;
  }

  const perfilMedio = construirPerfilSintetico(nivel, "MEDIO");
  const agilidadeMonstroAlvo = perfilMedio.agilidade + (dodgeAlvoPct - ESQUIVA_MINIMA_PCT);
  const multiplicador_agilidade = agilidadeMonstroAlvo / base.agilidadeMedia;

  const multiplicadores = {
    vida: multiplicador_vida,
    dano: multiplicador_dano,
    agilidade: multiplicador_agilidade,
    velocidade: multiplicador_velocidade,
  };

  for (const [chave, valor] of Object.entries(multiplicadores)) {
    if (!multiplicadorValido(valor)) {
      throw erro(
        `O valor desejado para "${chave}" resultaria num multiplicador inválido ou fora dos limites técnicos (${valor}).`,
      );
    }
  }

  return { multiplicadores, avisos, base };
}

// --------------------------------------------------------- FAIXA/ZONA

// Faixa de nível vinculada ao monstro (aparições ativas), respeitando
// override por aparição — MESMA precedência real de
// adventureRollService.sortearNivelMonstro (nivel_min/max_override ??
// zone.nivel_monstro_min/max). Sem nenhuma aparição vinculada, devolve
// null (o Admin ainda pode escolher um nível de referência manualmente).
async function faixaNivelDoMonstro(idMonstro, idZonaExplicita) {
  const where = { id_monstro: idMonstro, ativo: true };
  if (idZonaExplicita) where.id_area = idZonaExplicita;

  const aparicoes = await AdventureZoneMonster.findAll({
    where,
    include: [{ model: AdventureZone, attributes: ["id", "nome", "nivel_monstro_min", "nivel_monstro_max"] }],
  });

  if (aparicoes.length === 0) return null;

  let min = null;
  let max = null;
  for (const aparicao of aparicoes) {
    const zona = aparicao.AdventureZone;
    if (!zona) continue;
    const minEfetivo = aparicao.nivel_min_override ?? zona.nivel_monstro_min;
    const maxEfetivo = aparicao.nivel_max_override ?? zona.nivel_monstro_max;
    if (min === null || minEfetivo < min) min = minEfetivo;
    if (max === null || maxEfetivo > max) max = maxEfetivo;
  }

  if (min === null || max === null) return null;
  return { min, max };
}

// ------------------------------------------------------------ PREVIEW

const AVISO_VELOCIDADE =
  "Velocidade atualmente não altera iniciativa/ordem de turno no combate PvE solo (a ordem é sempre jogador ataca, depois o monstro contra-ataca) — funciona só como estatística persistida/exibida nesta versão.";

function linhaDaFaixa(nivel, multiplicadores) {
  const stats = statsFinaisComFaixa(nivel, multiplicadores);
  const esquiva = esquivaContraPerfis(nivel, stats.agilidade.media);
  return {
    nivel,
    vidaMedia: stats.vida.media,
    danoMedio: stats.dano.media,
    agilidadeMedia: stats.agilidade.media,
    velocidadeMedia: stats.velocidade.media,
    esquivaVsMedio: esquiva.MEDIO,
  };
}

// Monta o preview completo (§5) — usado tanto no Modo Simples (mode:
// "desired") quanto no Modo Avançado (mode: "multipliers", editando os
// 4 multiplicadores direto).
async function gerarPreview({ idMonstro, referenceLevel, mode = "multipliers", desired, multiplicadores, zoneId }) {
  const nivel = Math.max(1, Math.round(Number(referenceLevel) || 1));
  const avisos = [AVISO_VELOCIDADE];

  let multiplicadoresFinais;
  if (mode === "desired") {
    const conversao = converterDesejadoParaMultiplicadores(nivel, desired);
    multiplicadoresFinais = conversao.multiplicadores;
    avisos.push(...conversao.avisos);
  } else {
    multiplicadoresFinais = {
      vida: Number(multiplicadores?.vida),
      dano: Number(multiplicadores?.dano),
      agilidade: Number(multiplicadores?.agilidade),
      velocidade: Number(multiplicadores?.velocidade),
    };
    for (const [chave, valor] of Object.entries(multiplicadoresFinais)) {
      if (!multiplicadorValido(valor)) {
        throw erro(`Multiplicador de "${chave}" inválido ou fora dos limites técnicos (${valor}).`);
      }
    }
  }

  const base = basePorNivel(nivel);
  const stats = statsFinaisComFaixa(nivel, multiplicadoresFinais);
  const esquiva = esquivaContraPerfis(nivel, stats.agilidade.media);
  const ttk = estimarTurnos(nivel, { vidaMaxima: stats.vida.media, danoBase: stats.dano.media, agilidade: stats.agilidade.media }, "MEDIO");
  const dificuldade = dificuldadeHeuristica(ttk.turnosParaMatar, ttk.turnosParaMorrer);

  let faixaPorNivel = null;
  if (idMonstro) {
    const faixa = await faixaNivelDoMonstro(idMonstro, zoneId);
    if (faixa) {
      const niveis = new Set([faixa.min, nivel, faixa.max]);
      faixaPorNivel = [...niveis]
        .filter((n) => Number.isFinite(n) && n >= 1)
        .sort((a, b) => a - b)
        .map((n) => linhaDaFaixa(n, multiplicadoresFinais));
    }
  }

  return {
    nivelReferencia: nivel,
    baseNivel: base,
    multiplicadores: multiplicadoresFinais,
    statsFinais: stats,
    esquivaContraPerfis: esquiva,
    ttk,
    dificuldadeEstimada: dificuldade,
    faixaPorNivel,
    avisos,
  };
}

module.exports = {
  basePorNivel,
  statsFinaisComFaixa,
  construirPerfilSintetico,
  perfisDisponiveis,
  esquivaContraPerfis,
  estimarTurnos,
  dificuldadeHeuristica,
  converterDesejadoParaMultiplicadores,
  faixaNivelDoMonstro,
  gerarPreview,
  AVISO_VELOCIDADE,
};
