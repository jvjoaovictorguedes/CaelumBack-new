// Sistema de Proezas Únicas §25/§28 — Fase 7 (Conteúdo). Prova que a
// migration 20261207010000-unique-feats-conteudo-inicial semeou as 9
// Proezas corretamente (cada uma com seu Legado UNIQUE_FEAT + o
// UniquePowerEffect que a autoriza a funcionar em PvE — sem essa
// linha, uniquePowerEffectRegistry.idsDesautorizadosNoContexto
// bloquearia o Legado em TODO contexto, PvE incluído) e faz UMA prova
// end-to-end real (não apenas leitura de schema) pra "O Sobrevivente
// Impossível", reaproveitando a mesma técnica de combate determinístico
// já validada em uniqueFeatIntegration.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
require("../src/models/associations");

const UniqueFeat = require("../src/models/UniqueFeat");
const UniqueFeatClaim = require("../src/models/UniqueFeatClaim");
const UniquePowerEffect = require("../src/models/UniquePowerEffect");
const Power = require("../src/models/Power");
const CharacterAbilities = require("../src/models/CharacterAbilities");
const Character = require("../src/models/Character");
const AdventureZone = require("../src/models/AdventureZone");
const { validarTriggerConfig } = require("../src/services/uniqueFeatTriggerRegistry");
const adventureService = require("../src/services/adventureService");
const combatController = require("../src/controllers/combatController");

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

test.after(async () => {
  if (temBanco) await sequelize.close();
});

const KEYS_SEED = [
  "sobrevivente_impossivel",
  "aquele_que_viu_o_abismo",
  "ferreiro_impossivel",
  "refinador_alem_do_limite",
  "alquimista_proibido",
  "pescaria_lendaria",
  "navegador_perdido",
  "primeiro_golpe_de_uma_era",
  "desbravador_celestial",
];

testeComBanco("as 9 Proezas do seed inicial existem, ativas, com trigger_config válido pro schema real", async () => {
  const feats = await UniqueFeat.findAll({ where: { key: KEYS_SEED } });
  assert.equal(feats.length, 9, "as 9 Proezas do seed devem existir");
  for (const feat of feats) {
    assert.equal(feat.ativa, true, `${feat.key} devia nascer ativa (conteúdo real, não rascunho)`);
    assert.doesNotThrow(
      () => validarTriggerConfig(feat.trigger_key, feat.trigger_config),
      `${feat.key}: trigger_config precisa ser válido pro schema de ${feat.trigger_key}`,
    );
  }
});

testeComBanco("cada Legado do seed é um Power UNIQUE_FEAT com UniquePowerEffect ativo (senão nem funcionaria em PvE)", async () => {
  const feats = await UniqueFeat.findAll({ where: { key: KEYS_SEED } });
  for (const feat of feats) {
    // eslint-disable-next-line no-await-in-loop -- verificação sequencial simples, sem dependência de ordem
    const power = await Power.findByPk(feat.id_power_reward);
    assert.ok(power, `${feat.key}: Power do Legado precisa existir`);
    assert.equal(power.acquisition_scope, "UNIQUE_FEAT", `${feat.key}: Legado precisa ser UNIQUE_FEAT`);

    // eslint-disable-next-line no-await-in-loop
    const efeito = await UniquePowerEffect.findByPk(power.id);
    assert.ok(efeito, `${feat.key}: precisa ter UniquePowerEffect (senão fica bloqueado em todo contexto)`);
    assert.equal(efeito.ativo, true);
    assert.equal(efeito.allow_pve, true, `${feat.key}: precisa funcionar em PvE`);
    assert.equal(efeito.allow_ranked, false, "V1: nunca em Ranked");
    assert.equal(efeito.allow_pvp_casual, false, "V1: nunca em PvP Casual");
    assert.equal(efeito.allow_tournament, false, "V1: nunca em Torneio");
  }
});

testeComBanco("nenhum Power do seed reaproveita id_power_reward de outra Proeza (UNIQUE em UniqueFeat.id_power_reward)", async () => {
  const feats = await UniqueFeat.findAll({ where: { key: KEYS_SEED } });
  const idsPower = feats.map((f) => f.id_power_reward);
  assert.equal(new Set(idsPower).size, idsPower.length, "cada Proeza precisa ter seu próprio Legado exclusivo");
});

testeComBanco("'O Sobrevivente Impossível' é conquistável de verdade: vitória real no Covil do Minotauro com 1 HP", async () => {
  const feat = await UniqueFeat.findOne({ where: { key: "sobrevivente_impossivel" } });
  assert.ok(feat, "pré-condição: Proeza do seed precisa existir");

  const zona = await AdventureZone.findByPk(3);
  assert.equal(zona?.nome, "Covil do Minotauro", "pré-condição: zona 3 precisa ser mesmo a referenciada no trigger_config do seed");

  // Esta Proeza é conteúdo REAL e PERMANENTE (key fixa, não gerada por
  // sufixo()) — numa base de teste persistente, uma execução anterior
  // desta MESMA suíte pode já ter vencido a corrida global (é
  // exatamente essa garantia de "um vencedor pra sempre" que o sistema
  // existe pra proteger). O teste precisa continuar correto nos dois
  // cenários: primeira conquista real (meu personagem vence) OU
  // corrida já resolvida antes (meu personagem tenta de novo,
  // corretamente NÃO rouba o vencedor já registrado).
  const claimAntes = await UniqueFeatClaim.findOne({ where: { id_unique_feat: feat.id } });

  const { personagem } = await criarPersonagem({ nivel: 50 });
  await adventureService.entrarNaZona(personagem.id, zona.id);

  const gerar = { req: { personagemAtual: { id: personagem.id }, body: {} }, res: { status() { return this; }, json() {} } };
  await combatController.gerarInimigoParaPersonagem(gerar.req, gerar.res);

  // Mesma técnica de aventuraExpansaoCombateReal.test.js/uniqueFeatIntegration.test.js:
  // enfraquece o encontro JÁ REAL (mesmo id_area sorteado) pra vitória
  // determinística, e força o PRÓPRIO personagem a já estar com 1 HP —
  // como o inimigo morre no primeiro golpe, nada mais reduz essa vida
  // depois, então hpRestante chega exatamente 1 no momento da vitória.
  const personagemDb = await Character.findByPk(personagem.id);
  personagemDb.encontro_pve = { ...personagemDb.encontro_pve, vida_maxima: 1, vida_atual: 1 };
  personagemDb.vida_atual = 1;
  await personagemDb.save();

  let ultimaResposta = null;
  for (let turno = 0; turno < 15; turno += 1) {
    let statusCode = null;
    let corpo = null;
    const ataque = {
      req: { personagemAtual: { id: personagem.id }, body: { action: { type: "attack" } } },
      res: {
        status(codigo) {
          statusCode = codigo;
          return this;
        },
        json(payload) {
          corpo = payload;
          return this;
        },
      },
    };
    // eslint-disable-next-line no-await-in-loop -- combate é sequencial por natureza (turno depende do anterior)
    await combatController.executarTurno(ataque.req, ataque.res);
    ultimaResposta = { statusCode, corpo };
    if (ultimaResposta.corpo?.data?.done) break;
  }
  assert.ok(ultimaResposta?.corpo?.data?.victory, `não venceu — resposta final: ${JSON.stringify(ultimaResposta?.corpo)}`);

  const claimDepois = await UniqueFeatClaim.findOne({ where: { id_unique_feat: feat.id } });
  assert.ok(claimDepois, "a condição real (vitória com 1 HP no Covil do Minotauro) precisa resultar numa claim válida — de MEU personagem ou de quem já tinha vencido antes");

  if (!claimAntes) {
    // Primeira conquista real desta base de teste — meu personagem venceu.
    assert.equal(claimDepois.id_personagem, personagem.id);
    const ability = await CharacterAbilities.findOne({ where: { id_personagem: personagem.id, id_power: feat.id_power_reward } });
    assert.ok(ability, "Legado 'Recusar o Destino' devia ter sido concedido");
    assert.equal(ability.is_active, false);
  } else {
    // Corrida já resolvida por uma execução anterior — meu personagem
    // ainda venceu o COMBATE de verdade (assert de victory acima já
    // provou isso), mas não pode ter roubado o vencedor já registrado.
    assert.equal(claimDepois.id, claimAntes.id, "claim não pode ter mudado de dono numa corrida já resolvida");
    const abilityIndevida = await CharacterAbilities.findOne({ where: { id_personagem: personagem.id, id_power: feat.id_power_reward } });
    assert.equal(abilityIndevida, null, "meu personagem não pode ter recebido o Legado — a Proeza já tinha dono");
  }
});
