// Balcão de Espólios §6 — resolve nível/nome/próximo marco/
// multiplicador/faixa de bônus a partir de reputacao_encomendas.
// Único lugar que interpreta SPOIL_REPUTATION_LEVELS — nunca persistir
// nível/nome como segunda fonte de verdade (spec §6.3), sempre
// recalcular a partir do ponto bruto.
const crypto = require("crypto");
const { SPOIL_REPUTATION_LEVELS: SPOIL_REPUTATION_LEVELS_PADRAO } = require("../config/adventureGuildConfig");
const gameSettingCache = require("./gameSettingCache");

// Painel Administrativo Fase 10 — admin pode sobrescrever os níveis via
// GameSetting (chave "spoils.reputationLevels", ver
// adminSpoilConfigService.js); leitura sempre síncrona a partir do
// cache em memória (gameSettingCache.js), nunca bate no banco aqui —
// essa função roda em /characters/me, um dos endpoints mais chamados
// do jogo. Sem override salvo, cai exatamente no mesmo array hardcoded
// de antes.
function niveis() {
  return gameSettingCache.obter("spoils.reputationLevels", SPOIL_REPUTATION_LEVELS_PADRAO);
}

// Acha o nível mais alto cujo mínimo o total de pontos já alcançou —
// a lista está em ordem crescente de `minimo`, então o último que bate
// é o nível atual.
function resolverNivel(pontos) {
  const lista = niveis();
  let atual = lista[0];
  for (const nivel of lista) {
    if (pontos >= nivel.minimo) atual = nivel;
    else break;
  }
  return atual;
}

function proximoNivel(nivelAtual) {
  const lista = niveis();
  const indice = lista.findIndex((n) => n.nivel === nivelAtual.nivel);
  return lista[indice + 1] ?? null;
}

// Shape de resposta reaproveitado tanto por GET /spoil-orders quanto
// pelo resumo em /characters/me (spec §10.1/§12) — nível V retorna
// nextLevelAt: null (§6.3/§12), nunca Infinity/NaN indo pro frontend.
function formatarResumoReputacao(pontos) {
  const nivel = resolverNivel(pontos);
  const proximo = proximoNivel(nivel);
  return {
    points: pontos,
    level: nivel.nivel,
    roman: nivel.roman,
    name: nivel.nome,
    nextLevelAt: proximo ? proximo.minimo : null,
    rewardMultiplier: nivel.multiplicador,
  };
}

// §7.3 — sorteia um percentual dentro da faixa do nível (ex.: 10%-20%
// pro nível I), com resolução de centésimo de ponto percentual.
// crypto.randomInt (não Math.random) pelo mesmo motivo documentado em
// adventureGuildRotationService.js: RNG de servidor, nunca previsível
// pelo cliente.
function sortearPercentualBonus(nivel) {
  const [min, max] = nivel.bonusFaixa;
  const PRECISAO = 10000;
  const minInt = Math.round(min * PRECISAO);
  const maxInt = Math.round(max * PRECISAO);
  const sorteado = crypto.randomInt(minInt, maxInt + 1);
  return sorteado / PRECISAO;
}

module.exports = { resolverNivel, proximoNivel, formatarResumoReputacao, sortearPercentualBonus };
