// Fila: upload de emblema de guilda — imagem precisa vir ENQUADRADA
// (quadrada) do jogador, dentro de um range de tamanho, e é normalizada
// pro tamanho final fixo no servidor. Cobre o serviço de validação
// (puro, sem banco) e o fluxo ponta a ponta via controller (com banco).
const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
const Guild = require("../src/models/Guild");
const GuildMember = require("../src/models/GuildMember");
const { validarEProcessarEmblema, ImagemInvalidaError } = require("../src/services/guildEmblemService");
const { DIMENSAO_FINAL_PX, DIMENSAO_MINIMA_PX, TAMANHO_MAXIMO_BYTES } = require("../src/config/guildEmblemConfig");
const guildEmblemController = require("../src/controllers/guildEmblemController");

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

function quadradoPng(lado, cor = { r: 200, g: 100, b: 50 }) {
  return sharp({ create: { width: lado, height: lado, channels: 3, background: cor } }).png().toBuffer();
}

// ---------------------------------------------------------------------
// guildEmblemService — validação pura, sem banco
// ---------------------------------------------------------------------

test("aceita uma imagem quadrada válida e normaliza pro tamanho final configurado", async () => {
  const original = await quadradoPng(400);
  const { buffer, mime } = await validarEProcessarEmblema(original);
  assert.equal(mime, "image/png");
  const metadata = await sharp(buffer).metadata();
  assert.equal(metadata.width, DIMENSAO_FINAL_PX);
  assert.equal(metadata.height, DIMENSAO_FINAL_PX);
});

test("rejeita imagem retangular — precisa estar enquadrada (quadrada)", async () => {
  const retangular = await sharp({
    create: { width: 400, height: 200, channels: 3, background: { r: 10, g: 10, b: 10 } },
  })
    .png()
    .toBuffer();

  await assert.rejects(() => validarEProcessarEmblema(retangular), ImagemInvalidaError);
});

test("rejeita imagem menor que a dimensão mínima", async () => {
  const pequena = await quadradoPng(DIMENSAO_MINIMA_PX - 10);
  await assert.rejects(() => validarEProcessarEmblema(pequena), ImagemInvalidaError);
});

test("rejeita arquivo maior que o limite de bytes", async () => {
  const grandeDemais = Buffer.alloc(TAMANHO_MAXIMO_BYTES + 1024, 1);
  await assert.rejects(() => validarEProcessarEmblema(grandeDemais), ImagemInvalidaError);
});

test("rejeita arquivo corrompido/que não é imagem de verdade", async () => {
  await assert.rejects(
    () => validarEProcessarEmblema(Buffer.from("isso claramente não é uma imagem")),
    ImagemInvalidaError,
  );
});

test("rejeita corpo vazio", async () => {
  await assert.rejects(() => validarEProcessarEmblema(Buffer.alloc(0)), ImagemInvalidaError);
});

// ---------------------------------------------------------------------
// guildEmblemController — fluxo ponta a ponta com banco real
// ---------------------------------------------------------------------

function reqRes({ params = {}, personagemAtual, file }) {
  let statusCode = null;
  let corpo = null;
  let headers = {};
  let enviado = null;
  const req = { params, personagemAtual, file };
  const res = {
    status(codigo) {
      statusCode = codigo;
      return this;
    },
    json(payload) {
      corpo = payload;
      return this;
    },
    set(chave, valor) {
      headers[chave] = valor;
      return this;
    },
    send(payload) {
      enviado = payload;
      return this;
    },
  };
  return { req, res, resultado: () => ({ statusCode, corpo, headers, enviado }) };
}

async function criarGuildComMembro(cargo) {
  const { personagem: fundador } = await criarPersonagem({ nivel: 10 });
  const chave = sufixo();
  const sigla = Math.random().toString(36).slice(2, 7).toUpperCase();
  const guild = await Guild.create({
    nome: `Guilda ${chave}`.slice(0, 24),
    sigla,
    id_fundador: fundador.id,
    id_lider: fundador.id,
  });
  await GuildMember.create({ id_guild: guild.id, id_personagem: fundador.id, cargo: "Fundador" });

  if (cargo === "Fundador") return { guild, personagem: fundador };

  const { personagem: outro } = await criarPersonagem({ nivel: 10 });
  await GuildMember.create({ id_guild: guild.id, id_personagem: outro.id, cargo });
  return { guild, personagem: outro };
}

testeComBanco("Fundador consegue enviar o emblema, e ele passa a ser servido de volta corretamente", async () => {
  const { guild, personagem } = await criarGuildComMembro("Fundador");
  const imagem = await quadradoPng(500);

  const envio = reqRes({
    params: { id: String(guild.id) },
    personagemAtual: { id: personagem.id },
    file: { buffer: imagem },
  });
  await guildEmblemController.enviarEmblema(envio.req, envio.res);
  const { statusCode, corpo } = envio.resultado();
  assert.equal(statusCode, 200, JSON.stringify(corpo));
  assert.ok(corpo.data.emblema_url.includes(`/api/guilds/${guild.id}/emblem?v=`));

  const leitura = reqRes({ params: { id: String(guild.id) } });
  await guildEmblemController.obterEmblema(leitura.req, leitura.res);
  const resultadoLeitura = leitura.resultado();
  assert.equal(resultadoLeitura.statusCode, 200);
  assert.equal(resultadoLeitura.headers["Content-Type"], "image/png");
  const metadata = await sharp(resultadoLeitura.enviado).metadata();
  assert.equal(metadata.width, DIMENSAO_FINAL_PX);
});

testeComBanco("Veterano NÃO consegue enviar emblema (403) — mesma permissão de editar_identidade", async () => {
  const { guild, personagem } = await criarGuildComMembro("Veterano");
  const imagem = await quadradoPng(300);

  const envio = reqRes({
    params: { id: String(guild.id) },
    personagemAtual: { id: personagem.id },
    file: { buffer: imagem },
  });
  await guildEmblemController.enviarEmblema(envio.req, envio.res);
  assert.equal(envio.resultado().statusCode, 403);
});

testeComBanco("envio com imagem retangular é rejeitado (400) e nada é salvo", async () => {
  const { guild, personagem } = await criarGuildComMembro("Fundador");
  const retangular = await sharp({
    create: { width: 400, height: 150, channels: 3, background: { r: 5, g: 5, b: 5 } },
  })
    .png()
    .toBuffer();

  const envio = reqRes({
    params: { id: String(guild.id) },
    personagemAtual: { id: personagem.id },
    file: { buffer: retangular },
  });
  await guildEmblemController.enviarEmblema(envio.req, envio.res);
  assert.equal(envio.resultado().statusCode, 400);

  const guildRecarregada = await Guild.findByPk(guild.id);
  assert.equal(guildRecarregada.emblema_url, null);
});

testeComBanco("guilda sem emblema enviado responde 404 ao tentar servir a imagem", async () => {
  const { guild } = await criarGuildComMembro("Fundador");
  const leitura = reqRes({ params: { id: String(guild.id) } });
  await guildEmblemController.obterEmblema(leitura.req, leitura.res);
  assert.equal(leitura.resultado().statusCode, 404);
});

testeComBanco("Guild.findAll (defaultScope) nunca carrega os bytes de emblema_imagem", async () => {
  const { guild, personagem } = await criarGuildComMembro("Fundador");
  const imagem = await quadradoPng(300);
  const envio = reqRes({
    params: { id: String(guild.id) },
    personagemAtual: { id: personagem.id },
    file: { buffer: imagem },
  });
  await guildEmblemController.enviarEmblema(envio.req, envio.res);
  assert.equal(envio.resultado().statusCode, 200);

  const guilds = await Guild.findAll({ where: { id: guild.id } });
  assert.equal(guilds[0].dataValues.emblema_imagem, undefined);
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
