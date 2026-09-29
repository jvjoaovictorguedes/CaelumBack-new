// Expedição — cooldown GLOBAL entre as 3 profissões. Bug real reportado
// repetidas vezes pelos jogadores: "Essa profissão ainda está em
// cooldown" aparecendo mesmo pouco tempo depois de coletar, e o tempo
// de espera parecendo muito maior que o configurado no admin (3s virava
// ~15s na prática). A causa raiz era 100% de frontend (ExpeditionClient
// só atualizava o estado local da profissão que acabou de coletar,
// então trocar de aba pra outra profissão mostrava o botão liberado
// mesmo com o cooldown global ainda ativo no servidor — o clique batia
// no 429 sem nenhum aviso visual antes). Este teste trava o contrato de
// backend que o fix de frontend passou a depender: coletar() grava o
// MESMO proxima_coleta_em nas 3 linhas de character_professions
// (mesmo na que não foi coletada), e o erro 429 sempre devolve
// disponivelEmMs coerente com o cooldown configurado no admin.
const test = require("node:test");
const assert = require("node:assert/strict");

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

const expeditionService = require("../src/services/expeditionService");
const expeditionSettingsService = require("../src/services/expeditionSettingsService");
const GameSetting = require("../src/models/GameSetting");

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

test.after(async () => {
  if (!temBanco) return;
  // Devolve o cooldown pro default (3000ms) — nunca deixar um teste
  // vazar um cooldown de teste (5000ms) pros outros arquivos que rodam
  // em paralelo (node --test).
  await GameSetting.destroy({ where: { chave: "expedition.cooldown" } });
  await require("../src/services/gameSettingCache").recarregar();

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

async function criarUsuarioAdmin() {
  const chave = sufixo();
  const admin = await User.create({
    username: `admin_expedicao_${chave}`,
    email: `admin_expedicao_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin: true,
  });
  usuariosCriados.push(admin.id);
  return admin;
}

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

  // Cobre os dois únicos resultados possíveis no nível 1 dessa profissão
  // (CHANCE_POR_NIVEL_PPM[1]: só Comum e Incomum têm chance > 0) — sem
  // isso, sortearQualidade() podia devolver uma qualidade sem Item
  // cadastrado e coletar() lançaria 500 em vez do fluxo normal.
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

testeComBanco(
  "coletar(): grava o MESMO cooldown nas 3 profissões, mesmo na que não coletou agora",
  async () => {
    const { usuario, personagem } = await criarPersonagem({ nivel: 5 });
    usuariosCriados.push(usuario.id);
    personagensCriados.push(personagem.id);
    const admin = await criarUsuarioAdmin();

    await expeditionSettingsService.updateBalanceamento(
      "expedition.cooldown",
      { TEMPO_COLETA_MS: 5000 },
      { idAdmin: admin.id },
    );

    const regiaoMineracao = await criarRegiaoComRecurso("Mineracao");
    await criarRegiaoComRecurso("Silvicultura");

    // coletar() exige que as 3 linhas de character_professions já
    // existam (diferente de listarProfissoes, que faz lazy-create) —
    // listarProfissoes cria as 3 na primeira consulta, mesmo padrão que
    // o frontend segue de verdade (ele sempre chama GET
    // /expeditions/professions antes de qualquer coleta).
    await expeditionService.listarProfissoes(personagem.id);

    const antes = Date.now();
    await expeditionService.coletar(personagem.id, regiaoMineracao.id);

    const profissoes = await CharacterProfession.findAll({ where: { id_personagem: personagem.id } });
    assert.equal(profissoes.length, 3, "as 3 profissões precisam existir (lazy-create)");
    for (const profissao of profissoes) {
      assert.ok(profissao.proxima_coleta_em, `${profissao.tipo} devia ter proxima_coleta_em preenchido`);
      const restante = new Date(profissao.proxima_coleta_em).getTime() - antes;
      // Tolerância generosa (±2s) só pra absorver o tempo de execução do
      // teste em si — o importante é que NENHUMA profissão (nem
      // Silvicultura, que não foi tocada) ficou sem o cooldown global.
      assert.ok(
        restante > 2000 && restante <= 7000,
        `${profissao.tipo}: cooldown fora da faixa esperada (${restante}ms, configurado 5000ms)`,
      );
    }
  },
);

testeComBanco(
  "coletar(): tentar coletar em OUTRA profissão durante o cooldown global rejeita com 429 e disponivelEmMs coerente",
  async () => {
    const { usuario, personagem } = await criarPersonagem({ nivel: 5 });
    usuariosCriados.push(usuario.id);
    personagensCriados.push(personagem.id);
    const admin = await criarUsuarioAdmin();

    await expeditionSettingsService.updateBalanceamento(
      "expedition.cooldown",
      { TEMPO_COLETA_MS: 5000 },
      { idAdmin: admin.id },
    );

    const regiaoMineracao = await criarRegiaoComRecurso("Mineracao");
    const regiaoSilvicultura = await criarRegiaoComRecurso("Silvicultura");

    await expeditionService.listarProfissoes(personagem.id);
    await expeditionService.coletar(personagem.id, regiaoMineracao.id);

    // Troca de profissão (o cenário exato relatado pelos jogadores:
    // coletar em Mineração e, na sequência, tentar em Silvicultura).
    await assert.rejects(
      () => expeditionService.coletar(personagem.id, regiaoSilvicultura.id),
      (erro) => {
        assert.equal(erro.statusCode, 429);
        assert.equal(erro.message, "Essa profissão ainda está em cooldown.");
        assert.ok(typeof erro.disponivelEmMs === "number" && erro.disponivelEmMs > 0 && erro.disponivelEmMs <= 5000);
        return true;
      },
    );
  },
);
