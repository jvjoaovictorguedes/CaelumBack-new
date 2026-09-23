// Fila (pedido do jogador): "o monstro não se adapta mais ao meu
// nível, ele é fixo" — um personagem nível 107 zerava um "Javali
// Selvagem (Nv. 1)" em poucos hits mas ainda levava dano relevante de
// volta, porque gerarInimigo calibrava 100% em cima dos atributos REAIS
// do jogador e só escalava pra CIMA quando o monstro tinha nível MAIOR
// que o do jogador (nunca pra baixo) — algo que não existe passado o
// nível 50 (teto de zona atual). calcularEscalaPorNivel agora também
// encolhe pra BAIXO quanto mais o monstro fica pra trás do nível real
// do jogador. Não precisa de banco — é função pura.
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
  assert.ok(escalaJavali >= 0.08, "nunca deveria cair abaixo do piso configurado");
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
