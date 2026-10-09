// Evento "O Coração da Máquina Celestial" — Fase 7 (Núcleo da
// Convergência). NÃO introduz nenhum componente novo — combina os três
// domínios já construídos (mecânico/Fase 3, óptico/Fase 5, hidráulico/
// Fase 6) numa única câmara. A "convergência" não é fiação cruzada
// entre domínios (um Output mecânico não "liga" um Emitter óptico —
// cada domínio só entende as próprias conexões, por design desde a
// Fase 3), e sim no nível de OBJETIVO: uma condição composta que exige
// os três terminais atingidos SIMULTANEAMENTE, usando só o avaliador
// de condições declarativas que a Fase 2 já tem (AND sobre
// components.*.atingido).
//
// SINCRONIZAÇÃO: por que isso realmente exige os três ao mesmo tempo
// e não só "algum dia, em qualquer ordem" — o objetivo final lê os
// campos `atingido` BRUTOS dos terminais (não-sticky, recalculados do
// zero a cada ação, exatamente como cada domínio já garante
// individualmente). Então se o jogador desengatar a embreagem depois
// de resolver o mecânico pra mexer no óptico, `output1.atingido` volta
// pra false e o objetivo composto deixa de bater até os três estarem
// certos NA MESMA FOTO do estado — diferente dos 3 sub-objetivos
// individuais (que são sticky, cada um documentando o progresso
// permanente do jogador nessa parte).
const { criarRegistryDeComponentes } = require("./puzzleComponentRegistry");
const { validarSemCiclos } = require("./puzzleEngineCore");
const { criarRegistryMecanico, propagarMecanica } = require("./puzzleMechanicalComponents");
const { criarRegistryOptico, propagarOptica } = require("./puzzleOpticalComponents");
const { criarRegistryHidraulico, propagarHidraulica } = require("./puzzleHydraulicComponents");

const TIPOS_MECANICOS = new Set(["MOTOR", "SHAFT", "GEAR", "PULLEY", "LEVER", "CLUTCH", "OUTPUT"]);
const TIPOS_OPTICOS = new Set(["EMITTER", "MIRROR", "PRISM", "LENS", "SHUTTER", "RECEIVER"]);
const TIPOS_HIDRAULICOS = new Set(["PUMP", "PIPE", "VALVE", "PRESSURE_NODE", "RESERVOIR", "TURBINE"]);

// Registry único reunindo os três — cada tipo continua com EXATAMENTE
// a mesma definição (validarProps/criarEstado/reduzir/feedbackPublico)
// do domínio original; nada é reimplementado aqui, só reexportado via
// `.obter()`/`.registrar()` do próprio mecanismo da Fase 2.
function criarRegistryConvergencia() {
  const registry = criarRegistryDeComponentes();
  for (const origem of [criarRegistryMecanico(), criarRegistryOptico(), criarRegistryHidraulico()]) {
    for (const key of origem.listar()) {
      registry.registrar(origem.obter(key));
    }
  }
  return registry;
}

// Topologia válida = válida em CADA domínio independentemente (nunca
// uma conexão mecânica→óptica direta — isso sequer existe no grafo de
// nenhum dos dois posProcessarComponentes, então validar os três
// subgrafos separados já cobre tudo).
function validarTopologia(config) {
  validarSemCiclos(config, TIPOS_MECANICOS, { codigoErro: "TOPOLOGIA_CICLO" });
  validarSemCiclos(config, TIPOS_OPTICOS, { codigoErro: "TOPOLOGIA_CICLO" });
  validarSemCiclos(config, TIPOS_HIDRAULICOS, { codigoErro: "TOPOLOGIA_CICLO" });
  return true;
}

// Composição das três propagações — cada uma só toca os próprios tipos
// (filtra conexões/componentes pelo próprio TIPOS_* internamente), daí
// rodar as três em sequência, encadeando o resultado, equivale a
// rodar cada domínio isolado sobre a fatia dele do mesmo config.
function propagarConvergencia({ config, components }) {
  let novoMapa = propagarMecanica({ config, components });
  novoMapa = propagarOptica({ config, components: novoMapa });
  novoMapa = propagarHidraulica({ config, components: novoMapa });
  return novoMapa;
}

function criarContextoConvergencia(config, seed) {
  validarTopologia(config);
  return { config, seed, registry: criarRegistryConvergencia(), posProcessarComponentes: propagarConvergencia };
}

module.exports = {
  criarRegistryConvergencia,
  criarContextoConvergencia,
  validarTopologia,
  propagarConvergencia,
};
