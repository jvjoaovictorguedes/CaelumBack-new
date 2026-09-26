// Sistema de Proezas Únicas §16 — integração real do trigger
// ADVENTURE_VICTORY: combate de ponta a ponta via combatController (o
// MESMO caminho que o Express usa), não uma chamada direta a
// uniqueFeatService. Confirma que "cada integração chama o check no
// evento autoritativo correto" (§27) de verdade, não só em isolamento.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
const combatController = require("../src/controllers/combatController");
const characterController = require("../src/controllers/characterController");
const adventureService = require("../src/services/adventureService");
const AdventureZone = require("../src/models/AdventureZone");
const Character = require("../src/models/Character");
require("../src/models/associations");

const UniqueFeat = require("../src/models/UniqueFeat");
const UniqueFeatClaim = require("../src/models/UniqueFeatClaim");
const CharacterAbilities = require("../src/models/CharacterAbilities");
const Power = require("../src/models/Power");

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

async function criarProezaParaZona(zoneId) {
  const power = await Power.create({
    nome: `Legado de teste ${sufixo()}`,
    descricao: "Power de teste pra Proeza Única (integração real).",
    tipo_poder: "Ativo",
    custo_mana: 10,
    escala_atributo: "Forca",
    valor_escala: 1,
    acquisition_scope: "UNIQUE_FEAT",
  });
  return UniqueFeat.create({
    key: `teste_integracao_${sufixo()}`,
    nome: "Proeza de teste (integração real)",
    descricao_publica: "Lore pública de teste.",
    descricao_secreta_admin: "Vencer um combate na zona de teste.",
    trigger_key: "ADVENTURE_VICTORY",
    trigger_config: { zoneId },
    id_power_reward: power.id,
    ativa: true,
  });
}

async function vencerUmCombateReal(personagemId, zonaId) {
  await adventureService.entrarNaZona(personagemId, zonaId);

  const gerar = reqRes(personagemId, {});
  await combatController.gerarInimigoParaPersonagem(gerar.req, gerar.res);
  assert.equal(gerar.resultado().statusCode, 200, JSON.stringify(gerar.resultado().corpo));

  // Mesmo truque de aventuraExpansaoCombateReal.test.js: enfraquece o
  // encontro JÁ REAL (mesmo id_area sorteado) pra vitória determinística
  // sem depender de sorte de dano/esquiva, mantendo a integração real.
  const personagemDb = await Character.findByPk(personagemId);
  personagemDb.encontro_pve = { ...personagemDb.encontro_pve, vida_maxima: 1, vida_atual: 1 };
  await personagemDb.save();

  let ultimaResposta = null;
  for (let turno = 0; turno < 15; turno += 1) {
    const ataque = reqRes(personagemId, { action: { type: "attack" } });
    // eslint-disable-next-line no-await-in-loop
    await combatController.executarTurno(ataque.req, ataque.res);
    ultimaResposta = ataque.resultado();
    if (ultimaResposta.corpo?.data?.done) break;
  }
  assert.ok(ultimaResposta?.corpo?.data?.victory, `não venceu — resposta final: ${JSON.stringify(ultimaResposta?.corpo)}`);
  return ultimaResposta.corpo.data;
}

testeComBanco("vitória real na zona certa concede a Proeza (claim + CharacterAbilities + log)", async () => {
  const zona = await AdventureZone.findOne({ where: { nome: "Campos dos Viajantes" } });
  assert.ok(zona, "área 'Campos dos Viajantes' não encontrada — migrations da expansão rodaram?");

  const feat = await criarProezaParaZona(zona.id);
  const { personagem } = await criarPersonagem({ nivel: 5 });

  const dados = await vencerUmCombateReal(personagem.id, zona.id);

  assert.ok(
    dados.log.some((linha) => linha.includes("escreveu uma nova página na história de Caelum")),
    "log de vitória devia registrar a conquista da Proeza",
  );

  const claim = await UniqueFeatClaim.findOne({ where: { id_unique_feat: feat.id } });
  assert.ok(claim, "claim devia ter sido criado pela vitória real");
  assert.equal(claim.id_personagem, personagem.id);
  assert.equal(claim.trigger_key, "ADVENTURE_VICTORY");
  assert.equal(claim.trigger_snapshot.zoneId, zona.id);

  const ability = await CharacterAbilities.findOne({
    where: { id_personagem: personagem.id, id_power: feat.id_power_reward },
  });
  assert.ok(ability, "CharacterAbilities do Legado devia ter sido concedido");
  assert.equal(ability.is_active, false);
  assert.equal(ability.nivel_habilidade, 1);
});

testeComBanco("vitória real em zona SEM Proeza configurada não conquista nada", async () => {
  const zona = await AdventureZone.findOne({ where: { nome: "Campos dos Viajantes" } });
  assert.ok(zona);

  // Proeza configurada pra uma zona que NUNCA vai bater neste teste —
  // usa um id claramente fora da faixa real (negativo) em vez do id
  // verdadeiro da zona.
  const feat = await criarProezaParaZona(-999999);
  const { personagem } = await criarPersonagem({ nivel: 5 });

  const dados = await vencerUmCombateReal(personagem.id, zona.id);

  assert.ok(
    !dados.log.some((linha) => linha.includes("escreveu uma nova página na história de Caelum")),
    "log não devia mencionar Proeza nenhuma",
  );
  const claim = await UniqueFeatClaim.findOne({ where: { id_unique_feat: feat.id } });
  assert.equal(claim, null, "Proeza configurada pra outra zona não devia ter sido conquistada");
});

testeComBanco("Legado conquistado aparece em GET /characters/:id/powers (origem=legado), nunca fica invisível", async () => {
  // Bug real encontrado durante a Fase 5 (UX pública): o Legado é
  // concedido via CharacterAbilities DIRETO (uniqueFeatService.
  // tryClaimAtomic), nunca por ClassAbilities/RaceAbilities — sem o
  // terceiro ramo em characterController.getPoderesDisponiveis, o
  // jogador nunca veria o próprio Legado pra sequer poder ativá-lo.
  const zona = await AdventureZone.findOne({ where: { nome: "Campos dos Viajantes" } });
  assert.ok(zona);
  const feat = await criarProezaParaZona(zona.id);
  const { personagem } = await criarPersonagem({ nivel: 5 });

  await vencerUmCombateReal(personagem.id, zona.id);
  const claim = await UniqueFeatClaim.findOne({ where: { id_unique_feat: feat.id } });
  assert.ok(claim, "pré-condição: a Proeza precisa ter sido conquistada");

  const chamada = reqRes(personagem.id, {});
  chamada.req.params = { id: personagem.id };
  await characterController.getPoderesDisponiveis(chamada.req, chamada.res);
  const { statusCode, corpo } = chamada.resultado();
  assert.equal(statusCode, 200);

  const power = await Power.findByPk(feat.id_power_reward);
  const entradaLegado = corpo.data.poderes.find((p) => p.id_power === power.id);
  assert.ok(entradaLegado, "Legado devia aparecer na lista de poderes do personagem");
  assert.equal(entradaLegado.origem, "legado");
  assert.equal(entradaLegado.acquisition_scope, "UNIQUE_FEAT");
  assert.equal(entradaLegado.aprendido, true);
  assert.equal(entradaLegado.ativo, false, "concedido inativo — o jogador ativa como qualquer outro poder");
  assert.equal(entradaLegado.nivel_habilidade, 1);
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
