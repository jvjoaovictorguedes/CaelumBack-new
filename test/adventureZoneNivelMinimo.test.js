// Gate de nível mínimo pra ENTRAR numa zona da Aventura (pedido do
// jogador: até aqui nivel_monstro_min/max era só indicativo, nunca
// bloqueava entrada — ver AdventureZone.js). Cobre o serviço de
// jogador (adventureService.entrarNaZona/listarZonas) e a validação
// do Admin (adminAdventureService.createAdminZone/updateAdminZone).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
const AdventureZone = require("../src/models/AdventureZone");
const CharacterAdventureSession = require("../src/models/CharacterAdventureSession");
const User = require("../src/models/User");
const adventureService = require("../src/services/adventureService");
const adminAdventureService = require("../src/services/adminAdventureService");

let temBanco = false;
let ctxAdmin = null;
test.before(async () => {
  temBanco = await bancoDisponivel();
  if (temBanco) {
    const admin = await User.create({ username: `admin_${sufixo()}`, email: `admin_${sufixo()}@teste.local`, passwordHash: "hash-de-teste", isAdmin: true });
    ctxAdmin = { idAdmin: admin.id, req: {} };
  }
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

const zonasCriadas = [];
test.after(async () => {
  if (!temBanco) return;
  if (zonasCriadas.length > 0) {
    await CharacterAdventureSession.destroy({ where: { id_area: zonasCriadas } });
    await AdventureZone.destroy({ where: { id: zonasCriadas } });
  }
  await sequelize.close();
});

async function criarZonaTeste(overrides = {}) {
  const zona = await AdventureZone.create({
    nome: `Zona Teste ${sufixo()}`,
    nivel_monstro_min: 1,
    nivel_monstro_max: 10,
    ...overrides,
  });
  zonasCriadas.push(zona.id);
  return zona;
}

testeComBanco("entrarNaZona: bloqueia personagem abaixo do nivel_jogador_minimo da zona", async () => {
  const zona = await criarZonaTeste({ nivel_jogador_minimo: 20 });
  const { personagem } = await criarPersonagem({ nivel: 10 });

  await assert.rejects(
    () => adventureService.entrarNaZona(personagem.id, zona.id),
    (err) => {
      assert.equal(err.status, 403);
      assert.match(err.message, /nível 20/);
      return true;
    },
  );
});

testeComBanco("entrarNaZona: permite personagem no nível exato ou acima do mínimo", async () => {
  const zona = await criarZonaTeste({ nivel_jogador_minimo: 20 });
  const { personagem } = await criarPersonagem({ nivel: 20 });

  const { sessao } = await adventureService.entrarNaZona(personagem.id, zona.id);
  assert.equal(sessao.id_area, zona.id);
});

testeComBanco("entrarNaZona: zona com nivel_jogador_minimo padrão (1) aceita qualquer personagem", async () => {
  const zona = await criarZonaTeste();
  const { personagem } = await criarPersonagem({ nivel: 1 });

  const { sessao } = await adventureService.entrarNaZona(personagem.id, zona.id);
  assert.equal(sessao.id_area, zona.id);
});

testeComBanco("listarZonas: expõe nivel_jogador_minimo e bloqueada_por_nivel corretamente", async () => {
  const zona = await criarZonaTeste({ nivel_jogador_minimo: 15, ordem: 999999 });

  const zonasAbaixo = await adventureService.listarZonas(10);
  const encontradaAbaixo = zonasAbaixo.find((z) => z.id === zona.id);
  assert.equal(encontradaAbaixo.nivel_jogador_minimo, 15);
  assert.equal(encontradaAbaixo.bloqueada_por_nivel, true);

  const zonasAcima = await adventureService.listarZonas(15);
  const encontradaAcima = zonasAcima.find((z) => z.id === zona.id);
  assert.equal(encontradaAcima.bloqueada_por_nivel, false);
});

testeComBanco("admin createAdminZone: valida nivel_jogador_minimo (rejeita < 1 e não inteiro)", async () => {
  await assert.rejects(
    () =>
      adminAdventureService.createAdminZone(
        { nome: `Zona Admin ${sufixo()}`, nivel_monstro_min: 1, nivel_monstro_max: 5, nivel_jogador_minimo: 0 },
        ctxAdmin,
      ),
    /nivel_jogador_minimo/,
  );

  await assert.rejects(
    () =>
      adminAdventureService.createAdminZone(
        { nome: `Zona Admin ${sufixo()}`, nivel_monstro_min: 1, nivel_monstro_max: 5, nivel_jogador_minimo: 2.5 },
        ctxAdmin,
      ),
    /nivel_jogador_minimo/,
  );

  const zona = await adminAdventureService.createAdminZone(
    { nome: `Zona Admin ${sufixo()}`, nivel_monstro_min: 1, nivel_monstro_max: 5, nivel_jogador_minimo: 3 },
    ctxAdmin,
  );
  zonasCriadas.push(zona.id);
  assert.equal(zona.nivel_jogador_minimo, 3);
});

testeComBanco("admin createAdminZone: sem nivel_jogador_minimo no payload, usa o default (1) do model", async () => {
  const zona = await adminAdventureService.createAdminZone(
    { nome: `Zona Admin ${sufixo()}`, nivel_monstro_min: 1, nivel_monstro_max: 5 },
    ctxAdmin,
  );
  zonasCriadas.push(zona.id);
  assert.equal(zona.nivel_jogador_minimo, 1);
});

testeComBanco("admin updateAdminZone: PATCH valida nivel_jogador_minimo antes de persistir", async () => {
  const zona = await criarZonaTeste({ nivel_jogador_minimo: 5 });

  await assert.rejects(
    () => adminAdventureService.updateAdminZone(zona.id, { nivel_jogador_minimo: -1 }, ctxAdmin),
    /nivel_jogador_minimo/,
  );
  await zona.reload();
  assert.equal(zona.nivel_jogador_minimo, 5, "valor inválido não pode ter sido persistido");

  const atualizada = await adminAdventureService.updateAdminZone(zona.id, { nivel_jogador_minimo: 25 }, ctxAdmin);
  assert.equal(atualizada.nivel_jogador_minimo, 25);
});
