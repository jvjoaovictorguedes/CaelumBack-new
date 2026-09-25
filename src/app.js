// src/app.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const http = require("http");
const { Server: SocketIOServer } = require("socket.io");
const { connectDB, isDatabaseReady } = require("./config/database");
const registerPvpLiveHandlers = require("./socket/pvpLiveSocket");
const registerRankedLiveHandlers = require("./socket/rankedLiveSocket");
const registerTournamentHandlers = require("./socket/tournamentSocket");
const registerGuildHandlers = require("./socket/guildSocket");
const registerMessagesHandlers = require("./socket/messagesSocket");
const registerPartyHandlers = require("./socket/partySocket");
const registerGuildBossHandlers = require("./socket/guildBossSocket");
const registerWorldBossHandlers = require("./socket/worldBossSocket");

// Importa TODOS os modelos primeiro.
// A ordem de importação dos modelos aqui geralmente não importa,
const User = require("./models/User");
const Race = require("./models/Race");
const Class = require("./models/Class");
const Item = require("./models/Item");
const Power = require("./models/Power");
const Character = require("./models/Character");
const ArmorProperties = require("./models/ArmorProperties");
const CharacterAbilities = require("./models/CharacterAbilities");
const CharacterInventory = require("./models/CharacterInventory");
const ClassAbilities = require("./models/ClassAbilities");
const ConsumableProperties = require("./models/ConsumableProperties");
const RaceAbilities = require("./models/RaceAbilities");
const WeaponProperties = require("./models/WeaponProperties");

// Associações Item<->WeaponProperties/ArmorProperties/ConsumableProperties
// (com alias explícito) — fonte única, carregada aqui no boot em vez de
// espalhada/duplicada por controller (ver models/associations.js).
require("./models/associations");

// Importa as rotas
const userRoutes = require("./routes/userRoutes");
const raceRoutes = require("./routes/raceRoutes");
const powerRoutes = require("./routes/powerRoutes");
const itemRoutes = require("./routes/itemsRoutes");
const classRoutes = require("./routes/classRoutes");
const characterRoutes = require("./routes/characterRoutes");
const armorPropertiesRoutes = require("./routes/armorPropertiesRoutes");
const characterAbilitiesRoutes = require("./routes/characterAbilitiesRoutes");
const characterInventoryRoutes = require("./routes/characterInventoryRoutes");
const classAbilitiesRoutes = require("./routes/classAbilitiesRoutes");
const consumablePropertiesRoutes = require("./routes/consumablePropertiesRoutes");
const raceAbilitiesRoutes = require("./routes/raceAbilitiesRoutes");
const weaponPropertiesRoutes = require("./routes/weaponPropertiesRoutes");
const combatRoutes = require("./routes/combatRoutes");
const shopRoutes = require("./routes/shopRoutes");
const craftingRoutes = require("./routes/craftingRoutes");
const expeditionRoutes = require("./routes/expeditionRoutes");
const patchNotesRoutes = require("./routes/patchNotesRoutes");
const characterUseItemRoutes = require("./routes/characterItemRoutes");
const attributeRoutes = require("./routes/attributeRoutes");
const characterEquipmentRoutes = require("./routes/CharacterEquipmentRoutes");
const messageRoutes = require("./routes/messageRoutes");
const pvpRoutes = require("./routes/pvpRoutes");
const guildRoutes = require("./routes/guildRoutes");
const evolutionRoutes = require("./routes/evolutionRoutes");
const onboardingRoutes = require("./routes/onboardingRoutes");
const marketRoutes = require("./routes/marketRoutes");
const adventureRoutes = require("./routes/adventureRoutes");
const bestiaryRoutes = require("./routes/bestiaryRoutes");
const rankingRoutes = require("./routes/rankingRoutes");
const worldRoutes = require("./routes/worldRoutes");
const adventureGuildRoutes = require("./routes/adventureGuildRoutes");
const equipmentInstanceRoutes = require("./routes/equipmentInstanceRoutes");
const inventoryV2Routes = require("./routes/inventoryV2Routes");
const adminTournamentRoutes = require("./routes/adminTournamentRoutes");
const adminItemRoutes = require("./routes/adminItemRoutes");
const adminAuditRoutes = require("./routes/adminAuditRoutes");
const adminRoleRoutes = require("./routes/adminRoleRoutes");
const adminPatchNoteRoutes = require("./routes/adminPatchNoteRoutes");
const adminGameSettingRoutes = require("./routes/adminGameSettingRoutes");
const adminAdventureRoutes = require("./routes/adminAdventureRoutes");
const adminEquipmentSetRoutes = require("./routes/adminEquipmentSetRoutes");
const { powersRouter: adminPowersRouter, statusEffectsRouter: adminStatusEffectsRouter, weaponStatusEffectsRouter: adminWeaponStatusEffectsRouter } = require("./routes/adminPowerRoutes");
const { adminMediaRouter, mediaServingRouter } = require("./routes/adminMediaRoutes");
const adminMissionRoutes = require("./routes/adminMissionRoutes");
const adminSpoilConfigRoutes = require("./routes/adminSpoilConfigRoutes");
const adminHuntConfigRoutes = require("./routes/adminHuntConfigRoutes");
const adminGrantRoutes = require("./routes/adminGrantRoutes");
const adminGlobalBuffRoutes = require("./routes/adminGlobalBuffRoutes");
const adminTavernRoutes = require("./routes/adminTavernRoutes");
const adminWorldBossRoutes = require("./routes/adminWorldBossRoutes");
const alchemyRoutes = require("./routes/alchemyRoutes");
const fishingRoutes = require("./routes/fishingRoutes");
const tavernRoutes = require("./routes/tavernRoutes");
const worldBossRoutes = require("./routes/worldBossRoutes");
const adminGuildJournalRoutes = require("./routes/adminGuildJournalRoutes");
const guildJournalRoutes = require("./routes/guildJournalRoutes");
const adminFishingRoutes = require("./routes/adminFishingRoutes");
const adminPlayerRoutes = require("./routes/adminPlayerRoutes");
const adminInventoryRoutes = require("./routes/adminInventoryRoutes");

const app = express();
const port = process.env.PORT || 3001;

// Necessário pra req.ip refletir o IP real do cliente atrás do proxy do
// Railway (senão todo mundo cai no mesmo IP do proxy e o rate limit de
// login/registro trava geral em vez de por pessoa).
app.set("trust proxy", 1);
// Não precisa anunciar "Express" pra quem for reconhecer versões/vulns
// conhecidas do framework.
app.disable("x-powered-by");

// Conecta ao banco de dados e sincroniza os modelos
// connectDB já chama sequelize.sync()
// O .catch() é essencial: connectDB() roda sem await, e uma promise
// rejeitada sem handler derruba o processo inteiro (comportamento padrão
// do Node desde a v15) mesmo depois do servidor já estar no ar.
connectDB()
  .then(() => require("./services/gameSettingCache").iniciarAtualizacaoPeriodica())
  .catch((error) => {
    console.error(
      "Erro fatal e inesperado ao conectar ao banco de dados:",
      error,
    );
  });

// CORS_ORIGIN é opcional fora de produção (comportamento de antes:
// sem ele, aceita qualquer origem, pra não travar quem ainda está
// configurando o ambiente local). Em produção isso é proibido — "*"
// nunca é um fallback aceitável quando o backend usa cookies/JWT de
// verdade, então o processo nem sobe sem a variável configurada.
const emProducao = process.env.NODE_ENV === "production";

const origensPermitidas = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origem) => origem.trim())
  .filter(Boolean);

if (emProducao && origensPermitidas.length === 0) {
  throw new Error(
    'CORS_ORIGIN é obrigatório em produção (NODE_ENV=production) e não pode cair em "*". ' +
      'Defina CORS_ORIGIN="https://seusite.com" (separado por vírgula se houver mais de um) antes de subir o servidor.',
  );
}

if (!emProducao && origensPermitidas.length === 0) {
  console.warn(
    '[cors] CORS_ORIGIN não configurado — aceitando requisições de qualquer origem. Defina CORS_ORIGIN="https://seusite.com" (separado por vírgula se houver mais de um) pra restringir.',
  );
}

const corsOptions =
  origensPermitidas.length > 0
    ? { origin: origensPermitidas, credentials: true }
    : undefined;

// RESEND_API_KEY/RESEND_FROM ausentes fora de produção só logam o link
// de reset no console (ver emailService.js) — jeito válido de testar o
// fluxo sem provedor configurado. Em produção isso significaria
// "esqueci minha senha" nunca entregando e-mail nenhum pra ninguém,
// silenciosamente, e o console.warn de fallback vazaria o token de
// reset em texto puro no log de produção — falha melhor detectada
// aqui, no boot, do que só quando alguém tentar resetar a senha (e
// nunca souber por quê não chegou). FRONTEND_URL é exigido junto
// porque o link de reset é montado a partir dela; sem ela o e-mail
// (quando enviado) leva um link quebrado.
if (emProducao && !(process.env.RESEND_API_KEY && process.env.RESEND_FROM)) {
  throw new Error(
    'RESEND_API_KEY e RESEND_FROM são obrigatórios em produção (NODE_ENV=production) — sem eles, "esqueci minha senha" nunca entrega e-mail nenhum. ' +
      "Configure RESEND_API_KEY e RESEND_FROM antes de subir o servidor.",
  );
}
if (emProducao && !process.env.FRONTEND_URL) {
  throw new Error(
    "FRONTEND_URL é obrigatório em produção (NODE_ENV=production) — é usado pra montar o link de redefinição de senha no e-mail. " +
      'Defina FRONTEND_URL="https://seusite.com" antes de subir o servidor.',
  );
}

// Helmet cobre um conjunto de headers de segurança padrão (X-Content-
// Type-Options, X-Frame-Options, HSTS, etc.) que não custam nada manter
// e não existiam antes. crossOriginResourcePolicy fica "cross-origin"
// porque o frontend (outro domínio) carrega imagens/mídia servidas por
// esta API.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// Limite de tamanho do corpo da requisição — sem isso, um payload JSON
// gigante (de propósito ou por bug) era aceito e processado inteiro
// antes de qualquer validação de rota rodar.
app.use(express.json({ limit: "100kb" }));
app.use(cors(corsOptions));

app.use((req, res, next) => {
  if (req.path === "/" || isDatabaseReady()) {
    return next();
  }

  return res.status(503).json({
    message:
      "Banco de dados indisponível. Tente novamente em alguns instantes.",
  });
});

app.get("/", (req, res) => {
  res.send("Bem-vindo à API do meu RPG!");
});

app.use("/api/shop", shopRoutes);
app.use("/api/crafting", craftingRoutes);
app.use("/api/alchemy", alchemyRoutes);
app.use("/api/fishing", fishingRoutes);
app.use("/api/tavern", tavernRoutes);
app.use("/api/world-boss", worldBossRoutes);
app.use("/api/expeditions", expeditionRoutes);
app.use("/api/patch-notes", patchNotesRoutes);
app.use("/api/guild-journal", guildJournalRoutes);
app.use("/api/users", userRoutes);
app.use("/api/races", raceRoutes);
app.use("/api/powers", powerRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/characters", characterRoutes);
app.use("/api/armor-properties", armorPropertiesRoutes);
app.use("/api/character-abilities", characterAbilitiesRoutes);
app.use("/api/character-inventory", characterInventoryRoutes);
app.use("/api/class-abilities", classAbilitiesRoutes);
app.use("/api/consumable-properties", consumablePropertiesRoutes);
app.use("/api/race-abilities", raceAbilitiesRoutes);
app.use("/api/weapon-properties", weaponPropertiesRoutes);
app.use("/api/combat", combatRoutes);
app.use("/api/character-items", characterUseItemRoutes);
app.use("/api/attributes", attributeRoutes);
app.use("/api/character-equipment", characterEquipmentRoutes);
app.use("/api/equipment", equipmentInstanceRoutes);
app.use("/api/inventory", inventoryV2Routes);
app.use("/api/messages", messageRoutes);
app.use("/api/pvp", pvpRoutes);
app.use("/api/guilds", guildRoutes);
app.use("/api/evolutions", evolutionRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/adventure", adventureRoutes);
app.use("/api/bestiary", bestiaryRoutes);
app.use("/api/ranking", rankingRoutes);
app.use("/api/world", worldRoutes);
app.use("/api/adventure-guild", adventureGuildRoutes);
app.use("/api/onboarding", onboardingRoutes);
// Torneios — administração (criar/iniciar/cancelar/prêmio). Toda rota
// aqui exige authMiddleware + adminMiddleware (ver o arquivo).
app.use("/api/admin/pvp/tournaments", adminTournamentRoutes);
app.use("/api/admin/items", adminItemRoutes);
app.use("/api/admin/audit", adminAuditRoutes);
app.use("/api/admin/admins", adminRoleRoutes);
app.use("/api/admin/patch-notes", adminPatchNoteRoutes);
app.use("/api/admin/settings", adminGameSettingRoutes);
app.use("/api/admin/adventure", adminAdventureRoutes);
app.use("/api/admin/equipment-sets", adminEquipmentSetRoutes);
app.use("/api/admin/powers", adminPowersRouter);
app.use("/api/admin/status-effects", adminStatusEffectsRouter);
app.use("/api/admin/items/:idItem/weapon-status-effects", adminWeaponStatusEffectsRouter);
app.use("/api/admin/media", adminMediaRouter);
// Pública de propósito (sem authMiddleware) — imagem_url de Item/Power/
// etc pode apontar pra cá, e telas de jogador comuns carregam isso num
// <img src> sem token de admin.
app.use("/api/media", mediaServingRouter);
app.use("/api/admin/missions", adminMissionRoutes);
app.use("/api/admin/spoils/config", adminSpoilConfigRoutes);
app.use("/api/admin/hunts/config", adminHuntConfigRoutes);
app.use("/api/admin/grants", adminGrantRoutes);
app.use("/api/admin/global-buffs", adminGlobalBuffRoutes);
app.use("/api/admin/tavern", adminTavernRoutes);
app.use("/api/admin/world-boss", adminWorldBossRoutes);
app.use("/api/admin/guild-journal", adminGuildJournalRoutes);
app.use("/api/admin/fishing", adminFishingRoutes);
app.use("/api/admin/players", adminPlayerRoutes);
app.use("/api/admin/inventory", adminInventoryRoutes);

// Nenhuma rota acima bateu — sem isso, o Express respondia com a página
// de erro padrão dele (texto puro tipo "Cannot GET /api/xyz"), que o
// frontend não sabe interpretar como JSON e acaba mostrando cru pro
// jogador. Sempre depois de TODAS as rotas, senão intercepta tudo.
app.use((req, res) => {
  res.status(404).json({
    message:
      "Essa página ou recurso não existe. Verifique o link e tente de novo.",
  });
});

// Rede de segurança final — captura qualquer exceção que escapou do
// try/catch de um controller (ou um erro síncrono em middleware) antes
// que o Express derrube a conexão sem resposta nenhuma pro cliente.
// Precisa ser o ÚLTIMO app.use e ter exatamente 4 parâmetros (é assim
// que o Express reconhece um error handler).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("Erro não tratado:", err);
  if (res.headersSent) return;
  res.status(500).json({
    message: "Algo deu errado no servidor. Tente novamente em instantes.",
  });
});

// PVP ao vivo (Socket.io) precisa do servidor HTTP cru pra fazer o
// upgrade da conexão — por isso o app não usa mais app.listen direto.
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors:
    origensPermitidas.length > 0
      ? { origin: origensPermitidas, credentials: true }
      : { origin: "*" },
});
registerPvpLiveHandlers(io);
registerRankedLiveHandlers(io);
// PvP v2 §11/§12 — partidas ranqueadas assíncronas vivem em memória:
// um restart deixaria linhas "EmAndamento" órfãs (e a tentativa diária
// gasta). Encerra como falha de servidor e estorna a tentativa no boot.
require("./socket/rankedLiveSocket")
  .encerrarPartidasOrfas()
  .catch((error) => console.error("Falha ao encerrar partidas ranqueadas órfãs:", error));
registerTournamentHandlers(io);
registerGuildHandlers(io);
registerMessagesHandlers(io);
registerPartyHandlers(io);
registerGuildBossHandlers(io);
registerWorldBossHandlers(io);
require("./services/worldBossScheduler").iniciar();
// rankedController usa isso pra criar a partida ranqueada assíncrona a
// partir de uma rota REST (POST /ranked/match/start) e emitir os
// eventos do duelo pro socket do jogador; messageController faz o mesmo
// pra message:new/inbox:update quando a mensagem é enviada por REST.
app.set("io", io);

server.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
