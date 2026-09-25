// Cache em memória de GameSetting, atualizado periodicamente em
// background — existe pra permitir que fórmulas de jogo (reputação/
// recompensa) leiam config administrável SEM virar leitura de banco
// síncrona em todo request. resolverNivel()/formatarResumoReputacao()
// de spoilReputationService.js e hunterReputationService.js são
// chamadas em /characters/me (um dos endpoints mais frequentes do
// jogo) — não dá pra tornar essas funções assíncronas só por causa
// disso. Em vez disso, o cache fica sempre "morno": recarrega sozinho
// a cada RECARGA_MS e também é recarregado na hora (await) sempre que
// um admin salva uma config nova (ver adminSpoilConfigService.js/
// adminHuntConfigService.js), então a mudança nunca demora mais que um
// request pra valer.
const GameSetting = require("../models/GameSetting");

const RECARGA_MS = 60_000;
let cache = {};
let intervalo = null;

async function recarregar() {
  const linhas = await GameSetting.findAll();
  const novoCache = {};
  for (const linha of linhas) novoCache[linha.chave] = linha.valor;
  cache = novoCache;
}

// Leitura síncrona — nunca bate no banco. `valorPadrao` é o mesmo
// hardcoded que já existe no config/*.js correspondente, então mesmo
// antes da primeira recarga (ou se a linha nunca foi criada) o
// comportamento é idêntico ao de antes dessa mudança existir.
function obter(chave, valorPadrao) {
  return cache[chave] !== undefined ? cache[chave] : valorPadrao;
}

function iniciarAtualizacaoPeriodica() {
  if (intervalo) return;
  recarregar().catch((erro) => console.error("[gameSettingCache] falha ao carregar na inicialização:", erro));
  intervalo = setInterval(() => {
    recarregar().catch((erro) => console.error("[gameSettingCache] falha ao recarregar:", erro));
  }, RECARGA_MS);
  intervalo.unref?.();
}

module.exports = { obter, recarregar, iniciarAtualizacaoPeriodica };
