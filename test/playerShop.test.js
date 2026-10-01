// Loja do Aventureiro V2 — Fase 3 (perfil da loja). playerShopService.js.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const Character = require("../src/models/Character");
const PlayerShop = require("../src/models/PlayerShop");
const CharacterForgeProgress = require("../src/models/CharacterForgeProgress");
const playerShopService = require("../src/services/playerShopService");

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

const personagensCriados = [];
const usuariosCriados = [];

test.after(async () => {
  if (!temBanco) return;
  if (personagensCriados.length > 0) {
    await PlayerShop.destroy({ where: { id_personagem: personagensCriados } });
    await CharacterForgeProgress.destroy({ where: { id_personagem: personagensCriados } });
    await Character.destroy({ where: { id: personagensCriados } });
  }
  if (usuariosCriados.length > 0) await User.destroy({ where: { id: usuariosCriados } });
  await sequelize.close();
});

async function novoPersonagem() {
  const { usuario, personagem } = await criarPersonagem({ nivel: 5 });
  usuariosCriados.push(usuario.id);
  personagensCriados.push(personagem.id);
  return { usuario, personagem };
}

testeComBanco("loja: criarOuAtualizarLoja cria na primeira vez e atualiza na segunda (nunca duplica)", async () => {
  const { personagem } = await novoPersonagem();

  const criada = await playerShopService.criarOuAtualizarLoja(personagem.id, {
    nome: `Loja do ${sufixo()}`,
    descricao: "Vendo de tudo um pouco.",
  });
  assert.equal(criada.id_personagem, personagem.id);
  assert.equal(criada.ativa, true);
  assert.equal(criada.aceita_encomendas, true);

  const atualizada = await playerShopService.criarOuAtualizarLoja(personagem.id, {
    nome: `Loja Renomeada ${sufixo()}`,
    aceita_encomendas: false,
  });
  assert.equal(atualizada.id, criada.id, "upsert tem que atualizar a MESMA linha, nunca criar uma segunda");
  assert.equal(atualizada.aceita_encomendas, false);

  const total = await PlayerShop.count({ where: { id_personagem: personagem.id } });
  assert.equal(total, 1, "só pode existir 1 loja por personagem mesmo depois de 2 upserts");
});

testeComBanco("loja: criarOuAtualizarLoja rejeita nome vazio/curto demais", async () => {
  const { personagem } = await novoPersonagem();
  await assert.rejects(
    () => playerShopService.criarOuAtualizarLoja(personagem.id, { nome: "Oi" }),
    /entre 3 e 100 caracteres/,
  );
});

testeComBanco("loja: obterPerfilPublico devolve profissões reais e estatísticas zeradas (sem demanda/encomenda ainda)", async () => {
  const { personagem } = await novoPersonagem();
  await playerShopService.criarOuAtualizarLoja(personagem.id, { nome: `Loja ${sufixo()}` });
  await CharacterForgeProgress.create({ id_personagem: personagem.id, nivel: 7, experiencia: 1234 });

  const perfil = await playerShopService.obterPerfilPublico(personagem.id);
  assert.equal(perfil.nome_personagem, personagem.nome);
  assert.equal(perfil.profissoes.ferreiro.nivel, 7);
  assert.equal(perfil.profissoes.alquimista, null);
  assert.equal(perfil.estatisticas.produtos_ativos, 0);
  assert.equal(perfil.estatisticas.demandas_concluidas, 0);
  assert.equal(perfil.estatisticas.encomendas_concluidas, 0);
});

testeComBanco("loja: obterPerfilPublico lança 404 quando o personagem não tem loja", async () => {
  const { personagem } = await novoPersonagem();
  await assert.rejects(
    () => playerShopService.obterPerfilPublico(personagem.id),
    (erro) => erro.statusCode === 404,
  );
});

testeComBanco("loja: listarLojasPublicas só mostra lojas ativas e respeita busca por nome", async () => {
  const { personagem: p1 } = await novoPersonagem();
  const { personagem: p2 } = await novoPersonagem();
  const nomeUnico = `Ferraria Exclusiva ${sufixo()}`;
  await playerShopService.criarOuAtualizarLoja(p1.id, { nome: nomeUnico });
  await playerShopService.criarOuAtualizarLoja(p2.id, { nome: `Loja Inativa ${sufixo()}`, ativa: false });

  const resultado = await playerShopService.listarLojasPublicas({ busca: nomeUnico });
  assert.equal(resultado.lojas.length, 1);
  assert.equal(resultado.lojas[0].id_personagem, p1.id);
});
