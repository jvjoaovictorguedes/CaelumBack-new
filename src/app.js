// src/app.js
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server: SocketIOServer } = require("socket.io");
const { connectDB, isDatabaseReady } = require("./config/database");
const registerPvpLiveHandlers = require("./socket/pvpLiveSocket");
const registerGuildHandlers = require("./socket/guildSocket");

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
const characterUseItemRoutes = require("./routes/characterItemRoutes");
const attributeRoutes = require("./routes/attributeRoutes");
const characterEquipmentRoutes = require("./routes/CharacterEquipmentRoutes");
const messageRoutes = require("./routes/messageRoutes");
const pvpRoutes = require("./routes/pvpRoutes");
const guildRoutes = require("./routes/guildRoutes");

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
connectDB().catch((error) => {
  console.error("Erro fatal e inesperado ao conectar ao banco de dados:", error);
});

// CORS_ORIGIN é opcional de propósito: sem ele, o comportamento
// continua exatamente igual a antes (qualquer origem) pra não quebrar
// um deploy que ainda não configurou a variável — mas com ela, restringe
// só ao(s) domínio(s) do frontend, em vez de aceitar qualquer site.
const origensPermitidas = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origem) => origem.trim())
  .filter(Boolean);

if (origensPermitidas.length === 0) {
  console.warn(
    '[cors] CORS_ORIGIN não configurado — aceitando requisições de qualquer origem. Defina CORS_ORIGIN="https://seusite.com" (separado por vírgula se houver mais de um) pra restringir.',
  );
}

const corsOptions =
  origensPermitidas.length > 0
    ? { origin: origensPermitidas, credentials: true }
    : undefined;

app.use(express.json());
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
app.use("/api/messages", messageRoutes);
app.use("/api/pvp", pvpRoutes);
app.use("/api/guilds", guildRoutes);

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
registerGuildHandlers(io);

server.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
