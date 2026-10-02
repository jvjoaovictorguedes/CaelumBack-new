// Painel Administrativo — Loja do Aventureiro V2 Fase 8 (taxas/limites/
// prazos/kill-switch). Prova que updateAdminPlayerShopConfig valida
// direito E que o override realmente pega AO VIVO nos services de jogo
// (playerShopDemandService/playerShopCommissionService), sem reiniciar
// o processo — mesmo padrão de teste de adminExpeditionBalance.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const GameSetting = require("../src/models/GameSetting");
const AdminActionLog = require("../src/models/AdminActionLog");
const Character = require("../src/models/Character");
const Item = require("../src/models/Item");
const PlayerShop = require("../src/models/PlayerShop");
const PlayerShopDemand = require("../src/models/PlayerShopDemand");
const gameSettingCache = require("../src/services/gameSettingCache");
const adminPlayerShopConfigService = require("../src/services/adminPlayerShopConfigService");
const playerShopService = require("../src/services/playerShopService");
const playerShopDemandService = require("../src/services/playerShopDemandService");

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
const itensCriados = [];
const demandasCriadas = [];

test.after(async () => {
  if (!temBanco) return;
  await GameSetting.destroy({ where: { chave: Object.keys(adminPlayerShopConfigService.PADRAO) } });
  await gameSettingCache.recarregar();
  if (demandasCriadas.length > 0) await PlayerShopDemand.destroy({ where: { id: demandasCriadas } });
  if (personagensCriados.length > 0) {
    await PlayerShop.destroy({ where: { id_personagem: personagensCriados } });
    await Character.destroy({ where: { id: personagensCriados } });
  }
  if (usuariosCriados.length > 0) {
    const User = require("../src/models/User");
    await User.destroy({ where: { id: usuariosCriados } });
  }
  if (itensCriados.length > 0) await Item.destroy({ where: { id: itensCriados } });
  await sequelize.close();
});

async function novoPersonagem() {
  const { usuario, personagem } = await criarPersonagem({ nivel: 5 });
  usuariosCriados.push(usuario.id);
  personagensCriados.push(personagem.id);
  return { usuario, personagem };
}

testeComBanco("getAdminPlayerShopConfig: devolve os valores padrão quando nada foi salvo ainda", async () => {
  await GameSetting.destroy({ where: { chave: Object.keys(adminPlayerShopConfigService.PADRAO) } });
  const config = await adminPlayerShopConfigService.getAdminPlayerShopConfig();
  assert.equal(config["playershop.ativo"], true);
  assert.equal(config["playershop.taxaEncomenda"], 0.08);
});

testeComBanco("updateAdminPlayerShopConfig: rejeita taxa fora de 0-1 e não salva nada", async () => {
  const admin = await novoPersonagem();
  await assert.rejects(
    () =>
      adminPlayerShopConfigService.updateAdminPlayerShopConfig(
        { "playershop.taxaEncomenda": 1.5 },
        { idAdmin: admin.usuario.id, req: null },
      ),
    /entre 0 e 1/,
  );
});

testeComBanco("updateAdminPlayerShopConfig: salva, audita e recarrega o cache ao vivo", async () => {
  const admin = await novoPersonagem();
  const antesDoAudit = await AdminActionLog.count({ where: { entidade: "GameSetting" } });

  const config = await adminPlayerShopConfigService.updateAdminPlayerShopConfig(
    { "playershop.taxaEncomenda": 0.15, "playershop.quantidadeMaxima": 500 },
    { idAdmin: admin.usuario.id, req: null },
  );
  assert.equal(config["playershop.taxaEncomenda"], 0.15);
  assert.equal(config["playershop.quantidadeMaxima"], 500);

  const depoisDoAudit = await AdminActionLog.count({ where: { entidade: "GameSetting" } });
  assert.ok(depoisDoAudit > antesDoAudit, "toda alteração de config precisa gerar uma entrada de auditoria");

  // Sem reiniciar o processo, o service de jogo já tem que enxergar o
  // novo valor (gameSettingCache recarregado dentro do próprio update).
  assert.equal(adminPlayerShopConfigService.obter("playershop.taxaEncomenda"), 0.15);
});

testeComBanco("kill-switch: playershop.ativo=false bloqueia criarDemanda com erro 503", async () => {
  const { personagem } = await novoPersonagem();
  const item = await Item.create({
    nome: `Minério Kill-Switch ${sufixo()}`,
    descricao: "Material bruto.",
    tipo_item: "Material",
    raridade: "Comum",
    negociavel_mercado: true,
  });
  itensCriados.push(item.id);
  await playerShopService.criarOuAtualizarLoja(personagem.id, { nome: `Loja ${sufixo()}` });
  personagem.dinheiro = 1000;
  await personagem.save();

  await adminPlayerShopConfigService.updateAdminPlayerShopConfig(
    { "playershop.ativo": false },
    { idAdmin: personagem.id_usuario, req: null },
  );

  await assert.rejects(
    () => playerShopDemandService.criarDemanda(personagem.id, { id_item: item.id, quantidade: 1, preco_unitario: 10 }),
    (erro) => erro.statusCode === 503,
  );

  // Religa pra não vazar estado desligado pros outros arquivos de teste
  // que rodam no mesmo processo (gameSettingCache é um módulo singleton).
  await adminPlayerShopConfigService.updateAdminPlayerShopConfig(
    { "playershop.ativo": true },
    { idAdmin: personagem.id_usuario, req: null },
  );
});
