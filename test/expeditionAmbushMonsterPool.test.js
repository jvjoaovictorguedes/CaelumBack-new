// Pedido do jogador: "SELECIONAR QUAIS MONSTROS PODEM APARECER NA
// EMBOSCADA" — a emboscada da Expedição (Mineração/Silvicultura/
// Exploração) usava um gerador 100% procedural (gerarInimigo, nome
// decorativo sorteado de NOMES_INIMIGOS), sem nenhum vínculo com o
// catálogo real de AdventureMonster. Agora ela sorteia do catálogo,
// filtrado por AdventureMonster.ativo && AdventureMonster.disponivel_emboscada
// (ver expeditionService.coletar e adventureRollService.sortearMonstroEmboscada),
// com fallback pro gerador antigo só se o pool curado estiver vazio.
const test = require("node:test");
const assert = require("node:assert/strict");

const { sortearMonstroEmboscada } = require("../src/services/adventureRollService");

test("sortearMonstroEmboscada: sem candidato nenhum devolve null", () => {
  assert.equal(sortearMonstroEmboscada([], 10), null);
  assert.equal(sortearMonstroEmboscada(null, 10), null);
});

test("sortearMonstroEmboscada: único candidato é sempre o escolhido", () => {
  const unico = { nome: "Único", nivel: 7 };
  for (let i = 0; i < 20; i++) {
    assert.equal(sortearMonstroEmboscada([unico], 10), unico);
  }
});

test("sortearMonstroEmboscada: escolhe sempre o nível mais próximo do alvo", () => {
  const longe = { nome: "Longe", nivel: 1 };
  const perto = { nome: "Perto", nivel: 9 };
  const maisLonge = { nome: "Mais longe ainda", nivel: 30 };
  for (let i = 0; i < 20; i++) {
    const escolhido = sortearMonstroEmboscada([longe, perto, maisLonge], 10);
    assert.equal(escolhido.nome, "Perto");
  }
});

test("sortearMonstroEmboscada: empate na distância sorteia entre os empatados (nunca escolhe o mais longe)", () => {
  const abaixo = { nome: "Abaixo", nivel: 8 };
  const acima = { nome: "Acima", nivel: 12 };
  const foraDoEmpate = { nome: "Fora do empate", nivel: 1 };
  const nomesVistos = new Set();
  for (let i = 0; i < 40; i++) {
    const escolhido = sortearMonstroEmboscada([abaixo, acima, foraDoEmpate], 10);
    nomesVistos.add(escolhido.nome);
    assert.notEqual(escolhido.nome, "Fora do empate");
  }
  // Com 40 tentativas e 50% de chance cada, a probabilidade de só um dos
  // dois empatados aparecer é desprezível (~2 * 0.5^40) — uma falha aqui
  // indica um bug real no sorteio, não um flake.
  assert.ok(nomesVistos.has("Abaixo") && nomesVistos.has("Acima"), "os dois empatados deveriam aparecer em 40 tentativas");
});

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const User = require("../src/models/User");
const Character = require("../src/models/Character");
const CharacterProfession = require("../src/models/CharacterProfession");
const ExpeditionRegion = require("../src/models/ExpeditionRegion");
const ExpeditionResource = require("../src/models/ExpeditionResource");
const ExpeditionRegionResource = require("../src/models/ExpeditionRegionResource");
const ExpeditionResourceItem = require("../src/models/ExpeditionResourceItem");
const AdventureMonster = require("../src/models/AdventureMonster");

const expeditionConfig = require("../src/config/expeditionConfig");
const expeditionService = require("../src/services/expeditionService");

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

const itensCriados = [];
const personagensCriados = [];
const usuariosCriados = [];
const regioesCriadas = [];
const recursosCriados = [];
const monstrosCriados = [];
const chanceOriginal = expeditionConfig.CHANCE_MONSTRO_PPM;

test.after(async () => {
  if (!temBanco) return;
  // Nunca deixar essa chance "sempre emboscada" vazar pros outros
  // arquivos de teste de Expedição que rodam em paralelo (node --test).
  expeditionConfig.CHANCE_MONSTRO_PPM = chanceOriginal;

  if (monstrosCriados.length > 0) await AdventureMonster.destroy({ where: { id: monstrosCriados } });
  if (recursosCriados.length > 0) {
    await ExpeditionResourceItem.destroy({ where: { id_recurso: recursosCriados } });
    await ExpeditionRegionResource.destroy({ where: { id_recurso: recursosCriados } });
    await ExpeditionResource.destroy({ where: { id: recursosCriados } });
  }
  if (regioesCriadas.length > 0) await ExpeditionRegion.destroy({ where: { id: regioesCriadas } });
  if (personagensCriados.length > 0) {
    await CharacterProfession.destroy({ where: { id_personagem: personagensCriados } });
  }
  if (usuariosCriados.length > 0) {
    await Character.destroy({ where: { id_usuario: usuariosCriados } });
    await User.destroy({ where: { id: usuariosCriados } });
  }
  if (itensCriados.length > 0) await Item.destroy({ where: { id: itensCriados } });
  await sequelize.close();
});

async function criarRegiaoComRecurso(profissao) {
  const chave = sufixo();
  const item = await Item.create({
    nome: `Material de Teste ${chave}`,
    descricao: "Material de teste de expedição.",
    tipo_item: "Material",
    raridade: "Comum",
  });
  itensCriados.push(item.id);

  const recurso = await ExpeditionResource.create({ nome: `Recurso ${chave}`, profissao, ativo: true });
  recursosCriados.push(recurso.id);
  await ExpeditionResourceItem.create({ id_recurso: recurso.id, qualidade: "Comum", id_item: item.id });
  await ExpeditionResourceItem.create({ id_recurso: recurso.id, qualidade: "Incomum", id_item: item.id });

  const regiao = await ExpeditionRegion.create({
    nome: `Região de Teste ${chave}`,
    profissao,
    nivel_minimo: 1,
    ativo: true,
  });
  regioesCriadas.push(regiao.id);

  await ExpeditionRegionResource.create({ id_regiao: regiao.id, id_recurso: recurso.id, peso: 1 });
  return regiao;
}

async function criarMonstroCatalogo({ nome, nivel, disponivel_emboscada }) {
  const monstro = await AdventureMonster.create({
    nome,
    nivel,
    vida_maxima: 1000,
    dano_min: 1,
    dano_max: 1,
    agilidade: 1,
    velocidade: 1,
    xp_recompensa: 1,
    ouro_recompensa: 1,
    ativo: true,
    disponivel_emboscada,
  });
  monstrosCriados.push(monstro.id);
  return monstro;
}

// O catálogo de AdventureMonster NUNCA está vazio de verdade (seed de
// conteúdo real, ver adventureExpansionData.js) — testar a ESCOLHA entre
// "elegível" vs "bloqueado" com o resto do catálogo real ligado é uma
// corrida contra dezenas de outros monstros do mesmo nível. Isola a
// zona de teste desligando temporariamente disponivel_emboscada de todo
// mundo que não foi criado por este teste, e restaura exatamente esse
// conjunto no fim — nenhum outro fluxo do sistema lê essa coluna fora
// da emboscada, então a flag voltar como estava não afeta nada mais.
async function comCatalogoDeEmboscadaIsolado(fn) {
  const idsOriginalmenteDisponiveis = (
    await AdventureMonster.findAll({ where: { disponivel_emboscada: true }, attributes: ["id"] })
  ).map((m) => m.id);
  await AdventureMonster.update({ disponivel_emboscada: false }, { where: { disponivel_emboscada: true } });
  try {
    await fn();
  } finally {
    if (idsOriginalmenteDisponiveis.length > 0) {
      await AdventureMonster.update(
        { disponivel_emboscada: true },
        { where: { id: idsOriginalmenteDisponiveis } },
      );
    }
  }
}

testeComBanco(
  "coletar() em emboscada forçada: só sorteia monstro com disponivel_emboscada=true, nunca o desmarcado pelo admin",
  () =>
    comCatalogoDeEmboscadaIsolado(async () => {
      const { usuario, personagem } = await criarPersonagem({ nivel: 5 });
      usuariosCriados.push(usuario.id);
      personagensCriados.push(personagem.id);

      const regiao = await criarRegiaoComRecurso("Mineracao");
      await expeditionService.listarProfissoes(personagem.id);

      const elegivel = await criarMonstroCatalogo({
        nome: `Emboscada Elegível ${sufixo()}`,
        nivel: 5,
        disponivel_emboscada: true,
      });
      await criarMonstroCatalogo({
        nome: `Emboscada Bloqueada ${sufixo()}`,
        nivel: 5,
        disponivel_emboscada: false,
      });

      // Força 100% de chance de interrupção — sem isso o teste dependeria
      // do sorteio de 6% de sortearInterrupcaoDeMonstro().
      expeditionConfig.CHANCE_MONSTRO_PPM = 1_000_000;

      await expeditionService.coletar(personagem.id, regiao.id);

      const personagemAtualizado = await Character.findByPk(personagem.id);
      assert.ok(personagemAtualizado.encontro_pve, "coletar() deveria ter armado um encontro de emboscada");
      assert.equal(personagemAtualizado.encontro_pve.nome, elegivel.nome);
      assert.equal(personagemAtualizado.encontro_pve.origemExpedicao, true);
    }),
);

testeComBanco(
  "coletar() em emboscada forçada: catálogo sem nenhum monstro elegível cai no gerador antigo (nunca trava a coleta)",
  () =>
    comCatalogoDeEmboscadaIsolado(async () => {
      const { usuario, personagem } = await criarPersonagem({ nivel: 5 });
      usuariosCriados.push(usuario.id);
      personagensCriados.push(personagem.id);

      const regiao = await criarRegiaoComRecurso("Silvicultura");
      await expeditionService.listarProfissoes(personagem.id);

      await criarMonstroCatalogo({
        nome: `Emboscada Bloqueada Only ${sufixo()}`,
        nivel: 5,
        disponivel_emboscada: false,
      });

      expeditionConfig.CHANCE_MONSTRO_PPM = 1_000_000;

      await expeditionService.coletar(personagem.id, regiao.id);

      const personagemAtualizado = await Character.findByPk(personagem.id);
      assert.ok(personagemAtualizado.encontro_pve, "coletar() deveria ter armado um encontro de emboscada (fallback)");
      // Gerador antigo (gerarInimigo) devolve dano_base, nunca dano_min/dano_max
      // — assinatura usada aqui só pra confirmar que o fallback (e não o
      // catálogo) foi quem montou esse inimigo.
      assert.equal(personagemAtualizado.encontro_pve.dano_min, undefined);
      assert.ok(typeof personagemAtualizado.encontro_pve.dano_base === "number");
    }),
);
