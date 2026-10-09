// Evento "O Coração da Máquina Celestial" — Fase 8 (Ações de Puzzle
// via API/Realtime). Pipeline único de toda ação de jogador contra uma
// PuzzleInstance: autentica (já feito pelo controller via
// req.personagemAtual), valida participação/lifecycle/versão, executa
// o Puzzle Engine PURO (Fases 2-7, nenhum require de Express/Socket.IO
// aqui), persiste via o UPDATE condicional que já é a garantia real de
// concorrência (puzzleInstanceService.aplicarMutacao — NUNCA uma
// segunda forma de "salvar estado"), e determina completion.
//
// NUNCA aceita do cliente: completed/success/solution/reward — o único
// dado de entrada aceito é a ação em si (type/componentId/payload) +
// expectedStateVersion; tudo o mais (novo estado, quais objetivos
// concluíram, se o puzzle terminou) é 100% calculado aqui a partir do
// engine determinístico.
const engine = require("./puzzleEngineCore");
const { resolverContexto } = require("./puzzleDomainRegistry");
const puzzleInstanceService = require("./puzzleInstanceService");
const puzzleClueService = require("./puzzleClueService");
const puzzlePioneerService = require("./puzzlePioneerService");

function erro(mensagem, statusCode = 400, code) {
  return Object.assign(new Error(mensagem), { statusCode, code });
}

const STATUS_ATIVOS = new Set(["CREATED", "ACTIVE"]);

// Único ponto de entrada da Fase 8 — devolve { instancia (atualizada),
// resultado (PuzzleResult do engine: eventos/feedbackPublico/
// condicoesAtingidas/objetivosRecemConcluidos) }.
async function executarAcao(idInstance, idPersonagem, acao, expectedStateVersion) {
  // Ownership (seção 12 da encomenda, mesmo critério de
  // obterParaPersonagem): nunca confiar em nada vindo do cliente pra
  // identidade — idPersonagem sempre de req.personagemAtual.id. 404
  // (não 403) se a instância não é desse personagem, pra não confirmar
  // existência pra quem não tem acesso.
  const instancia = await puzzleInstanceService.obterParaPersonagem(idInstance, idPersonagem, { comBlueprint: true });

  // Lifecycle: só aceita ação em CREATED/ACTIVE — qualquer terminal
  // (COMPLETED/FAILED/ABANDONED/EXPIRED) rejeita com 409 claro, nunca
  // silenciosamente "funciona mas não faz nada".
  if (!STATUS_ATIVOS.has(instancia.status)) {
    throw erro(`Esta instância já está em um estado terminal (${instancia.status}) — nenhuma ação é aceita.`, 409, "INSTANCIA_FINALIZADA");
  }

  const config = instancia.blueprintVersion.config;
  const idBlueprint = instancia.blueprintVersion.id_blueprint;
  const contexto = resolverContexto(config, instancia.seed);

  // Validação de FORMA da ação (componentId existe no config, type é
  // string, payload é objeto) já acontece DENTRO de engine.executarAcao
  // — nunca duplicada aqui. O mesmo vale pra expectedStateVersion:
  // puzzleInstanceService.aplicarMutacao já valida/compara contra
  // state_version real no banco via UPDATE condicional (a garantia de
  // verdade); esta chamada só executa o engine ANTES pra saber qual
  // seria o novo estado, e só persiste se a versão ainda bater.
  const resultado = engine.executarAcao(contexto, instancia.state, acao);

  // Completion: nunca aceito do cliente, só calculado aqui a partir do
  // engine. CREATED nunca pula direto pra COMPLETED (TRANSICOES_VALIDAS
  // da Fase 1 exige passar por ACTIVE — é onde started_at nasce), mas
  // isso não pode significar "puzzle resolvido na 1ª ação fica presa em
  // ACTIVE pra sempre esperando uma 2ª ação que pode nunca vir" — um
  // Blueprint futuro (Fase 15, builder visual) pode perfeitamente ter
  // um único passo. `completou` é calculado uma vez e vale pras duas
  // transições abaixo.
  const completou = puzzleInstanceService.todosObjetivosConcluidos(config, resultado.state);
  const novoStatus = instancia.status === "CREATED" ? "ACTIVE" : completou ? "COMPLETED" : undefined;

  let instanciaAtualizada = await puzzleInstanceService.aplicarMutacao(idInstance, expectedStateVersion, {
    novoStatus,
    novoState: resultado.state,
  });

  // Mesma ação que acabou de ativar (CREATED→ACTIVE) já resolveu tudo —
  // uma 2ª mutação sequencial (mesma request, nunca concorrente) leva
  // ACTIVE→COMPLETED na hora, em vez de depender de uma ação futura do
  // jogador só pra "descobrir" que já tinha terminado.
  if (novoStatus === "ACTIVE" && completou) {
    instanciaAtualizada = await puzzleInstanceService.aplicarMutacao(idInstance, instanciaAtualizada.state_version, {
      novoStatus: "COMPLETED",
    });
  }

  // Fase 9 — SEMPRE depois da persistência acima, nunca antes: a
  // sincronização de pistas lê o state/status JÁ gravado (nunca o
  // `resultado` especulativo, que pode não ter vencido o UPDATE
  // condicional se outra ação concorrente chegou primeiro — por isso
  // usa `instanciaAtualizada.state`, não `resultado.state`).
  const pistasDesbloqueadas = await puzzleClueService.sincronizarDesbloqueios({
    idPersonagem,
    idBlueprint,
    objetivosConcluidos: instanciaAtualizada.state.objetivosConcluidos,
    completou: instanciaAtualizada.status === "COMPLETED",
  });

  // Fase 10 — mesmo contrato de entrada/timing da sincronização de
  // pistas acima (sempre depois da persistência, nunca antes). Rodam em
  // 2 passos separados de propósito: uma falha/corrida num marco
  // Pioneer nunca pode impedir o desbloqueio de uma pista, e vice-versa
  // — são sistemas independentes reagindo ao MESMO state persistido.
  const conquistasPioneiras = await puzzlePioneerService.sincronizarConquistas({
    idPersonagem,
    idBlueprint,
    objetivosConcluidos: instanciaAtualizada.state.objetivosConcluidos,
    completou: instanciaAtualizada.status === "COMPLETED",
  });

  return { instancia: instanciaAtualizada, resultado, pistasDesbloqueadas, conquistasPioneiras };
}

module.exports = { executarAcao };
