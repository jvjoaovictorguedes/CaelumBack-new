// Sistema de Taverna §15/§19.4 — Painel Administrativo: sem tavern.manage
// o backend recusa com 403 (mesmo padrão de requireAdminPermission já
// coberto por adminPanelFundacao.test.js, aqui aplicado à permissão
// tavern.manage/role "Conteudo"), CRUD registra auditoria antes/depois,
// duplicar cria entidade INATIVA, desativar preserva histórico e
// vínculos, buff_key fora da whitelist é rejeitada, e settings fora de
// faixa segura são rejeitados.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const AdminRole = require("../src/models/AdminRole");
const AdminActionLog = require("../src/models/AdminActionLog");
const TavernMenuItem = require("../src/models/TavernMenuItem");
const TavernGame = require("../src/models/TavernGame");
const CharacterTavernBuff = require("../src/models/CharacterTavernBuff");
const GameSetting = require("../src/models/GameSetting");

const adminRoleService = require("../src/services/adminRoleService");
const requireAdminPermission = require("../src/middlewares/requireAdminPermission");
const adminTavernService = require("../src/services/adminTavernService");
const tavernBuffService = require("../src/services/tavernBuffService");

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

async function criarUsuarioAdmin() {
  const chave = sufixo();
  return User.create({
    username: `admin_taverna_${chave}`,
    email: `admin_taverna_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin: true,
  });
}

function reqRes({ userId, body, query } = {}) {
  let statusCode = null;
  let corpo = null;
  const req = { user: userId ? { id: userId } : undefined, body: body ?? {}, query: query ?? {}, ip: "127.0.0.1", get: () => "teste-agent" };
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

const itensMenuCriados = [];
const jogosCriados = [];

test.after(async () => {
  if (!temBanco) return;
  await CharacterTavernBuff.destroy({ where: { source_menu_item_id: itensMenuCriados.length ? itensMenuCriados : [-1] } });
  await TavernMenuItem.destroy({ where: { id: itensMenuCriados.length ? itensMenuCriados : [-1] } });
  await TavernGame.destroy({ where: { id: jogosCriados.length ? jogosCriados : [-1] } });
  await sequelize.close();
});

testeComBanco("requireAdminPermission(tavern.manage) bloqueia sem a permissão e libera com role Conteudo", async () => {
  const admin = await criarUsuarioAdmin();
  const middleware = requireAdminPermission("tavern.manage");

  const semPermissao = reqRes({ userId: admin.id });
  let chamouNext = false;
  await middleware(semPermissao.req, semPermissao.res, () => {
    chamouNext = true;
  });
  assert.equal(chamouNext, false);
  assert.equal(semPermissao.resultado().statusCode, 403);

  const role = await AdminRole.findOne({ where: { nome: "Conteudo" } });
  await adminRoleService.assignRole(admin.id, role.id, { idAdmin: admin.id });

  const comPermissao = reqRes({ userId: admin.id });
  chamouNext = false;
  await middleware(comPermissao.req, comPermissao.res, () => {
    chamouNext = true;
  });
  assert.equal(chamouNext, true, "Conteudo tem tavern.manage — devia liberar");
});

testeComBanco("createAdminTavernMenuItem rejeita buff_key fora da whitelist", async () => {
  const admin = await criarUsuarioAdmin();
  await assert.rejects(
    () =>
      adminTavernService.createAdminTavernMenuItem(
        {
          nome: `Prato ilegal ${sufixo()}`,
          descricao: "teste",
          categoria: "Refeicao",
          preco_gold: 30,
          buff_key: "GODMODE_PCT",
          magnitude: 5,
          duracao_segundos: 3600,
        },
        { idAdmin: admin.id },
      ),
    /buff_key precisa ser uma de/,
  );
});

testeComBanco("createAdminTavernMenuItem cria item e registra auditoria com dadosDepois", async () => {
  const admin = await criarUsuarioAdmin();
  const item = await adminTavernService.createAdminTavernMenuItem(
    {
      nome: `Ensopado de teste ${sufixo()}`,
      descricao: "teste",
      categoria: "Refeicao",
      preco_gold: 40,
      buff_key: "MAX_HP_PCT",
      magnitude: 5,
      duracao_segundos: 3600,
    },
    { idAdmin: admin.id },
  );
  itensMenuCriados.push(item.id);

  const log = await AdminActionLog.findOne({ where: { entidade: "TavernMenuItem", id_entidade: item.id, acao: "criar" } });
  assert.ok(log, "deveria ter registrado auditoria de criação");
  assert.equal(log.dados_depois.buff_key, "MAX_HP_PCT");
});

testeComBanco("updateAdminTavernMenuItem registra auditoria com dadosAntes e dadosDepois", async () => {
  const admin = await criarUsuarioAdmin();
  const item = await adminTavernService.createAdminTavernMenuItem(
    {
      nome: `Chá de teste ${sufixo()}`,
      descricao: "teste",
      categoria: "Bebida",
      preco_gold: 35,
      buff_key: "MAX_MANA_PCT",
      magnitude: 5,
      duracao_segundos: 3600,
    },
    { idAdmin: admin.id },
  );
  itensMenuCriados.push(item.id);

  await adminTavernService.updateAdminTavernMenuItem(item.id, { preco_gold: 50 }, { idAdmin: admin.id });

  const log = await AdminActionLog.findOne({
    where: { entidade: "TavernMenuItem", id_entidade: item.id, acao: "editar" },
    order: [["id", "DESC"]],
  });
  assert.ok(log);
  assert.equal(log.dados_antes.preco_gold, 35);
  assert.equal(log.dados_depois.preco_gold, 50);
});

testeComBanco("duplicateAdminTavernMenuItem cria cópia INATIVA e nunca reaproveita a chave do jogador", async () => {
  const admin = await criarUsuarioAdmin();
  const original = await adminTavernService.createAdminTavernMenuItem(
    {
      nome: `Banquete de teste ${sufixo()}`,
      descricao: "teste",
      categoria: "Refeicao",
      preco_gold: 60,
      buff_key: "ADVENTURE_XP_PCT",
      magnitude: 5,
      duracao_segundos: 3600,
      ativo: true,
    },
    { idAdmin: admin.id },
  );
  itensMenuCriados.push(original.id);

  const copia = await adminTavernService.duplicateAdminTavernMenuItem(original.id, { idAdmin: admin.id });
  itensMenuCriados.push(copia.id);

  assert.equal(copia.ativo, false, "cópia deve nascer inativa");
  assert.notEqual(copia.id, original.id);
  assert.equal(copia.buff_key, "ADVENTURE_XP_PCT");
});

testeComBanco("setAtivoAdminTavernMenuItem(desativar) preserva histórico/vínculo (nunca deleta fisicamente)", async () => {
  const admin = await criarUsuarioAdmin();
  const { criarPersonagem } = require("./helpers/db");
  const { personagem } = await criarPersonagem();
  personagem.dinheiro = 100;
  await personagem.save();

  const item = await adminTavernService.createAdminTavernMenuItem(
    {
      nome: `Tônico de teste ${sufixo()}`,
      descricao: "teste",
      categoria: "Bebida",
      preco_gold: 20,
      buff_key: "FISHING_CONTROL_PCT",
      magnitude: 5,
      duracao_segundos: 3600,
    },
    { idAdmin: admin.id },
  );
  itensMenuCriados.push(item.id);

  await tavernBuffService.consumirOferta(personagem.id, item.id);

  await adminTavernService.setAtivoAdminTavernMenuItem(item.id, false, { idAdmin: admin.id });

  const buffLinha = await CharacterTavernBuff.findOne({ where: { source_menu_item_id: item.id } });
  assert.ok(buffLinha, "vínculo do buff comprado antes de desativar deve continuar existindo");

  const itemRecarregado = await TavernMenuItem.findByPk(item.id);
  assert.equal(itemRecarregado.ativo, false);
  assert.ok(itemRecarregado, "linha nunca é deletada fisicamente");
});

testeComBanco("createAdminTavernGame nunca aceita win_chance_ppm do payload — sempre trava em 500000", async () => {
  const admin = await criarUsuarioAdmin();
  const jogo = await adminTavernService.createAdminTavernGame(
    {
      key: `jogo_teste_${sufixo()}`,
      nome: "Jogo de Teste",
      descricao: "teste",
      presentation_key: "COIN",
      win_chance_ppm: 999999, // tentativa de adulteração — deve ser ignorada
      payout_multiplier: 1.9,
      min_bet: 10,
      max_bet: 1000,
    },
    { idAdmin: admin.id },
  );
  jogosCriados.push(jogo.id);

  assert.equal(jogo.win_chance_ppm, 500000, "V1 é sempre 50/50, mesmo com payload adulterado");
});

testeComBanco("createAdminTavernGame rejeita presentation_key fora da whitelist", async () => {
  const admin = await criarUsuarioAdmin();
  await assert.rejects(
    () =>
      adminTavernService.createAdminTavernGame(
        {
          key: `jogo_ilegal_${sufixo()}`,
          nome: "Jogo Ilegal",
          descricao: "teste",
          presentation_key: "ROULETTE_36",
          payout_multiplier: 1.9,
          min_bet: 10,
          max_bet: 1000,
        },
        { idAdmin: admin.id },
      ),
    /presentation_key precisa ser uma de/,
  );
});

testeComBanco("duplicateAdminTavernGame cria cópia INATIVA com win_chance_ppm travado", async () => {
  const admin = await criarUsuarioAdmin();
  const original = await adminTavernService.createAdminTavernGame(
    {
      key: `jogo_original_${sufixo()}`,
      nome: "Jogo Original",
      descricao: "teste",
      presentation_key: "DICE_PARITY",
      payout_multiplier: 1.85,
      min_bet: 5,
      max_bet: 500,
      ativo: true,
    },
    { idAdmin: admin.id },
  );
  jogosCriados.push(original.id);

  const copia = await adminTavernService.duplicateAdminTavernGame(original.id, { idAdmin: admin.id });
  jogosCriados.push(copia.id);

  assert.equal(copia.ativo, false);
  assert.equal(copia.win_chance_ppm, 500000);
  assert.notEqual(copia.key, original.key);
});

testeComBanco("updateAdminTavernSettings rejeita valores fora de faixa segura", async () => {
  const admin = await criarUsuarioAdmin();
  await assert.rejects(
    () => adminTavernService.updateAdminTavernSettings({ "tavern.rest.minimum_gold": 999_999 }, { idAdmin: admin.id }),
    /fora de uma faixa segura/,
  );
  await assert.rejects(
    () => adminTavernService.updateAdminTavernSettings({ "tavern.games.max_bet_global": 50_000_000 }, { idAdmin: admin.id }),
    /fora de uma faixa segura/,
  );
});

testeComBanco("updateAdminTavernSettings rejeita chave desconhecida (admin não inventa parâmetro novo)", async () => {
  const admin = await criarUsuarioAdmin();
  await assert.rejects(
    () => adminTavernService.updateAdminTavernSettings({ "tavern.rest.formula_secreta": 1 }, { idAdmin: admin.id }),
    /Chave desconhecida/,
  );
});

testeComBanco("updateAdminTavernSettings salva valor válido, registra auditoria e recarrega o cache", async () => {
  const admin = await criarUsuarioAdmin();
  const antes = await GameSetting.findByPk("tavern.rest.base_gold");
  const resultado = await adminTavernService.updateAdminTavernSettings({ "tavern.rest.base_gold": 25 }, { idAdmin: admin.id });
  assert.equal(resultado["tavern.rest.base_gold"], 25);

  const log = await AdminActionLog.findOne({
    where: { entidade: "GameSetting", acao: antes ? "editar" : "criar" },
    order: [["id", "DESC"]],
  });
  assert.ok(log);
  assert.equal(log.dados_depois.valor, 25);

  // devolve ao default pra não vazar estado pros outros testes que rodam
  // com o cache de GameSetting compartilhado.
  await adminTavernService.updateAdminTavernSettings({ "tavern.rest.base_gold": 20 }, { idAdmin: admin.id });
});
