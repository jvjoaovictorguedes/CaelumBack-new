// Fila (pedido do jogador): "o monstro não se adapta mais ao meu
// nível, ele é fixo" — um personagem nível 107 zerava um "Javali
// Selvagem (Nv. 1)" em poucos hits mas ainda levava dano relevante de
// volta, porque gerarInimigo calibrava 100% em cima dos atributos REAIS
// do jogador e só escalava pra CIMA quando o monstro tinha nível MAIOR
// que o do jogador (nunca pra baixo).
//
// Primeira correção usava DIFERENÇA ABSOLUTA de nível — e reintroduziu
// o MESMO bug numa forma mais grave: um personagem nível 14 relatou
// estar morrendo pra um monstro nível 4 (gap de 10 níveis só derrubava
// a escala pra ~85%, forte o bastante pra ainda matar). Diferença
// absoluta não captura que "10 níveis" é desprezível pra um nível 107
// mas ESMAGADOR pra um nível 14. calcularEscalaPorNivel agora usa a
// RAZÃO entre os níveis (elevada ao quadrado) pra decair pra BAIXO —
// funciona em qualquer faixa de nível do jogo, não só em números altos.
// Não precisa de banco — é função pura.
const test = require("node:test");
const assert = require("node:assert/strict");

const { calcularEscalaPorNivel, gerarInimigo } = require("../src/controllers/combatController");

test("monstro no mesmo nível do jogador (ou acima) mantém a escala cheia/crescente — comportamento antigo preservado", () => {
  assert.equal(calcularEscalaPorNivel(107, 107), 1);
  assert.ok(calcularEscalaPorNivel(110, 107) > 1, "monstro 3 níveis acima deveria ser mais forte que o baseline");
  assert.ok(
    calcularEscalaPorNivel(200, 107) <= 6,
    "diferença de nível gigante ainda respeita o teto (ESCALA_MAXIMA_POR_DIFERENCA_DE_NIVEL)",
  );
});

test("monstro BEM abaixo do nível do jogador agora fica perto do piso (antes ficava sempre em 1x)", () => {
  const escalaJavali = calcularEscalaPorNivel(1, 107);
  assert.ok(escalaJavali < 0.15, `esperava escala perto do piso, veio ${escalaJavali}`);
  assert.ok(escalaJavali >= 0.05, "nunca deveria cair abaixo do piso configurado");
});

test("bug relatado: monstro nível 4 vs jogador nível 14 agora fica bem enfraquecido (antes só caía pra ~85%)", () => {
  const escala = calcularEscalaPorNivel(4, 14);
  assert.ok(escala < 0.15, `esperava um monstro claramente incapaz de ameaçar o jogador, veio ${escala}`);
});

test("gap pequeno em nível BAIXO também pesa — nível 1 vs nível 3 (exemplo literal do pedido) fica fraco", () => {
  // "um lvl 1 não pode matar um lvl 3, só se ele não tiver item e não
  // upar as habilidades" — a calibração de base (gerarInimigo) ainda
  // depende dos atributos reais do jogador; o que a escala por nível
  // garante é que o monstro nível 1 não comece numa força comparável à
  // de um combate "normal" só porque a diferença absoluta é pequena.
  const escala = calcularEscalaPorNivel(1, 3);
  assert.ok(escala < 0.2, `esperava escala baixa mesmo com gap absoluto pequeno, veio ${escala}`);
});

test("monstro perto do nível do jogador (mesmo os dois altos) continua dando trabalho de verdade", () => {
  // Pedido explícito do jogador: "um 100 já chega bem próximo do meu
  // nível de poder, me dando trabalho" (ele é nível 107).
  const escalaPertoDoNivel = calcularEscalaPorNivel(100, 107);
  assert.ok(
    escalaPertoDoNivel > 0.85,
    `monstro 7 níveis abaixo deveria continuar quase na força cheia, veio ${escalaPertoDoNivel}`,
  );
});

test("a escala cai de forma monotônica quanto mais o monstro fica pra trás do jogador", () => {
  const nivelJogador = 107;
  const escalas = [100, 80, 50, 20, 1].map((nivelMonstro) => calcularEscalaPorNivel(nivelMonstro, nivelJogador));
  for (let i = 1; i < escalas.length; i += 1) {
    assert.ok(
      escalas[i] <= escalas[i - 1],
      `escala deveria só diminuir (ou empatar no piso) conforme o monstro fica mais fraco: ${JSON.stringify(escalas)}`,
    );
  }
});

test("gerarInimigo: bug relatado — jogador nível 14 com build mediano não pode morrer pra um monstro nível 4", () => {
  // Build "mediano", não otimizado (o próprio pedido do jogador admite
  // que só um personagem SEM itens e SEM habilidades upadas deveria
  // perder aqui) — nem exagerado pra cima, só razoável pro nível.
  const jogadorNivel14 = { nivel: 14, forca: 22, vitalidade: 22, agilidade: 14, velocidade: 14, inteligencia: 10 };
  const monstroFraco = gerarInimigo(jogadorNivel14, "Algo fraco", { nivelForcado: 4 });

  const vidaDoJogador = 30 + jogadorNivel14.vitalidade * 6; // mesma fórmula de vidaMaximaDe (combatFormulas.js)
  // RODADAS_PARA_INIMIGO_MATAR_JOGADOR é ~4.2 num combate "normal" (escala
  // 1x) — um monstro genuinamente fraco precisa estar bem longe disso:
  // exige mais de 15 acertos pra matar o jogador, não ~4.
  assert.ok(
    monstroFraco.dano_base * 15 < vidaDoJogador,
    `monstro nível 4 (dano ${monstroFraco.dano_base}) ainda mataria um jogador nível 14 (vida ~${vidaDoJogador}) rápido demais`,
  );
});

test("gerarInimigo: um Javali nível 1 pra um jogador nível 107 sai drasticamente mais fraco que um encontro no mesmo nível", () => {
  const jogadorAlto = { nivel: 107, forca: 80, vitalidade: 80, agilidade: 40, velocidade: 40, inteligencia: 20 };

  const inimigoFraco = gerarInimigo(jogadorAlto, "Javali Selvagem", { nivelForcado: 1 });
  const inimigoNoNivel = gerarInimigo(jogadorAlto, "Algo do próprio nível", { nivelForcado: 107 });

  assert.ok(
    inimigoFraco.vida_maxima < inimigoNoNivel.vida_maxima * 0.2,
    `Javali nv.1 (vida ${inimigoFraco.vida_maxima}) deveria ser muito mais fraco que um inimigo nível 107 (vida ${inimigoNoNivel.vida_maxima})`,
  );
  assert.ok(
    inimigoFraco.dano_base < inimigoNoNivel.dano_base * 0.2,
    `Javali nv.1 (dano ${inimigoFraco.dano_base}) deveria bater muito mais fraco que um inimigo nível 107 (dano ${inimigoNoNivel.dano_base})`,
  );
});
