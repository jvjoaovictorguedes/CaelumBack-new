// Poder com dano E cura ao mesmo tempo ("Ciclo Vital"/rouba vida) só
// pode curar quando o golpe de fato acerta — bug reportado: esquivar do
// ataque não impedia a cura, como se tivesse "roubado vida" de um golpe
// que nunca aconteceu. aplicarAcao é função pura (sem banco), dá pra
// testar direto controlando Math.random pra forçar acerto/esquiva.
const test = require("node:test");
const assert = require("node:assert/strict");
const { aplicarAcao } = require("../src/services/duelEngine");

function personagemBase(overrides = {}) {
  return {
    forca: 10,
    vitalidade: 10,
    inteligencia: 10,
    agilidade: 10,
    velocidade: 10,
    vida_atual: 50,
    mana_atual: 100,
    multiplicador_dano_fisico: 1,
    multiplicador_dano_magico: 1,
    ...overrides,
  };
}

const poderCicloVital = {
  nome: "Ciclo Vital",
  dano_base: 20,
  cura_base: 15,
  valor_escala: 1,
  escala_atributo: "Forca",
  custo_mana: 10,
};

function comMathRandomFixo(valor, fn) {
  const original = Math.random;
  Math.random = () => valor;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

test("poder com dano+cura NÃO cura quando o golpe é esquivado", () => {
  const atacante = personagemBase({ vida_atual: 20 }); // com espaço de sobra pra curar
  const defensor = personagemBase({ agilidade: 999 }); // garante diferença alta pra maximizar chance de esquiva

  const resultado = comMathRandomFixo(0, () =>
    aplicarAcao({
      atacante,
      defensor,
      acao: { tipo: "power", power: poderCicloVital },
      vidaMaxAtacante: 50,
    }),
  );

  assert.equal(resultado.esquivou, true, "com Math.random()=0 o golpe deveria ser esquivado");
  assert.equal(resultado.dano, 0);
  assert.equal(atacante.vida_atual, 20, "vida do atacante não pode subir quando o golpe erra");
});

test("poder com dano+cura CURA normalmente quando o golpe acerta", () => {
  const atacante = personagemBase({ vida_atual: 20 });
  const defensor = personagemBase({ agilidade: 10 });

  const resultado = comMathRandomFixo(0.99, () =>
    aplicarAcao({
      atacante,
      defensor,
      acao: { tipo: "power", power: poderCicloVital },
      vidaMaxAtacante: 50,
    }),
  );

  assert.equal(resultado.esquivou, false);
  assert.ok(resultado.dano > 0, "golpe deveria causar dano quando acerta");
  assert.ok(atacante.vida_atual > 20, "vida do atacante deveria subir quando o golpe acerta");
});

test("poder de cura pura (sem dano) continua curando mesmo com Math.random() baixo", () => {
  const atacante = personagemBase({ vida_atual: 20 });
  const defensor = personagemBase({ agilidade: 10 });
  const poderCuraPura = { ...poderCicloVital, dano_base: 0 };

  const resultado = comMathRandomFixo(0, () =>
    aplicarAcao({
      atacante,
      defensor,
      acao: { tipo: "power", power: poderCuraPura },
      vidaMaxAtacante: 50,
    }),
  );

  assert.equal(resultado.esquivou, false, "poder sem dano nunca passa pelo cálculo de acerto/esquiva");
  assert.ok(atacante.vida_atual > 20, "cura pura precisa continuar funcionando sempre");
});
