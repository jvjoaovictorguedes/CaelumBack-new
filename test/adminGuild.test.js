// Painel Administrativo — Guilda. Cobre o balanceamento (guildConfig.js
// via GameSetting, mesmo padrão de adminExpeditionBalance.test.js) e o
// CRUD dos 2 catálogos geridos aqui: Níveis (GuildLevelConfig) e Boss
// por Rank (GuildBossConfig). Missões de Guilda (GuildMission) já têm
// CRUD/testes próprios em adminMissionService.js — não duplicados aqui.
const test = require("node:test");
const assert = require("node:assert/strict");

const { sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const GameSetting = require("../src/models/GameSetting");
const GuildLevelConfig = require("../src/models/GuildLevelConfig");
const GuildBossConfig = require("../src/models/GuildBossConfig");
const GuildBossAbility = require("../src/models/GuildBossAbility");
const Power = require("../src/models/Power");

const guildSettingsService = require("../src/services/guildSettingsService");
const adminGuildService = require("../src/services/adminGuildService");
const guildConfig = require("../src/config/guildConfig");

let temBanco = false;
test.before(async () => {
  try {
    await sequelize.authenticate();
    temBanco = true;
  } catch {
    temBanco = false;
  }
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

async function criarUsuarioAdmin() {
  const chave = sufixo();
  return User.create({
    username: `admin_guild_${chave}`,
    email: `admin_guild_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin: true,
  });
}

const nivelDeTesteCriado = [];
const bossesCriados = [];
const powersCriados = [];

async function criarPowerDeTeste(overrides = {}) {
  const power = await Power.create({
    nome: `Power Teste Boss Guilda ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    custo_mana: 0,
    dano_base: 50,
    escala_atributo: "Forca",
    valor_escala: 1,
    tipo_dano: "Fisico",
    cooldown: 2,
    ...overrides,
  });
  powersCriados.push(power.id);
  return power;
}

test.after(async () => {
  if (!temBanco) return;
  // Devolve o balanceamento pro default — nunca deixar um teste vazar
  // TEMPO/fração/tamanho de teste pros outros arquivos que rodam junto
  // (node --test).
  await GameSetting.destroy({ where: { chave: guildSettingsService.GRUPOS } });
  if (nivelDeTesteCriado.length > 0) await GuildLevelConfig.destroy({ where: { nivel: nivelDeTesteCriado } });
  if (bossesCriados.length > 0) {
    await GuildBossAbility.destroy({ where: { id_guild_boss_config: bossesCriados } });
    await GuildBossConfig.destroy({ where: { id: bossesCriados } });
  }
  if (powersCriados.length > 0) await Power.destroy({ where: { id: powersCriados } });
  await sequelize.close();
});

// --------------------------------------------------------- BALANCEAMENTO
testeComBanco("balanceamento: getBalanceamentoCompleto devolve os 5 grupos com atual+padrao", async () => {
  const tudo = await guildSettingsService.getBalanceamentoCompleto();
  for (const grupo of guildSettingsService.GRUPOS) {
    assert.ok(tudo[grupo], `grupo ${grupo} ausente`);
    assert.ok(tudo[grupo].atual);
    assert.ok(tudo[grupo].padrao);
  }
});

testeComBanco("balanceamento: guild.carencia persiste, aplica AO VIVO e reflete no snapshot atual", async () => {
  const admin = await criarUsuarioAdmin();
  const resultado = await guildSettingsService.updateBalanceamento(
    "guild.carencia",
    { CARENCIA_NOVO_MEMBRO_MS: 3600000 },
    { idAdmin: admin.id },
  );
  assert.equal(resultado.atual.CARENCIA_NOVO_MEMBRO_MS, 3600000);
  // Aplicado em-lugar no módulo de config de verdade (não só persistido
  // no banco) — é isso que faz guildContributionService/guildBuffService
  // (que já desestruturaram membroEmCarencia no load) enxergarem o
  // valor novo sem reiniciar o processo.
  assert.equal(guildConfig.CARENCIA_NOVO_MEMBRO_MS, 3600000);

  const linha = await GameSetting.findByPk("guild.carencia");
  assert.ok(linha, "GameSetting precisa ter sido persistido");
  assert.equal(linha.valor.CARENCIA_NOVO_MEMBRO_MS, 3600000);
});

testeComBanco("balanceamento: guild.boss aplica ao vivo e é lido via guildConfig.<chave> (não desestruturado)", async () => {
  const admin = await criarUsuarioAdmin();
  await guildSettingsService.updateBalanceamento(
    "guild.boss",
    { BOSS_AO_VIVO_TAMANHO_MAXIMO: 12, BOSS_AO_VIVO_PRAZO_TURNO_MS: 15000 },
    { idAdmin: admin.id },
  );
  assert.equal(guildConfig.BOSS_AO_VIVO_TAMANHO_MAXIMO, 12);
  assert.equal(guildConfig.BOSS_AO_VIVO_PRAZO_TURNO_MS, 15000);
});

testeComBanco("balanceamento: guild.boss rejeita frações que não somam 1", async () => {
  const admin = await criarUsuarioAdmin();
  await assert.rejects(
    () =>
      guildSettingsService.updateBalanceamento(
        "guild.boss",
        { BOSS_FRACAO_IGUALITARIA: 0.5, BOSS_FRACAO_PROPORCIONAL: 0.6 },
        { idAdmin: admin.id },
      ),
    (erro) => {
      assert.equal(erro.statusCode, 400);
      return true;
    },
  );
});

testeComBanco("balanceamento: guild.buffs mescla só o nível enviado, preserva os outros", async () => {
  const admin = await criarUsuarioAdmin();
  const custoOriginalNivel2 = guildConfig.BUFF_NIVEIS.XP[2].custo;
  await guildSettingsService.updateBalanceamento(
    "guild.buffs",
    { XP: { 1: { custo: 999999 } } },
    { idAdmin: admin.id },
  );
  assert.equal(guildConfig.BUFF_NIVEIS.XP[1].custo, 999999);
  assert.equal(guildConfig.BUFF_NIVEIS.XP[1].bonusPercentual, 2, "bonusPercentual do nível 1 não deveria mudar");
  assert.equal(guildConfig.BUFF_NIVEIS.XP[2].custo, custoOriginalNivel2, "nível 2 não deveria ser afetado");
});

// -------------------------------------------------------------- NÍVEIS
testeComBanco("níveis: upsertNivel cria e depois atualiza o mesmo nível (upsert por PK)", async () => {
  const admin = await criarUsuarioAdmin();
  const nivelTeste = 9000 + Math.floor(Math.random() * 1000);
  nivelDeTesteCriado.push(nivelTeste);

  const criado = await adminGuildService.upsertNivel(
    { nivel: nivelTeste, xp_para_proximo_nivel: 1000, limite_membros: 20 },
    { idAdmin: admin.id },
  );
  assert.equal(criado.limite_membros, 20);

  const atualizado = await adminGuildService.upsertNivel(
    { nivel: nivelTeste, xp_para_proximo_nivel: 2000, limite_membros: 25 },
    { idAdmin: admin.id },
  );
  assert.equal(atualizado.limite_membros, 25);
  assert.equal(atualizado.xp_para_proximo_nivel, 2000);

  const total = await GuildLevelConfig.count({ where: { nivel: nivelTeste } });
  assert.equal(total, 1, "upsert não deveria criar uma segunda linha pro mesmo nível");
});

// --------------------------------------------------------- BOSS DA GUILDA
testeComBanco("boss: criarBoss valida rank, impede duplicata e atualizarBoss edita sem duplicar", async () => {
  const admin = await criarUsuarioAdmin();

  await assert.rejects(
    () =>
      adminGuildService.criarBoss(
        { rank: "X", nome_chefe: "Teste", descricao: "teste", vida_total: 1000, janela_horas: 24 },
        { idAdmin: admin.id },
      ),
    (erro) => {
      assert.equal(erro.statusCode, 400);
      return true;
    },
  );

  // Usa um rank fora dos já seedados em produção pra não colidir — "S"
  // é o topo da escada e legítimo de sobrar sem seed em dev/teste.
  const boss = await adminGuildService.criarBoss(
    {
      rank: "S",
      nome_chefe: `Chefe de Teste ${sufixo()}`,
      descricao: "Boss criado em teste automatizado.",
      vida_total: 500000,
      janela_horas: 48,
      custo_liberacao: 1000,
      xp_guilda_concedido: 500,
      pool_dinheiro_total: 10000,
      pool_xp_total: 2000,
      dano_base_ataque: 100,
      premio_maior_dano: 500,
    },
    { idAdmin: admin.id },
  );
  bossesCriados.push(boss.id);
  assert.equal(boss.rank, "S");

  await assert.rejects(
    () =>
      adminGuildService.criarBoss(
        { rank: "S", nome_chefe: "Duplicado", descricao: "x", vida_total: 100, janela_horas: 1 },
        { idAdmin: admin.id },
      ),
    (erro) => {
      assert.equal(erro.statusCode, 400);
      assert.match(erro.message, /já existe/i);
      return true;
    },
  );

  const editado = await adminGuildService.atualizarBoss(boss.id, { vida_total: 750000 }, { idAdmin: admin.id });
  assert.equal(editado.vida_total, 750000);
  assert.equal(editado.rank, "S", "editar outro campo não deveria mexer no rank");
});

// ------------------------------------------------ HABILIDADES DO BOSS
// Pedido do dono do projeto: Boss da Guilda ganha habilidades "igual
// no Boss Mundial" — mesmo padrão de WorldBossAbility (vínculo Boss ->
// Power reutilizado). Testes cobrem só a camada admin (CRUD +
// validação); a seleção/telegraph em combate é testada em
// bossAbilityAiService.test.js (puro) e guildBossLiveBattle.test.js
// (socket).
testeComBanco("habilidades do boss: criarHabilidadeBoss valida tipo_alvo/id_power e listarHabilidadesBoss filtra por boss", async () => {
  const admin = await criarUsuarioAdmin();
  const power = await criarPowerDeTeste();
  const boss = await adminGuildService.criarBoss(
    { rank: "A", nome_chefe: `Chefe Habilidade ${sufixo()}`, descricao: "teste", vida_total: 100000, janela_horas: 24 },
    { idAdmin: admin.id },
  );
  bossesCriados.push(boss.id);

  await assert.rejects(
    () => adminGuildService.criarHabilidadeBoss(boss.id, { id_power: power.id, tipo_alvo: "TIPO_INVALIDO" }, { idAdmin: admin.id }),
    (erro) => {
      assert.equal(erro.statusCode, 400);
      assert.match(erro.message, /tipo_alvo/);
      return true;
    },
  );

  await assert.rejects(
    () => adminGuildService.criarHabilidadeBoss(boss.id, { id_power: 999999999, tipo_alvo: "ALEATORIO" }, { idAdmin: admin.id }),
    (erro) => {
      assert.equal(erro.statusCode, 404);
      return true;
    },
  );

  const habilidade = await adminGuildService.criarHabilidadeBoss(
    boss.id,
    { id_power: power.id, tipo_alvo: "MENOR_VIDA", peso_uso: 3, prioridade: 1, tempo_conjuracao_ms: 1500, cooldown_rodadas_override: 4 },
    { idAdmin: admin.id },
  );
  assert.equal(habilidade.id_guild_boss_config, boss.id);
  assert.equal(habilidade.tipo_alvo, "MENOR_VIDA");
  assert.equal(habilidade.ativo, true, "ativo default precisa ser true");

  const outroBoss = await adminGuildService.criarBoss(
    { rank: "C", nome_chefe: `Outro Chefe ${sufixo()}`, descricao: "teste", vida_total: 100000, janela_horas: 24 },
    { idAdmin: admin.id },
  );
  bossesCriados.push(outroBoss.id);

  const listaDoBoss = await adminGuildService.listarHabilidadesBoss(boss.id);
  assert.equal(listaDoBoss.length, 1);
  assert.equal(listaDoBoss[0].id, habilidade.id);

  const listaDoOutro = await adminGuildService.listarHabilidadesBoss(outroBoss.id);
  assert.equal(listaDoOutro.length, 0, "habilidade de um boss não pode aparecer na listagem de outro");
});

testeComBanco("habilidades do boss: atualizarHabilidadeBoss edita parcialmente e excluirHabilidadeBoss remove de verdade", async () => {
  const admin = await criarUsuarioAdmin();
  const power = await criarPowerDeTeste();
  const boss = await adminGuildService.criarBoss(
    { rank: "B", nome_chefe: `Chefe Edicao ${sufixo()}`, descricao: "teste", vida_total: 100000, janela_horas: 24 },
    { idAdmin: admin.id },
  );
  bossesCriados.push(boss.id);

  const habilidade = await adminGuildService.criarHabilidadeBoss(
    boss.id,
    { id_power: power.id, tipo_alvo: "ALEATORIO", peso_uso: 1, prioridade: 0 },
    { idAdmin: admin.id },
  );

  const editada = await adminGuildService.atualizarHabilidadeBoss(habilidade.id, { prioridade: 9, tipo_alvo: "TODOS" }, { idAdmin: admin.id });
  assert.equal(editada.prioridade, 9);
  assert.equal(editada.tipo_alvo, "TODOS");
  assert.equal(editada.id_power, power.id, "campo não enviado no patch precisa permanecer intacto");

  await adminGuildService.excluirHabilidadeBoss(habilidade.id, { idAdmin: admin.id });
  const listaDepois = await adminGuildService.listarHabilidadesBoss(boss.id);
  assert.equal(listaDepois.length, 0, "excluir precisa remover de verdade (não é soft-delete aqui — habilidade de boss não aparece em nenhuma outra tela)");

  await assert.rejects(
    () => adminGuildService.atualizarHabilidadeBoss(habilidade.id, { prioridade: 1 }, { idAdmin: admin.id }),
    (erro) => {
      assert.equal(erro.statusCode, 404);
      return true;
    },
  );
});
