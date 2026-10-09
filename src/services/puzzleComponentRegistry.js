// Evento "O Coração da Máquina Celestial" — Fase 2 (Puzzle Engine
// Determinístico). Registry declarativo de tipos de componente.
//
// Por que um registry POR INSTÂNCIA (criarRegistryDeComponentes()) e não
// um Map global do módulo: cada domínio de puzzle (mecânico — Fase 3,
// óptico — Fase 5, hidráulico — Fase 6) registra seus próprios tipos de
// componente num registry próprio. Um Map global faria testes de fases
// diferentes colidirem por key (ex.: dois arquivos de teste registrando
// "GEAR" cada um com semântica própria) e tornaria puzzleEngineCore.js
// implicitamente stateful entre testes/módulos — o engine em si precisa
// ser puro e nunca guardar estado de registro global.
//
// GARANTIA DE SEGURANÇA (requisito explícito da encomenda da Fase 2):
// um tipo de componente é SEMPRE código real registrado em tempo de
// require() por um arquivo do backend (ex.: puzzleMechanicalComponents.js
// na Fase 3) — nunca algo lido de uma coluna JSONB do banco e
// interpretado. O que o Admin/BlueprintVersion.config guarda é só a
// REFERÊNCIA (`type: "GEAR"`) + props de dados puros (números/strings/
// booleans) — nunca uma function, nunca uma string executada via eval/
// Function/vm. Esta função de registro RECUSA qualquer definição cujos
// campos de comportamento não sejam já functions JS reais em memória.
const crypto = require("crypto");

function erro(mensagem, statusCode = 400, code) {
  return Object.assign(new Error(mensagem), { statusCode, code });
}

const CAMPOS_DE_COMPORTAMENTO = ["reduzir", "criarEstado", "validarProps", "feedbackPublico"];

function validarDefinicao(definicao) {
  if (!definicao || typeof definicao !== "object") {
    throw erro("Definição de tipo de componente precisa ser um objeto.");
  }
  if (typeof definicao.key !== "string" || !definicao.key.trim()) {
    throw erro("Definição de tipo de componente precisa de 'key' (string não vazia).");
  }
  if (typeof definicao.reduzir !== "function") {
    throw erro(`Tipo de componente '${definicao.key}': 'reduzir' precisa ser uma function JS real.`);
  }
  for (const campo of CAMPOS_DE_COMPORTAMENTO) {
    if (definicao[campo] !== undefined && typeof definicao[campo] !== "function") {
      // Pega no nascimento qualquer tentativa de guardar string/JSON como
      // "comportamento" (ex.: alguém tentando passar uma expressão livre
      // vinda do banco) — comportamento só pode ser function JS já
      // existente em memória, nunca um valor serializável.
      throw erro(`Tipo de componente '${definicao.key}': '${campo}' precisa ser function, não ${typeof definicao[campo]}.`);
    }
  }
}

// `criarRegistryDeComponentes()` devolve um registry novo e isolado.
// Quem monta o registry "real" de produção (Fase 3+: puzzleMechanical
// ComponentRegistry.js e equivalentes ópticos/hidráulicos) chama
// `.registrar()` uma vez por tipo, em require()-time, e exporta o
// registry pronto — nunca condicional a dado de runtime.
function criarRegistryDeComponentes() {
  const tipos = new Map();

  function registrar(definicao) {
    validarDefinicao(definicao);
    if (tipos.has(definicao.key)) {
      throw erro(`Tipo de componente duplicado neste registry: ${definicao.key}.`);
    }
    tipos.set(definicao.key, {
      key: definicao.key,
      validarProps: definicao.validarProps || (() => {}),
      criarEstado: definicao.criarEstado || (() => ({})),
      reduzir: definicao.reduzir,
      feedbackPublico: definicao.feedbackPublico || (() => ({})),
    });
    return tipos.get(definicao.key);
  }

  function obter(key) {
    const tipo = tipos.get(key);
    if (!tipo) throw erro(`Tipo de componente desconhecido: ${key}.`, 400, "COMPONENTE_TIPO_DESCONHECIDO");
    return tipo;
  }

  function possui(key) {
    return tipos.has(key);
  }

  function listar() {
    return Array.from(tipos.keys());
  }

  // Assinatura estável do conjunto de tipos registrados — usada pelo
  // validador de solvabilidade do Admin (Fase 15) pra conferir que um
  // Blueprint publicado foi validado contra a MESMA versão de registry
  // que vai rodar em runtime, nunca uma composição de tipos diferente
  // adicionada depois sem nova validação.
  function assinatura() {
    return crypto.createHash("sha256").update(listar().sort().join(",")).digest("hex");
  }

  return { registrar, obter, possui, listar, assinatura };
}

module.exports = { criarRegistryDeComponentes };
