require("dotenv").config();
const { config } = require("../src/discord/config");
const { commands } = require("../src/discord/commands");
const { request } = require("../src/discord/api");
async function main() {
  const c = config();
  if (!c.ready)
    throw new Error(
      "Configure DISCORD_APPLICATION_ID, DISCORD_GUILD_ID, DISCORD_NEWS_CHANNEL_ID, DISCORD_PUBLIC_KEY e DISCORD_BOT_TOKEN nos segredos.",
    );
  // Upsert only our commands; never bulk-delete unrelated application commands.
  for (const command of commands)
    await request(
      `/applications/${c.applicationId}/guilds/${c.guildId}/commands`,
      { method: "POST", body: command },
    );
  console.log(
    "Cinco comandos News Caelum registrados no servidor configurado.",
  );
}
main().catch((e) => {
  console.error(
    e.status
      ? `Discord HTTP ${e.status}`
      : "Não foi possível registrar os comandos. Confira a configuração e as permissões.",
  );
  process.exitCode = 1;
});
