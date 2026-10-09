// Evento "O Coração da Máquina Celestial" — Fase 8 (Ações de Puzzle
// via API/Realtime). Único ponto que sabe mapear BlueprintVersion.config
// -> qual engine de domínio usar (Fase 3/5/6/7). Nunca reimplementa
// nada dos domínios — só resolve qual `criarContexto*(config, seed)`
// chamar, com base em `config.dominio` (string obrigatória, validada
// na criação do Blueprint — Fase 15 reforça isso no Builder; aqui é
// defesa em profundidade pra runtime nunca silenciosamente tratar um
// config de um domínio como se fosse de outro).
const { criarContextoMecanico } = require("./puzzleMechanicalComponents");
const { criarContextoOptico } = require("./puzzleOpticalComponents");
const { criarContextoHidraulico } = require("./puzzleHydraulicComponents");
const { criarContextoConvergencia } = require("./puzzleConvergenceComponents");

function erro(mensagem, statusCode = 400, code) {
  return Object.assign(new Error(mensagem), { statusCode, code });
}

const CRIADORES_DE_CONTEXTO = {
  MECANICO: criarContextoMecanico,
  OPTICO: criarContextoOptico,
  HIDRAULICO: criarContextoHidraulico,
  CONVERGENCIA: criarContextoConvergencia,
};

// Chamado sempre que o engine precisa simular uma PuzzleBlueprintVersion
// (criação de instância E toda ação subsequente) — nunca guarda o
// contexto entre chamadas (ele é barato de montar: só registra tipos e
// valida topologia, nenhuma query de banco aqui dentro).
function resolverContexto(config, seed) {
  if (!config || typeof config !== "object") throw erro("config do Blueprint inválido.");
  const dominio = config.dominio;
  const criador = CRIADORES_DE_CONTEXTO[dominio];
  if (!criador) {
    throw erro(
      `config.dominio desconhecido ou ausente: ${JSON.stringify(dominio)}. Esperado um de: ${Object.keys(CRIADORES_DE_CONTEXTO).join(", ")}.`,
      400,
      "DOMINIO_DESCONHECIDO",
    );
  }
  return criador(config, seed);
}

module.exports = { resolverContexto, DOMINIOS_CONHECIDOS: Object.keys(CRIADORES_DE_CONTEXTO) };
