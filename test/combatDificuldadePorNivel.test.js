// Fila (pedido do jogador, reafirmado): "o monstro está se adaptando
// ainda e não deveria se adaptar com o nível do personagem, o valor
// deveria ser fixo". A versão anterior já tinha corrigido um bug
// parecido (ver histórico abaixo), mas ainda calibrava a BASE de
// vida_maxima/dano_base em cima dos atributos REAIS do jogador que
// está caçando (vidaMaximaDe/danoBasicoEsperado dele) — só a escala por
// cima disso era relativa ao nível. Resultado: dois personagens do
// MESMO nível, com equipamento diferente, recebiam o "mesmo" monstro
// com força bem diferente entre si.
//
// Histórico do problema original (§ ainda válido como motivação):
// um personagem nível 107 caçando um "Javali Selvagem (Nv. 1)" recebia
// um inimigo calibrado 100% em cima dos próprios atributos, então esse
// Javali sobrevivia a um hit e ainda batia de volta por dano relevante
// — o número do nível virava só rótulo.
//
// Correção atual: gerarInimigo/gerarInimigoDeGrupo constroem um
// personagem de REFERÊNCIA só a partir do NÍVEL do monstro
// (statsDeReferenciaPorNivel — nunca lido de `jogador`), e alimentam
// esse personagem fake nas MESMAS fórmulas vidaMaximaDe/
// danoBasicoEsperado que o jogo já usa pro personagem de verdade. Não
// precisa de banco — são funções puras.
const test = require("node:test");
const assert = require("node:assert/strict");

const { gerarInimigo, gerarInimigoDeGrupo, statsDeReferenciaPorNivel } = require("../src/controllers/combatController");

test("statsDeReferenciaPorNivel cresce só com o nível — nunca lê nada do jogador", () => {
  const nivel1 = statsDeReferenciaPorNivel(1);
  const nivel50 = statsDeReferenciaPorNivel(50);
  assert.equal(nivel1.nivel, 1);
  assert.equal(nivel50.nivel, 50);
  assert.ok(nivel50.forca > nivel1.forca, "atributo de referência deveria crescer com o nível");
  assert.ok(nivel50.vitalidade > nivel1.vitalidade);
});

test("gerarInimigo: o MESMO nível de monstro gera o MESMO inimigo (dentro da variação ±10%) pra jogadores com atributos bem diferentes", () => {
  const jogadorFraco = { nivel: 50, forca: 5, vitalidade: 5, agilidade: 5, velocidade: 5, inteligencia: 5 };
  const jogadorForte = { nivel: 50, forca: 500, vitalidade: 500, agilidade: 200, velocidade: 200, inteligencia: 200 };

  // Muitas amostras pra cobrir a variação aleatória (±10%) dos dois
  // lados e garantir que a diferença não vem do jogador.
  const amostras = 200;
  let vidaFraco = 0;
  let vidaForte = 0;
  let danoFraco = 0;
  let danoForte = 0;
  for (let i = 0; i < amostras; i += 1) {
    vidaFraco += gerarInimigo(jogadorFraco, "Teste", { nivelForcado: 50 }).vida_maxima;
    vidaForte += gerarInimigo(jogadorForte, "Teste", { nivelForcado: 50 }).vida_maxima;
    danoFraco += gerarInimigo(jogadorFraco, "Teste", { nivelForcado: 50 }).dano_base;
    danoForte += gerarInimigo(jogadorForte, "Teste", { nivelForcado: 50 }).dano_base;
  }
  const mediaVidaFraco = vidaFraco / amostras;
  const mediaVidaForte = vidaForte / amostras;
  const mediaDanoFraco = danoFraco / amostras;
  const mediaDanoForte = danoForte / amostras;

  // Médias de muitas amostras convergem pro mesmo valor esperado —
  // tolerância generosa (15%) só pra absorver ruído estatístico, nunca
  // uma diferença sistemática vinda do jogador.
  assert.ok(
    Math.abs(mediaVidaFraco - mediaVidaForte) / mediaVidaFraco < 0.15,
    `vida do monstro nível 50 não deveria depender do jogador: fraco=${mediaVidaFraco}, forte=${mediaVidaForte}`,
  );
  assert.ok(
    Math.abs(mediaDanoFraco - mediaDanoForte) / mediaDanoFraco < 0.15,
    `dano do monstro nível 50 não deveria depender do jogador: fraco=${mediaDanoFraco}, forte=${mediaDanoForte}`,
  );
});

test("gerarInimigo: monstro nível 1 é bem mais fraco que um monstro nível 50, pro mesmo jogador", () => {
  const jogador = { nivel: 50, forca: 50, vitalidade: 50, agilidade: 20, velocidade: 20, inteligencia: 20 };
  const fraco = gerarInimigo(jogador, "Javali Selvagem", { nivelForcado: 1 });
  const forte = gerarInimigo(jogador, "Algo nível 50", { nivelForcado: 50 });

  assert.ok(fraco.vida_maxima < forte.vida_maxima * 0.5, `nível 1 (vida ${fraco.vida_maxima}) deveria ser bem mais fraco que nível 50 (vida ${forte.vida_maxima})`);
  assert.ok(fraco.dano_base < forte.dano_base * 0.5, `nível 1 (dano ${fraco.dano_base}) deveria bater bem mais fraco que nível 50 (dano ${forte.dano_base})`);
});

test("gerarInimigo: um lvl 10 perde de verdade pra um monstro lvl 50 — dano do monstro mata o jogador em poucos hits", () => {
  // Jogador nível 10 com atributos razoáveis pro nível (não zerado, não
  // otimizado) enfrentando um monstro forçado nível 50.
  const jogadorNivel10 = { nivel: 10, forca: 12, vitalidade: 12, agilidade: 8, velocidade: 8, inteligencia: 8 };
  const monstroForte = gerarInimigo(jogadorNivel10, "Algo forte", { nivelForcado: 50 });

  const { vidaMaximaDe } = require("../src/services/combatFormulas");
  const vidaDoJogador = vidaMaximaDe(jogadorNivel10);

  assert.ok(
    monstroForte.dano_base * 4 >= vidaDoJogador,
    `monstro nível 50 (dano ${monstroForte.dano_base}) deveria conseguir matar um jogador nível 10 (vida ${vidaDoJogador}) em poucos golpes`,
  );
});

test("gerarInimigoDeGrupo: vida do monstro cresce com o tamanho do grupo, mas o dano continua o de UM monstro daquele nível", () => {
  const base = { nivelMedio: 20, agilidadeMedia: 10, velocidadeMedia: 10 };
  const soloAmostras = Array.from({ length: 50 }, () =>
    gerarInimigoDeGrupo({ ...base, tamanhoGrupo: 1 }, "Teste", { nivelForcado: 20 }).vida_maxima,
  );
  const trioAmostras = Array.from({ length: 50 }, () =>
    gerarInimigoDeGrupo({ ...base, tamanhoGrupo: 3 }, "Teste", { nivelForcado: 20 }).vida_maxima,
  );
  const mediaSolo = soloAmostras.reduce((a, b) => a + b, 0) / soloAmostras.length;
  const mediaTrio = trioAmostras.reduce((a, b) => a + b, 0) / trioAmostras.length;

  assert.ok(
    mediaTrio > mediaSolo * 2.5,
    `vida com 3 aliados (${mediaTrio}) deveria ser bem maior que sozinho (${mediaSolo}), proporcional ao tamanho do grupo`,
  );
});
