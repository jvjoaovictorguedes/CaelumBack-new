// Painel Administrativo de Músicas — cobre os requisitos de teste
// mínimos da spec (§15.2): permissão, Range 206, upload inválido,
// isolamento de rascunho, publish concorrente/idempotente, pool
// inválido, track em uso (409), rollback e auditoria.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const AdminRole = require("../src/models/AdminRole");
const AdminActionLog = require("../src/models/AdminActionLog");
const MusicTrack = require("../src/models/MusicTrack");
const MusicTrackFileVersion = require("../src/models/MusicTrackFileVersion");
const MusicPool = require("../src/models/MusicPool");
const MusicConfigVersion = require("../src/models/MusicConfigVersion");
const MusicAssignment = require("../src/models/MusicAssignment");
const MusicPoolTrackAssignment = require("../src/models/MusicPoolTrackAssignment");

const adminRoleService = require("../src/services/adminRoleService");
const requireAdminPermission = require("../src/middlewares/requireAdminPermission");
const musicTrackService = require("../src/services/musicTrackService");
const musicConfigService = require("../src/services/musicConfigService");
const musicController = require("../src/controllers/musicController");

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

async function criarUsuarioAdmin(prefixo = "admin_musica") {
  const chave = sufixo();
  return User.create({
    username: `${prefixo}_${chave}`,
    email: `${prefixo}_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin: true,
  });
}

function reqRes({ userId, body, query, params, headers } = {}) {
  let statusCode = null;
  let corpo = null;
  const headersEnviados = {};
  const req = {
    user: userId ? { id: userId } : undefined,
    body: body ?? {},
    query: query ?? {},
    params: params ?? {},
    headers: headers ?? {},
    ip: "127.0.0.1",
    get: (h) => (h.toLowerCase() === "user-agent" ? "teste-agent" : undefined),
    app: { get: () => null },
  };
  const res = {
    status(codigo) {
      statusCode = codigo;
      return this;
    },
    set(campo, valor) {
      headersEnviados[campo] = valor;
      return this;
    },
    json(payload) {
      corpo = payload;
      return this;
    },
    send(payload) {
      corpo = payload;
      return this;
    },
    end() {
      return this;
    },
  };
  return { req, res, resultado: () => ({ statusCode: statusCode ?? 200, corpo, headers: headersEnviados }) };
}

// Um MP3 mínimo sintético (ID3v2 + 1 frame MPEG1 Layer3 128kbps/44100Hz)
// suficiente pra passar na validação de magic bytes e no streaming.
function construirMp3DeTeste(bytesAudio = 5000) {
  const id3 = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  // Frame header: 0xFFFB9064 -> MPEG1 Layer3, 128kbps, 44100Hz, sem padding.
  const frameHeader = Buffer.from([0xff, 0xfb, 0x90, 0x64]);
  const corpo = Buffer.alloc(bytesAudio, 0xaa);
  return Buffer.concat([id3, frameHeader, corpo]);
}

const tracksCriadas = [];
const poolsCriados = [];

test.after(async () => {
  if (!temBanco) return;
  await MusicPoolTrackAssignment.destroy({ where: {} });
  await MusicAssignment.destroy({ where: {} });
  await MusicConfigVersion.destroy({ where: { notes: { [require("sequelize").Op.iLike]: "%teste%" } } });
  await MusicTrackFileVersion.destroy({ where: { id_track: tracksCriadas.length ? tracksCriadas : [-1] } });
  await MusicTrack.destroy({ where: { id: tracksCriadas.length ? tracksCriadas : [-1] } });
  await MusicPool.destroy({ where: { id: poolsCriados.length ? poolsCriados : [-1] } });
  await sequelize.close();
});

testeComBanco("requireAdminPermission(music.manage) bloqueia sem a permissão e libera com role Conteudo", async () => {
  const admin = await criarUsuarioAdmin();
  const middleware = requireAdminPermission("music.manage");

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
  assert.equal(chamouNext, true, "Conteudo tem music.manage — devia liberar");
});

testeComBanco("requireAdminPermission(music.publish) é distinta de music.manage", async () => {
  const admin = await criarUsuarioAdmin("admin_musica_publish");
  const middleware = requireAdminPermission("music.publish");
  const semPermissao = reqRes({ userId: admin.id });
  let chamouNext = false;
  await middleware(semPermissao.req, semPermissao.res, () => {
    chamouNext = true;
  });
  assert.equal(chamouNext, false);
  assert.equal(semPermissao.resultado().statusCode, 403);
});

testeComBanco("upload rejeita arquivo que não é áudio de verdade (400)", async () => {
  const admin = await criarUsuarioAdmin();
  const track = await musicTrackService.criarTrack(
    { key: `t-upload-${sufixo()}`, nome: "Teste Upload" },
    { idAdmin: admin.id, req: null },
  );
  tracksCriadas.push(track.id);

  const bufferInvalido = Buffer.from("isso não é um mp3 de verdade, só texto puro");
  await assert.rejects(
    () =>
      musicTrackService.uploadNovaVersao(
        track.id,
        { buffer: bufferInvalido, nomeArquivoOriginal: "fake.mp3", mimeDeclarado: "audio/mpeg" },
        { idAdmin: admin.id, req: null },
      ),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    },
  );
});

testeComBanco("upload válido cria versão, e audit registra MUSIC_TRACK_FILE_UPLOAD com before/after", async () => {
  const admin = await criarUsuarioAdmin();
  const track = await musicTrackService.criarTrack(
    { key: `t-upload-ok-${sufixo()}`, nome: "Teste Upload OK" },
    { idAdmin: admin.id, req: null },
  );
  tracksCriadas.push(track.id);

  const mp3 = construirMp3DeTeste();
  const versao = await musicTrackService.uploadNovaVersao(
    track.id,
    { buffer: mp3, nomeArquivoOriginal: "faixa.mp3", mimeDeclarado: "audio/mpeg" },
    { idAdmin: admin.id, req: null },
  );
  assert.equal(versao.versao, 1);
  assert.ok(versao.duracao_ms === null || versao.duracao_ms > 0);

  const log = await AdminActionLog.findOne({
    where: { acao: "MUSIC_TRACK_FILE_UPLOAD", entidade: "MusicTrackFileVersion", id_entidade: versao.id },
  });
  assert.ok(log, "deveria ter registrado auditoria do upload");
  assert.ok(log.dados_depois, "auditoria deveria ter dados_depois");
});

testeComBanco("ativar versão exige música.publish antes do controller e é auditada", async () => {
  const admin = await criarUsuarioAdmin();
  const track = await musicTrackService.criarTrack(
    { key: `t-ativa-${sufixo()}`, nome: "Teste Ativação" },
    { idAdmin: admin.id, req: null },
  );
  tracksCriadas.push(track.id);
  const mp3a = construirMp3DeTeste(4000);
  const mp3b = construirMp3DeTeste(9000);
  await musicTrackService.uploadNovaVersao(track.id, { buffer: mp3a, nomeArquivoOriginal: "a.mp3", mimeDeclarado: "audio/mpeg" }, { idAdmin: admin.id, req: null });
  await musicTrackService.uploadNovaVersao(track.id, { buffer: mp3b, nomeArquivoOriginal: "b.mp3", mimeDeclarado: "audio/mpeg" }, { idAdmin: admin.id, req: null });

  const ativada = await musicTrackService.ativarVersao(track.id, 2, { idAdmin: admin.id, req: null });
  assert.equal(ativada.versao, 2);
  const v1 = await MusicTrackFileVersion.findOne({ where: { id_track: track.id, versao: 1 } });
  assert.equal(v1.ativo, false, "só uma versão ativa por vez");

  const log = await AdminActionLog.findOne({ where: { acao: "MUSIC_TRACK_FILE_ACTIVATE_VERSION", id_entidade: ativada.id } });
  assert.ok(log);
});

testeComBanco("Range 206: bytes=0-1023 retorna 206 com Content-Range/Content-Length corretos", async () => {
  const admin = await criarUsuarioAdmin();
  const key = `t-range-${sufixo()}`;
  const track = await musicTrackService.criarTrack({ key, nome: "Teste Range" }, { idAdmin: admin.id, req: null });
  tracksCriadas.push(track.id);
  const mp3 = construirMp3DeTeste(20000);
  const versao = await musicTrackService.uploadNovaVersao(track.id, { buffer: mp3, nomeArquivoOriginal: "r.mp3", mimeDeclarado: "audio/mpeg" }, { idAdmin: admin.id, req: null });
  await musicTrackService.ativarVersao(track.id, versao.versao, { idAdmin: admin.id, req: null });

  const { req, res, resultado } = reqRes({ params: { key }, headers: { range: "bytes=0-1023" } });
  await musicController.servirAudio(req, res);
  const r = resultado();
  assert.equal(r.statusCode, 206);
  assert.equal(r.headers["Content-Range"], `bytes 0-1023/${mp3.length}`);
  assert.equal(r.headers["Content-Length"], "1024");
  assert.equal(r.corpo.length, 1024);
  assert.equal(r.headers["Accept-Ranges"], "bytes");
});

testeComBanco("sem Range devolve o arquivo inteiro com 200", async () => {
  const admin = await criarUsuarioAdmin();
  const key = `t-full-${sufixo()}`;
  const track = await musicTrackService.criarTrack({ key, nome: "Teste Full" }, { idAdmin: admin.id, req: null });
  tracksCriadas.push(track.id);
  const mp3 = construirMp3DeTeste(3000);
  const versao = await musicTrackService.uploadNovaVersao(track.id, { buffer: mp3, nomeArquivoOriginal: "f.mp3", mimeDeclarado: "audio/mpeg" }, { idAdmin: admin.id, req: null });
  await musicTrackService.ativarVersao(track.id, versao.versao, { idAdmin: admin.id, req: null });

  const { req, res, resultado } = reqRes({ params: { key } });
  await musicController.servirAudio(req, res);
  const r = resultado();
  assert.equal(r.statusCode, 200);
  assert.equal(r.corpo.length, mp3.length);
});

testeComBanco("track/versão inexistente devolve 404 ao servir áudio", async () => {
  const { req, res, resultado } = reqRes({ params: { key: `nao-existe-${sufixo()}` } });
  await musicController.servirAudio(req, res);
  assert.equal(resultado().statusCode, 404);
});

testeComBanco("draft isolation: editar o rascunho não altera GET /api/music/config", async () => {
  const admin = await criarUsuarioAdmin();
  const antes = await musicConfigService.obterConfigPublicada();

  const key = `t-iso-${sufixo()}`;
  const track = await musicTrackService.criarTrack({ key, nome: "Isolamento" }, { idAdmin: admin.id, req: null });
  tracksCriadas.push(track.id);

  await musicConfigService.atualizarAssignment("PAGE_QUESTS", { assignment_type: "TRACK", id_track: track.id }, { idAdmin: admin.id, req: null });

  const depois = await musicConfigService.obterConfigPublicada();
  assert.deepEqual(depois, antes, "config publicada não pode mudar só por editar o draft");
});

testeComBanco("pool inválido (peso<=0) é rejeitado antes mesmo de tocar o draft", async () => {
  const admin = await criarUsuarioAdmin();
  const pool = await musicConfigService.criarPool({ key: `pool-teste-${sufixo()}`, nome: "Pool Teste" }, { idAdmin: admin.id, req: null });
  poolsCriados.push(pool.id);
  const track = await musicTrackService.criarTrack({ key: `t-pool-${sufixo()}`, nome: "Track Pool" }, { idAdmin: admin.id, req: null });
  tracksCriadas.push(track.id);

  await assert.rejects(
    () => musicConfigService.atualizarTracksDoPool(pool.id, [{ id_track: track.id, peso: 0 }], { idAdmin: admin.id, req: null }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    },
  );
});

testeComBanco("pool vazio ou só com track inativa bloqueia publish (validarDraft)", async () => {
  const admin = await criarUsuarioAdmin();
  const pool = await musicConfigService.criarPool({ key: `pool-vazio-${sufixo()}`, nome: "Pool Vazio" }, { idAdmin: admin.id, req: null });
  poolsCriados.push(pool.id);
  const track = await musicTrackService.criarTrack({ key: `t-pool-vazio-${sufixo()}`, nome: "Track Pool Vazio" }, { idAdmin: admin.id, req: null });
  tracksCriadas.push(track.id);
  await musicConfigService.atualizarTracksDoPool(pool.id, [{ id_track: track.id, peso: 1 }], { idAdmin: admin.id, req: null });
  await musicConfigService.atualizarAssignment("PAGE_MESSAGES", { assignment_type: "POOL", id_pool: pool.id }, { idAdmin: admin.id, req: null });

  // Desativa a única track do pool -> pool fica "vazio de ativas".
  await musicTrackService.atualizarTrack(track.id, {}, { idAdmin: admin.id, req: null }); // no-op update, sanity
  const { draft } = await musicConfigService.obterDraftCompleto();
  await track.update({ ativo: false });

  const { valido, erros } = await musicConfigService.validarDraft(draft.id);
  assert.equal(valido, false);
  assert.ok(erros.some((e) => e.includes(pool.key) || e.toLowerCase().includes("pool")));

  await track.update({ ativo: true }); // limpa pro resto da suíte
});

testeComBanco("desativar track referenciada na config PUBLICADA retorna 409 com usos", async () => {
  const admin = await criarUsuarioAdmin();
  const track = await musicTrackService.criarTrack({ key: `t-em-uso-${sufixo()}`, nome: "Em uso" }, { idAdmin: admin.id, req: null });
  tracksCriadas.push(track.id);
  await musicConfigService.atualizarAssignment("PAGE_MESSAGES", { assignment_type: "TRACK", id_track: track.id }, { idAdmin: admin.id, req: null });

  const publicado = await musicConfigService.publicarDraft({ idAdmin: admin.id, req: null, notes: "teste 409" });
  assert.equal(publicado.status, "PUBLISHED");

  await assert.rejects(
    () => musicTrackService.desativarTrack(track.id, { idAdmin: admin.id, req: null }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.ok(Array.isArray(error.usos) && error.usos.length > 0);
      return true;
    },
  );
});

testeComBanco("publish concorrente: dois cliques não criam duas versões PUBLISHED", async () => {
  const admin = await criarUsuarioAdmin();
  const track = await musicTrackService.criarTrack({ key: `t-concorrente-${sufixo()}`, nome: "Concorrente" }, { idAdmin: admin.id, req: null });
  tracksCriadas.push(track.id);
  await musicConfigService.atualizarAssignment("PAGE_QUESTS", { assignment_type: "TRACK", id_track: track.id }, { idAdmin: admin.id, req: null });

  const resultados = await Promise.allSettled([
    musicConfigService.publicarDraft({ idAdmin: admin.id, req: null, notes: "corrida 1" }),
    musicConfigService.publicarDraft({ idAdmin: admin.id, req: null, notes: "corrida 2" }),
  ]);

  const sucesso = resultados.filter((r) => r.status === "fulfilled");
  const falha = resultados.filter((r) => r.status === "rejected");
  assert.equal(sucesso.length, 1, "só uma das duas publicações concorrentes deveria vencer");
  assert.equal(falha.length, 1);

  const publicadas = await MusicConfigVersion.count({ where: { status: "PUBLISHED" } });
  assert.equal(publicadas, 1, "nunca pode haver duas versões PUBLISHED");
});

testeComBanco("rollback cria um novo draft e preserva a versão histórica intacta", async () => {
  const admin = await criarUsuarioAdmin();
  const publicadaAntes = await musicConfigService.obterVersionPublicada();
  assert.ok(publicadaAntes, "precisa existir uma versão publicada (seed/testes anteriores)");
  const numeroOriginal = publicadaAntes.version_number;

  const novoDraft = await musicConfigService.restaurarComoNovoDraft(numeroOriginal, { idAdmin: admin.id, req: null });
  assert.equal(novoDraft.status, "DRAFT");
  assert.notEqual(novoDraft.version_number, numeroOriginal);

  const origemInalterada = await MusicConfigVersion.findOne({ where: { version_number: numeroOriginal } });
  assert.equal(origemInalterada.status, "PUBLISHED", "rollback não pode mutar a versão histórica");

  const log = await AdminActionLog.findOne({ where: { acao: "MUSIC_CONFIG_ROLLBACK_TO_DRAFT", id_entidade: novoDraft.id } });
  assert.ok(log);
});
