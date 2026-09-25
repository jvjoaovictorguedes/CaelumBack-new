// src/config/forgeConfig.js
//
// Configuração central da Forja v3 — toda a matemática de progressão/
// sorteio/custo mora aqui (spec §50: "Não espalhar números por
// controllers"). Números transcritos diretamente das tabelas da
// especificação (Especificacao_Forja_v3_Caelum.docx); onde a spec deixa
// uma lacuna (ver comentários "GAP" abaixo), a decisão tomada é
// documentada ali mesmo.

const NIVEL_MAXIMO = 10;

// Mesma curva da Expedição, reaproveitada por instrução explícita da
// spec (§2: "Utilizar inicialmente a mesma curva da Expedição").
const XP_NECESSARIO_POR_ETAPA = {
  1: 120, 2: 300, 3: 650, 4: 1200, 5: 2400, 6: 4800, 7: 8500, 8: 14000, 9: 22000,
};

// XP TOTAL acumulado pra ALCANÇAR cada nível — nunca decrementado/zerado
// (mesmo critério do expeditionConfig.js).
const XP_TOTAL_PARA_NIVEL = { 1: 0 };
for (let nivel = 2; nivel <= NIVEL_MAXIMO; nivel += 1) {
  XP_TOTAL_PARA_NIVEL[nivel] = XP_TOTAL_PARA_NIVEL[nivel - 1] + XP_NECESSARIO_POR_ETAPA[nivel - 1];
}

const ORDEM_QUALIDADE = ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"];
const NOME_EXIBICAO_QUALIDADE = {
  Comum: "Comum", Incomum: "Incomum", Raro: "Raro", Epico: "Épico", Lendario: "Lendário", Mitico: "Mítico",
};

// ---------------------------------------------------------------------
// FUNDIÇÃO (§6/§7/§8)
// ---------------------------------------------------------------------

const FRAGMENTOS_POR_BARRA = { Comum: 100, Incomum: 60, Raro: 30, Epico: 12, Lendario: 5, Mitico: 2 };

// Maior qualidade fundível por nível de Forja — nível sem entrada própria
// herda o degrau anterior (ex.: nível 3 funde até Incomum, igual nível 2).
const QUALIDADE_MAXIMA_FUNDICAO_POR_NIVEL = {
  1: "Comum", 2: "Incomum", 3: "Incomum", 4: "Raro", 5: "Raro",
  6: "Epico", 7: "Epico", 8: "Lendario", 9: "Lendario", 10: "Mitico",
};

// Chance de +1 barra bônus, por barra-base produzida (rolada individualmente).
const CHANCE_BARRA_BONUS_PPM_POR_NIVEL = {
  1: 0, 2: 10_000, 3: 20_000, 4: 40_000, 5: 60_000,
  6: 80_000, 7: 110_000, 8: 140_000, 9: 170_000, 10: 200_000,
};

const XP_FUNDICAO_POR_QUALIDADE_BARRA = { Comum: 2, Incomum: 4, Raro: 8, Epico: 20, Lendario: 50, Mitico: 120 };

// ---------------------------------------------------------------------
// FABRICAÇÃO (§13/§19/§21/§22)
// ---------------------------------------------------------------------

// Chance (em partes por milhão) de o resultado sair N degraus ACIMA da
// qualidade-base dos materiais escolhidos — "Mesma" é o que sobra.
const CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL = {
  1: { mesma: 990_000, mais1: 10_000, mais2: 0, mais3: 0, mais4: 0, mais5: 0 },
  2: { mesma: 980_000, mais1: 19_000, mais2: 1_000, mais3: 0, mais4: 0, mais5: 0 },
  3: { mesma: 970_000, mais1: 28_000, mais2: 2_000, mais3: 0, mais4: 0, mais5: 0 },
  4: { mesma: 955_000, mais1: 42_000, mais2: 2_900, mais3: 100, mais4: 0, mais5: 0 },
  5: { mesma: 930_000, mais1: 64_000, mais2: 5_500, mais3: 500, mais4: 0, mais5: 0 },
  6: { mesma: 900_000, mais1: 88_000, mais2: 11_000, mais3: 1_000, mais4: 0, mais5: 0 },
  7: { mesma: 860_000, mais1: 115_000, mais2: 23_000, mais3: 2_000, mais4: 0, mais5: 0 },
  8: { mesma: 810_000, mais1: 150_000, mais2: 35_000, mais3: 4_500, mais4: 500, mais5: 0 },
  9: { mesma: 750_000, mais1: 180_000, mais2: 55_000, mais3: 13_500, mais4: 1_400, mais5: 100 },
  10: { mesma: 680_000, mais1: 210_000, mais2: 80_000, mais3: 25_000, mais4: 4_500, mais5: 500 },
};

const XP_FABRICACAO_POR_QUALIDADE_EQUIPAMENTO = {
  Comum: 25, Incomum: 40, Raro: 70, Epico: 130, Lendario: 250, Mitico: 500,
};

const TEMPO_BASE_FABRICACAO_MS_POR_QUALIDADE = {
  Comum: 5 * 60_000, Incomum: 10 * 60_000, Raro: 20 * 60_000,
  Epico: 45 * 60_000, Lendario: 90 * 60_000, Mitico: 180 * 60_000,
};

// -25% no nível 10, aproximadamente -10% no nível 5 (spec §22 dá só 3
// pontos da curva — interpolação linear entre eles bate ~11% no nível 5,
// perto o bastante do "≈-10%" citado).
function reducaoTempoPorNivelForja(nivel) {
  return ((Math.max(1, Math.min(NIVEL_MAXIMO, nivel)) - 1) / (NIVEL_MAXIMO - 1)) * 0.25;
}

// GAP preenchido (spec §20 não define os limiares exatos de "adequado/
// muito abaixo/extremamente abaixo/trivial", só as 4 faixas percentuais
// de XP) — usa a mesma tabela de nível mínimo recomendado por qualidade
// da Fundição (§7) como "nível esperado" pra uma receita daquela
// qualidade-base, e compara com o nível de Forja atual do personagem.
const NIVEL_FORJA_ESPERADO_POR_QUALIDADE = { Comum: 1, Incomum: 2, Raro: 4, Epico: 6, Lendario: 8, Mitico: 10 };

function multiplicadorAntiFarmXp(nivelForjaAtual, qualidadeBaseDaReceita) {
  const nivelEsperado = NIVEL_FORJA_ESPERADO_POR_QUALIDADE[qualidadeBaseDaReceita] ?? 1;
  const diferenca = nivelForjaAtual - nivelEsperado;
  if (diferenca <= 2) return 1;
  if (diferenca <= 5) return 0.5;
  if (diferenca <= 8) return 0.1;
  return 0;
}

// ---------------------------------------------------------------------
// REFINAMENTO (§28-§35)
// ---------------------------------------------------------------------

const CHANCE_BASE_REFINAMENTO_PPM_POR_ALVO = {
  1: 1_000_000, 2: 1_000_000, 3: 1_000_000, 4: 900_000, 5: 800_000,
  6: 700_000, 7: 600_000, 8: 450_000, 9: 300_000, 10: 150_000,
};

const BONUS_FORJA_REFINAMENTO_PPM_POR_NIVEL = {
  1: 0, 2: 10_000, 3: 20_000, 4: 30_000, 5: 50_000,
  6: 70_000, 7: 90_000, 8: 120_000, 9: 150_000, 10: 200_000,
};

// +1/+2/+3 permanecem garantidos em 100% mesmo somando os bônus (§30).
const REFINAMENTOS_GARANTIDOS = [1, 2, 3];
// `let` (não `const`) só nestes dois — são os únicos valores PRIMITIVOS
// editáveis via Painel Administrativo (§9); tudo o mais editável aqui é
// um objeto (dicionário por nível/qualidade/alvo), mutado em-lugar por
// aplicarOverridesBalanceamento no fim do arquivo, o que basta pra
// qualquer `require("./forgeConfig")` que já tenha desestruturado esse
// objeto enxergar a mudança sem reiniciar o processo.
let CAP_CHANCE_REFINAMENTO_PPM = 950_000;

// Bônus percentual acumulado aplicado ao atributo principal do equipamento.
const BONUS_ATRIBUTO_REFINAMENTO_PCT = {
  0: 0, 1: 2, 2: 4, 3: 6, 4: 9, 5: 12, 6: 15, 7: 19, 8: 23, 9: 27, 10: 32,
};

// Multiplicador de "unidades" de material por tentativa de refino, de
// acordo com o alvo desejado (§32).
const UNIDADES_MATERIAL_REFINAMENTO_POR_ALVO = {
  1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 5, 9: 7, 10: 10,
};

// GAP preenchido (spec §32/§34 pede "materiais com relação ao item" e dá
// a tabela de categorias, mas não a quantidade-base nem o item exato) —
// 1 unidade = a quantidade abaixo de Barra/Tronco/Essência (na qualidade
// do PRÓPRIO equipamento, resolvida via forge_bar_items/expedition_
// resource_items) mais ouro proporcional à qualidade. Multiplica pelas
// unidades da tabela acima.
const MATERIAIS_BASE_REFINAMENTO_POR_CATEGORIA = {
  Arma: { barras: 1, troncos: 1 },
  Escudo: { barras: 1, troncos: 1 },
  Armadura: { barras: 1, troncos: 0 },
  Acessorio1: { barras: 1, troncos: 0 },
  Acessorio2: { barras: 1, troncos: 0 },
  Capacete: { barras: 1, troncos: 0 },
  // Vara de Pesca (Pesca §10.2) — mistura de troncos + barras pra dar
  // identidade de craft, reutilizando a MESMA curva/fila/pergaminho do
  // resto da Forja (nunca uma segunda fila/segunda moeda pra varas).
  Ferramenta: { barras: 1, troncos: 1 },
};

const OURO_BASE_REFINAMENTO_POR_QUALIDADE = {
  Comum: 20, Incomum: 50, Raro: 120, Epico: 300, Lendario: 800, Mitico: 2000,
};

// Em falha, ~25% do XP do sucesso (§35).
const XP_REFINAMENTO_POR_ALVO = { 1: 30, 2: 45, 3: 65, 4: 90, 5: 130, 6: 190, 7: 280, 8: 420, 9: 650, 10: 1000 };
let FATOR_XP_REFINAMENTO_FALHA = 0.25;

// ---------------------------------------------------------------------
// FILA (§46-§48)
// ---------------------------------------------------------------------

const SLOTS_FORJA = { FUNDICAO: "Fundicao", FORJA: "Forja" };
const TIPOS_ACAO_FORJA = { FUNDICAO: "Fundicao", FABRICACAO: "Fabricacao", REFINAMENTO: "Refinamento" };

// ---------------------------------------------------------------------
// PAINEL ADMINISTRATIVO — hot-reload de balanceamento (§9/§10/§19 fase 5)
// ---------------------------------------------------------------------
//
// Aplica overrides já VALIDADOS (forgeSettingsService, nunca chamado
// direto por um controller) por cima destes defaults. SEMPRE por
// mutação em-lugar dos mesmos objetos já exportados acima — nunca
// reatribuindo o binding do módulo — porque forgeCraftingService/
// forgeSmeltingService/forgeRefinementService/forgeRollService já
// desestruturaram essas TABELAS (dicionários) no load: como é o mesmo
// objeto por referência, mutar as chaves dele é visto por todo mundo
// sem precisar re-requerir nada. Os dois primitivos editáveis
// (CAP_CHANCE_REFINAMENTO_PPM/FATOR_XP_REFINAMENTO_FALHA) são a exceção
// — ver comentário ao lado da declaração de cada um.
function aplicarOverridesBalanceamento(grupo, valores) {
  if (!valores || typeof valores !== "object") return;
  switch (grupo) {
    case "forge.smelting": {
      if (valores.FRAGMENTOS_POR_BARRA) Object.assign(FRAGMENTOS_POR_BARRA, valores.FRAGMENTOS_POR_BARRA);
      if (valores.QUALIDADE_MAXIMA_FUNDICAO_POR_NIVEL) {
        Object.assign(QUALIDADE_MAXIMA_FUNDICAO_POR_NIVEL, valores.QUALIDADE_MAXIMA_FUNDICAO_POR_NIVEL);
      }
      if (valores.CHANCE_BARRA_BONUS_PPM_POR_NIVEL) {
        Object.assign(CHANCE_BARRA_BONUS_PPM_POR_NIVEL, valores.CHANCE_BARRA_BONUS_PPM_POR_NIVEL);
      }
      if (valores.XP_FUNDICAO_POR_QUALIDADE_BARRA) {
        Object.assign(XP_FUNDICAO_POR_QUALIDADE_BARRA, valores.XP_FUNDICAO_POR_QUALIDADE_BARRA);
      }
      break;
    }
    case "forge.crafting": {
      if (valores.CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL) {
        for (const [nivel, tabela] of Object.entries(valores.CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL)) {
          CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL[nivel] = { ...tabela };
        }
      }
      if (valores.XP_FABRICACAO_POR_QUALIDADE_EQUIPAMENTO) {
        Object.assign(XP_FABRICACAO_POR_QUALIDADE_EQUIPAMENTO, valores.XP_FABRICACAO_POR_QUALIDADE_EQUIPAMENTO);
      }
      if (valores.TEMPO_BASE_FABRICACAO_MS_POR_QUALIDADE) {
        Object.assign(TEMPO_BASE_FABRICACAO_MS_POR_QUALIDADE, valores.TEMPO_BASE_FABRICACAO_MS_POR_QUALIDADE);
      }
      break;
    }
    case "forge.refinement": {
      if (valores.CHANCE_BASE_REFINAMENTO_PPM_POR_ALVO) {
        Object.assign(CHANCE_BASE_REFINAMENTO_PPM_POR_ALVO, valores.CHANCE_BASE_REFINAMENTO_PPM_POR_ALVO);
      }
      if (valores.BONUS_FORJA_REFINAMENTO_PPM_POR_NIVEL) {
        Object.assign(BONUS_FORJA_REFINAMENTO_PPM_POR_NIVEL, valores.BONUS_FORJA_REFINAMENTO_PPM_POR_NIVEL);
      }
      if (valores.BONUS_ATRIBUTO_REFINAMENTO_PCT) {
        Object.assign(BONUS_ATRIBUTO_REFINAMENTO_PCT, valores.BONUS_ATRIBUTO_REFINAMENTO_PCT);
      }
      if (valores.UNIDADES_MATERIAL_REFINAMENTO_POR_ALVO) {
        Object.assign(UNIDADES_MATERIAL_REFINAMENTO_POR_ALVO, valores.UNIDADES_MATERIAL_REFINAMENTO_POR_ALVO);
      }
      if (valores.MATERIAIS_BASE_REFINAMENTO_POR_CATEGORIA) {
        for (const [categoria, base] of Object.entries(valores.MATERIAIS_BASE_REFINAMENTO_POR_CATEGORIA)) {
          MATERIAIS_BASE_REFINAMENTO_POR_CATEGORIA[categoria] = { ...base };
        }
      }
      if (valores.OURO_BASE_REFINAMENTO_POR_QUALIDADE) {
        Object.assign(OURO_BASE_REFINAMENTO_POR_QUALIDADE, valores.OURO_BASE_REFINAMENTO_POR_QUALIDADE);
      }
      if (valores.XP_REFINAMENTO_POR_ALVO) {
        Object.assign(XP_REFINAMENTO_POR_ALVO, valores.XP_REFINAMENTO_POR_ALVO);
      }
      if (typeof valores.CAP_CHANCE_REFINAMENTO_PPM === "number") {
        CAP_CHANCE_REFINAMENTO_PPM = valores.CAP_CHANCE_REFINAMENTO_PPM;
        module.exports.CAP_CHANCE_REFINAMENTO_PPM = CAP_CHANCE_REFINAMENTO_PPM;
      }
      if (typeof valores.FATOR_XP_REFINAMENTO_FALHA === "number") {
        FATOR_XP_REFINAMENTO_FALHA = valores.FATOR_XP_REFINAMENTO_FALHA;
        module.exports.FATOR_XP_REFINAMENTO_FALHA = FATOR_XP_REFINAMENTO_FALHA;
      }
      break;
    }
    case "forge.progression": {
      // XP_NECESSARIO_POR_ETAPA é DERIVADO em XP_TOTAL_PARA_NIVEL — mudar
      // a curva precisa recalcular o acumulado inteiro (e é o único grupo
      // com preview de impacto obrigatório antes de aplicar, §11.2).
      if (valores.XP_NECESSARIO_POR_ETAPA) {
        Object.assign(XP_NECESSARIO_POR_ETAPA, valores.XP_NECESSARIO_POR_ETAPA);
        let acumulado = 0;
        for (let nivel = 2; nivel <= NIVEL_MAXIMO; nivel += 1) {
          acumulado += XP_NECESSARIO_POR_ETAPA[nivel - 1];
          XP_TOTAL_PARA_NIVEL[nivel] = acumulado;
        }
      }
      break;
    }
    default:
      break;
  }
}

module.exports = {
  NIVEL_MAXIMO,
  XP_NECESSARIO_POR_ETAPA,
  XP_TOTAL_PARA_NIVEL,
  ORDEM_QUALIDADE,
  NOME_EXIBICAO_QUALIDADE,
  FRAGMENTOS_POR_BARRA,
  QUALIDADE_MAXIMA_FUNDICAO_POR_NIVEL,
  CHANCE_BARRA_BONUS_PPM_POR_NIVEL,
  XP_FUNDICAO_POR_QUALIDADE_BARRA,
  CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL,
  XP_FABRICACAO_POR_QUALIDADE_EQUIPAMENTO,
  TEMPO_BASE_FABRICACAO_MS_POR_QUALIDADE,
  reducaoTempoPorNivelForja,
  NIVEL_FORJA_ESPERADO_POR_QUALIDADE,
  multiplicadorAntiFarmXp,
  CHANCE_BASE_REFINAMENTO_PPM_POR_ALVO,
  BONUS_FORJA_REFINAMENTO_PPM_POR_NIVEL,
  REFINAMENTOS_GARANTIDOS,
  CAP_CHANCE_REFINAMENTO_PPM,
  BONUS_ATRIBUTO_REFINAMENTO_PCT,
  UNIDADES_MATERIAL_REFINAMENTO_POR_ALVO,
  MATERIAIS_BASE_REFINAMENTO_POR_CATEGORIA,
  OURO_BASE_REFINAMENTO_POR_QUALIDADE,
  XP_REFINAMENTO_POR_ALVO,
  FATOR_XP_REFINAMENTO_FALHA,
  SLOTS_FORJA,
  TIPOS_ACAO_FORJA,
  aplicarOverridesBalanceamento,
};
