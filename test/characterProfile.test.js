// Perfil de Jogador — testes de integração (§57/§59 da Especificação
// Perfil de Jogador). Precisa de Postgres real (TEST_DATABASE_URL).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/controllers/guildController");

const AdventureMonster = require("../src/models/AdventureMonster");
const Item = require("../src/models/Item");
const CharacterEquipment = require("../src/models/CharacterEquipment");
const monsterKillService = require("../src/services/monsterKillService");
const achievementService = require("../src/services/achievementService");
const characterProfileService = require("../src/services/characterProfileService");

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

// §59 — inspeciona TODAS as chaves do payload (recursivamente) e falha
// se algum campo proibido aparecer, em vez de checar só o topo. É fácil
// um include futuro vazar dado por acidente sem isto.
const CHAVES_PROIBIDAS = [
  "id_usuario",
  "email",
  "passwordHash",
  "senha",
  "dinheiro",
  "gold",
  "inventory",
  "inventario",
];

function coletarChaves(valor, acumulado = new Set()) {
  if (valor === null || typeof valor !== "object") return acumulado;
  if (Array.isArray(valor)) {
    for (const item of valor) coletarChaves(item, acumulado);
    return acumulado;
  }
  for (const [chave, valorFilho] of Object.entries(valor)) {
    acumulado.add(chave);
    coletarChaves(valorFilho, acumulado);
  }
  return acumulado;
}

testeComBanco("perfil de personagem existente retorna dados válidos", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const perfil = await characterProfileService.obterPerfilPublico(personagem.id, null);
  assert.equal(perfil.identity.id, personagem.id);
  assert.equal(perfil.identity.nome, personagem.nome);
});

testeComBanco("ID inexistente lança erro equivalente a 404", async () => {
  await assert.rejects(
    () => characterProfileService.obterPerfilPublico(999999999, null),
    (err) => err.status === 404,
  );
});

testeComBanco("payload público NÃO contém nenhuma chave proibida (privacidade)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const perfil = await characterProfileService.obterPerfilPublico(personagem.id, null);
  const chaves = coletarChaves(perfil);
  for (const proibida of CHAVES_PROIBIDAS) {
    assert.equal(chaves.has(proibida), false, `chave proibida "${proibida}" apareceu no payload público`);
  }
});

testeComBanco("visitante não recebe atributos detalhados; dono recebe", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const visitante = await characterProfileService.obterPerfilPublico(personagem.id, null);
  assert.equal(visitante.identity.atributos, undefined);

  const proprio = await characterProfileService.obterPerfilProprio(personagem.id);
  assert.ok(proprio.identity.atributos);
  assert.equal(proprio.identity.atributos.forca, personagem.forca);
});

testeComBanco("equipamentos públicos trazem só o que está equipado (vazio sem equipar nada)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const equip = await characterProfileService.montarEquipamentosPublicos(personagem.id);
  assert.deepEqual(equip, []);
});

testeComBanco("frase respeita o limite de 140 caracteres", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  await assert.rejects(
    () => characterProfileService.atualizarPersonalizacao(personagem.id, { frase: "x".repeat(141) }),
    (err) => err.status === 400,
  );
  const perfil = await characterProfileService.atualizarPersonalizacao(personagem.id, { frase: "Uma frase válida." });
  assert.equal(perfil.identity.frase, "Uma frase válida.");
});

testeComBanco("frase remove HTML (nunca aceita tags)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const perfil = await characterProfileService.atualizarPersonalizacao(personagem.id, {
    frase: "<b>oi</b><script>alert(1)</script>",
  });
  assert.equal(perfil.identity.frase, "oialert(1)");
});

testeComBanco("não é possível equipar título não desbloqueado", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  await assert.rejects(
    () => characterProfileService.atualizarPersonalizacao(personagem.id, { id_titulo_selecionado: 999999 }),
    (err) => err.status === 403,
  );
});

testeComBanco("não é possível destacar conquista não desbloqueada", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  await assert.rejects(
    () => characterProfileService.atualizarPersonalizacao(personagem.id, { conquistas_destaque: [999999] }),
    (err) => err.status === 403,
  );
});

testeComBanco("não é possível destacar monstro não descoberto", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const monstro = await AdventureMonster.create({ nome: `NuncaVi${sufixo()}` });
  await assert.rejects(
    () => characterProfileService.atualizarPersonalizacao(personagem.id, { monstros_destaque: [monstro.id] }),
    (err) => err.status === 403,
  );
});

testeComBanco("achievement grant é idempotente e alimenta highlights corretamente", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const monstro = await AdventureMonster.create({ nome: `MonstroKill${sufixo()}` });

  await monsterKillService.registrarMorte(personagem.id, monstro.nome, null);
  await achievementService.checkMonsterKillAchievements(personagem.id, null);
  await achievementService.checkMonsterKillAchievements(personagem.id, null);
  await achievementService.checkMonsterKillAchievements(personagem.id, null);

  const conquistas = await achievementService.listarConquistasDoPersonagem(personagem.id);
  const primeiroSangue = conquistas.filter((c) => c.achievement.key === "primeiro_sangue");
  assert.equal(primeiroSangue.length, 1, "3 chamadas seguidas não duplicam a conquista");

  const perfil = await characterProfileService.atualizarPersonalizacao(personagem.id, {
    conquistas_destaque: [primeiroSangue[0].id_achievement],
  });
  assert.equal(perfil.highlights.conquistas.length, 1);
  assert.equal(perfil.highlights.conquistas[0].key, "primeiro_sangue");
});

testeComBanco("highlights não duplicam e respeitam no máximo 3 slots", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  await assert.rejects(
    () =>
      characterProfileService.atualizarPersonalizacao(personagem.id, {
        conquistas_destaque: [1, 2, 3, 4],
      }),
    (err) => err.status === 400,
  );
});

async function equiparItemQualquer(idPersonagem) {
  const item = await Item.create({
    nome: `Espada Perfil ${sufixo()}`,
    descricao: "teste",
    tipo_item: "Arma",
    raridade: "Comum",
  });
  await CharacterEquipment.create({ id_personagem: idPersonagem, slot: "ArmaPrincipal", id_item: item.id });
  return item;
}

testeComBanco("ocultar equipamentos: visitante não recebe a lista, dono continua recebendo", async () => {
  const { personagem, usuario } = await criarPersonagem({ nivel: 5 });
  const item = await equiparItemQualquer(personagem.id);

  const antes = await characterProfileService.obterPerfilPublico(personagem.id, null);
  assert.equal(antes.equipment.length, 1);
  assert.equal(antes.equipment_oculto, false);

  const proprio = await characterProfileService.atualizarPersonalizacao(personagem.id, { ocultar_equipamentos: true });
  assert.equal(proprio.privacidade.ocultar_equipamentos, true);
  assert.equal(proprio.equipment.length, 1, "o dono sempre vê o próprio equipamento");
  assert.equal(proprio.equipment[0].id_item, item.id);

  const visitante = await characterProfileService.obterPerfilPublico(personagem.id, usuario.id + 999999);
  assert.deepEqual(visitante.equipment, []);
  assert.equal(visitante.equipment_oculto, true);
  assert.equal(visitante.privacidade, undefined, "visitante nunca vê a configuração de privacidade");

  const reaberto = await characterProfileService.atualizarPersonalizacao(personagem.id, { ocultar_equipamentos: false });
  assert.equal(reaberto.privacidade.ocultar_equipamentos, false);
  const visitanteDepois = await characterProfileService.obterPerfilPublico(personagem.id, null);
  assert.equal(visitanteDepois.equipment.length, 1);
});

testeComBanco("ocultar_equipamentos só aceita booleano", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  await assert.rejects(
    () => characterProfileService.atualizarPersonalizacao(personagem.id, { ocultar_equipamentos: "sim" }),
    (err) => err.status === 400,
  );
});

testeComBanco("PvP do perfil traz só Arena Ranqueada (sem PvP casual nem Torneio)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const perfil = await characterProfileService.obterPerfilPublico(personagem.id, null);
  assert.equal("melhor_sequencia" in perfil.pvp, false);
  assert.equal("trofeus_torneio" in perfil.pvp, false);
  assert.ok(perfil.pvp.medalhas);
  assert.equal(typeof perfil.pvp.vitorias_temporada, "number");
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
