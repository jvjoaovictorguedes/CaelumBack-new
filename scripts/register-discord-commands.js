require("dotenv").config();
const { config } = require("../src/discord/config");
const { commands } = require("../src/discord/commands");
const { request } = require("../src/discord/api");
async function main() {
  const c = config();
  const issues = [];
  for (const name of [
    "DISCORD_APPLICATION_ID",
    "DISCORD_GUILD_ID",
    "DISCORD_NEWS_CHANNEL_ID",
  ]) {
    if (!/^\d{17,20}$/.test(process.env[name] || ""))
      issues.push(
        `${name}: ausente ou inválido (somente números, sem espaços ou aspas).`,
      );
  }
  if (!/^[a-f0-9]{64}$/i.test(process.env.DISCORD_PUBLIC_KEY || ""))
    issues.push(
      "DISCORD_PUBLIC_KEY: ausente ou inválida (64 caracteres hexadecimais, sem espaços ou aspas).",
    );
  if (!process.env.DISCORD_BOT_TOKEN?.trim())
    issues.push("DISCORD_BOT_TOKEN: ausente ou vazio.");
  if (issues.length) {
    console.error("Configuração pendente no ambiente deste processo:");
    for (const issue of issues) console.error(`- ${issue}`);
    console.error(
      "Configure as variáveis no serviço backend de produção, aplique o deploy e abra um novo Shell.",
    );
    process.exitCode = 1;
    return;
  }
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
      ? `Discord HTTP ${e.status}${e.status === 401 ? ": confira DISCORD_BOT_TOKEN." : e.status === 403 ? ": confira a instalação do bot e o acesso ao servidor." : ": falha no registro dos comandos."}`
      : "O Discord não confirmou a requisição. Confira a conexão de saída e tente novamente; o comando atualiza os registros existentes.",
  );
  process.exitCode = 1;
});
