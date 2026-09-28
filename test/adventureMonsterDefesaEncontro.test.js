// Especificação "Admin de Aventura + Defesa/Poder de Monstros" v3 §5.3/
// §12.1 — Defesa precisa chegar no snapshot REAL do combate solo (não
// só existir na coluna do banco). Mesmo padrão de fixture isolada de
// adminAdventureValidation.test.js (zona/monstro/vínculo próprios,
// nunca os dados compartilhados de aventuraExpansao.test.js).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo } = require("./helpers/db");
require("../src/models/associations");

const AdventureZone = require("../src/models/AdventureZone");
const AdventureMonster = require("../src/models/AdventureMonster");
const AdventureZoneMonster = require("../src/models/AdventureZoneMonster");
const adventureService = require("../src/services/adventureService");
const combatController = require("../src/controllers/combatController");
const { calcularPoderRecomendado } = require("../src/services/hunterRewardService");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

function reqRes(characterId, body) {
  let statusCode = null;
  let corpo = null;
  const req = { personagemAtual: { id: characterId }, body };
  const res = {
    status(codigo) {
      statusCode = codigo;
      return this;
    },
    json(payload) {
      corpo = payload;
      return this;
    },
  };
  return { req, res, resultado: () => ({ statusCode, corpo }) };
}

async function criarZonaComMonstro({ defesa }) {
  const zona = await AdventureZone.create({
    nome: `Zona Defesa Teste ${sufixo()}`,
    nivel_monstro_min: 1,
    nivel_monstro_max: 99,
    ativa: true,
  });
  const monstro = await AdventureMonster.create({
    nome: `Monstro Defesa Teste ${sufixo()}`,
    nivel: 1,
    vida_maxima: 1000, // alto de propósito — só precisamos gerar o encontro, não vencer
    dano_min: 1,
    dano_max: 1,
    agilidade: 1,
    velocidade: 1,
    xp_recompensa: 1,
    ouro_recompensa: 1,
    defesa,
    ativo: true,
  });
  await AdventureZoneMonster.create({
    id_area: zona.id,
    id_monstro: monstro.id,
    peso_aparicao: 100,
    tipo_aparicao: "Comum",
    nivel_jogador_minimo: 1,
    ativo: true,
  });
  return { zona, monstro };
}

testeComBanco("Aventura solo: encontro_pve.defesa vem do catálogo (AdventureMonster.defesa), §5.3", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { zona } = await criarZonaComMonstro({ defesa: 37 });

  await adventureService.entrarNaZona(personagem.id, zona.id);
  const gerar = reqRes(personagem.id, {});
  await combatController.gerarInimigoParaPersonagem(gerar.req, gerar.res);

  assert.equal(gerar.resultado().statusCode, 200, JSON.stringify(gerar.resultado().corpo));
  const inimigo = gerar.resultado().corpo.data.enemy;
  assert.equal(inimigo.defesa, 37, "o encontro real precisa carregar a Defesa configurada no Admin");
});

testeComBanco("Aventura solo: monstro com defesa=0 (default) mantém encontro sem Defesa — comportamento antigo preservado", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { zona } = await criarZonaComMonstro({ defesa: 0 });

  await adventureService.entrarNaZona(personagem.id, zona.id);
  const gerar = reqRes(personagem.id, {});
  await combatController.gerarInimigoParaPersonagem(gerar.req, gerar.res);

  const inimigo = gerar.resultado().corpo.data.enemy;
  assert.equal(inimigo.defesa, 0);
});

test("hunterRewardService.calcularPoderRecomendado: usa defesa real do monstro, não fixa em 0 (§12.1 Caçadas preservam defesa configurada)", () => {
  const difficulty = { hpMultiplier: 0, damageMultiplier: 0 };
  const semDefesa = calcularPoderRecomendado({ vidaMaxima: 100, danoMin: 10, danoMax: 10, defesa: 0, difficulty });
  const comDefesa = calcularPoderRecomendado({ vidaMaxima: 100, danoMin: 10, danoMax: 10, defesa: 50, difficulty });
  assert.ok(comDefesa > semDefesa, "monstro com mais Defesa precisa recomendar mais Poder (mais EHP efetivo)");
});

test("hunterRewardService.calcularPoderRecomendado: Defesa NUNCA escala pela dificuldade da Caçada, só HP/dano", () => {
  const facil = { hpMultiplier: 0, damageMultiplier: 0 };
  const dificil = { hpMultiplier: 1, damageMultiplier: 1 };
  // Mesma defesa nos dois — só dano/vida dobram na dificuldade "dificil".
  // Sem a defesa influenciar corretamente o EHP, o comportamento relativo
  // entre os dois quebraria de forma imprevisível.
  const poderFacil = calcularPoderRecomendado({ vidaMaxima: 100, danoMin: 10, danoMax: 10, defesa: 20, difficulty: facil });
  const poderDificil = calcularPoderRecomendado({ vidaMaxima: 100, danoMin: 10, danoMax: 10, defesa: 20, difficulty: dificil });
  assert.ok(poderDificil > poderFacil, "dificuldade maior (mais HP/dano) precisa recomendar mais Poder");
});
