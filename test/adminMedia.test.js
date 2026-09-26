// Biblioteca de Mídia — bug relatado: imagem_url apontando pra um
// grupo sem versão ativa (nunca enviado, ou envio antigo já desativado)
// devolvia um JSON de erro com Content-Type application/json; um <img
// src> cross-origin pedindo isso é exatamente o cenário que o Chrome
// bloqueia como ORB (net::ERR_BLOCKED_BY_ORB), virando ícone quebrado
// em vez de qualquer coisa reconhecível. Cobre o placeholder (imagem
// de verdade, nunca JSON) e o diagnóstico que acha toda referência
// quebrada de uma vez (Item/Power/EquipmentSet/AdventureMonster).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const MediaAsset = require("../src/models/MediaAsset");
const mediaAssetService = require("../src/services/mediaAssetService");
const adminMediaController = require("../src/controllers/adminMediaController");

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
const gruposCriados = [];

test.after(async () => {
  if (!temBanco) return;
  if (itensCriados.length > 0) await Item.destroy({ where: { id: itensCriados } });
  if (gruposCriados.length > 0) await MediaAsset.destroy({ where: { grupo: gruposCriados } });
  await sequelize.close();
});

function reqRes({ params = {}, query = {} } = {}) {
  const req = { params, query };
  const estado = { statusCode: 200, headers: {}, corpo: undefined };
  const res = {
    status(codigo) {
      estado.statusCode = codigo;
      return res;
    },
    set(chave, valor) {
      estado.headers[chave] = valor;
      return res;
    },
    json(corpo) {
      estado.corpo = corpo;
      return res;
    },
    send(corpo) {
      estado.corpo = corpo;
      return res;
    },
  };
  return { req, res, estado: () => estado };
}

testeComBanco("servir: grupo sem versão ativa devolve imagem de verdade (placeholder), nunca JSON — nunca aciona ORB no navegador", async () => {
  const { req, res, estado } = reqRes({ params: { grupo: `grupo-nunca-existiu-${Date.now()}` } });
  await adminMediaController.servir(req, res);
  const r = estado();
  assert.equal(r.statusCode, 404);
  assert.equal(r.headers["Content-Type"], "image/png");
  assert.ok(Buffer.isBuffer(r.corpo), "corpo precisa ser um Buffer de bytes de imagem, nunca um objeto JSON");
  // Magic bytes de PNG.
  assert.equal(r.corpo.slice(0, 8).toString("hex"), "89504e470d0a1a0a");
});

testeComBanco("listarReferenciasQuebradas: acha Item cujo imagem_url aponta pra grupo sem versão ativa", async () => {
  const grupo = `grupo-quebrado-${Date.now()}`;
  const item = await Item.create({
    nome: `Item Diagnóstico ${Date.now()}`,
    descricao: "x",
    tipo_item: "Material",
    raridade: "Comum",
    valor_compra: 0,
    valor_venda: 0,
    peso: 0,
    disponivel_loja: false,
    imagem_url: `https://exemplo-de-producao.up.railway.app/api/media/${grupo}?v=1`,
  });
  itensCriados.push(item.id);

  const quebrados = await mediaAssetService.listarReferenciasQuebradas();
  const encontrado = quebrados.find((q) => q.entidade === "Item" && q.id === item.id);
  assert.ok(encontrado, "item com grupo inexistente precisa aparecer no diagnóstico");
  assert.equal(encontrado.grupo, grupo);
});

testeComBanco("listarReferenciasQuebradas: NÃO acha Item cujo grupo tem versão ativa de verdade", async () => {
  const grupo = `grupo-valido-${Date.now()}`;
  await MediaAsset.create({
    grupo,
    versao: 1,
    categoria: "Item",
    tipo: "imagem",
    mime: "image/png",
    tamanho_bytes: 10,
    dados: Buffer.from("fake-png-bytes"),
    ativo: true,
  });
  gruposCriados.push(grupo);

  const item = await Item.create({
    nome: `Item Diagnóstico OK ${Date.now()}`,
    descricao: "x",
    tipo_item: "Material",
    raridade: "Comum",
    valor_compra: 0,
    valor_venda: 0,
    peso: 0,
    disponivel_loja: false,
    imagem_url: `/api/media/${grupo}`,
  });
  itensCriados.push(item.id);

  const quebrados = await mediaAssetService.listarReferenciasQuebradas();
  assert.ok(!quebrados.some((q) => q.entidade === "Item" && q.id === item.id), "item com grupo ativo nunca pode aparecer como quebrado");
});

testeComBanco("listarReferenciasQuebradas: ignora imagem_url que não é da Biblioteca de Mídia (ex.: arte estática em /images/...)", async () => {
  const item = await Item.create({
    nome: `Item Arte Estática ${Date.now()}`,
    descricao: "x",
    tipo_item: "Material",
    raridade: "Comum",
    valor_compra: 0,
    valor_venda: 0,
    peso: 0,
    disponivel_loja: false,
    imagem_url: "/images/material-generico.webp",
  });
  itensCriados.push(item.id);

  const quebrados = await mediaAssetService.listarReferenciasQuebradas();
  assert.ok(!quebrados.some((q) => q.entidade === "Item" && q.id === item.id));
});
