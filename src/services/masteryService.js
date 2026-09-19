// Cálculo de Maestria Regional (Bestiário — §10-§13/§19 da spec).
// Nível de Maestria nunca é ARMAZENADO: é sempre recalculado a partir
// dos abates reais em character_monster_kills, então não existe risco
// de "nível de Maestria" ficar dessincronizado do contador de abates
// que é a fonte de verdade (mesmo raciocínio de nunca aceitar do
// cliente algo que o servidor já pode derivar com segurança).
const CharacterMonsterKill = require("../models/CharacterMonsterKill");
const { monstrosDaZona } = require("./adventureService");
const { NIVEL_MAXIMO_MAESTRIA, REQUISITOS_ABATES_POR_NIVEL } = require("../config/bestiaryConfig");

// Um monstro só é "descoberto" quando primeira_derrota_em existe —
// encontrar e perder não conta (§6): registrarMorte só roda no ramo de
// VITÓRIA do combate, então uma derrota do jogador nunca chega a criar
// essa linha.
async function progressoDosMonstros(idPersonagem, idArea, transaction) {
  const monstrosZona = await monstrosDaZona(idArea, transaction);
  if (monstrosZona.length === 0) return [];

  const nomes = monstrosZona.map((m) => m.nome);
  const kills = await CharacterMonsterKill.findAll({
    where: { id_personagem: idPersonagem, nome_monstro: nomes },
    transaction,
  });
  const killsPorNome = new Map(kills.map((k) => [k.nome_monstro, k]));

  return monstrosZona.map((m) => {
    const kill = killsPorNome.get(m.nome);
    return {
      nome: m.nome,
      tipo_aparicao: m.tipo_aparicao,
      abates: kill?.quantidade ?? 0,
      descoberto: Boolean(kill?.primeira_derrota_em),
    };
  });
}

// Maior nível (2..5) em que TODOS os monstros da região já atingiram o
// requisito ACUMULADO daquele nível (§11/§13) — nunca um nível cujo
// requisito algum monstro ainda não cumpriu, mesmo que outros já
// estejam bem acima.
function nivelAtingidoPorAbates(monstros) {
  let nivel = 1;
  for (let candidato = 2; candidato <= NIVEL_MAXIMO_MAESTRIA; candidato++) {
    const requisitos = REQUISITOS_ABATES_POR_NIVEL[candidato];
    const todosAtingiram = monstros.every((m) => m.abates >= requisitos[m.tipo_aparicao]);
    if (!todosAtingiram) break;
    nivel = candidato;
  }
  return nivel;
}

// Só pra apresentação (§18) — a regra real de subida é o cumprimento
// individual de cada requisito, nunca esta média.
function progressoParaProximoNivel(monstros, nivelAtual) {
  if (nivelAtual >= NIVEL_MAXIMO_MAESTRIA) return 100;
  const requisitos = REQUISITOS_ABATES_POR_NIVEL[nivelAtual + 1];
  const razoes = monstros.map((m) => Math.min(1, m.abates / requisitos[m.tipo_aparicao]));
  const media = razoes.reduce((soma, r) => soma + r, 0) / razoes.length;
  return Math.round(media * 100);
}

async function calcularMaestriaDaRegiao(idPersonagem, idArea, transaction) {
  const monstros = await progressoDosMonstros(idPersonagem, idArea, transaction);
  if (monstros.length === 0) {
    return { nivel: 0, descobertos: 0, total: 0, progresso_pct_proximo_nivel: 0, monstros: [] };
  }

  const descobertos = monstros.filter((m) => m.descoberto).length;
  const bestiarioCompleto = descobertos === monstros.length;

  // §10 — sem estágio intermediário de "desbloqueada, nível 0":
  // completar o Bestiário já concede Maestria I direto.
  const nivel = bestiarioCompleto ? nivelAtingidoPorAbates(monstros) : 0;

  return {
    nivel,
    descobertos,
    total: monstros.length,
    progresso_pct_proximo_nivel: bestiarioCompleto ? progressoParaProximoNivel(monstros, nivel) : 0,
    monstros,
  };
}

module.exports = { calcularMaestriaDaRegiao };
